import { describe, expect, it } from "vitest";
import { classificarMovimento, mesmaPessoa } from "./classificar";
import { conferirSaldos } from "./extrato";
import { lerExtratoItau, type ItemDeTexto } from "./extrato-itau-pdf";
import { lerExtratoSantander } from "./extrato-santander-pdf";
import { REGRAS_INICIAIS, ordenarRegras, type RegraAplicavel } from "./regras";

// Nomes fictícios.
const TITULAR = "FULANO BELTRANO SICRANO SOUZA";

describe("mesmaPessoa", () => {
  it.each([
    ["FULANO B S SOUZA", true],
    ["Fulano Beltrano Sicrano So", true],
    ["FULANO BELTRANO SICRANO", true],
    ["fulano beltrano de sicrano souza", true],
    ["FULANO A OLIVEIRA", false],
    ["Fulano Almeida de Oliv", false],
    ["CICRANA BELTRANO SICRANO SOUZA", false],
    ["FULANO", false],
  ])("%s -> %s", (nome, esperado) => {
    expect(mesmaPessoa(nome, TITULAR)).toBe(esperado);
  });

  it("reconhece o nome completo quando o conhecido é o abreviado (mesmo número de palavras)", () => {
    expect(mesmaPessoa("FULANO BELTRANO SICRANO SOUZA", "FULANO B S SOUZA")).toBe(true);
    expect(mesmaPessoa("FULANO B S SOUZA", "FULANO BELTRANO SICRANO SOUZA")).toBe(true);
    expect(mesmaPessoa("FULANO BELTRANO SICRANO SOUZA", "FULANO X S SOUZA")).toBe(false);
  });
});

describe("classificarMovimento", () => {
  const regras: RegraAplicavel[] = ordenarRegras(
    REGRAS_INICIAIS.map(([padrao, categoria, nome], i) => ({ id: `${i}`, padrao, categoriaId: categoria, nome: nome ?? null, origem: "sistema" as const })),
  );
  const ctx = { nomesProprios: [TITULAR, "CICRANA DE TAL"], regrasOrdenadas: regras };
  const mov = (lancamento: string, descricao: string, valorCentavos: number) => ({ data: "2026-03-10", lancamento, descricao, valorCentavos });

  it("pix entre contas próprias e para o cônjuge é transferência", () => {
    expect(classificarMovimento(mov("PIX ENVIADO", "FULANO B S SOUZA", -10000), ctx)).toMatchObject({ tipo: "transferencia", categoriaNome: "Transferência entre contas" });
    expect(classificarMovimento(mov("PIX RECEBIDO", "Cicrana de Tal", 5000), ctx).tipo).toBe("transferencia");
  });

  it("salário e rendimento são receitas conhecidas", () => {
    expect(classificarMovimento(mov("SALÁRIO", "EMPRESA X LTDA", 700000), ctx)).toMatchObject({ tipo: "receita", categoriaNome: "Salário", descricao: "Salário · Empresa X Ltda", precisaRevisao: false });
    expect(classificarMovimento(mov("RENDIMENTOS", "REND PAGO APLIC AUT MAIS", 224), ctx).categoriaNome).toBe("Rendimentos de investimentos");
  });

  it("pagamento de fatura é transferência", () => {
    expect(classificarMovimento(mov("PAGAMENTO DE FATURA", "", -500000), ctx).categoriaNome).toBe("Pagamento de fatura");
  });

  it("pix para terceiros vai para revisão, a não ser que uma regra conheça", () => {
    expect(classificarMovimento(mov("PIX ENVIADO", "Arena Esportes Ltda", -45000), ctx)).toMatchObject({ tipo: "despesa", precisaRevisao: true, descricao: "Pix para Arena Esportes Ltda" });
    expect(classificarMovimento(mov("PIX RECEBIDO", "OUTRA PESSOA", 2500), ctx)).toMatchObject({ tipo: "receita", precisaRevisao: true });
    expect(classificarMovimento(mov("PAGAMENTO", "UBER DO BRASIL", -3000), ctx)).toMatchObject({ tipo: "despesa", precisaRevisao: false });
  });
});

describe("conferirSaldos", () => {
  it("aponta o dia em que o saldo não fecha e calcula a abertura", () => {
    const movimentos = [
      { data: "2026-01-02", lancamento: "A", descricao: "", valorCentavos: 1000 },
      { data: "2026-01-03", lancamento: "B", descricao: "", valorCentavos: -300 },
      { data: "2026-01-05", lancamento: "C", descricao: "", valorCentavos: 50 },
    ];
    const r = conferirSaldos(movimentos, [
      { data: "2026-01-02", saldoCentavos: 1500 },
      { data: "2026-01-03", saldoCentavos: 1200 },
      { data: "2026-01-05", saldoCentavos: 1300 },
    ]);
    expect(r.saldoInicialCentavos).toBe(500);
    expect(r.diasQueNaoBatem).toEqual([{ data: "2026-01-05", esperado: 1250, informado: 1300 }]);
  });
});

