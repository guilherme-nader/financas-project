import { describe, expect, it } from "vitest";
import { somarDias } from "../datas";
import { acharLancadoAMao } from "./casar-manual";

describe("lançamento manual reconhecido na importação", () => {
  const manuais = [
    { id: "a", data: "2026-03-10", valorCentavos: -2822 },
    { id: "b", data: "2026-03-12", valorCentavos: -2822 },
    { id: "c", data: "2026-03-10", valorCentavos: -8640 },
  ];

  it("acha o de mesmo valor mais próximo da data do banco", () => {
    expect(acharLancadoAMao(manuais, { data: "2026-03-12", valorCentavos: -2822 }, new Set())?.id).toBe("b");
  });

  it("não usa o mesmo lançamento duas vezes", () => {
    expect(acharLancadoAMao(manuais, { data: "2026-03-12", valorCentavos: -2822 }, new Set(["b"]))?.id).toBe("a");
    expect(acharLancadoAMao(manuais, { data: "2026-03-12", valorCentavos: -2822 }, new Set(["a", "b"]))).toBeNull();
  });

  it("ignora valor diferente, sinal trocado ou mais de 3 dias", () => {
    expect(acharLancadoAMao(manuais, { data: "2026-03-10", valorCentavos: 8640 }, new Set())).toBeNull();
    expect(acharLancadoAMao(manuais, { data: "2026-03-14", valorCentavos: -8640 }, new Set())).toBeNull();
  });

  it("soma dias atravessando mês e ano", () => {
    expect(somarDias("2026-12-30", 3)).toBe("2027-01-02");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
  });
});
