import { fechamentoPeloVencimento } from "../cartao";
import { planejarFatura } from "./planejar-fatura";
import { describe, expect, it } from "vitest";
import { ErroDeFormato, lerFaturaXpCsv, vencimentoPeloNomeDoArquivo } from "./fatura-xp-csv";
import { REGRAS_INICIAIS, encontrarRegra, ordenarRegras, type RegraAplicavel } from "./regras";
import { chaveEstabelecimento, compacto, descricaoAmigavel, normalizar } from "./texto";

// Fatura fictícia no mesmo formato da exportação da XP.
const FATURA = [
  "Data;Estabelecimento;Portador;Valor;Parcela",
  "04/09/2026;PADARIA BOA VISTA;FULANO TESTE;R$ 23,50;-",
  "05/09/2026;DL*UBERRIDES;FULANO TESTE;R$ 10,39;-",
  "05/09/2026;DL          *UBERRIDES;FULANO TESTE;R$ 10,39;-",
  "08/09/2026;Pagamento de fatura;FULANO TESTE;R$ -3.778,38; de 1",
  "18/08/2026;LOJA DE PRESENTES;FULANO TESTE;R$ 500,00;2 de 4",
  "20/09/2026;ESTORNO LOJA;FULANO TESTE;R$ -15,00;-",
  "21/09/2026;SUPERMERCADO CENTRAL;FULANO TESTE;R$ 1.234,56;-",
  "",
].join("\r\n");

describe("lerFaturaXpCsv", () => {
  const fatura = lerFaturaXpCsv("﻿" + FATURA);

  it("separa compras e o pagamento da fatura anterior", () => {
    expect(fatura.compras).toHaveLength(6);
    expect(fatura.pagamentos).toEqual([{ data: "2026-09-08", valorCentavos: 377838, portador: "FULANO TESTE" }]);
  });

  it("lê datas, valores, estornos e parcelas", () => {
    expect(fatura.compras[0]).toEqual({
      data: "2026-09-04",
      descricaoOriginal: "PADARIA BOA VISTA",
      portador: "FULANO TESTE",
      valorCentavos: 2350,
      parcelaNumero: null,
      parcelaTotal: null,
    });
    const parcela = fatura.compras.find((c) => c.parcelaTotal);
    expect(parcela).toMatchObject({ data: "2026-08-18", valorCentavos: 50000, parcelaNumero: 2, parcelaTotal: 4 });
    expect(fatura.compras.find((c) => c.descricaoOriginal === "ESTORNO LOJA")?.valorCentavos).toBe(-1500);
  });

  it("total da fatura é a soma das compras menos estornos, sem o pagamento", () => {
    expect(fatura.totalCentavos).toBe(2350 + 1039 + 1039 + 50000 - 1500 + 123456);
  });

  it("aponta linhas ilegíveis sem quebrar", () => {
    const comErro = lerFaturaXpCsv(FATURA + "32/13/2026;XYZ;FULANO;R$ 1,00;-\n");
    expect(comErro.linhasIgnoradas).toHaveLength(1);
    expect(comErro.compras).toHaveLength(6);
  });

  it("rejeita arquivo que não é fatura", () => {
    expect(() => lerFaturaXpCsv("nome,idade\nana,3")).toThrow(ErroDeFormato);
  });
});

describe("vencimentoPeloNomeDoArquivo", () => {
  it("lê a data do nome exportado pela XP", () => {
    expect(vencimentoPeloNomeDoArquivo("Fatura2026-10-10.csv")).toBe("2026-10-10");
    expect(vencimentoPeloNomeDoArquivo("fatura.csv")).toBeNull();
    expect(vencimentoPeloNomeDoArquivo("Fatura2026-02-30.csv")).toBeNull();
  });
});

describe("texto", () => {
  it("normaliza e compacta", () => {
    expect(normalizar("Pão  da   Praça")).toBe("PAO DA PRACA");
    expect(compacto("DL          *UBERRIDES")).toBe(compacto("DL*UBERRIDES"));
  });

  it("gera chave de estabelecimento sem números de identificação", () => {
    expect(chaveEstabelecimento("LUCAS SILVA S 118859106")).toBe("LUCASSILVAS");
    expect(chaveEstabelecimento("PRUDENT*APOL001465831")).toBe("PRUDENT*APOL");
  });

  it("deixa a descrição legível", () => {
    expect(descricaoAmigavel("DL*99 RIDE")).toBe("99 Ride");
    expect(descricaoAmigavel("SUP EPA VINTE E TRES")).toBe("Sup Epa Vinte e Tres");
    expect(descricaoAmigavel("PG *99 L2L 99 RIDE")).toBe("99 L2L 99 Ride");
    expect(descricaoAmigavel("LUCAS SILVA S 118859106")).toBe("Lucas Silva S");
  });
});

