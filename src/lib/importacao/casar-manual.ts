import { diasEntre as dias, type DataISO } from "../datas";

/**
 * Lançamento digitado à mão (ex.: um Pix lançado no dia, pelo print do app) que depois chega no extrato.
 * Mesmo valor, até 3 dias de diferença, o mais próximo primeiro. Em vez de duplicar, a importação
 * "adota" o lançamento manual: ele ganha a identidade do banco e mantém a categoria escolhida.
 */
export type Manual = { id: string; data: DataISO; valorCentavos: number };

export function acharLancadoAMao(
  manuais: Manual[],
  movimento: { data: DataISO; valorCentavos: number },
  usados: Set<string>,
): Manual | null {
  const candidatos = manuais
    .filter((m) => !usados.has(m.id) && m.valorCentavos === movimento.valorCentavos && dias(m.data, movimento.data) <= 3)
    .sort((a, b) => dias(a.data, movimento.data) - dias(b.data, movimento.data));
  return candidatos[0] ?? null;
}
