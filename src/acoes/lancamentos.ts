"use server";

import { and, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { categorias, contas, faturas, transacoes, type Conta } from "@/db/schema";
import { cicloDaFatura } from "@/lib/cartao";
import { exigirUsuario } from "@/lib/dal";
import { ehDataValida, hojeISO, mesDe } from "@/lib/datas";
import { lerValorEmCentavos } from "@/lib/dinheiro";
import { montarLinhas } from "@/lib/lancamento";

export type EstadoFormulario = {
  erro?: string;
  campos?: Partial<Record<string, string>>;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const texto = (max: number) => z.string().trim().min(1).max(max);
const idOpcional = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined))
  .pipe(z.string().uuid().optional());

const esquemaNovo = z.object({
  tipo: z.enum(["despesa", "receita", "transferencia"]),
  valor: z.string(),
  descricao: texto(200),
  data: z.string().refine(ehDataValida, "Data inválida"),
  contaId: z.string().uuid(),
  contaDestinoId: idOpcional,
  categoriaId: idOpcional,
  pessoaId: z.string().uuid(),
  parcelas: z.coerce.number().int().min(1).max(72).default(1),
  observacao: z.string().trim().max(1000).optional(),
});

function erroDeValidacao(erro: z.ZodError): EstadoFormulario {
  const campos: Record<string, string> = {};
  for (const problema of erro.issues) {
    const nome = String(problema.path[0] ?? "");
    if (nome && !campos[nome]) campos[nome] = mensagemCampo(nome);
  }
  return { erro: "Confira os campos destacados.", campos };
}

function mensagemCampo(nome: string): string {
  const mensagens: Record<string, string> = {
    descricao: "Escreva uma descrição.",
    data: "Escolha uma data válida.",
    contaId: "Escolha a conta.",
    contaDestinoId: "Escolha a conta de destino.",
    pessoaId: "Escolha de quem é.",
    parcelas: "Parcelas entre 1 e 72.",
    categoriaId: "Categoria inválida.",
  };
  return mensagens[nome] ?? "Valor inválido.";
}

/** Garante a fatura do cartão para aquele vencimento e devolve o id. */
async function faturaDoCartao(tx: Tx, contaId: string, ciclo: { fechamento: string; vencimento: string }) {
  await tx
    .insert(faturas)
    .values({ contaId, dataFechamento: ciclo.fechamento, dataVencimento: ciclo.vencimento })
    .onConflictDoNothing({ target: [faturas.contaId, faturas.dataVencimento] });
  const fatura = await tx.query.faturas.findFirst({
    where: and(eq(faturas.contaId, contaId), eq(faturas.dataVencimento, ciclo.vencimento)),
    columns: { id: true },
  });
  return fatura!.id;
}

/** Categoria de sistema certa para uma transferência entre estas duas contas. */
function nomeCategoriaTransferencia(origem: Conta, destino: Conta): string {
  if (destino.tipo === "cartao") return "Pagamento de fatura";
  if (destino.tipo === "investimento" && origem.tipo !== "investimento") return "Aporte em investimento";
  if (origem.tipo === "investimento" && destino.tipo !== "investimento") return "Resgate de investimento";
  return "Transferência entre contas";
}

export async function criarLancamento(_anterior: EstadoFormulario, form: FormData): Promise<EstadoFormulario> {
  const usuario = await exigirUsuario();
  const dados = esquemaNovo.safeParse(Object.fromEntries(form));
  if (!dados.success) return erroDeValidacao(dados.error);
  const d = dados.data;

  const valor = lerValorEmCentavos(d.valor);
  if (!valor) return { erro: "Confira os campos destacados.", campos: { valor: "Digite um valor maior que zero." } };

  const conta = await db.query.contas.findFirst({ where: eq(contas.id, d.contaId) });
  if (!conta) return { erro: "Conta não encontrada.", campos: { contaId: "Escolha a conta." } };
  const hoje = hojeISO();

  if (d.tipo === "transferencia") {
    if (!d.contaDestinoId || d.contaDestinoId === d.contaId) {
      return { erro: "Confira os campos destacados.", campos: { contaDestinoId: "Escolha outra conta de destino." } };
    }
    const destino = await db.query.contas.findFirst({ where: eq(contas.id, d.contaDestinoId) });
    if (!destino) return { erro: "Conta de destino não encontrada." };
    const categoria = await db.query.categorias.findFirst({
      where: and(eq(categorias.tipo, "transferencia"), eq(categorias.nome, nomeCategoriaTransferencia(conta, destino))),
    });
    const transferenciaId = crypto.randomUUID();
    const comum = {
      tipo: "transferencia" as const,
      data: d.data,
      dataCaixa: d.data,
      descricao: d.descricao,
      categoriaId: categoria?.id ?? null,
      pessoaId: d.pessoaId,
      status: d.data > hoje ? ("prevista" as const) : ("realizada" as const),
      transferenciaId,
      observacao: d.observacao || null,
      criadoPorId: usuario.id,
    };
    await db.insert(transacoes).values([
      { ...comum, contaId: conta.id, valorCentavos: -valor },
      { ...comum, contaId: destino.id, valorCentavos: valor },
    ]);
    redirect(`/lancamentos?mes=${mesDe(d.data)}`);
  }

  if (d.categoriaId) {
    const categoria = await db.query.categorias.findFirst({ where: eq(categorias.id, d.categoriaId) });
    if (!categoria || categoria.tipo !== d.tipo) {
      return { erro: "Confira os campos destacados.", campos: { categoriaId: "Essa categoria não é do tipo escolhido." } };
    }
  }

  let linhas;
  try {
    linhas = montarLinhas(conta, {
      tipo: d.tipo,
      valorTotalCentavos: valor,
      data: d.data,
      parcelas: d.parcelas,
      hoje,
    });
  } catch (erro) {
    return { erro: (erro as Error).message };
  }

  const grupoParcelamentoId = linhas.length > 1 ? crypto.randomUUID() : null;
  await db.transaction(async (tx) => {
    for (const linha of linhas) {
      const faturaId = linha.fatura ? await faturaDoCartao(tx, conta.id, linha.fatura) : null;
      await tx.insert(transacoes).values({
        contaId: conta.id,
        tipo: d.tipo,
        data: linha.data,
        dataCaixa: linha.dataCaixa,
        descricao: d.descricao,
        valorCentavos: linha.valorCentavos,
        categoriaId: d.categoriaId ?? null,
        pessoaId: d.pessoaId,
        status: linha.status,
        faturaId,
        parcelaNumero: linha.parcelaNumero,
        parcelaTotal: linha.parcelaTotal,
        grupoParcelamentoId,
        observacao: d.observacao || null,
        criadoPorId: usuario.id,
      });
    }
  });

  redirect(`/lancamentos?mes=${mesDe(d.data)}`);
}

