import { describe, expect, it } from "vitest";
import { lerFaturaNubank } from "./fatura-nubank-pdf";
import { decodificarOfx, lerExtratoNubankCsv, lerOfx, separarMemo } from "./ofx";
import { planejarFatura } from "./planejar-fatura";

// Dados fictícios no formato real dos arquivos.
const OFX = `OFXHEADER:100
DATA:OFXSGML
ENCODING:UTF-8
<OFX>
<SIGNONMSGSRSV1><SONRS><FI><ORG>NU PAGAMENTOS S.A.</ORG></FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>0260</BANKID><BRANCHID>1</BRANCHID><ACCTID>1234567-8</ACCTID></BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260101000000[-3:BRT]</DTSTART>
<DTEND>20260131000000[-3:BRT]</DTEND>
<STMTTRN>
<TRNTYPE>DEBIT</TRNTYPE>
<DTPOSTED>20260108000000[-3:BRT]</DTPOSTED>
<TRNAMT>-3623.34</TRNAMT>
<FITID>aaa-1</FITID>
<MEMO>Transferência enviada pelo Pix - FULANO B S SOUZA - •••.111.222-•• - BANCO X (0001) Agência: 1 Conta: 9-9</MEMO>
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT</TRNTYPE>
<DTPOSTED>20260105000000[-3:BRT]</DTPOSTED>
<TRNAMT>1000.5</TRNAMT>
<FITID>aaa-2</FITID>
<MEMO>Pagamento de fatura</MEMO>
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>500.00</BALAMT><DTASOF>20260131000000[-3:BRT]</DTASOF></LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

describe("lerOfx", () => {
  const e = lerOfx(decodificarOfx(new TextEncoder().encode(OFX)));

  it("lê lançamentos em ordem, com identificador do banco e memo separado", () => {
    expect(e.banco).toBe("nubank");
    expect(e.conta).toBe("1234567-8");
    expect(e.periodo).toEqual({ inicio: "2026-01-01", fim: "2026-01-31" });
    expect(e.movimentos).toEqual([
      { data: "2026-01-05", valorCentavos: 100050, idBanco: "aaa-2", lancamento: "Pagamento de fatura", descricao: "" },
      { data: "2026-01-08", valorCentavos: -362334, idBanco: "aaa-1", lancamento: "Transferência enviada pelo Pix", descricao: "FULANO B S SOUZA" },
    ]);
  });

  it("calcula o saldo inicial a partir do saldo final", () => {
    expect(e.saldosDoDia).toEqual([{ data: "2026-01-31", saldoCentavos: 50000 }]);
    expect(e.saldoInicialCentavos).toBe(50000 - (100050 - 362334));
  });

  it("decodifica OFX em Windows-1252", () => {
    const latin = new Uint8Array([...new TextEncoder().encode("CHARSET:1252\n<MEMO>Transfer"), 0xea, ...new TextEncoder().encode("ncia")]);
    expect(decodificarOfx(latin)).toContain("Transferência");
  });

  it("recusa OFX de cartão na aba de extrato", () => {
    expect(() => lerOfx("<OFX><CREDITCARDMSGSRSV1>")).toThrow(/cartão/);
  });
});

describe("separarMemo", () => {
  it("trata estorno", () => {
    expect(separarMemo("Estorno - Transferência enviada pelo Pix - LOJA X - 00.000/0001-00")).toEqual({ lancamento: "Estorno", descricao: "LOJA X" });
  });
});

describe("lerExtratoNubankCsv", () => {
  const csv = [
    "Data,Valor,Identificador,Descrição",
    "19/08/2026,-69.16,id-9,Transferência enviada pelo Pix - LOJA X - 00.000/0001-00",
    "19/08/2026,69.16,id-9,Estorno - Transferência enviada pelo Pix - LOJA X - 00.000/0001-00",
    "08/01/2026,-3623.34,aaa-1,Transferência enviada pelo Pix - FULANO B S SOUZA - •••.111.222-••",
  ].join("\n");
  const e = lerExtratoNubankCsv(csv);

  it("usa o mesmo identificador do OFX, inclusive no estorno", () => {
    expect(e.movimentos.map((m) => m.idBanco)).toEqual(["aaa-1", "id-9", "id-9:reversal"]);
    expect(e.movimentos[2]).toMatchObject({ lancamento: "Estorno", descricao: "LOJA X", valorCentavos: 6916 });
  });
});

describe("lerFaturaNubank", () => {
  const linhas = [
    "Esta é a sua fatura de",
    "novembro, no valor de",
    "R$ 1.657,17",
    "FATURA  09 NOV 2026  EMISSÃO E ENVIO  02 NOV 2026",
    "Fatura anterior  R$ 14.172,42",
    "Pagamento recebido  −R$ 13.937,24",
    "TRANSAÇÕES  DE 02 OUT A 02 NOV",
    "Fulano Souza  R$ 1.421,99",
    "02 OUT  Estorno de \"Loja Online - Co\"  −R$ 227,42",
    "Estorno referente a compra em Loja Online, de valor R$ 235,38",
    "02 OUT  •••• 1234  Loja de Roupa - Parcela 3/4  R$ 297,75",
    "02 OUT  IOF de \"Loja Online - Co\"  −R$ 7,77",
    "02 OUT  •••• 1234  Joalheria - Parcela 3/4  R$ 500,00",
    "02 OUT  Ajuste a débito  R$ 7,77",
    "23 OUT  •••• 1234  Br1*Onibus  R$ 851,66",
    "EUR 50.00 = USD 58.06",
    "Pagamentos  -R$ 13.937,24",
    "09 OUT  Pagamento em 09 OUT  −R$ 13.937,24",
    "09 OUT  Saldo restante da fatura anterior  R$ 0,01",
    "Em cumprimento à regulação do Banco Central",
  ];
  const { fatura, vencimento } = lerFaturaNubank(linhas);

  it("lê vencimento, compras, créditos, parcelas e o pagamento", () => {
    expect(vencimento).toBe("2026-11-09");
    expect(fatura.compras.map((c) => [c.descricaoOriginal, c.valorCentavos, c.parcelaNumero])).toEqual([
      ['Estorno de "Loja Online - Co"', -22742, null],
      ["Loja de Roupa", 29775, 3],
      ['IOF de "Loja Online - Co"', -777, null],
      ["Joalheria", 50000, 3],
      ["Ajuste a débito", 777, null],
      ["Br1*Onibus", 85166, null],
    ]);
    expect(fatura.pagamentos).toEqual([{ data: "2026-10-09", valorCentavos: 1393724, portador: "Fulano Souza" }]);
  });

  it("parcela guarda a data da compra original (2 meses antes da 3ª)", () => {
    expect(fatura.compras[1].data).toBe("2026-08-02");
  });

  it("total confere somando o que sobrou da fatura anterior", () => {
    expect(fatura.totalCentavos).toBe(142199);
    expect(fatura.saldoAnteriorCentavos).toBe(23518);
    expect(fatura.totalInformadoCentavos).toBe(142199 + 23518);
  });
});

describe("parcelas do Nubank entre faturas", () => {
  it("a 1ª parcela (dia da compra) e a 2ª (dia do fechamento) são a mesma compra", () => {
    const setembro = planejarFatura(
      { compras: [{ data: "2026-08-19", descricaoOriginal: "Joalheria", portador: "", valorCentavos: 50000, parcelaNumero: 1, parcelaTotal: 4 }], pagamentos: [], totalCentavos: 50000, linhasIgnoradas: [] },
      "2026-09-09",
    );
    const outubro = planejarFatura(
      { compras: [{ data: "2026-08-02", descricaoOriginal: "Joalheria", portador: "", valorCentavos: 50000, parcelaNumero: 2, parcelaTotal: 4 }], pagamentos: [], totalCentavos: 50000, linhasIgnoradas: [] },
      "2026-10-09",
    );
    const previstaDe2 = setembro.find((l) => l.parcelaNumero === 2)!;
    expect(outubro[0].chave).toBe(previstaDe2.chave);
  });
});
