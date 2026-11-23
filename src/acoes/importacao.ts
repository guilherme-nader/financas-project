"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contas } from "@/db/schema";
import { exigirUsuario } from "@/lib/dal";
import { ehDataValida } from "@/lib/datas";
import { ErroDeFormato, lerFaturaXpCsv } from "@/lib/importacao/fatura-xp-csv";
import { gravarFatura, type ResumoImportacao } from "@/lib/importacao/gravar-fatura";
import { gravarExtrato, type ResumoExtrato } from "@/lib/importacao/gravar-extrato";
import type { ExtratoLido } from "@/lib/importacao/extrato";
import { lerExtratoItau, type ItemDeTexto } from "@/lib/importacao/extrato-itau-pdf";
import { lerExtratoSantander } from "@/lib/importacao/extrato-santander-pdf";
import { itensDoPdf } from "@/lib/importacao/pdf";
import { ehFaturaNubank, lerFaturaNubank } from "@/lib/importacao/fatura-nubank-pdf";
import { linhasDoPdf } from "@/lib/importacao/linhas-pdf";
import { decodificarOfx, lerExtratoNubankCsv, lerOfx } from "@/lib/importacao/ofx";
import { lerExtratoXpOcr } from "@/lib/importacao/extrato-xp-ocr";
import { ehExtratoWise, lerExtratoWise } from "@/lib/importacao/extrato-wise-pdf";
import { extratoWiseEmReais } from "@/lib/importacao/wise-em-reais";
import { z } from "zod";

export type EstadoImportacao = {
  erro?: string;
  resumo?: ResumoImportacao & { contaNome: string; arquivoNome: string; vencimento: string };
};

const TAMANHO_MAXIMO = 3 * 1024 * 1024; // fatura em PDF tem poucas centenas de KB.

const ehPdf = (arquivo: File) => arquivo.type === "application/pdf" || /\.pdf$/i.test(arquivo.name);

export async function importarFatura(_anterior: EstadoImportacao, form: FormData): Promise<EstadoImportacao> {
  const usuario = await exigirUsuario();

  const arquivo = form.get("arquivo");
  const contaId = String(form.get("contaId") ?? "");
  let vencimento = String(form.get("vencimento") ?? "");

  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Escolha o arquivo da fatura." };
  if (arquivo.size > TAMANHO_MAXIMO) return { erro: "Arquivo grande demais para uma fatura." };

  const conta = await db.query.contas.findFirst({ where: eq(contas.id, contaId) });
  if (!conta || conta.tipo !== "cartao") return { erro: "Escolha o cartão desta fatura." };

  let fatura;
  try {
    if (ehPdf(arquivo)) {
      // Fatura do Nubank em PDF: o vencimento vem do próprio documento.
      const linhas = linhasDoPdf(await itensDoPdf(new Uint8Array(await arquivo.arrayBuffer())));
      if (linhas.length === 0) return { erro: "O PDF não tem texto (é uma imagem). Baixe a fatura pelo app do banco." };
      if (!ehFaturaNubank(linhas)) return { erro: "PDF de fatura ainda não reconhecido. Por enquanto: Nubank (PDF) e XP (CSV)." };
      const lida = lerFaturaNubank(linhas);
      fatura = lida.fatura;
      vencimento = lida.vencimento;
    } else {
      if (!ehDataValida(vencimento)) return { erro: "Informe a data de vencimento da fatura." };
      fatura = lerFaturaXpCsv(await arquivo.text());
    }
  } catch (erro) {
    if (erro instanceof ErroDeFormato) return { erro: erro.message };
    throw erro;
  }

  const resumo = await gravarFatura({
    conta,
    vencimento,
    fatura,
    arquivoNome: arquivo.name,
    usuarioId: usuario.id,
  });
  return { resumo: { ...resumo, contaNome: conta.nome, arquivoNome: arquivo.name, vencimento } };
}

export type EstadoImportacaoExtrato = {
  erro?: string;
  contaNome?: string;
  resultados?: (ResumoExtrato & { arquivoNome: string; titular: string | null })[];
  falhas?: { arquivoNome: string; motivo: string }[];
};

const MAX_ARQUIVOS = 24;

