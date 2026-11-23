import { describe, expect, it } from "vitest";
import { classificarMovimento } from "./classificar";
import { lerExtratoXpOcr, separarDescricaoXp } from "./extrato-xp-ocr";

// Texto como sai do OCR (com os erros típicos), dados fictícios, do mais novo para o mais antigo.
const OCR = [
  "Nome: FULANO DE TAL Conta do cliente: 1234567-8",
  "Data/Hora Descrição Valor (R$) Saldo (R$)",
  "10/11/2026 10:55:14 PAGAMENTO DE FATURA -R$ 7.831,82 R$ 0,00",
  "09/11/2026 14:22:02 | Transferência enviada para a conta investimento -R$ 33,03 RS 7.831,82",
  "09/11/2026 14:21:17 Pixrecebido de Cicrana de Tal RS 33,03 RS 7.864,85",
  "09/11/2026 14:02:54 | Pixrecebido de Cicrana de Tal RS 540,00 RS 7.831,82",
  "06/11/2026 07:09:43 TED recebida de EMPRESA X LTDA R$ 4.505,57 R$ 7.291,82",
  "05/11/2026 13:02:13 Pix recebido de Fulano B S Souza R$ 2.7/86,25 R$ 2.786,25",
  "09/10/2026 09:25:05 PAGAMENTO DE FATURA -R$ 6.364,90 R$ 0,00",
];

describe("lerExtratoXpOcr", () => {
  const e = lerExtratoXpOcr(OCR);

  it("lê as linhas em ordem cronológica, com valores pelos dígitos", () => {
    expect(e.conta).toBe("1234567-8");
    expect(e.movimentos.map((m) => [m.data, m.lancamento, m.descricao, m.valorCentavos])).toEqual([
      ["2026-10-09", "PAGAMENTO DE FATURA", "", -636490],
      ["2026-11-05", "Pix recebido", "Fulano B S Souza", 278625],
      ["2026-11-06", "TED recebida", "EMPRESA X LTDA", 450557],
      ["2026-11-09", "Pix recebido", "Cicrana de Tal", 54000],
      ["2026-11-09", "Pix recebido", "Cicrana de Tal", 3303],
      ["2026-11-09", "Transferência enviada para a conta investimento", "", -3303],
      ["2026-11-10", "PAGAMENTO DE FATURA", "", -783182],
    ]);
    expect(e.suspeitos).toEqual([]);
    expect(e.saldoInicialCentavos).toBe(636490);
  });

  it("corrige pelo saldo um valor que o OCR leu errado", () => {
    const comErro = lerExtratoXpOcr(OCR.map((l) => l.replace("R$ 4.505,57 R$ 7.291,82", "R$ 4.595,57 R$ 7.291,82")));
    expect(comErro.movimentos[2].valorCentavos).toBe(450557);
    expect(comErro.suspeitos).toEqual([]);
  });

  it("marca como suspeita a linha que não fecha de jeito nenhum", () => {
    const quebrado = lerExtratoXpOcr(OCR.map((l) => l.replace("R$ 4.505,57 R$ 7.291,82", "R$ 4.505,57 R$ 7.391,82")));
    expect(quebrado.suspeitos.length).toBeGreaterThan(0);
  });

  it("aceita hora e ano sujos pelo OCR", () => {
    const sujo = lerExtratoXpOcr(
      OCR.map((l) =>
        l
          .replace("06/11/2026 07:09:43", "06/11/2026 07:09:4/ /—")
          .replace("05/11/2026 13:02:13", "05/11/2076 13:02:13\""),
      ),
    );
    expect(sujo.movimentos).toHaveLength(e.movimentos.length);
    expect(sujo.movimentos.map((m) => m.data)).toEqual(e.movimentos.map((m) => m.data));
    expect(sujo.movimentos.find((m) => m.descricao === "EMPRESA X LTDA")?.valorCentavos).toBe(450557);
  });

  it("gera identificadores estáveis (reimportar não duplica)", () => {
    expect(lerExtratoXpOcr(OCR).movimentos.map((m) => m.idBanco)).toEqual(e.movimentos.map((m) => m.idBanco));
  });
});

describe("classificação de linhas da XP", () => {
  const ctx = { nomesProprios: ["FULANO BELTRANO SICRANO SOUZA", "CICRANA DE TAL"], regrasOrdenadas: [] };
  const mov = (texto: string, valorCentavos: number) => ({ data: "2026-11-09", valorCentavos, ...separarDescricaoXp(texto) });

  it("conta investimento é aporte/resgate", () => {
    expect(classificarMovimento(mov("Transferência enviada para a conta investimento", -3303), ctx).categoriaNome).toBe("Aporte em investimento");
    expect(classificarMovimento(mov("Transferência recebida da conta investimento", 5329), ctx).categoriaNome).toBe("Resgate de investimento");
  });

  it("pix para vocês mesmos é transferência; pagamento para terceiros vai para revisão", () => {
    expect(classificarMovimento(mov("Pix enviado para Fulano B S Souza", -10000), ctx).tipo).toBe("transferencia");
    expect(classificarMovimento(mov("Pagamento para EMPRESA DE SAUDE", -46972), ctx)).toMatchObject({ tipo: "despesa", precisaRevisao: true });
  });
});
