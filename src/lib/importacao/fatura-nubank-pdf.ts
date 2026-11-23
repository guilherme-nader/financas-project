import { ehDataValida, somarMeses, type DataISO } from "../datas";
import { lerValorEmCentavos } from "../dinheiro";
import { ErroDeFormato, type CompraFatura, type FaturaLida, type PagamentoNaFatura } from "./fatura-xp-csv";

/**
 * Leitor da fatura do cartão Nubank em PDF, a partir das linhas de texto do documento.
 *
 * - Vencimento: "FATURA 09 OUT 2026". Valor: "Esta é a sua fatura de …, no valor de R$ X".
 * - Transações: "02 OUT  •••• 2626  Loja X  R$ 297,75" (o cartão final é opcional).
 * - Parcela: "Loja - Parcela 2/4". A data é a da PARCELA (não da compra original, como na XP).
 * - Compra em moeda estrangeira vem com linhas de conversão logo abaixo (ignoradas).
 * - IOF, "IOF de volta", estornos e ajustes entram como compras/créditos.
 * - Na seção "Pagamentos": "Pagamento em 09 OUT" é o pagamento da fatura anterior;
 *   "Saldo restante da fatura anterior" (centavos que vão e voltam) é ignorado.
 */

const MESES: Record<string, number> = { JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6, JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12 };

export type FaturaNubankLida = { fatura: FaturaLida; vencimento: DataISO };

function valor(sinal: string | undefined, numero: string): number {
  const v = lerValorEmCentavos(numero)!;
  return sinal ? -v : v;
}

export function ehFaturaNubank(linhas: string[]): boolean {
  return linhas.some((l) => /Esta é a sua fatura de/i.test(l)) && linhas.some((l) => /^TRANSAÇÕES\s+DE\s/i.test(l.trim()));
}

export function lerFaturaNubank(linhas: string[]): FaturaNubankLida {
  const texto = linhas.map((l) => l.trim());
  const venc = texto.map((l) => /FATURA\s+(\d{2})\s+([A-Z]{3})\s+(\d{4})/.exec(l)).find(Boolean);
  if (!venc || !MESES[venc[2]]) throw new ErroDeFormato("Não achei o vencimento na fatura do Nubank.");
  const anoVenc = Number(venc[3]);
  const mesVenc = MESES[venc[2]];
  const vencimento = `${anoVenc}-${String(mesVenc).padStart(2, "0")}-${venc[1]}`;
  if (!ehDataValida(vencimento)) throw new ErroDeFormato("Vencimento inválido na fatura do Nubank.");

  // "no valor de" pode estar na mesma linha do valor ou na de cima.
  let totalInformado: number | null = null;
  const iValor = texto.findIndex((l) => /no valor de/i.test(l));
  if (iValor >= 0) {
    const alvo = /R\$\s*([\d.]+,\d{2})/.exec(texto[iValor]) ?? /R\$\s*([\d.]+,\d{2})/.exec(texto[iValor + 1] ?? "");
    if (alvo) totalInformado = lerValorEmCentavos(alvo[1]);
  }

  // Resumo: "Fatura anterior R$ X" e "Pagamento recebido −R$ Y". O que não foi pago passa para esta.
  const doResumo = (rotulo: RegExp) => {
    const l = texto.find((t) => rotulo.test(t));
    const m = l ? /R\$\s*([\d.]+,\d{2})/.exec(l) : null;
    return m ? lerValorEmCentavos(m[1])! : 0;
  };
  const saldoAnterior = doResumo(/^Fatura anterior\b/i) - doResumo(/^Pagamento recebido\b/i);

  const dataDe = (dia: string, mes: string): DataISO | null => {
    const m = MESES[mes];
    if (!m) return null;
    // Compras de dezembro aparecem na fatura de janeiro do ano seguinte.
    const ano = m > mesVenc ? anoVenc - 1 : anoVenc;
    const d = `${ano}-${String(m).padStart(2, "0")}-${dia}`;
    return ehDataValida(d) ? d : null;
  };

  const compras: CompraFatura[] = [];
  const pagamentos: PagamentoNaFatura[] = [];
  const linhasIgnoradas: FaturaLida["linhasIgnoradas"] = [];
  let naSecao = false;
  let emPagamentos = false;
  let portador = "";

  texto.forEach((linha, i) => {
    if (/^TRANSAÇÕES\s+DE\s/i.test(linha)) {
      naSecao = true;
      emPagamentos = false;
      return;
    }
    if (!naSecao) return;
    if (/^(Em cumprimento|O Nubank declara|Como assegurado)/i.test(linha) || /^\d+ de \d+$/.test(linha)) {
      naSecao = false;
      return;
    }

    const m = /^(\d{2})\s+([A-Z]{3})\s+(?:•+\s*\d{4}\s+)?(.+?)\s+([−-])?\s*R\$\s*([\d.]+,\d{2})$/.exec(linha);
    if (!m) {
      // Cabeçalho do portador ("Fulano  R$ 1.421,99") ou da seção de pagamentos.
      // Só letras e espaços: evita confundir com "Estorno referente a compra…, de valor R$ X".
      const cab = /^([A-Za-zÀ-ÿ ]+?)\s+[−-]?\s*R\$\s*[\d.]+,\d{2}$/.exec(linha);
      if (cab) {
        emPagamentos = /^Pagamentos/i.test(cab[1]);
        if (!emPagamentos) portador = cab[1].trim();
      }
      return; // linhas de conversão de moeda e explicações de estorno
    }

    const data = dataDe(m[1], m[2]);
    const descricao = m[3].trim();
    const v = valor(m[4], m[5]);
    if (!data) {
      linhasIgnoradas.push({ linha: i + 1, conteudo: linha, motivo: "data ilegível" });
      return;
    }
    if (/^Saldo restante da fatura anterior/i.test(descricao)) return;
    if (emPagamentos || /^Pagamento em\s/i.test(descricao)) {
      if (v < 0) pagamentos.push({ data, valorCentavos: -v, portador });
      return;
    }

    const parcela = /^(.*?)\s*-\s*Parcela\s+(\d+)\/(\d+)$/i.exec(descricao);
    if (parcela) {
      const numero = Number(parcela[2]);
      const total = Number(parcela[3]);
      compras.push({
        // Guarda a data da compra original (1ª parcela), como na fatura XP.
        data: somarMeses(data, -(numero - 1)),
        descricaoOriginal: parcela[1].trim(),
        portador,
        valorCentavos: v,
        parcelaNumero: numero,
        parcelaTotal: total,
      });
      return;
    }
    compras.push({ data, descricaoOriginal: descricao, portador, valorCentavos: v, parcelaNumero: null, parcelaTotal: null });
  });

  if (compras.length === 0 && pagamentos.length === 0 && totalInformado === null) {
    throw new ErroDeFormato("Não achei as transações da fatura do Nubank.");
  }

  return {
    vencimento,
    fatura: {
      compras,
      pagamentos,
      totalCentavos: compras.reduce((s, c) => s + c.valorCentavos, 0),
      totalInformadoCentavos: totalInformado,
      saldoAnteriorCentavos: saldoAnterior,
      linhasIgnoradas,
    },
  };
}
