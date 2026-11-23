import type { MovimentoExtrato } from "./extrato";
import { encontrarRegra, type RegraAplicavel } from "./regras";
import { descricaoAmigavel, normalizar } from "./texto";

/**
 * Decide o que é cada movimento de um extrato de conta.
 * Função pura: recebe os nomes que identificam vocês dois nos bancos e as regras.
 */

const LIGACOES = new Set(["DE", "DA", "DO", "DAS", "DOS", "E"]);

function tokens(nome: string): string[] {
  return normalizar(nome)
    .replace(/[^A-Z ]/g, " ")
    .split(" ")
    .filter((t) => t && !LIGACOES.has(t));
}

/**
 * Os bancos abreviam e cortam nomes: "FULANO B S SOUZA", "Fulano Beltrano Sicrano So".
 * É a mesma pessoa se o primeiro nome é igual e cada pedaço do nome mais curto aparece,
 * na ordem, no mais longo: igual, como inicial ("B" = BELTRANO) ou como começo ("SO" = SOUZA).
 */
export function mesmaPessoa(a: string, b: string): boolean {
  const ta = tokens(a);
  const tb = tokens(b);
  const [curto, longo] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (curto.length < 2 || curto[0] !== longo[0]) return false;
  let j = 1;
  for (const parte of curto.slice(1)) {
    // Abreviação vale nos dois sentidos: "B" casa com "BELTRANO" e "BELTRANO" com "B".
    while (j < longo.length && !(longo[j].startsWith(parte) || parte.startsWith(longo[j]))) j++;
    if (j >= longo.length) return false;
    j++;
  }
  return true;
}

export type Classificacao = {
  tipo: "receita" | "despesa" | "transferencia";
  /** Para transferências e receitas conhecidas: nome da categoria. Senão, vem da regra. */
  categoriaNome: string | null;
  regra: RegraAplicavel | null;
  descricao: string;
  precisaRevisao: boolean;
};

const PIX_OU_TED = /\b(PIX|TED|DOC|TRANSF)/;

/** O movimento é um Pix/TED/transferência com nome de contraparte? (Para guardar e reclassificar depois.) */
export function contraparteDe(m: { lancamento: string; descricao: string }): string | null {
  return PIX_OU_TED.test(normalizar(m.lancamento)) && m.descricao.trim() ? m.descricao.trim() : null;
}

export function classificarMovimento(
  m: MovimentoExtrato,
  contexto: { nomesProprios: string[]; regrasOrdenadas: RegraAplicavel[] },
): Classificacao {
  const lanc = normalizar(m.lancamento);
  const desc = normalizar(m.descricao);
  const tudo = `${lanc} ${desc}`;
  const entrada = m.valorCentavos > 0;
  const quem = m.descricao ? descricaoAmigavel(m.descricao) : "";

  if (/SALARIO/.test(tudo)) {
    return { tipo: "receita", categoriaNome: "Salário", regra: null, descricao: quem && !/SALARIO/.test(desc) ? `Salário · ${quem}` : "Salário", precisaRevisao: false };
  }
  if (/RENDIMENTO|REND PAGO|REMUNERACAO APLICACAO/.test(tudo)) {
    return { tipo: "receita", categoriaNome: "Rendimentos de investimentos", regra: null, descricao: "Rendimento da conta", precisaRevisao: false };
  }
  if (/PAGAMENTO DE FATURA|PAGTO FATURA|PAG FATURA|FATURA CARTAO/.test(tudo)) {
    return { tipo: "transferencia", categoriaNome: "Pagamento de fatura", regra: null, descricao: "Pagamento de fatura", precisaRevisao: false };
  }
  // Dinheiro indo/voltando da conta global (câmbio) é transferência entre contas de vocês.
  if (/TRANSFERENCIA PARA CONTA PROPRIA|LIQ\.? CAMBIO/.test(tudo)) {
    return { tipo: "transferencia", categoriaNome: "Transferência entre contas", regra: null, descricao: entrada ? "Câmbio: volta da conta global" : "Câmbio: conta global", precisaRevisao: false };
  }
  // XP: "Transferência enviada para a conta investimento" / "recebida da conta investimento".
  if (/CONTA ?INVESTIMENTO/.test(tudo)) {
    return entrada
      ? { tipo: "transferencia", categoriaNome: "Resgate de investimento", regra: null, descricao: "Resgate da conta investimento", precisaRevisao: false }
      : { tipo: "transferencia", categoriaNome: "Aporte em investimento", regra: null, descricao: "Aplicação na conta investimento", precisaRevisao: false };
  }
  if (/APLICACAO|APLIC\b/.test(tudo) && !entrada) {
    return { tipo: "transferencia", categoriaNome: "Aporte em investimento", regra: null, descricao: "Aplicação", precisaRevisao: false };
  }
  if (/RESGATE/.test(tudo) && entrada) {
    return { tipo: "transferencia", categoriaNome: "Resgate de investimento", regra: null, descricao: "Resgate", precisaRevisao: false };
  }
  if (PIX_OU_TED.test(lanc) && m.descricao && contexto.nomesProprios.some((n) => mesmaPessoa(m.descricao, n))) {
    return {
      tipo: "transferencia",
      categoriaNome: "Transferência entre contas",
      regra: null,
      descricao: entrada ? `Pix recebido de ${quem}` : `Pix enviado para ${quem}`,
      precisaRevisao: false,
    };
  }

  const regra = encontrarRegra(`${m.lancamento} ${m.descricao}`, contexto.regrasOrdenadas);
  const rotulo = quem || descricaoAmigavel(m.lancamento);
  return {
    tipo: entrada ? "receita" : "despesa",
    categoriaNome: null,
    regra,
    descricao: regra?.nome ?? (PIX_OU_TED.test(lanc) && quem ? `${entrada ? "Pix de" : "Pix para"} ${quem}` : rotulo),
    // Regra de despesa não serve para entrada (e vice-versa): quem decide é a revisão.
    precisaRevisao: !regra,
  };
}
