import { somarMeses, type DataISO } from "../datas";
import type { FaturaLida } from "./fatura-xp-csv";
import { compacto } from "./texto";

/**
 * Transforma a fatura lida nas linhas que vão para o banco, do ponto de vista da conta
 * do cartão (compra = saída, negativa). Função pura: o banco só executa o plano.
 *
 * Chaves de importação
 * - Compra à vista: identificada pela fatura, data, estabelecimento, valor e a ordem entre
 *   compras idênticas (duas corridas de Uber iguais no mesmo dia são duas linhas).
 * - Parcela: identificada pela COMPRA ORIGINAL e pelo número da parcela, sem depender da
 *   fatura. Assim a parcela 3/4 criada como prevista ao importar a fatura com a 2/4 é a
 *   mesma linha que aparece de verdade na fatura seguinte, e é confirmada, não duplicada.
 */

export type LinhaPlanejada = {
  chave: string;
  /** Mesma string para todas as parcelas de uma compra (vira o grupoParcelamentoId). */
  grupo: string | null;
  tipo: "despesa" | "transferencia";
  ehPagamento: boolean;
  data: DataISO;
  dataCaixa: DataISO;
  descricaoOriginal: string;
  portador: string;
  /** Com sinal, do ponto de vista do cartão. */
  valorCentavos: number;
  parcelaNumero: number | null;
  parcelaTotal: number | null;
  status: "prevista" | "realizada";
};

export function planejarFatura(fatura: FaturaLida, vencimento: DataISO): LinhaPlanejada[] {
  const linhas: LinhaPlanejada[] = [];
  const ocorrencias = new Map<string, number>();
  const ordem = (base: string) => {
    const n = (ocorrencias.get(base) ?? 0) + 1;
    ocorrencias.set(base, n);
    return n;
  };

  for (const c of fatura.compras) {
    const estab = compacto(c.descricaoOriginal);
    const comum = {
      tipo: "despesa" as const,
      ehPagamento: false,
      descricaoOriginal: c.descricaoOriginal,
      portador: c.portador,
      valorCentavos: -c.valorCentavos,
    };

    if (!c.parcelaNumero || !c.parcelaTotal) {
      const base = `c|${vencimento}|${c.data}|${estab}|${c.valorCentavos}`;
      linhas.push({
        ...comum,
        chave: `${base}|${ordem(base)}`,
        grupo: null,
        data: c.data,
        dataCaixa: vencimento,
        parcelaNumero: null,
        parcelaTotal: null,
        status: "realizada",
      });
      continue;
    }

    // Parcela k de n: esta e as próximas (previstas) até a última.
    const baseGrupo = `p|${c.data}|${estab}|${c.valorCentavos}|${c.parcelaTotal}|${c.parcelaNumero}`;
    const grupo = `p|${c.data}|${estab}|${c.valorCentavos}|${c.parcelaTotal}|${ordem(baseGrupo)}`;
    for (let numero = c.parcelaNumero; numero <= c.parcelaTotal; numero++) {
      const adiante = numero - c.parcelaNumero;
      linhas.push({
        ...comum,
        chave: `${grupo}|${numero}`,
        grupo,
        data: somarMeses(c.data, numero - 1),
        dataCaixa: somarMeses(vencimento, adiante),
        parcelaNumero: numero,
        parcelaTotal: c.parcelaTotal,
        status: adiante === 0 ? "realizada" : "prevista",
      });
    }
  }

  for (const p of fatura.pagamentos) {
    const base = `pg|${p.data}|${p.valorCentavos}`;
    linhas.push({
      chave: `${base}|${ordem(base)}`,
      grupo: null,
      tipo: "transferencia",
      ehPagamento: true,
      data: p.data,
      dataCaixa: p.data,
      descricaoOriginal: "Pagamento de fatura",
      portador: p.portador,
      valorCentavos: p.valorCentavos,
      parcelaNumero: null,
      parcelaTotal: null,
      status: "realizada",
    });
  }

  return linhas;
}
