import { ehDataValida, type DataISO } from "../datas";
import { lerValorEmCentavos } from "../dinheiro";
import { conferirSaldos, type ExtratoLido, type MovimentoExtrato } from "./extrato";
import type { ItemDeTexto } from "./extrato-itau-pdf";
import { ErroDeFormato } from "./fatura-xp-csv";

/**
 * Leitor do "Extrato Consolidado Inteligente" mensal do Santander em PDF.
 *
 * Tabela "Movimentação": Data | Descrição | Nº Documento | Movimento (R$) | Saldo (R$)
 * - A data (dd/mm) só aparece no primeiro lançamento do dia; o ano vem do mês do extrato.
 * - Saída tem o sinal no fim: "150,00-".
 * - A descrição pode continuar na linha de baixo (o nome de quem pagou/recebeu).
 * - O saldo aparece no último lançamento do dia.
 * - "SALDO EM dd/mm" abre (saldo anterior) e fecha a tabela; depois vêm outras seções.
 */

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DINHEIRO = /^\d{1,3}(\.\d{3})*,\d{2}-?$/;
const DIA_MES = /^(\d{2})\/(\d{2})$/;

function valor(texto: string): number {
  const t = texto.trim();
  const v = lerValorEmCentavos(t.replace(/-$/, ""))!;
  return t.endsWith("-") ? -v : v;
}

type Colunas = { data: number; descricao: number; documento: number; fimMovimento: number; fimSaldo: number; yCabecalho: number };

function colunas(itens: ItemDeTexto[]): Colunas | null {
  const mov = itens.find((i) => i.texto.trim() === "Movimento (R$)");
  if (!mov) return null;
  const mesmaLinha = (t: string) => itens.find((i) => i.texto.trim() === t && Math.abs(i.y - mov.y) < 3);
  const data = mesmaLinha("Data");
  const desc = mesmaLinha("Descrição");
  const doc = mesmaLinha("Nº Documento");
  const saldo = mesmaLinha("Saldo (R$)");
  if (!data || !desc || !doc || !saldo) return null;
  return {
    data: data.x,
    descricao: desc.x,
    documento: doc.x,
    fimMovimento: mov.x + mov.largura,
    fimSaldo: saldo.x + saldo.largura,
    yCabecalho: mov.y,
  };
}

