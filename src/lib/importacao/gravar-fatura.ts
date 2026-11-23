import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { categorias, faturas, importacoes, pessoas, regras, transacoes, type Conta } from "@/db/schema";
import { fechamentoPeloVencimento } from "../cartao";
import type { DataISO } from "../datas";
import type { FaturaLida } from "./fatura-xp-csv";
import { parearTransferencias } from "./parear";
import { planejarFatura } from "./planejar-fatura";
import { encontrarRegra, ordenarRegras } from "./regras";
import { descricaoAmigavel, normalizar } from "./texto";

export type ResumoImportacao = {
  importacaoId: string;
  compras: number;
  novas: number;
  confirmadas: number;
  duplicadas: number;
  futuras: number;
  categorizadas: number;
  paraRevisar: number;
  totalCentavos: number;
  /** null = o arquivo não informa o total; senão, se a soma lida bate com o total impresso. */
  totalConfere: boolean | null;
  totalInformadoCentavos: number | null;
  conferencias: { vencimento: DataISO; totalFatura: number; pagamento: number; confere: boolean }[];
  linhasIgnoradas: number;
};

/** Transforma uma string estável num UUID estável (para o id do grupo de parcelas). */
function uuidDe(texto: string): string {
  const h = createHash("sha256").update(texto).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export async function gravarFatura(params: {
  conta: Conta;
  vencimento: DataISO;
  fatura: FaturaLida;
  arquivoNome: string;
  usuarioId: string;
}): Promise<ResumoImportacao> {
  const { conta, vencimento, fatura } = params;
  const plano = planejarFatura(fatura, vencimento);

  const [listaRegras, listaPessoas, catPagamento] = await Promise.all([
    db.select().from(regras),
    db.select().from(pessoas),
    db.query.categorias.findFirst({
      where: and(eq(categorias.tipo, "transferencia"), eq(categorias.nome, "Pagamento de fatura")),
    }),
  ]);
  const regrasOrdenadas = ordenarRegras(listaRegras);

  // Portador "DEBORA SOBRENOME" -> pessoa Débora (pelo primeiro nome); senão, dono do cartão.
  const pessoaDoPortador = (portador: string) => {
    const primeiro = normalizar(portador).split(" ")[0];
    const achada = listaPessoas.find((p) => !p.compartilhada && normalizar(p.nome).split(" ")[0] === primeiro);
    return achada?.id ?? conta.pessoaId;
  };

  const resumo: ResumoImportacao = {
    importacaoId: "",
    compras: fatura.compras.length,
    novas: 0,
    confirmadas: 0,
    duplicadas: 0,
    futuras: 0,
    categorizadas: 0,
    paraRevisar: 0,
    totalCentavos: fatura.totalCentavos,
    totalConfere:
      fatura.totalInformadoCentavos == null
        ? null
        : fatura.totalInformadoCentavos === fatura.totalCentavos + (fatura.saldoAnteriorCentavos ?? 0),
    totalInformadoCentavos: fatura.totalInformadoCentavos ?? null,
    conferencias: [],
    linhasIgnoradas: fatura.linhasIgnoradas.length,
  };
  const usoDeRegras = new Map<string, number>();

  await db.transaction(async (tx) => {
    const [importacao] = await tx
      .insert(importacoes)
      .values({
        contaId: conta.id,
        formato: "fatura-xp-csv",
        arquivoNome: params.arquivoNome,
        referencia: vencimento,
        totalLinhas: plano.filter((l) => l.status === "realizada").length,
        criadoPorId: params.usuarioId,
      })
      .returning({ id: importacoes.id });
    resumo.importacaoId = importacao.id;

    const faturaIds = new Map<DataISO, string>();
    const faturaDe = async (venc: DataISO) => {
      if (!faturaIds.has(venc)) {
        await tx
          .insert(faturas)
          .values({
            contaId: conta.id,
            dataFechamento: fechamentoPeloVencimento(venc, conta.diaFechamento, conta.diaVencimento),
            dataVencimento: venc,
          })
          .onConflictDoNothing({ target: [faturas.contaId, faturas.dataVencimento] });
        const f = await tx.query.faturas.findFirst({
          where: and(eq(faturas.contaId, conta.id), eq(faturas.dataVencimento, venc)),
          columns: { id: true },
        });
        faturaIds.set(venc, f!.id);
      }
      return faturaIds.get(venc)!;
    };

    for (const linha of plano) {
      const existente = await tx.query.transacoes.findFirst({
        where: and(eq(transacoes.contaId, conta.id), eq(transacoes.chaveImportacao, linha.chave)),
        columns: { id: true, status: true },
      });
      const faturaId = linha.ehPagamento ? null : await faturaDe(linha.dataCaixa);

      if (existente) {
        if (existente.status === "prevista" && linha.status === "realizada") {
          await tx
            .update(transacoes)
            .set({
              status: "realizada",
              data: linha.data,
              dataCaixa: linha.dataCaixa,
              faturaId,
              importacaoId: importacao.id,
              atualizadoEm: new Date(),
            })
            .where(eq(transacoes.id, existente.id));
          resumo.confirmadas++;
        } else if (linha.status === "realizada") {
          resumo.duplicadas++;
        }
        continue;
      }

      const regra = linha.ehPagamento ? null : encontrarRegra(linha.descricaoOriginal, regrasOrdenadas);
      if (regra) usoDeRegras.set(regra.id, (usoDeRegras.get(regra.id) ?? 0) + 1);
      const precisaRevisao = !linha.ehPagamento && !regra;

      await tx.insert(transacoes).values({
        contaId: conta.id,
        tipo: linha.tipo,
        data: linha.data,
        dataCaixa: linha.dataCaixa,
        descricao: linha.ehPagamento ? "Pagamento de fatura" : (regra?.nome ?? descricaoAmigavel(linha.descricaoOriginal)),
        descricaoOriginal: linha.descricaoOriginal,
        valorCentavos: linha.valorCentavos,
        categoriaId: linha.ehPagamento ? (catPagamento?.id ?? null) : (regra?.categoriaId ?? null),
        pessoaId: pessoaDoPortador(linha.portador),
        status: linha.status,
        origem: "importacao",
        faturaId,
        parcelaNumero: linha.parcelaNumero,
        parcelaTotal: linha.parcelaTotal,
        grupoParcelamentoId: linha.grupo ? uuidDe(`${conta.id}|${linha.grupo}`) : null,
        precisaRevisao,
        importacaoId: importacao.id,
        chaveImportacao: linha.chave,
        criadoPorId: params.usuarioId,
      });

      if (linha.status === "prevista") {
        resumo.futuras++;
      } else {
        resumo.novas++;
        if (!linha.ehPagamento) {
          if (precisaRevisao) resumo.paraRevisar++;
          else resumo.categorizadas++;
        }
      }
    }

    // Esta fatura: total conferido pelo arquivo.
    await tx
      .update(faturas)
      .set({ totalInformadoCentavos: fatura.totalInformadoCentavos ?? fatura.totalCentavos, status: "fechada" })
      .where(eq(faturas.id, await faturaDe(vencimento)));

    // O pagamento listado aqui quita a fatura anterior: confere o valor.
    for (const pagamento of fatura.pagamentos) {
      const anterior = await tx.query.faturas.findFirst({
        where: and(eq(faturas.contaId, conta.id), lt(faturas.dataVencimento, vencimento)),
        orderBy: desc(faturas.dataVencimento),
      });
      if (!anterior || anterior.totalInformadoCentavos === null) continue;
      const confere = anterior.totalInformadoCentavos === pagamento.valorCentavos;
      resumo.conferencias.push({
        vencimento: anterior.dataVencimento,
        totalFatura: anterior.totalInformadoCentavos,
        pagamento: pagamento.valorCentavos,
        confere,
      });
      if (confere) await tx.update(faturas).set({ status: "paga" }).where(eq(faturas.id, anterior.id));
    }

    await parearTransferencias(tx);

    for (const [id, vezes] of usoDeRegras) {
      await tx
        .update(regras)
        .set({ vezesUsada: sql`${regras.vezesUsada} + ${vezes}` })
        .where(eq(regras.id, id));
    }

    await tx
      .update(importacoes)
      .set({
        novas: resumo.novas,
        confirmadas: resumo.confirmadas,
        duplicadas: resumo.duplicadas,
        paraRevisar: resumo.paraRevisar,
      })
      .where(eq(importacoes.id, importacao.id));
  });

  return resumo;
}
