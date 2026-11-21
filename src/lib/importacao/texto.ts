/**
 * Normalização dos textos que vêm dos bancos ("DL          *UBERRIDES", "Pixrecebido de…").
 */

/** Sem acento, maiúsculo, espaços simples: "Pão  da Praça" -> "PAO DA PRACA". */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalizado e sem espaços, para comparar ignorando espaçamento: "DL *UBER" -> "DL*UBER". */
export function compacto(texto: string): string {
  return normalizar(texto).replace(/\s/g, "");
}

/**
 * Chave do estabelecimento para regras: compacta e sem números longos de identificação
 * ("LUCAS SILVA S 118859106" -> "LUCASSILVAS", "PRUDENT*APOL001465831" -> "PRUDENT*APOL").
 */
export function chaveEstabelecimento(texto: string): string {
  return compacto(texto)
    .replace(/\d{4,}/g, "")
    .replace(/[-*.]+$/g, "");
}

// Intermediários de pagamento que aparecem antes do nome do estabelecimento.
const PREFIXOS = /^(DL|PG|IFD|ZP|UBR|PAG|MP|EC|CAPPTA|PAYPAL|SC-|JIM\.COM)\s*\*?\s*/;

const MINUSCULAS = new Set(["DE", "DA", "DO", "DAS", "DOS", "E", "EM", "PARA", "COM"]);

/** Nome legível: "DL*99 RIDE" -> "99 Ride"; "SUP EPA VINTE E TRES" -> "Sup Epa Vinte e Tres". */
export function descricaoAmigavel(texto: string): string {
  let limpo = texto.replace(/\s+/g, " ").trim();
  for (let i = 0; i < 2; i++) limpo = limpo.replace(PREFIXOS, "");
  limpo = limpo.replace(/\s\d{6,}$/, "").trim() || texto.trim();
  return limpo
    .split(" ")
    .map((palavra, i) => {
      const maiuscula = palavra.toUpperCase();
      if (i > 0 && MINUSCULAS.has(maiuscula)) return palavra.toLowerCase();
      if (/\d/.test(palavra) || palavra.length <= 2) return palavra;
      return palavra.charAt(0).toUpperCase() + palavra.slice(1).toLowerCase();
    })
    .join(" ");
}
