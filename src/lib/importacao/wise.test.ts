import { describe, expect, it } from "vitest";
import { classificarMovimento } from "./classificar";
import { converter, cotacaoNaData, fechamentosPorDia } from "./cotacao";
import { lerExtratoWise } from "./extrato-wise-pdf";

// Linhas como saem do PDF da Conta Global (dados fictícios).
const LINHAS = [
  "Extrato Wise",
  "Conta:  12345678",
  "Período:  01/09/2026  até  30/11/2026",
  "Data  Transação  Tipo  Valor  Status",
  "06/10/2026",
  "Banco Teste SA  TRANSFER  4.54 USD  Completed",
  "16:10",
  "30/09/2026",
  "Lanchonete X  CARD_PAYMENT  28 EUR  Completed",
  "08:49",
  "26/09/2026  Federação de",
  "CARD_PAYMENT  16.65 EUR  Completed",
  "10:45  Tênis Teste",
  "24/09/2026",
  "Metrô  CARD_CHECK  0 EUR  Cancelled",
  "14:00",
  "24/09/2026",
  "Loja Grande  CARD_PAYMENT  1,234.50 EUR  Completed",
  "13:00",
];

describe("lerExtratoWise", () => {
  const w = lerExtratoWise(LINHAS);

  it("lê transações concluídas, com descrição em várias linhas e valor com milhar", () => {
    expect(w.conta).toBe("12345678");
    expect(w.periodo).toEqual({ inicio: "2026-09-01", fim: "2026-11-30" });
    expect(w.movimentos).toEqual([
      { data: "2026-09-24", descricao: "Loja Grande", tipo: "CARD_PAYMENT", moeda: "EUR", valorMoedaCentesimos: -123450 },
      { data: "2026-09-26", descricao: "Federação de Tênis Teste", tipo: "CARD_PAYMENT", moeda: "EUR", valorMoedaCentesimos: -1665 },
      { data: "2026-09-30", descricao: "Lanchonete X", tipo: "CARD_PAYMENT", moeda: "EUR", valorMoedaCentesimos: -2800 },
      { data: "2026-10-06", descricao: "Banco Teste SA", tipo: "TRANSFER", moeda: "USD", valorMoedaCentesimos: -454 },
    ]);
  });
});

describe("cotação PTAX", () => {
  const f = fechamentosPorDia([
    { cotacaoVenda: 5.8711, dataHoraCotacao: "2026-09-25 10:08:10", tipoBoletim: "Abertura" },
    { cotacaoVenda: 5.8626, dataHoraCotacao: "2026-09-25 13:06:51", tipoBoletim: "Fechamento" },
    { cotacaoVenda: 5.85, dataHoraCotacao: "2026-09-28 10:00:00", tipoBoletim: "Abertura" },
    { cotacaoVenda: 5.84, dataHoraCotacao: "2026-09-28 11:00:00", tipoBoletim: "Intermediário" },
  ]);

  it("usa o fechamento do dia; sem fechamento, o último boletim", () => {
    expect(f.get("2026-09-25")).toBe(5.8626);
    expect(f.get("2026-09-28")).toBe(5.84);
  });

  it("no fim de semana vale o último dia útil anterior", () => {
    expect(cotacaoNaData(f, "2026-09-27")).toEqual({ valor: 5.8626, dia: "2026-09-25" });
    expect(cotacaoNaData(f, "2026-09-20")).toBeNull();
  });

  it("converte centésimos de euro em centavos de real", () => {
    expect(converter(-1665, 5.8626)).toBe(-9761);
  });
});

describe("câmbio na classificação", () => {
  const ctx = { nomesProprios: [], regrasOrdenadas: [] };
  it("volta da conta global e liquidação de câmbio são transferência", () => {
    expect(classificarMovimento({ data: "2026-10-06", lancamento: "Transferência para conta própria", descricao: "Banco Teste SA", valorCentavos: -2400 }, ctx).tipo).toBe("transferencia");
    expect(classificarMovimento({ data: "2026-10-06", lancamento: "LIQ. CAMBIO COMPRA 639605224", descricao: "", valorCentavos: 2213 }, ctx).tipo).toBe("transferencia");
  });
});
