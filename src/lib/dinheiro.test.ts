import { describe, expect, it } from "vitest";
import { dividirEmParcelas, formatarCentavos, lerValorEmCentavos } from "./dinheiro";

describe("lerValorEmCentavos", () => {
  it.each([
    ["1.234,56", 123456],
    ["1234,56", 123456],
    ["1234.56", 123456],
    ["R$ 12", 1200],
    ["12,5", 1250],
    ["0,99", 99],
    ["1.234", 123400],
    ["1.234.567", 123456700],
    ["R$ 3.595,48", 359548],
    ["-46,00", 4600],
  ])("%s -> %i", (texto, esperado) => {
    expect(lerValorEmCentavos(texto)).toBe(esperado);
  });

  it.each(["", "abc", "1,234,56", "12,345", "1.2.3,4"])("rejeita %s", (texto) => {
    expect(lerValorEmCentavos(texto)).toBeNull();
  });
});

describe("formatarCentavos", () => {
  it("formata no padrão brasileiro", () => {
    expect(formatarCentavos(123456)).toBe("R$ 1.234,56");
    expect(formatarCentavos(-1085335)).toBe("−R$ 10.853,35");
    expect(formatarCentavos(5)).toBe("R$ 0,05");
    expect(formatarCentavos(600000, { sinal: true })).toBe("+R$ 6.000,00");
  });
});

describe("dividirEmParcelas", () => {
  it("soma exatamente o total e joga o resto na primeira", () => {
    expect(dividirEmParcelas(100000, 3)).toEqual([33334, 33333, 33333]);
    expect(dividirEmParcelas(113940, 6)).toEqual([18990, 18990, 18990, 18990, 18990, 18990]);
    expect(dividirEmParcelas(500, 1)).toEqual([500]);
  });

  it("rejeita número de parcelas inválido", () => {
    expect(() => dividirEmParcelas(100, 0)).toThrow();
    expect(() => dividirEmParcelas(100, 1.5)).toThrow();
  });
});
