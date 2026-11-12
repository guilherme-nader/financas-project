import { describe, expect, it } from "vitest";
import { cicloDaFatura } from "./cartao";

describe("cicloDaFatura", () => {
  // Cartão que fecha dia 3 e vence dia 10.
  it("compra antes do fechamento entra na fatura do mês", () => {
    expect(cicloDaFatura("2026-11-02", 3, 10)).toEqual({
      fechamento: "2026-11-03",
      vencimento: "2026-11-10",
    });
  });

  it("compra no dia do fechamento já vai para a fatura seguinte", () => {
    expect(cicloDaFatura("2026-11-03", 3, 10)).toEqual({
      fechamento: "2026-12-03",
      vencimento: "2026-12-10",
    });
  });

  it("vencimento no mês seguinte quando o dia de vencimento é menor que o de fechamento", () => {
    // Fecha dia 25, vence dia 5 do mês seguinte.
    expect(cicloDaFatura("2026-10-25", 25, 5)).toEqual({
      fechamento: "2026-11-25",
      vencimento: "2026-12-05",
    });
    expect(cicloDaFatura("2026-10-24", 25, 5)).toEqual({
      fechamento: "2026-10-25",
      vencimento: "2026-11-05",
    });
  });

  it("vira o ano corretamente", () => {
    expect(cicloDaFatura("2026-12-20", 15, 22)).toEqual({
      fechamento: "2027-01-15",
      vencimento: "2027-01-22",
    });
  });

  it("dia de fechamento que não existe no mês usa o último dia", () => {
    // Fecha dia 31: em fevereiro de 2027 fecha dia 28.
    expect(cicloDaFatura("2027-02-27", 31, 8)).toEqual({
      fechamento: "2027-02-28",
      vencimento: "2027-03-08",
    });
    expect(cicloDaFatura("2027-02-28", 31, 8)).toEqual({
      fechamento: "2027-03-31",
      vencimento: "2027-04-08",
    });
  });

  it("parcelas caem nas faturas dos meses seguintes", () => {
    const compra = "2026-11-09";
    expect(cicloDaFatura(compra, 3, 10, 0).vencimento).toBe("2026-12-10");
    expect(cicloDaFatura(compra, 3, 10, 1).vencimento).toBe("2027-01-10");
    expect(cicloDaFatura(compra, 3, 10, 5).vencimento).toBe("2027-05-10");
  });

  it("rejeita dias inválidos", () => {
    expect(() => cicloDaFatura("2026-11-01", 0, 10)).toThrow();
    expect(() => cicloDaFatura("2026-11-01", 3, 32)).toThrow();
  });
});
