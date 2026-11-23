import { ehDataValida, type DataISO } from "../datas";
import { lerValorEmCentavos } from "../dinheiro";
import { conferirSaldos, type ExtratoLido, type MovimentoExtrato } from "./extrato";
import { ErroDeFormato } from "./fatura-xp-csv";

export type { ExtratoLido, MovimentoExtrato } from "./extrato";

/**
 * Leitor do "Extrato conta corrente" do Itaú em PDF (o PDF gerado pelo banco, com texto).
 *
 * A tabela tem as colunas Data | Lançamentos | Descrição | Valor (R$) | Saldo (R$).
 * - Linhas só com data e saldo são o saldo no fim daquele dia.
 * - Lançamento e descrição podem continuar na linha de baixo ("RECEBIMENTO DE PIX QR" / "CODE").
 * - A ordem é do mais novo para o mais antigo.
 *
 * Em vez de texto corrido, usamos a posição de cada pedaço de texto na página: a coluna é
 * decidida pelo cabeçalho daquela página, o que aguenta mudanças de escala entre páginas.
 */

export type ItemDeTexto = {
  pagina: number;
  texto: string;
  x: number;
  /** y cresce para cima (padrão PDF). */
  y: number;
  largura: number;
};

const DATA = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const DINHEIRO = /^-?\d{1,3}(\.\d{3})*,\d{2}$/;

function dataISO(texto: string): DataISO | null {
  const m = DATA.exec(texto.trim());
  if (!m) return null;
  const d = `${m[3]}-${m[2]}-${m[1]}`;
  return ehDataValida(d) ? d : null;
}

function centavos(texto: string): number {
  const v = lerValorEmCentavos(texto)!;
  return texto.trim().startsWith("-") ? -v : v;
}

type Colunas = { lancamento: number; descricao: number; fimValor: number; fimSaldo: number; yCabecalho: number };

function colunasDaPagina(itens: ItemDeTexto[]): Colunas | null {
  const achar = (t: string) => itens.find((i) => i.texto.trim() === t);
  const valor = achar("Valor (R$)");
  const saldo = achar("Saldo (R$)");
  const lanc = itens.find((i) => i.texto.trim() === "Lançamentos" && valor && Math.abs(i.y - valor.y) < 3);
  const desc = achar("Descrição");
  if (!valor || !saldo || !lanc || !desc) return null;
  return {
    lancamento: lanc.x,
    descricao: desc.x,
    fimValor: valor.x + valor.largura,
    fimSaldo: saldo.x + saldo.largura,
    yCabecalho: valor.y,
  };
}

type Registro = { data: DataISO; lancamento: string[]; descricao: string[]; valor: number | null; saldo: number | null };

export function lerExtratoItau(itens: ItemDeTexto[]): ExtratoLido {
  const todos = itens.filter((i) => i.texto.trim());
  const texto = (re: RegExp) => todos.map((i) => re.exec(i.texto)).find(Boolean) ?? null;

  if (!todos.some((i) => /Extrato conta corrente/i.test(i.texto))) {
    throw new ErroDeFormato("Não parece um extrato de conta corrente do Itaú em PDF.");
  }

  const agencia = texto(/ag[eê]ncia:\s*([\d-]+)/i)?.[1] ?? null;
  const conta = texto(/conta:\s*([\d.-]+)/i)?.[1] ?? null;
  const periodo = texto(/(\d{2}\/\d{2}\/\d{4})\s*até\s*(\d{2}\/\d{2}\/\d{4})/i);
  // O nome do titular é o texto mais alto da primeira página.
  const primeira = todos.filter((i) => i.pagina === 1).sort((a, b) => b.y - a.y);
  const titular = primeira[0] && !/extrato|cpf|ag[eê]ncia/i.test(primeira[0].texto) ? primeira[0].texto.trim() : null;

  const registros: Registro[] = [];
  const paginas = [...new Set(todos.map((i) => i.pagina))].sort((a, b) => a - b);

  for (const pagina of paginas) {
    const daPagina = todos.filter((i) => i.pagina === pagina);
    const col = colunasDaPagina(daPagina);
    if (!col) continue;

    // Agrupa em linhas visuais (mesmo y, com tolerância), de cima para baixo.
    const corpo = daPagina.filter((i) => i.y < col.yCabecalho - 2).sort((a, b) => b.y - a.y || a.x - b.x);
    const linhas: ItemDeTexto[][] = [];
    for (const item of corpo) {
      const linha = linhas.find((l) => Math.abs(l[0].y - item.y) <= 3);
      if (linha) linha.push(item);
      else linhas.push([item]);
    }
    linhas.sort((a, b) => b[0].y - a[0].y);

    let atual: Registro | null = null;
    const meioValorSaldo = (col.fimValor + col.fimSaldo) / 2;
    for (const linha of linhas) {
      linha.sort((a, b) => a.x - b.x);
      const data = linha[0].x < col.lancamento - 5 ? dataISO(linha[0].texto) : null;
      if (data) {
        atual = { data, lancamento: [], descricao: [], valor: null, saldo: null };
        registros.push(atual);
      } else if (!atual) {
        continue;
      }
      for (const item of data ? linha.slice(1) : linha) {
        const t = item.texto.trim();
        if (DINHEIRO.test(t) && item.x > col.descricao) {
          if (item.x + item.largura > meioValorSaldo) atual.saldo = centavos(t);
          else atual.valor = centavos(t);
        } else if (item.x >= col.descricao - 2) {
          atual.descricao.push(t);
        } else if (item.x >= col.lancamento - 2) {
          atual.lancamento.push(t);
        }
      }
    }
  }

  // Do mais antigo para o mais novo.
  registros.reverse();
  const movimentos: MovimentoExtrato[] = [];
  const saldosDoDia: ExtratoLido["saldosDoDia"] = [];
  for (const r of registros) {
    if (r.valor !== null && r.lancamento.length) {
      movimentos.push({
        data: r.data,
        lancamento: r.lancamento.join(" "),
        descricao: r.descricao.join(" "),
        valorCentavos: r.valor,
      });
    } else if (r.saldo !== null && r.valor === null) {
      saldosDoDia.push({ data: r.data, saldoCentavos: r.saldo });
    }
  }
  if (movimentos.length === 0) throw new ErroDeFormato("Nenhum lançamento encontrado no extrato.");

  return {
    banco: "itau",
    titular,
    agencia,
    conta,
    periodo: periodo ? { inicio: dataISO(periodo[1])!, fim: dataISO(periodo[2])! } : null,
    movimentos,
    saldosDoDia,
    ...conferirSaldos(movimentos, saldosDoDia),
  };
}
