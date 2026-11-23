import { ehDataValida, type DataISO } from "../datas";
import type { ExtratoLido, MovimentoExtrato } from "./extrato";
import { ErroDeFormato } from "./fatura-xp-csv";
import { limparControle } from "./texto";

/**
 * Leitor de OFX (o formato de "exportar para gerenciador financeiro" dos bancos).
 * Aceita OFX 1.x (SGML, tags sem fechamento) e 2.x (XML).
 * Cada lançamento traz um identificador do banco (FITID), usado para nunca duplicar.
 */

/** Lê os bytes respeitando o cabeçalho de codificação (muitos bancos usam Windows-1252). */
export function decodificarOfx(bytes: Uint8Array): string {
  const cabecalho = new TextDecoder("latin1").decode(bytes.slice(0, 400));
  const utf8 = /ENCODING:\s*UTF-?8|encoding="utf-8"/i.test(cabecalho);
  return new TextDecoder(utf8 ? "utf-8" : "windows-1252").decode(bytes);
}

function campo(bloco: string, tag: string): string | null {
  const m = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i").exec(bloco);
  return m ? m[1].trim() : null;
}

function dataOfx(texto: string | null): DataISO | null {
  if (!texto || texto.length < 8) return null;
  const d = `${texto.slice(0, 4)}-${texto.slice(4, 6)}-${texto.slice(6, 8)}`;
  return ehDataValida(d) ? d : null;
}

function valorOfx(texto: string | null): number | null {
  if (!texto) return null;
  const limpo = texto.replace(",", ".");
  if (!/^[-+]?\d+(\.\d{1,2})?$/.test(limpo)) return null;
  const negativo = limpo.startsWith("-");
  const [inteiro, decimal = ""] = limpo.replace(/^[-+]/, "").split(".");
  const centavos = Number(inteiro) * 100 + Number(decimal.padEnd(2, "0"));
  return negativo ? -centavos : centavos;
}

/**
 * "Transferência enviada pelo Pix - FULANO - •••.123.456-•• - BANCO X (0001) Agência: 1 Conta: 2"
 *   -> lançamento "Transferência enviada pelo Pix", descrição "FULANO".
 * "Estorno - Transferência enviada pelo Pix - LOJA - ..." -> "Estorno", "LOJA".
 */
export function separarMemo(memo: string): { lancamento: string; descricao: string } {
  const partes = memo.split(" - ").map((p) => p.trim()).filter(Boolean);
  if (partes.length === 0) return { lancamento: memo.trim(), descricao: "" };
  if (/^estorno$/i.test(partes[0]) && partes.length >= 3) {
    return { lancamento: "Estorno", descricao: partes[2] };
  }
  return { lancamento: partes[0], descricao: partes[1] ?? "" };
}

export function lerOfx(bruto: string): ExtratoLido {
  const texto = limparControle(bruto);
  if (!/<OFX>/i.test(texto)) throw new ErroDeFormato("Não parece um arquivo OFX.");
  if (/<CREDITCARDMSGSRSV1>/i.test(texto)) {
    throw new ErroDeFormato("Este OFX é de cartão de crédito. Importe-o na aba Fatura de cartão.");
  }

  const org = campo(texto, "ORG");
  const blocos = texto.split(/<STMTTRN>/i).slice(1).map((b) => b.split(/<\/STMTTRN>/i)[0]);
  const movimentos: (MovimentoExtrato & { idBanco: string | null })[] = [];
  for (const bloco of blocos) {
    const data = dataOfx(campo(bloco, "DTPOSTED"));
    const valor = valorOfx(campo(bloco, "TRNAMT"));
    if (!data || valor === null) continue;
    const memo = (campo(bloco, "MEMO") ?? campo(bloco, "NAME") ?? "").replace(/<\/?\w+>$/, "").trim();
    movimentos.push({ data, valorCentavos: valor, idBanco: campo(bloco, "FITID"), ...separarMemo(memo) });
  }
  if (movimentos.length === 0) throw new ErroDeFormato("O OFX não tem lançamentos.");
  movimentos.sort((a, b) => a.data.localeCompare(b.data));

  const inicio = dataOfx(campo(texto, "DTSTART"));
  const fim = dataOfx(campo(texto, "DTEND"));
  const ledger = texto.split(/<LEDGERBAL>/i)[1] ?? "";
  const saldoFinal = valorOfx(campo(ledger, "BALAMT"));
  const dataSaldo = dataOfx(campo(ledger, "DTASOF")) ?? fim ?? movimentos.at(-1)!.data;
  const soma = movimentos.reduce((s, m) => s + m.valorCentavos, 0);

  return {
    banco: /NU PAGAMENTOS|NUBANK/i.test(org ?? "") ? "nubank" : "ofx",
    titular: null,
    agencia: campo(texto, "BRANCHID"),
    conta: campo(texto, "ACCTID"),
    periodo: inicio && fim ? { inicio, fim } : null,
    movimentos,
    saldosDoDia: saldoFinal === null ? [] : [{ data: dataSaldo, saldoCentavos: saldoFinal }],
    // O OFX só informa o saldo final; o inicial é o final menos tudo que se movimentou.
    saldoInicialCentavos: saldoFinal === null ? null : saldoFinal - soma,
    diasQueNaoBatem: [],
  };
}

/** CSV da conta Nubank: Data,Valor,Identificador,Descrição (mesmo identificador do OFX). */
export function lerExtratoNubankCsv(texto: string): ExtratoLido {
  const linhas = limparControle(texto).replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!/^Data,Valor,Identificador,Descri/i.test(linhas[0] ?? "")) {
    throw new ErroDeFormato("Não parece o CSV do extrato da conta Nubank.");
  }
  const movimentos: (MovimentoExtrato & { idBanco: string | null })[] = [];
  const vistos = new Map<string, number>();
  for (const linha of linhas.slice(1)) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4}),(-?\d+(?:\.\d{1,2})?),([^,]*),(.*)$/.exec(linha);
    if (!m) continue;
    const data = `${m[3]}-${m[2]}-${m[1]}`;
    const valor = valorOfx(m[4]);
    if (!ehDataValida(data) || valor === null) continue;
    const descricao = m[6].replace(/^"|"$/g, "").replace(/""/g, '"');
    // O estorno vem com o mesmo identificador da transação original; no OFX ele tem ":reversal".
    let id = m[5] || null;
    if (id && /^Estorno\b/i.test(descricao)) id = `${id}:reversal`;
    if (id && vistos.has(id)) id = `${id}:${vistos.get(id)! + 1}`;
    if (id) vistos.set(id.split(":")[0], (vistos.get(id.split(":")[0]) ?? 0) + 1);
    movimentos.push({ data, valorCentavos: valor, idBanco: id, ...separarMemo(descricao) });
  }
  if (movimentos.length === 0) throw new ErroDeFormato("O CSV não tem lançamentos.");
  movimentos.sort((a, b) => a.data.localeCompare(b.data));
  return {
    banco: "nubank",
    titular: null,
    agencia: null,
    conta: null,
    periodo: { inicio: movimentos[0].data, fim: movimentos.at(-1)!.data },
    movimentos,
    saldosDoDia: [],
    saldoInicialCentavos: null,
    diasQueNaoBatem: [],
  };
}
