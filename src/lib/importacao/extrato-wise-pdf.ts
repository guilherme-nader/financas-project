import { ehDataValida, type DataISO } from "../datas";
import { ErroDeFormato } from "./fatura-xp-csv";

/**
 * Extrato da Conta Global (Wise) em PDF. Os valores vêm em moeda estrangeira (EUR, USD…).
 *
 * Cada transação ocupa até três linhas:
 *   "26/09/2026  FFT | Fédération"                     <- data (+ começo da descrição)
 *   "CARD_PAYMENT  16.65 EUR  Completed"               <- tipo, valor, moeda, status
 *   "10:45  Française de Tennis"                       <- hora (+ resto da descrição)
 * Na maioria, a descrição fica na linha do meio: "RATP  CARD_PAYMENT  9.10 EUR  Completed".
 * Só transações "Completed" contam (verificações de cartão canceladas são ignoradas).
 */

export type MovimentoEstrangeiro = {
  data: DataISO;
  descricao: string;
  tipo: string;
  moeda: string;
  /** Valor na moeda original, em centésimos, com sinal (saída negativa). */
  valorMoedaCentesimos: number;
};

export type ExtratoWise = { conta: string | null; periodo: { inicio: DataISO; fim: DataISO } | null; movimentos: MovimentoEstrangeiro[] };

const DATA = /^(\d{2})\/(\d{2})\/(\d{4})\s*(.*)$/;
const HORA = /^(\d{2}):(\d{2})\s*(.*)$/;
const TRANSACAO = /^(.*?)\s*([A-Z][A-Z_]{3,})\s+([\d.,]+)\s+([A-Z]{3})\s+(Completed|Cancelled|Pending|Declined|Failed)\s*$/;

/** Tipos em que o dinheiro ENTRA na conta global. */
const ENTRADAS = /ADD|DEPOSIT|TOP_?UP|REFUND|CASHBACK|RECEIVE|INCOMING/;

function dataISO(dd: string, mm: string, aaaa: string): DataISO | null {
  const d = `${aaaa}-${mm}-${dd}`;
  return ehDataValida(d) ? d : null;
}

function centesimos(texto: string): number | null {
  // Formato da Wise: ponto decimal, vírgula de milhar ("1,234.50", "28", "4.81").
  const limpo = texto.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null;
  const [inteiro, decimal = ""] = limpo.split(".");
  return Number(inteiro) * 100 + Number(decimal.padEnd(2, "0"));
}

export function ehExtratoWise(linhas: string[]): boolean {
  return linhas.some((l) => /^Extrato Wise\b/.test(l.trim()));
}

export function lerExtratoWise(linhas: string[]): ExtratoWise {
  if (!ehExtratoWise(linhas)) throw new ErroDeFormato("Não parece um extrato da Wise / Conta Global.");
  const texto = linhas.map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);

  const conta = texto.map((l) => /^Conta:\s*(\S+)/.exec(l)).find(Boolean)?.[1] ?? null;
  const per = texto.map((l) => /Período:\s*(\d{2})\/(\d{2})\/(\d{4})\s*até\s*(\d{2})\/(\d{2})\/(\d{4})/.exec(l)).find(Boolean);
  const periodo = per ? { inicio: dataISO(per[1], per[2], per[3])!, fim: dataISO(per[4], per[5], per[6])! } : null;

  type Pendente = { data: DataISO; partes: string[]; tipo?: string; valor?: number; moeda?: string; status?: string };
  const movimentos: MovimentoEstrangeiro[] = [];
  let atual: Pendente | null = null;

  const fechar = () => {
    if (atual?.tipo && atual.valor !== undefined && atual.moeda && atual.status === "Completed" && atual.valor > 0) {
      const sinal = ENTRADAS.test(atual.tipo) ? 1 : -1;
      movimentos.push({
        data: atual.data,
        descricao: atual.partes.join(" ").replace(/\s+/g, " ").trim() || atual.tipo,
        tipo: atual.tipo,
        moeda: atual.moeda,
        valorMoedaCentesimos: sinal * atual.valor,
      });
    }
    atual = null;
  };

  for (const linha of texto) {
    if (/^(Extrato Wise|Conta:|Período:|Data de Impressão|Data Transação)/.test(linha)) continue;
    const d = DATA.exec(linha);
    if (d) {
      fechar();
      const data = dataISO(d[1], d[2], d[3]);
      if (data) atual = { data, partes: d[4] ? [d[4]] : [] };
      continue;
    }
    if (!atual) continue;
    const t = TRANSACAO.exec(linha);
    if (t && atual.tipo === undefined) {
      if (t[1]) atual.partes.push(t[1]);
      atual.tipo = t[2];
      atual.valor = centesimos(t[3]) ?? undefined;
      atual.moeda = t[4];
      atual.status = t[5];
      continue;
    }
    const h = HORA.exec(linha);
    if (h) {
      if (h[3]) atual.partes.push(h[3]);
      fechar();
    }
  }
  fechar();

  if (movimentos.length === 0) throw new ErroDeFormato("Nenhuma transação concluída no extrato da Wise.");
  movimentos.sort((a, b) => a.data.localeCompare(b.data));
  return { conta, periodo, movimentos };
}
