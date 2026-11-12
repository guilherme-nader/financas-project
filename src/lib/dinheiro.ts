/**
 * Dinheiro é sempre inteiro em centavos. Estas funções convertem entre o que a
 * pessoa digita/vê ("1.234,56") e centavos (123456).
 */

const formatador = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 123456 -> "R$ 1.234,56"; -123456 -> "−R$ 1.234,56" (com sinal de menos tipográfico). */
export function formatarCentavos(centavos: number, opcoes: { sinal?: boolean } = {}): string {
  const absoluto = formatador.format(Math.abs(centavos) / 100);
  if (centavos < 0) return `−R$ ${absoluto}`;
  if (opcoes.sinal && centavos > 0) return `+R$ ${absoluto}`;
  return `R$ ${absoluto}`;
}

/**
 * Converte o texto digitado em centavos. Aceita "1.234,56", "1234,56", "1234.56",
 * "R$ 12", "12,5". Retorna null se não for um valor válido.
 * O sinal é ignorado: quem decide se é entrada ou saída é o tipo do lançamento.
 */
export function lerValorEmCentavos(texto: string): number | null {
  let limpo = texto.replace(/R\$/gi, "").replace(/[\s −-]/g, "").trim();
  if (!limpo) return null;

  if (limpo.includes(",")) {
    // Formato brasileiro: ponto é milhar, vírgula é decimal.
    const [inteiro] = limpo.split(",");
    if (inteiro.includes(".") && !/^\d{1,3}(\.\d{3})+$/.test(inteiro)) return null;
    limpo = limpo.replace(/\./g, "").replace(",", ".");
  } else if ((limpo.match(/\./g) ?? []).length > 1) {
    // "1.234.567" sem vírgula: pontos são milhar.
    if (!/^\d{1,3}(\.\d{3})+$/.test(limpo)) return null;
    limpo = limpo.replace(/\./g, "");
  } else if (/^\d{1,3}\.\d{3}$/.test(limpo)) {
    // "1.234": em pt-BR é mil duzentos e trinta e quatro, não 1,234.
    limpo = limpo.replace(".", "");
  }

  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null;
  const [inteiro, decimal = ""] = limpo.split(".");
  return Number(inteiro) * 100 + Number(decimal.padEnd(2, "0"));
}

/**
 * Divide um total em n parcelas inteiras que somam exatamente o total.
 * A diferença de centavos fica na primeira parcela (como fazem os cartões).
 */
export function dividirEmParcelas(totalCentavos: number, parcelas: number): number[] {
  if (!Number.isInteger(parcelas) || parcelas < 1) {
    throw new Error("Número de parcelas inválido");
  }
  const base = Math.trunc(totalCentavos / parcelas);
  const resto = totalCentavos - base * parcelas;
  return Array.from({ length: parcelas }, (_, i) => (i === 0 ? base + resto : base));
}
