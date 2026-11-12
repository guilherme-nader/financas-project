import { diasNoMes, montarData, partes, type DataISO } from "./datas";

export type CicloFatura = {
  /** Dia em que a fatura que contém a compra fecha. */
  fechamento: DataISO;
  /** Dia em que essa fatura vence (quando o dinheiro sai da conta). */
  vencimento: DataISO;
};

/**
 * Em qual fatura cai uma compra feita em `dataCompra`.
 *
 * Regra dos cartões brasileiros: a compra feita no dia do fechamento ou depois
 * já entra na fatura seguinte ("melhor dia de compra" = dia do fechamento).
 * Se o dia de fechamento não existe no mês (ex.: 31 em fevereiro), vale o último dia.
 * O vencimento é no mesmo mês do fechamento quando o dia de vencimento é maior que o
 * de fechamento; senão, no mês seguinte.
 *
 * `parcela` (0 = primeira) empurra a fatura `parcela` meses para frente.
 */
export function cicloDaFatura(
  dataCompra: DataISO,
  diaFechamento: number,
  diaVencimento: number,
  parcela = 0,
): CicloFatura {
  validarDia(diaFechamento, "fechamento");
  validarDia(diaVencimento, "vencimento");

  const { ano, mes, dia } = partes(dataCompra);
  const fechamentoNoMesDaCompra = Math.min(diaFechamento, diasNoMes(ano, mes));
  const mesFechamento = (dia >= fechamentoNoMesDaCompra ? mes + 1 : mes) + parcela;
  const mesVencimento = diaVencimento > diaFechamento ? mesFechamento : mesFechamento + 1;

  return {
    fechamento: montarData(ano, mesFechamento, diaFechamento),
    vencimento: montarData(ano, mesVencimento, diaVencimento),
  };
}

function validarDia(dia: number, nome: string) {
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) {
    throw new Error(`Dia de ${nome} inválido: ${dia}`);
  }
}
