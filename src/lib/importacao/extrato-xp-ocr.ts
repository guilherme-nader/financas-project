import { ehDataValida, type DataISO } from "../datas";
import { conferirSaldos, type ExtratoLido, type MovimentoExtrato } from "./extrato";
import { ErroDeFormato } from "./fatura-xp-csv";

/**
 * Extrato da conta XP lido por OCR (o PDF da XP é uma imagem da tela, sem texto).
 *
 * Cada linha: "DD/MM/AAAA HH:MM:SS  Descrição  [-]R$ 1.234,56  R$ 9.876,54" (valor e saldo).
 * O OCR erra pontuação ("RS 3.7/42,56", "1.93795"), então:
 * - valores são lidos só pelos dígitos (todo valor tem 2 casas decimais);
 * - a coluna de saldo confere cada linha: saldo anterior + valor = saldo;
 * - se o valor está ilegível mas os saldos vizinhos fecham, o valor é recalculado pelo saldo;
 * - o que ainda não fecha é marcado como suspeito (vai para Revisar).
 */

export type ExtratoOcr = ExtratoLido & {
  /** Índices (em `movimentos`) de linhas cujo valor não pôde ser confirmado pelo saldo. */
  suspeitos: number[];
  /** Linhas com data que não foi possível ler. */
  ilegiveis: string[];
};

type Linha = { data: DataISO; texto: string; valor: number; saldo: number };

function normalizar(l: string): string {
  return l
    .replace(/[—–]/g, "-")
    .replace(/\|/g, " ")
    .replace(/R\s?S\$?\s?(?=[\d.,\s])/g, "R$ ")
    .replace(/\s+/g, " ")
    .trim();
}

// Data, depois a hora (que o OCR costuma sujar: "07:00:44:", "16:33:4/ /—") e o resto da linha.
const CABECALHO = /^(\d{2})\/(\d{2})\/(\d{4})\S*\s+(?:[\d:./'"]{4,12}[^A-Za-zÀ-ÿ]*)?(.*)$/;

function digitos(texto: string): number | null {
  const d = texto.replace(/\D/g, "");
  return d ? Number(d) : null;
}

/** "Pixrecebido de Fulano" -> lançamento "Pix recebido", descrição "Fulano". */
export function separarDescricaoXp(texto: string): { lancamento: string; descricao: string } {
  const t = texto.replace(/\s+/g, " ").trim();
  const pix = /^Pix\s*(recebido|enviado)\s*(de|para)\s+(.+)$/i.exec(t);
  if (pix) return { lancamento: `Pix ${pix[1].toLowerCase()}`, descricao: pix[3].trim() };
  const ted = /^TED\s*(recebida|enviada)\s*(de|para)\s+(.+)$/i.exec(t);
  if (ted) return { lancamento: `TED ${ted[1].toLowerCase()}`, descricao: ted[3].trim() };
  const pagto = /^Pagamento para\s+(.+)$/i.exec(t);
  if (pagto) return { lancamento: "Pagamento", descricao: pagto[1].trim() };
  return { lancamento: t, descricao: "" };
}

export function lerExtratoXpOcr(linhasOcr: string[]): ExtratoOcr {
  const texto = linhasOcr.map(normalizar);
  const conta = texto.map((l) => /Conta do cliente:?\s*([\d.-]+)/i.exec(l)).find(Boolean)?.[1] ?? null;

  const lidas: Linha[] = [];
  const ilegiveis: string[] = [];
  let ultimoAno: number | null = null;
  for (const l of texto) {
    const m = CABECALHO.exec(l);
    if (!m || !l.includes("R$")) continue;
    // Ano impossível ("2076") é erro de OCR: usa o da linha anterior.
    let ano = Number(m[3]);
    if ((ano < 2000 || ano > 2049) && ultimoAno) ano = ultimoAno;
    const data = `${ano}-${m[2]}-${m[1]}`;
    const partes = m[4].split("R$");
    if (!ehDataValida(data) || partes.length !== 3) {
      ilegiveis.push(l);
      continue;
    }
    ultimoAno = ano;
    let descricao = partes[0].trim();
    const negativo = descricao.endsWith("-");
    descricao = descricao.replace(/[-—\s/]+$/, "").replace(/^[^A-Za-zÀ-ÿ]+/, "").trim();
    const valor = digitos(partes[1]);
    const saldo = digitos(partes[2]);
    if (valor === null || saldo === null || !descricao) {
      ilegiveis.push(l);
      continue;
    }
    lidas.push({ data, texto: descricao, valor: negativo ? -valor : valor, saldo });
  }
  if (lidas.length === 0) {
    throw new ErroDeFormato("Não consegui ler lançamentos neste extrato da XP. Tente uma imagem mais nítida.");
  }

  // O extrato vem do mais novo para o mais antigo.
  lidas.reverse();

  // Confere pelo saldo e corrige valores ilegíveis quando os vizinhos fecham.
  const suspeitos: number[] = [];
  for (let i = 1; i < lidas.length; i++) {
    const anterior = lidas[i - 1];
    const atual = lidas[i];
    if (anterior.saldo + atual.valor === atual.saldo) continue;
    const proxima = lidas[i + 1];
    const recalculado = atual.saldo - anterior.saldo;
    const vizinhosFecham = !proxima || atual.saldo + proxima.valor === proxima.saldo;
    // Só corrige se o tamanho do número é parecido (o OCR trocou/sujou um dígito, não inventou).
    if (vizinhosFecham && Math.abs(String(Math.abs(recalculado)).length - String(Math.abs(atual.valor)).length) <= 1) {
      atual.valor = recalculado;
      continue;
    }
    suspeitos.push(i);
  }

  // Chave: data, valor e o saldo logo depois (quase único), com a ordem entre linhas iguais.
  const vistas = new Map<string, number>();
  const movimentos: MovimentoExtrato[] = lidas.map((l) => {
    const base = `xp-ocr|${l.data}|${l.valor}|${l.saldo}`;
    const n = (vistas.get(base) ?? 0) + 1;
    vistas.set(base, n);
    return { data: l.data, valorCentavos: l.valor, idBanco: `${base}|${n}`, ...separarDescricaoXp(l.texto) };
  });

  // Saldo no fim de cada dia = saldo da última linha do dia.
  const saldosDoDia: ExtratoLido["saldosDoDia"] = [];
  for (const l of lidas) {
    const ultimo = saldosDoDia.at(-1);
    if (ultimo?.data === l.data) ultimo.saldoCentavos = l.saldo;
    else saldosDoDia.push({ data: l.data, saldoCentavos: l.saldo });
  }
  const primeira = lidas[0];
  const conferencia = conferirSaldos(movimentos, saldosDoDia);

  return {
    banco: "xp",
    titular: null,
    agencia: null,
    conta,
    periodo: { inicio: primeira.data, fim: lidas.at(-1)!.data },
    movimentos,
    saldosDoDia,
    // Saldo antes da primeira linha: o saldo dela menos o próprio valor.
    saldoInicialCentavos: primeira.saldo - primeira.valor,
    diasQueNaoBatem: conferencia.diasQueNaoBatem,
    suspeitos,
    ilegiveis,
  };
}
