import type { DataISO } from "../datas";

/** Formato comum a todos os leitores de extrato de conta. */

export type MovimentoExtrato = {
  data: DataISO;
  /** Tipo do lançamento como o banco escreve ("PIX ENVIADO", "SALÁRIO"…). */
  lancamento: string;
  /** Contraparte ou detalhe ("FULANO DE TAL", "REND PAGO APLIC AUT MAIS"). */
  descricao: string;
  /** Com sinal: entrada positiva, saída negativa. */
  valorCentavos: number;
  /** Identificador do lançamento dado pelo banco (FITID do OFX), quando existe. */
  idBanco?: string | null;
};

export type ExtratoLido = {
  banco: "itau" | "santander" | "nubank" | "ofx";
  titular: string | null;
  agencia: string | null;
  conta: string | null;
  periodo: { inicio: DataISO; fim: DataISO } | null;
  /** Em ordem cronológica. */
  movimentos: MovimentoExtrato[];
  /** Saldos informados pelo banco (fim do dia), em ordem cronológica. */
  saldosDoDia: { data: DataISO; saldoCentavos: number }[];
  /** Saldo antes do primeiro movimento do extrato. */
  saldoInicialCentavos: number | null;
  /** Dias em que saldo anterior + movimentos do dia não bate com o saldo informado. */
  diasQueNaoBatem: { data: DataISO; esperado: number; informado: number }[];
};

/**
 * Confere o extrato dia a dia: saldo do dia anterior + movimentos do dia = saldo do dia.
 * Também calcula o saldo de abertura a partir do primeiro saldo informado.
 */
export function conferirSaldos(
  movimentos: MovimentoExtrato[],
  saldosDoDia: ExtratoLido["saldosDoDia"],
): Pick<ExtratoLido, "saldoInicialCentavos" | "diasQueNaoBatem"> {
  const somaDoDia = new Map<DataISO, number>();
  for (const m of movimentos) somaDoDia.set(m.data, (somaDoDia.get(m.data) ?? 0) + m.valorCentavos);

  const diasQueNaoBatem: ExtratoLido["diasQueNaoBatem"] = [];
  for (let i = 1; i < saldosDoDia.length; i++) {
    // Soma tudo que aconteceu depois do saldo anterior até este dia (inclusive).
    let movimentado = 0;
    for (const [dia, soma] of somaDoDia) {
      if (dia > saldosDoDia[i - 1].data && dia <= saldosDoDia[i].data) movimentado += soma;
    }
    const esperado = saldosDoDia[i - 1].saldoCentavos + movimentado;
    if (esperado !== saldosDoDia[i].saldoCentavos) {
      diasQueNaoBatem.push({ data: saldosDoDia[i].data, esperado, informado: saldosDoDia[i].saldoCentavos });
    }
  }

  const primeiro = saldosDoDia[0];
  return {
    saldoInicialCentavos: primeiro ? primeiro.saldoCentavos - (somaDoDia.get(primeiro.data) ?? 0) : null,
    diasQueNaoBatem,
  };
}
