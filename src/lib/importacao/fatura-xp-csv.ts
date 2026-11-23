import { ehDataValida, type DataISO } from "../datas";
import { lerValorEmCentavos } from "../dinheiro";

/**
 * Leitor da fatura do cartão XP exportada em CSV:
 *
 *   Data;Estabelecimento;Portador;Valor;Parcela
 *   05/09/2026;DL*UBERRIDES;FULANO;R$ 10,39;-
 *   18/08/2026;LOJA X;FULANO;R$ 500,00;2 de 4
 *   08/09/2026;Pagamento de fatura;FULANO;R$ -3.778,38; de 1
 *
 * - A data das parcelas é a da compra original.
 * - "Pagamento de fatura" é o pagamento da fatura ANTERIOR, que aparece como crédito.
 * - O vencimento não vem no arquivo, só no nome ("Fatura2026-10-10.csv").
 */

export type CompraFatura = {
  /** Data da compra original (para parcelas, a data da primeira). */
  data: DataISO;
  descricaoOriginal: string;
  portador: string;
  /** Positivo = compra; negativo = estorno/crédito. */
  valorCentavos: number;
  parcelaNumero: number | null;
  parcelaTotal: number | null;
};

export type PagamentoNaFatura = { data: DataISO; valorCentavos: number; portador: string };

export type FaturaLida = {
  compras: CompraFatura[];
  pagamentos: PagamentoNaFatura[];
  /** Soma das compras e estornos lidas no arquivo. */
  totalCentavos: number;
  /** Valor da fatura impresso no próprio documento, quando existe (para conferir). */
  totalInformadoCentavos?: number | null;
  /** Parte do total que veio da fatura anterior não paga inteira (fatura anterior − pagamento). */
  saldoAnteriorCentavos?: number;
  linhasIgnoradas: { linha: number; conteudo: string; motivo: string }[];
};

export class ErroDeFormato extends Error {}

export function vencimentoPeloNomeDoArquivo(nome: string): DataISO | null {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(nome);
  if (!m) return null;
  const data = `${m[1]}-${m[2]}-${m[3]}`;
  return ehDataValida(data) ? data : null;
}

function dataBRParaISO(texto: string): DataISO | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto.trim());
  if (!m) return null;
  const data = `${m[3]}-${m[2]}-${m[1]}`;
  return ehDataValida(data) ? data : null;
}

function lerValorComSinal(texto: string): number | null {
  const negativo = /-/.test(texto);
  const valor = lerValorEmCentavos(texto);
  if (valor === null) return null;
  return negativo ? -valor : valor;
}

function lerParcela(texto: string): { numero: number; total: number } | null {
  const m = /^\s*(\d+)\s*de\s*(\d+)\s*$/i.exec(texto);
  if (!m) return null;
  const numero = Number(m[1]);
  const total = Number(m[2]);
  return numero >= 1 && total >= 2 && numero <= total ? { numero, total } : null;
}

export function lerFaturaXpCsv(conteudo: string): FaturaLida {
  const linhas = conteudo.replace(/^﻿/, "").split(/\r?\n/);
  const cabecalho = (linhas[0] ?? "").split(";").map((c) => c.trim().toLowerCase());
  const col = (nome: string) => cabecalho.indexOf(nome);
  const iData = col("data");
  const iEstab = col("estabelecimento");
  const iPortador = col("portador");
  const iValor = col("valor");
  const iParcela = col("parcela");
  if (iData < 0 || iEstab < 0 || iValor < 0) {
    throw new ErroDeFormato(
      "Não parece uma fatura XP em CSV: faltam as colunas Data, Estabelecimento e Valor.",
    );
  }

  const compras: CompraFatura[] = [];
  const pagamentos: PagamentoNaFatura[] = [];
  const linhasIgnoradas: FaturaLida["linhasIgnoradas"] = [];

  linhas.slice(1).forEach((bruta, i) => {
    if (!bruta.trim()) return;
    const campos = bruta.split(";");
    const numeroLinha = i + 2;
    const data = dataBRParaISO(campos[iData] ?? "");
    const valor = lerValorComSinal(campos[iValor] ?? "");
    const descricao = (campos[iEstab] ?? "").trim();
    const portador = iPortador >= 0 ? (campos[iPortador] ?? "").trim() : "";
    if (!data || valor === null || !descricao) {
      linhasIgnoradas.push({ linha: numeroLinha, conteudo: bruta, motivo: "data, valor ou descrição ilegível" });
      return;
    }

    if (/pagamento\s+de\s+fatura/i.test(descricao) && valor < 0) {
      pagamentos.push({ data, valorCentavos: -valor, portador });
      return;
    }

    const parcela = iParcela >= 0 ? lerParcela(campos[iParcela] ?? "") : null;
    compras.push({
      data,
      descricaoOriginal: descricao,
      portador,
      valorCentavos: valor,
      parcelaNumero: parcela?.numero ?? null,
      parcelaTotal: parcela?.total ?? null,
    });
  });

  if (compras.length === 0 && pagamentos.length === 0) {
    throw new ErroDeFormato("O arquivo não tem nenhuma linha de compra.");
  }

  return {
    compras,
    pagamentos,
    totalCentavos: compras.reduce((s, c) => s + c.valorCentavos, 0),
    linhasIgnoradas,
  };
}
