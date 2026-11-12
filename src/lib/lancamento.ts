import { cicloDaFatura } from "./cartao";
import { somarMeses, type DataISO } from "./datas";
import { dividirEmParcelas } from "./dinheiro";

/**
 * Transforma um lançamento digitado (ex.: "compra de R$ 600 em 3x no cartão")
 * nas linhas que vão para o banco: uma por parcela, já com a data de caixa certa.
 * Função pura, sem banco, para poder ser testada.
 */

export type ContaParaLancamento = {
  tipo: "corrente" | "cartao" | "investimento";
  diaFechamento: number | null;
  diaVencimento: number | null;
};

export type EntradaLancamento = {
  tipo: "despesa" | "receita";
  /** Valor total, positivo, em centavos. */
  valorTotalCentavos: number;
  data: DataISO;
  parcelas: number;
  hoje: DataISO;
};

export type LinhaLancamento = {
  data: DataISO;
  dataCaixa: DataISO;
  /** Com sinal: despesa negativa, receita positiva. */
  valorCentavos: number;
  parcelaNumero: number | null;
  parcelaTotal: number | null;
  status: "prevista" | "realizada";
  /** Vencimento da fatura, quando a conta é cartão. */
  fatura: { fechamento: DataISO; vencimento: DataISO } | null;
};

export function montarLinhas(conta: ContaParaLancamento, entrada: EntradaLancamento): LinhaLancamento[] {
  if (entrada.valorTotalCentavos <= 0) throw new Error("O valor precisa ser maior que zero");
  if (!Number.isInteger(entrada.parcelas) || entrada.parcelas < 1 || entrada.parcelas > 72) {
    throw new Error("Parcelas devem ser entre 1 e 72");
  }
  if (entrada.parcelas > 1 && entrada.tipo !== "despesa") {
    throw new Error("Só despesas podem ser parceladas");
  }

  const ehCartao = conta.tipo === "cartao";
  if (ehCartao && (!conta.diaFechamento || !conta.diaVencimento)) {
    throw new Error("Cartão sem dia de fechamento/vencimento configurado");
  }

  const sinal = entrada.tipo === "despesa" ? -1 : 1;
  const valores = dividirEmParcelas(entrada.valorTotalCentavos, entrada.parcelas);
  const parcelado = entrada.parcelas > 1;

  return valores.map((valor, i) => {
    const data = somarMeses(entrada.data, i);
    const fatura = ehCartao
      ? cicloDaFatura(entrada.data, conta.diaFechamento!, conta.diaVencimento!, i)
      : null;
    const dataCaixa = fatura ? fatura.vencimento : data;
    return {
      data,
      dataCaixa,
      valorCentavos: sinal * valor,
      parcelaNumero: parcelado ? i + 1 : null,
      parcelaTotal: parcelado ? entrada.parcelas : null,
      // Parcela futura é certa, mas ainda não aconteceu: fica como prevista.
      status: data > entrada.hoje ? "prevista" : "realizada",
      fatura,
    };
  });
}