describe("regras", () => {
  const sistema: RegraAplicavel[] = REGRAS_INICIAIS.map(([padrao, categoria, nome], i) => ({
    id: `s${i}`,
    padrao,
    categoriaId: categoria,
    nome: nome ?? null,
    origem: "sistema",
  }));
  const ordenadas = ordenarRegras(sistema);

  it.each([
    ["DL          *UBERRIDES", "Transporte/Uber e 99"],
    ["PG *99 L2L 99 RIDE", "Transporte/Uber e 99"],
    ["99FOOD *ALGUM SUSHI PENDING", "Alimentação/Delivery"],
    ["WELLHUB FULANO", "Saúde/Academia"],
    ["SUPERMERCADOS BH", "Alimentação/Mercado"],
    ["PRUDENTIAL D*APOL00146583", "Seguros/Seguro de vida"],
    ["ZP*GERACAO MAIS CORTIN", "Casa/Móveis e decoração"],
  ])("%s -> %s", (descricao, categoria) => {
    expect(encontrarRegra(descricao, ordenadas)?.categoriaId).toBe(categoria);
  });

  it("não confunde imposto com posto nem praia com farmácia", () => {
    expect(encontrarRegra("PAGAMENTO IMPOSTO", ordenadas)).toBeNull();
    expect(encontrarRegra("QUIOSQUE DA PRAIA", ordenadas)).toBeNull();
  });

  it("o padrão mais específico vence (99Food antes de 99)", () => {
    expect(encontrarRegra("99FOOD PIZZA", ordenadas)?.nome).toBe("99Food");
  });

  it("regra do usuário vence a do sistema", () => {
    const usuario: RegraAplicavel = { id: "u1", padrao: "UBER", categoriaId: "Trabalho", nome: null, origem: "usuario" };
    const todas = ordenarRegras([...sistema, usuario]);
    expect(encontrarRegra("DL*UBERRIDES", todas)?.categoriaId).toBe("Trabalho");
  });
});


describe("planejarFatura", () => {
  const outubro = planejarFatura(lerFaturaXpCsv(FATURA), "2026-10-10");

  it("compra vira saída no cartão, com caixa no vencimento", () => {
    const padaria = outubro.find((l) => l.descricaoOriginal === "PADARIA BOA VISTA")!;
    expect(padaria).toMatchObject({ valorCentavos: -2350, data: "2026-09-04", dataCaixa: "2026-10-10", status: "realizada" });
  });

  it("estorno vira entrada no cartão", () => {
    expect(outubro.find((l) => l.descricaoOriginal === "ESTORNO LOJA")!.valorCentavos).toBe(1500);
  });

  it("compras idênticas no mesmo dia viram linhas diferentes", () => {
    const uber = outubro.filter((l) => l.descricaoOriginal.includes("UBERRIDES"));
    expect(uber).toHaveLength(2);
    expect(new Set(uber.map((u) => u.chave)).size).toBe(2);
  });

  it("parcela 2 de 4 cria a 2 (realizada) e a 3 e 4 (previstas) nas faturas seguintes", () => {
    const parcelas = outubro.filter((l) => l.parcelaTotal === 4);
    expect(parcelas.map((p) => [p.parcelaNumero, p.status, p.data, p.dataCaixa])).toEqual([
      [2, "realizada", "2026-09-18", "2026-10-10"],
      [3, "prevista", "2026-10-18", "2026-11-10"],
      [4, "prevista", "2026-11-18", "2026-12-10"],
    ]);
    expect(new Set(parcelas.map((p) => p.grupo)).size).toBe(1);
  });

  it("a parcela 3 da fatura seguinte tem a mesma chave da prevista", () => {
    const novembro = planejarFatura(
      lerFaturaXpCsv(FATURA.replace("R$ 500,00;2 de 4", "R$ 500,00;3 de 4")),
      "2026-11-10",
    );
    const prevista = outubro.find((l) => l.parcelaNumero === 3)!;
    const real = novembro.find((l) => l.parcelaNumero === 3)!;
    expect(real.chave).toBe(prevista.chave);
    expect(real.status).toBe("realizada");
    expect(real.grupo).toBe(prevista.grupo);
  });

  it("reimportar a mesma fatura gera exatamente as mesmas chaves", () => {
    const denovo = planejarFatura(lerFaturaXpCsv(FATURA), "2026-10-10");
    expect(denovo.map((l) => l.chave)).toEqual(outubro.map((l) => l.chave));
  });

  it("pagamento da fatura anterior vira transferência de entrada no cartão", () => {
    expect(outubro.find((l) => l.ehPagamento)).toMatchObject({
      tipo: "transferencia",
      valorCentavos: 377838,
      data: "2026-09-08",
    });
  });
});

describe("fechamentoPeloVencimento", () => {
  it("usa os dias do cartão", () => {
    expect(fechamentoPeloVencimento("2026-10-10", 3, 10)).toBe("2026-10-03");
    expect(fechamentoPeloVencimento("2026-11-05", 25, 5)).toBe("2026-10-25");
  });
  it("sem dias configurados, 7 dias antes", () => {
    expect(fechamentoPeloVencimento("2026-10-15", null, null)).toBe("2026-10-08");
  });
});

describe("arquivo com byte nulo", () => {
  it("a fatura XP com caractere de controle no nome do estabelecimento é lida sem ele", () => {
    const csv = "Data;Estabelecimento;Portador;Valor;Parcela\r\n12/08/2026;LOJA DE NEG\u0000CIOS;FULANA;R$ 19,15;-\r\n";
    const lida = lerFaturaXpCsv(csv);
    expect(lida.compras[0].descricaoOriginal).toBe("LOJA DE NEGCIOS");
  });
});
