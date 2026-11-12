import { describe, expect, it } from "vitest";
import { montarLinhas } from "./lancamento";

const corrente = { tipo: "corrente" as const, diaFechamento: null, diaVencimento: null };
const cartao = { tipo: "cartao" as const, diaFechamento: 3, diaVencimento: 10 };

describe("montarLinhas", () => {
  it("despesa simples na conta corrente: data e caixa iguais, valor negativo", () => {
    const [linha, ...resto] = montarLinhas(corrente, {
      tipo: "despesa",
      valorTotalCentavos: 359548,
      data: "2026-11-10",
      parcelas: 1,
      hoje: "2026-11-12",
    });
    expect(resto).toHaveLength(0);
    expect(linha).toMatchObject({
      data: "2026-11-10",
      dataCaixa: "2026-11-10",
      valorCentavos: -359548,
      parcelaNumero: null,
      status: "realizada",
      fatura: null,
    });
  });

  it("receita é positiva", () => {
    const [linha] = montarLinhas(corrente, {
      tipo: "receita",
      valorTotalCentavos: 600000,
      data: "2026-11-05",
      parcelas: 1,
      hoje: "2026-11-12",
    });
    expect(linha.valorCentavos).toBe(600000);
  });

  it("compra no cartão: caixa no vencimento da fatura", () => {
    const [linha] = montarLinhas(cartao, {
      tipo: "despesa",
      valorTotalCentavos: 6290,
      data: "2026-11-12",
      parcelas: 1,
      hoje: "2026-11-12",
    });
    expect(linha.data).toBe("2026-11-12");
    expect(linha.dataCaixa).toBe("2026-12-10");
    expect(linha.fatura).toEqual({ fechamento: "2026-12-03", vencimento: "2026-12-10" });
    expect(linha.status).toBe("realizada");
  });

  it("parcelado em 6x no cartão: uma linha por fatura, futuras como previstas", () => {
    const linhas = montarLinhas(cartao, {
      tipo: "despesa",
      valorTotalCentavos: 113940,
      data: "2026-11-09",
      parcelas: 6,
      hoje: "2026-11-12",
    });
    expect(linhas).toHaveLength(6);
    expect(linhas.map((l) => l.valorCentavos)).toEqual(Array(6).fill(-18990));
    expect(linhas.map((l) => l.dataCaixa)).toEqual([
      "2026-12-10",
      "2027-01-10",
      "2027-02-10",
      "2027-03-10",
      "2027-04-10",
      "2027-05-10",
    ]);
    expect(linhas.map((l) => l.parcelaNumero)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(linhas.every((l) => l.parcelaTotal === 6)).toBe(true);
    expect(linhas[0].status).toBe("realizada");
    expect(linhas.slice(1).every((l) => l.status === "prevista")).toBe(true);
  });

  it("valida entradas", () => {
    const base = { tipo: "despesa" as const, valorTotalCentavos: 100, data: "2026-11-01", parcelas: 1, hoje: "2026-11-01" };
    expect(() => montarLinhas(corrente, { ...base, valorTotalCentavos: 0 })).toThrow();
    expect(() => montarLinhas(corrente, { ...base, tipo: "receita", parcelas: 2 })).toThrow();
    expect(() => montarLinhas({ tipo: "cartao", diaFechamento: null, diaVencimento: null }, base)).toThrow();
  });
});
