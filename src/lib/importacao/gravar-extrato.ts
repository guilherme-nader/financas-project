import "server-only";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { categorias, contas, importacoes, pessoas, regras, transacoes, type Conta } from "@/db/schema";
import { classificarMovimento } from "./classificar";
import type { ExtratoLido } from "./extrato";
import { parearTransferencias } from "./parear";
import { ordenarRegras } from "./regras";
import { compacto } from "./texto";

export type ResumoExtrato = {
  importacaoId: string;
  banco: ExtratoLido["banco"];
  periodo: ExtratoLido["periodo"];
  movimentos: number;
  novas: number;
  duplicadas: number;
  transferenciasProprias: number;
  /** Lançamentos de conta caixinha (fora dos totais). */
  naCaixinha: number;
  pareadas: number;
  categorizadas: number;
  paraRevisar: number;
  diasQueNaoBatem: ExtratoLido["diasQueNaoBatem"];
  saldoInicialAjustado: number | null;
};

export async function gravarExtrato(params: {
  conta: Conta;
  extrato: ExtratoLido;
  arquivoNome: string;
  usuarioId: string;
}): Promise<ResumoExtrato> {
  const { conta, extrato } = params;

  // O titular do extrato é um nome do dono da conta: aprende para reconhecer Pix entre contas.
  const listaPessoas = await db.select().from(pessoas);
  const dono = listaPessoas.find((p) => p.id === conta.pessoaId);
  if (dono && !dono.compartilhada && extrato.titular) {
    const conhecido = dono.nomesNoBanco.some((n) => n.toUpperCase() === extrato.titular!.toUpperCase());
    if (!conhecido) {
      dono.nomesNoBanco = [...dono.nomesNoBanco, extrato.titular];
      await db.update(pessoas).set({ nomesNoBanco: dono.nomesNoBanco }).where(eq(pessoas.id, dono.id));
    }
  }
  const nomesProprios = listaPessoas.flatMap((p) => p.nomesNoBanco);
  const regrasOrdenadas = ordenarRegras(await db.select().from(regras));
  const categoriasFixas = await db.select().from(categorias).where(sql`${categorias.paiId} is null`);
  const idDaCategoria = (nome: string, tipo: "receita" | "despesa" | "transferencia") =>
    categoriasFixas.find((c) => c.nome === nome && c.tipo === tipo)?.id ?? null;

  const resumo: ResumoExtrato = {
    importacaoId: "",
    banco: extrato.banco,
    periodo: extrato.periodo,
    movimentos: extrato.movimentos.length,
    novas: 0,
    duplicadas: 0,
    transferenciasProprias: 0,
    naCaixinha: 0,
    pareadas: 0,
    categorizadas: 0,
    paraRevisar: 0,
    diasQueNaoBatem: extrato.diasQueNaoBatem,
    saldoInicialAjustado: null,
  };
  const usoDeRegras = new Map<string, number>();

  await db.transaction(async (tx) => {
    const [importacao] = await tx
      .insert(importacoes)
      .values({
        contaId: conta.id,
        formato: `extrato-${extrato.banco}-pdf`,
        arquivoNome: params.arquivoNome,
        referencia: extrato.periodo?.fim ?? null,
        totalLinhas: extrato.movimentos.length,
        criadoPorId: params.usuarioId,
      })
      .returning({ id: importacoes.id });
    resumo.importacaoId = importacao.id;

    // Conta nova (sem lançamentos antes do extrato): o saldo inicial vem do próprio extrato.
    if (extrato.saldoInicialCentavos !== null && extrato.periodo && conta.saldoInicialCentavos === 0) {
      const anterior = await tx.query.transacoes.findFirst({
        where: and(eq(transacoes.contaId, conta.id), lt(transacoes.data, extrato.periodo.inicio)),
        columns: { id: true },
      });
      if (!anterior && extrato.saldoInicialCentavos !== 0) {
        await tx.update(contas).set({ saldoInicialCentavos: extrato.saldoInicialCentavos }).where(eq(contas.id, conta.id));
        resumo.saldoInicialAjustado = extrato.saldoInicialCentavos;
      }
    }

    const ocorrencias = new Map<string, number>();
    for (const m of extrato.movimentos) {
      const base = `e|${m.data}|${compacto(m.lancamento)}|${compacto(m.descricao)}|${m.valorCentavos}`;
      const ordem = (ocorrencias.get(base) ?? 0) + 1;
      ocorrencias.set(base, ordem);
      const chave = `${base}|${ordem}`;

      const existente = await tx.query.transacoes.findFirst({
        where: and(eq(transacoes.contaId, conta.id), eq(transacoes.chaveImportacao, chave)),
        columns: { id: true },
      });
      if (existente) {
        resumo.duplicadas++;
        continue;
      }

      const c = classificarMovimento(m, { nomesProprios, regrasOrdenadas });
      let categoriaId = c.categoriaNome ? idDaCategoria(c.categoriaNome, c.tipo) : (c.regra?.categoriaId ?? null);
      let precisaRevisao = c.precisaRevisao;
      // Regra de despesa não vale para dinheiro que entrou (e vice-versa).
      if (categoriaId && c.regra && !c.categoriaNome) {
        const cat = await tx.query.categorias.findFirst({ where: eq(categorias.id, categoriaId), columns: { tipo: true } });
        if (cat?.tipo !== c.tipo) {
          categoriaId = null;
          precisaRevisao = true;
        } else {
          usoDeRegras.set(c.regra.id, (usoDeRegras.get(c.regra.id) ?? 0) + 1);
        }
      }
      // Caixinha de terceiros não pede revisão: não entra nos totais do casal.
      if (conta.foraDosTotais) precisaRevisao = false;

      await tx.insert(transacoes).values({
        contaId: conta.id,
        tipo: c.tipo,
        data: m.data,
        dataCaixa: m.data,
        descricao: c.descricao,
        descricaoOriginal: `${m.lancamento} ${m.descricao}`.trim(),
        valorCentavos: m.valorCentavos,
        categoriaId,
        pessoaId: conta.pessoaId,
        status: "realizada",
        origem: "importacao",
        precisaRevisao,
        importacaoId: importacao.id,
        chaveImportacao: chave,
        criadoPorId: params.usuarioId,
      });

      resumo.novas++;
      if (c.tipo === "transferencia") resumo.transferenciasProprias++;
      else if (conta.foraDosTotais) resumo.naCaixinha++;
      else if (precisaRevisao) resumo.paraRevisar++;
      else resumo.categorizadas++;
    }

    for (const [id, vezes] of usoDeRegras) {
      await tx.update(regras).set({ vezesUsada: sql`${regras.vezesUsada} + ${vezes}` }).where(eq(regras.id, id));
    }

    resumo.pareadas = await parearTransferencias(tx);

    await tx
      .update(importacoes)
      .set({ novas: resumo.novas, duplicadas: resumo.duplicadas, paraRevisar: resumo.paraRevisar })
      .where(eq(importacoes.id, importacao.id));
  });

  return resumo;
}
