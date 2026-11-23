import "server-only";
import { buscarPtax, converter, cotacaoNaData } from "./cotacao";
import { dataBR } from "../datas";
import type { ExtratoLido, MovimentoExtrato } from "./extrato";
import type { ExtratoWise } from "./extrato-wise-pdf";
import { ErroDeFormato } from "./fatura-xp-csv";

const SIMBOLO: Record<string, string> = { EUR: "€", USD: "US$", GBP: "£" };

/** Converte o extrato da conta global para reais pela PTAX de venda do dia de cada transação. */
export async function extratoWiseEmReais(wise: ExtratoWise): Promise<ExtratoLido> {
  const moedas = [...new Set(wise.movimentos.map((m) => m.moeda))];
  const inicio = wise.movimentos[0].data;
  const fim = wise.movimentos.at(-1)!.data;
  const cotacoes = new Map<string, Map<string, number>>();
  try {
    for (const moeda of moedas) cotacoes.set(moeda, await buscarPtax(moeda, inicio, fim));
  } catch {
    throw new ErroDeFormato("Não consegui buscar a cotação no Banco Central agora. Tente de novo em alguns minutos.");
  }

  const vistos = new Map<string, number>();
  const movimentos: MovimentoExtrato[] = wise.movimentos.map((m) => {
    const cotacao = cotacaoNaData(cotacoes.get(m.moeda)!, m.data);
    if (!cotacao) throw new ErroDeFormato(`Sem cotação de ${m.moeda} para ${dataBR(m.data)}.`);
    const base = `wise|${m.data}|${m.descricao}|${m.valorMoedaCentesimos}|${m.moeda}`;
    const n = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, n);
    const valorMoeda = `${SIMBOLO[m.moeda] ?? m.moeda} ${(Math.abs(m.valorMoedaCentesimos) / 100).toFixed(2).replace(".", ",")}`;
    const ehTransferencia = m.tipo === "TRANSFER" && /BANCO|BANK/i.test(m.descricao);
    return {
      data: m.data,
      lancamento: ehTransferencia ? "Transferência para conta própria" : m.valorMoedaCentesimos < 0 ? "Compra no exterior" : "Crédito no exterior",
      descricao: m.descricao,
      valorCentavos: converter(m.valorMoedaCentesimos, cotacao.valor),
      idBanco: `${base}|${n}`,
      observacao: `${valorMoeda} × R$ ${cotacao.valor.toFixed(4).replace(".", ",")} (PTAX de venda de ${dataBR(cotacao.dia)})`,
    };
  });

  return {
    banco: "wise",
    titular: null,
    agencia: null,
    conta: wise.conta,
    periodo: wise.periodo,
    movimentos,
    saldosDoDia: [],
    saldoInicialCentavos: null,
    diasQueNaoBatem: [],
  };
}
