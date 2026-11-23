import type { DataISO } from "../datas";

/**
 * Cotação PTAX (Banco Central) para converter moeda estrangeira em reais.
 * Usa a PTAX de VENDA do boletim de fechamento de cada dia; em fim de semana e feriado
 * vale a do último dia útil anterior (convenção oficial).
 */

export type BoletimPtax = { cotacaoVenda: number; dataHoraCotacao: string; tipoBoletim: string };

/** Escolhe, para cada dia, o boletim de fechamento (ou o último do dia). Função pura. */
export function fechamentosPorDia(boletins: BoletimPtax[]): Map<DataISO, number> {
  const porDia = new Map<DataISO, { valor: number; fechamento: boolean; hora: string }>();
  for (const b of boletins) {
    const dia = b.dataHoraCotacao.slice(0, 10);
    const atual = porDia.get(dia);
    const fechamento = b.tipoBoletim === "Fechamento";
    if (!atual || (fechamento && !atual.fechamento) || (!atual.fechamento && b.dataHoraCotacao > atual.hora)) {
      porDia.set(dia, { valor: b.cotacaoVenda, fechamento, hora: b.dataHoraCotacao });
    }
  }
  return new Map([...porDia].map(([d, v]) => [d, v.valor]));
}

/** Cotação válida numa data: a do próprio dia ou a do último dia útil antes dela. */
export function cotacaoNaData(fechamentos: Map<DataISO, number>, data: DataISO): { valor: number; dia: DataISO } | null {
  const dias = [...fechamentos.keys()].filter((d) => d <= data).sort();
  const dia = dias.at(-1);
  return dia ? { valor: fechamentos.get(dia)!, dia } : null;
}

/** Converte centésimos de moeda estrangeira para centavos de real (arredondando). */
export function converter(centesimos: number, cotacao: number): number {
  return Math.round(centesimos * cotacao);
}

const API = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata";
const mdy = (d: DataISO) => `${d.slice(5, 7)}-${d.slice(8, 10)}-${d.slice(0, 4)}`;

/** Busca os boletins PTAX de uma moeda num período (com 10 dias antes, para cobrir feriados). */
export async function buscarPtax(moeda: string, inicio: DataISO, fim: DataISO): Promise<Map<DataISO, number>> {
  if (!/^[A-Z]{3}$/.test(moeda)) throw new Error("Moeda inválida");
  const antes = new Date(`${inicio}T12:00:00Z`);
  antes.setUTCDate(antes.getUTCDate() - 10);
  const url =
    `${API}/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)` +
    `?@moeda='${moeda}'&@dataInicial='${mdy(antes.toISOString().slice(0, 10))}'&@dataFinalCotacao='${mdy(fim)}'` +
    `&$format=json&$select=cotacaoVenda,dataHoraCotacao,tipoBoletim`;
  const resposta = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!resposta.ok) throw new Error(`Banco Central respondeu ${resposta.status}`);
  const json = (await resposta.json()) as { value: BoletimPtax[] };
  return fechamentosPorDia(json.value);
}