/** Recebe um ou vários PDFs de extrato da mesma conta e importa em ordem cronológica. */
export async function importarExtratos(
  _anterior: EstadoImportacaoExtrato,
  form: FormData,
): Promise<EstadoImportacaoExtrato> {
  const usuario = await exigirUsuario();
  const contaId = String(form.get("contaId") ?? "");
  const arquivos = form.getAll("arquivos").filter((a): a is File => a instanceof File && a.size > 0);
  // PDFs que são imagem chegam já lidos por OCR no navegador (só o texto).
  const lidosPorOcr = form.getAll("ocr").map((t) => esquemaOcr.safeParse(safeJson(String(t))));

  if (arquivos.length === 0 && lidosPorOcr.length === 0) return { erro: "Escolha o(s) extrato(s): OFX, CSV do Nubank ou PDF." };
  if (arquivos.length > MAX_ARQUIVOS) return { erro: `Mande até ${MAX_ARQUIVOS} arquivos por vez.` };

  const conta = await db.query.contas.findFirst({ where: eq(contas.id, contaId) });
  if (!conta || conta.tipo === "cartao") return { erro: "Escolha a conta corrente ou de investimento do extrato." };

  const lidos: { arquivoNome: string; extrato: ExtratoLido }[] = [];
  const falhas: NonNullable<EstadoImportacaoExtrato["falhas"]> = [];
  for (const arquivo of arquivos) {
    try {
      const bytes = new Uint8Array(await arquivo.arrayBuffer());
      if (/\.ofx$/i.test(arquivo.name) || /OFXHEADER|<OFX>/i.test(new TextDecoder("latin1").decode(bytes.slice(0, 600)))) {
        lidos.push({ arquivoNome: arquivo.name, extrato: lerOfx(decodificarOfx(bytes)) });
        continue;
      }
      if (/\.csv$/i.test(arquivo.name)) {
        lidos.push({ arquivoNome: arquivo.name, extrato: lerExtratoNubankCsv(new TextDecoder("utf-8").decode(bytes)) });
        continue;
      }
      const itens = await itensDoPdf(bytes);
      const linhasPdf = linhasDoPdf(itens);
      if (ehExtratoWise(linhasPdf)) {
        lidos.push({ arquivoNome: arquivo.name, extrato: await extratoWiseEmReais(lerExtratoWise(linhasPdf)) });
        continue;
      }
      if (itens.length === 0) {
        falhas.push({
          arquivoNome: arquivo.name,
          motivo: "O PDF não tem texto (é uma imagem) e a leitura por OCR no navegador não rodou. Tente de novo.",
        });
        continue;
      }
      lidos.push({ arquivoNome: arquivo.name, extrato: lerExtrato(itens) });
    } catch (erro) {
      if (erro instanceof ErroDeFormato) falhas.push({ arquivoNome: arquivo.name, motivo: erro.message });
      else falhas.push({ arquivoNome: arquivo.name, motivo: "Não foi possível ler este PDF." });
    }
  }

  for (const r of lidosPorOcr) {
    if (!r.success) {
      falhas.push({ arquivoNome: "?", motivo: "Texto lido por OCR inválido." });
      continue;
    }
    try {
      lidos.push({ arquivoNome: r.data.arquivoNome, extrato: lerExtratoXpOcr(r.data.linhas) });
    } catch (erro) {
      falhas.push({ arquivoNome: r.data.arquivoNome, motivo: erro instanceof ErroDeFormato ? erro.message : "Não foi possível ler o texto." });
    }
  }

  lidos.sort((a, b) => (a.extrato.periodo?.inicio ?? "").localeCompare(b.extrato.periodo?.inicio ?? ""));
  const resultados: NonNullable<EstadoImportacaoExtrato["resultados"]> = [];
  for (const { arquivoNome, extrato } of lidos) {
    // Relê a conta: o saldo inicial pode ter sido ajustado pelo arquivo anterior.
    const atual = (await db.query.contas.findFirst({ where: eq(contas.id, conta.id) }))!;
    const resumo = await gravarExtrato({ conta: atual, extrato, arquivoNome, usuarioId: usuario.id });
    resultados.push({ ...resumo, arquivoNome, titular: extrato.titular });
  }
  return { contaNome: conta.nome, resultados, falhas };
}

const esquemaOcr = z.object({
  arquivoNome: z.string().max(200),
  linhas: z.array(z.string().max(500)).max(10_000),
});

function safeJson(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

/** Descobre o banco pelo conteúdo do PDF. */
function lerExtrato(itens: ItemDeTexto[]): ExtratoLido {
  if (itens.some((i) => /EXTRATO CONSOLIDADO INTELIGENTE/i.test(i.texto))) return lerExtratoSantander(itens);
  if (itens.some((i) => /Extrato conta corrente/i.test(i.texto))) return lerExtratoItau(itens);
  throw new ErroDeFormato("Formato de extrato ainda não reconhecido. Por enquanto: Itaú (conta corrente) e Santander (extrato consolidado).");
}