// Itens de texto montados à mão, com as posições do PDF real (dados fictícios).
const item = (pagina: number, texto: string, x: number, y: number, largura = texto.length * 4.5): ItemDeTexto => ({ pagina, texto, x, y, largura });

describe("lerExtratoItau", () => {
  const cab = (y: number) => [item(1, "Data", 40, y), item(1, "Lançamentos", 100, y), item(1, "Descrição", 256, y), item(1, "Valor (R$)", 416, y, 45), item(1, "Saldo (R$)", 500, y, 45)];
  const itens = [
    item(1, "FULANO B S SOUZA", 454, 795),
    item(1, "agência: 1234", 419, 780),
    item(1, "conta: 0012345-6", 481, 780),
    item(1, "Extrato conta corrente", 40, 537),
    item(1, "Período de visualização: 01/01/2026 até 31/01/2026", 40, 513),
    ...cab(419),
    item(1, "20/01/2026", 40, 392), item(1, "250,00", 529, 391, 16),
    item(1, "20/01/2026", 40, 367), item(1, "RECEBIMENTO DE PIX QR", 100, 366), item(1, "CODE", 100, 350),
    item(1, "PESSOA UM DA", 256, 366), item(1, "SILVA", 256, 350), item(1, "1.000,00", 425, 366, 36),
    item(1, "20/01/2026", 40, 325), item(1, "PIX ENVIADO", 100, 324), item(1, "FULANO B S SOUZA", 256, 324), item(1, "-750,00", 430, 324, 31),
    item(1, "10/01/2026", 40, 300), item(1, "0,00", 529, 300, 13),
  ];
  const e = lerExtratoItau(itens);

  it("lê cabeçalho, movimentos com descrição em duas linhas e saldos", () => {
    expect(e).toMatchObject({ banco: "itau", agencia: "1234", conta: "0012345-6", titular: "FULANO B S SOUZA", periodo: { inicio: "2026-01-01", fim: "2026-01-31" } });
    expect(e.movimentos).toEqual([
      { data: "2026-01-20", lancamento: "PIX ENVIADO", descricao: "FULANO B S SOUZA", valorCentavos: -75000 },
      { data: "2026-01-20", lancamento: "RECEBIMENTO DE PIX QR CODE", descricao: "PESSOA UM DA SILVA", valorCentavos: 100000 },
    ]);
    expect(e.diasQueNaoBatem).toEqual([]);
    expect(e.saldoInicialCentavos).toBe(0);
  });
});

describe("lerExtratoSantander", () => {
  const cab = (p: number, y: number) => [item(p, "Data", 34, y), item(p, "Descrição", 65, y), item(p, "Nº Documento", 298, y, 45), item(p, "Movimento (R$)", 409, y, 49), item(p, "Saldo (R$)", 508, y, 33)];
  const itens = [
    item(1, "EXTRATO CONSOLIDADO INTELIGENTE", 300, 800),
    item(1, "Resumo - março/2026", 60, 700),
    item(1, "Nome", 34, 690), item(1, "FULANO BELTRANO SICRANO SOUZA", 34, 680),
    ...cab(1, 273),
    item(1, "SALDO EM 28/02", 65, 262), item(1, "0,00", 526, 262, 13),
    item(1, "10/03", 34, 252), item(1, "PIX RECEBIDO PESSOA DOIS", 65, 252), item(1, "-", 319, 252, 2), item(1, "25,00", 437, 252, 16),
    item(1, "PIX RECEBIDO", 65, 243), item(1, "-", 319, 243, 2), item(1, "25,00", 437, 243, 16),
    item(1, "Pessoa Tres Com Nome Cor", 65, 233),
    item(1, "PIX ENVIADO Arena Teste Ltda", 65, 224), item(1, "-", 319, 224, 2), item(1, "50,00-", 433, 224, 22), item(1, "0,00", 526, 224, 13),
    item(1, "SALDO EM 31/03", 65, 214), item(1, "0,00", 526, 214, 13),
    item(1, "Saldos por Período", 34, 200), item(1, "99,00", 437, 190, 16),
  ];
  const e = lerExtratoSantander(itens);

  it("lê data só no primeiro do dia, descrição continuada, sinal no fim e para no fim da tabela", () => {
    expect(e.movimentos).toEqual([
      { data: "2026-03-10", lancamento: "PIX RECEBIDO", descricao: "PESSOA DOIS", valorCentavos: 2500 },
      { data: "2026-03-10", lancamento: "PIX RECEBIDO", descricao: "Pessoa Tres Com Nome Cor", valorCentavos: 2500 },
      { data: "2026-03-10", lancamento: "PIX ENVIADO", descricao: "Arena Teste Ltda", valorCentavos: -5000 },
    ]);
    expect(e.saldosDoDia.map((s) => s.data)).toEqual(["2026-02-28", "2026-03-10", "2026-03-31"]);
    expect(e.diasQueNaoBatem).toEqual([]);
    expect(e.titular).toBe("FULANO BELTRANO SICRANO SOUZA");
  });
});