export function lerExtratoSantander(itens: ItemDeTexto[]): ExtratoLido {
  const todos = itens.filter((i) => i.texto.trim());
  if (!todos.some((i) => /EXTRATO CONSOLIDADO INTELIGENTE/i.test(i.texto))) {
    throw new ErroDeFormato("Não parece um Extrato Consolidado Inteligente do Santander.");
  }

  const mesAno = todos.map((i) => /(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\/(\d{4})/i.exec(i.texto)).find(Boolean);
  if (!mesAno) throw new ErroDeFormato("Não achei o mês do extrato.");
  const ano = Number(mesAno[2]);
  const mes = MESES.indexOf(mesAno[1].toLowerCase()) + 1;

  const iNome = todos.findIndex((i) => i.texto.trim() === "Nome");
  const titular = iNome >= 0 ? (todos[iNome + 1]?.texto.trim() ?? null) : null;
  const agenciaConta = todos.map((i) => /^(\d{4})$/.exec(i.texto.trim())).find(Boolean);
  const conta = todos.map((i) => /^(\d{2}\.\d{6}-\d)$/.exec(i.texto.trim())).find(Boolean);

  const dataDoDia = (dd: string, mm: string): DataISO | null => {
    // Um extrato de janeiro pode citar o saldo de 31/12 do ano anterior.
    const a = Number(mm) > mes ? ano - 1 : ano;
    const d = `${a}-${mm}-${dd}`;
    return ehDataValida(d) ? d : null;
  };

  const movimentos: MovimentoExtrato[] = [];
  const saldosDoDia: ExtratoLido["saldosDoDia"] = [];
  let saldosEm = 0;
  let terminou = false;
  let dataAtual: DataISO | null = null;
  let ultimo: MovimentoExtrato | null = null;

  const paginas = [...new Set(todos.map((i) => i.pagina))].sort((a, b) => a - b);
  for (const pagina of paginas) {
    if (terminou) break;
    const daPagina = todos.filter((i) => i.pagina === pagina);
    const col = colunas(daPagina);
    if (!col) continue;

    const corpo = daPagina.filter((i) => i.y < col.yCabecalho - 2 && i.y > 45);
    const linhas: ItemDeTexto[][] = [];
    for (const item of corpo.sort((a, b) => b.y - a.y)) {
      const linha = linhas.find((l) => Math.abs(l[0].y - item.y) <= 2);
      if (linha) linha.push(item);
      else linhas.push([item]);
    }
    const meio = (col.fimMovimento + col.fimSaldo) / 2;

    for (const linha of linhas.sort((a, b) => b[0].y - a[0].y)) {
      if (terminou) break;
      linha.sort((a, b) => a.x - b.x);
      let descricao = "";
      let mov: number | null = null;
      let saldo: number | null = null;
      for (const item of linha) {
        const t = item.texto.trim();
        const fim = item.x + item.largura;
        if (item.x < col.descricao - 5) {
          const m = DIA_MES.exec(t);
          if (m) dataAtual = dataDoDia(m[1], m[2]);
        } else if (DINHEIRO.test(t) && fim > col.documento + 40) {
          if (fim > meio) saldo = valor(t);
          else mov = valor(t);
        } else if (item.x < col.documento - 5) {
          descricao = descricao ? `${descricao} ${t}` : t;
        }
      }

      const saldoEm = /^SALDO EM (\d{2})\/(\d{2})$/.exec(descricao);
      if (saldoEm) {
        if (saldo !== null) saldosDoDia.push({ data: dataDoDia(saldoEm[1], saldoEm[2])!, saldoCentavos: saldo });
        saldosEm++;
        ultimo = null;
        if (saldosEm >= 2) terminou = true;
        continue;
      }

      if (mov !== null && dataAtual) {
        // "PIX RECEBIDO FULANO" -> lançamento "PIX RECEBIDO", descrição "FULANO".
        const tipo = /^(PIX RECEBIDO|PIX ENVIADO|PIX AGENDADO|PIX DEVOLVIDO|TED RECEBIDA|TED ENVIADA|PAGAMENTO DE BOLETO|PAGTO|REMUNERACAO APLICACAO AUTOMATICA|TARIFA[^0-9]*)\s*(.*)$/i.exec(descricao);
        ultimo = {
          data: dataAtual,
          lancamento: tipo ? tipo[1].trim() : descricao,
          descricao: tipo ? tipo[2].trim() : "",
          valorCentavos: mov,
        };
        movimentos.push(ultimo);
        if (saldo !== null) {
          const ultimoSaldo = saldosDoDia.at(-1);
          if (ultimoSaldo?.data === dataAtual) ultimoSaldo.saldoCentavos = saldo;
          else saldosDoDia.push({ data: dataAtual, saldoCentavos: saldo });
        }
      } else if (descricao && ultimo && mov === null) {
        // Continuação da descrição do lançamento anterior.
        ultimo.descricao = ultimo.descricao ? `${ultimo.descricao} ${descricao}` : descricao;
      }
    }
  }

  if (saldosEm === 0) throw new ErroDeFormato("Não achei a tabela de movimentação do extrato.");

  const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fim = `${ano}-${String(mes).padStart(2, "0")}-${String(new Date(Date.UTC(ano, mes, 0)).getUTCDate()).padStart(2, "0")}`;
  return {
    banco: "santander",
    titular,
    agencia: agenciaConta?.[1] ?? null,
    conta: conta?.[1] ?? null,
    periodo: { inicio, fim },
    movimentos,
    saldosDoDia,
    ...conferirSaldos(movimentos, saldosDoDia),
  };
}