const esquemaEdicao = z.object({
  valor: z.string(),
  descricao: texto(200),
  data: z.string().refine(ehDataValida, "Data inválida"),
  categoriaId: idOpcional,
  pessoaId: z.string().uuid(),
  observacao: z.string().trim().max(1000).optional(),
  aplicarAoGrupo: z.string().optional(),
});

export async function atualizarLancamento(
  id: string,
  _anterior: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  await exigirUsuario();
  const dados = esquemaEdicao.safeParse(Object.fromEntries(form));
  if (!dados.success) return erroDeValidacao(dados.error);
  const d = dados.data;

  const valor = lerValorEmCentavos(d.valor);
  if (!valor) return { erro: "Confira os campos destacados.", campos: { valor: "Digite um valor maior que zero." } };

  const atual = await db.query.transacoes.findFirst({ where: eq(transacoes.id, id) });
  if (!atual) return { erro: "Lançamento não encontrado." };
  const conta = await db.query.contas.findFirst({ where: eq(contas.id, atual.contaId) });
  if (!conta) return { erro: "Conta não encontrada." };

  if (d.categoriaId) {
    const categoria = await db.query.categorias.findFirst({ where: eq(categorias.id, d.categoriaId) });
    if (!categoria || categoria.tipo !== atual.tipo) {
      return { erro: "Confira os campos destacados.", campos: { categoriaId: "Essa categoria não é do tipo deste lançamento." } };
    }
  }

  const hoje = hojeISO();
  const status = d.data > hoje ? ("prevista" as const) : ("realizada" as const);
  const agora = new Date();

  await db.transaction(async (tx) => {
    if (atual.transferenciaId) {
      // Os dois lados andam juntos: mesmo valor (sinais opostos), data e descrição.
      const lados = await tx.query.transacoes.findMany({ where: eq(transacoes.transferenciaId, atual.transferenciaId) });
      for (const lado of lados) {
        await tx
          .update(transacoes)
          .set({
            descricao: d.descricao,
            data: d.data,
            dataCaixa: d.data,
            valorCentavos: lado.valorCentavos < 0 ? -valor : valor,
            pessoaId: d.pessoaId,
            status,
            observacao: d.observacao || null,
            atualizadoEm: agora,
          })
          .where(eq(transacoes.id, lado.id));
      }
      return;
    }

    let dataCaixa = d.data;
    let faturaId = atual.faturaId;
    if (conta.tipo === "cartao" && conta.diaFechamento && conta.diaVencimento) {
      const ciclo = cicloDaFatura(d.data, conta.diaFechamento, conta.diaVencimento);
      dataCaixa = ciclo.vencimento;
      faturaId = await faturaDoCartao(tx, conta.id, ciclo);
    }

    await tx
      .update(transacoes)
      .set({
        descricao: d.descricao,
        data: d.data,
        dataCaixa,
        faturaId,
        valorCentavos: atual.tipo === "despesa" ? -valor : valor,
        categoriaId: d.categoriaId ?? null,
        pessoaId: d.pessoaId,
        status,
        observacao: d.observacao || null,
        precisaRevisao: false,
        atualizadoEm: agora,
      })
      .where(eq(transacoes.id, id));

    // Descrição, categoria e pessoa podem valer para todas as parcelas da compra.
    if (atual.grupoParcelamentoId && d.aplicarAoGrupo === "sim") {
      await tx
        .update(transacoes)
        .set({ descricao: d.descricao, categoriaId: d.categoriaId ?? null, pessoaId: d.pessoaId, atualizadoEm: agora })
        .where(eq(transacoes.grupoParcelamentoId, atual.grupoParcelamentoId));
    }
  });

  redirect(`/lancamentos?mes=${mesDe(d.data)}`);
}

export async function excluirLancamento(id: string, form: FormData) {
  await exigirUsuario();
  const atual = await db.query.transacoes.findFirst({ where: eq(transacoes.id, id) });
  if (!atual) redirect("/lancamentos");

  if (atual.transferenciaId) {
    await db.delete(transacoes).where(eq(transacoes.transferenciaId, atual.transferenciaId));
  } else if (atual.grupoParcelamentoId && form.get("escopo") === "grupo") {
    await db.delete(transacoes).where(eq(transacoes.grupoParcelamentoId, atual.grupoParcelamentoId));
  } else {
    await db.delete(transacoes).where(inArray(transacoes.id, [id]));
  }
  redirect(`/lancamentos?mes=${mesDe(atual.data)}`);
}
