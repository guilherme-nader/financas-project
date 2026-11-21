import { compacto } from "./texto";

/**
 * Regras de categorização: "se a descrição contém X, a categoria é Y".
 * As do usuário (criadas na tela Revisar) valem antes das que já vêm prontas;
 * entre regras do mesmo tipo, a mais específica (padrão mais longo) vence.
 */

export type RegraAplicavel = {
  id: string;
  /** Já em forma compacta (sem acento, maiúsculo, sem espaços). */
  padrao: string;
  categoriaId: string;
  /** Nome bonito para a descrição, ex.: "Uber". */
  nome: string | null;
  origem: "sistema" | "usuario";
};

export function ordenarRegras<T extends RegraAplicavel>(regras: T[]): T[] {
  return [...regras].sort((a, b) => {
    if (a.origem !== b.origem) return a.origem === "usuario" ? -1 : 1;
    return b.padrao.length - a.padrao.length;
  });
}

/** Recebe as regras já ordenadas por `ordenarRegras`. */
export function encontrarRegra<T extends RegraAplicavel>(descricao: string, regrasOrdenadas: T[]): T | null {
  const alvo = compacto(descricao);
  return regrasOrdenadas.find((r) => r.padrao && alvo.includes(r.padrao)) ?? null;
}

/**
 * Regras que já vêm prontas. Padrões genéricos de grandes redes e serviços, nada pessoal.
 * Formato: [padrão, "Categoria" ou "Categoria/Subcategoria", nome de exibição opcional].
 */
export const REGRAS_INICIAIS: [string, string, string?][] = [
  ["UBER", "Transporte/Uber e 99", "Uber"],
  ["99RIDE", "Transporte/Uber e 99", "99"],
  ["99POP", "Transporte/Uber e 99", "99"],
  ["CABIFY", "Transporte/Uber e 99", "Cabify"],
  ["AUTOPOSTO", "Transporte/Combustível"],
  ["SHELL", "Transporte/Combustível", "Shell"],
  ["IPIRANGA", "Transporte/Combustível", "Ipiranga"],
  ["ESTACIONAMENTO", "Transporte/Estacionamento"],
  ["ESTAPAR", "Transporte/Estacionamento", "Estapar"],
  ["SEMPARAR", "Transporte/Estacionamento", "Sem Parar"],
  ["99FOOD", "Alimentação/Delivery", "99Food"],
  ["IFOOD", "Alimentação/Delivery", "iFood"],
  ["IFD*", "Alimentação/Delivery", "iFood"],
  ["RAPPI", "Alimentação/Delivery", "Rappi"],
  ["HORTIFRUTI", "Alimentação/Mercado"],
  ["SUPERMERCADO", "Alimentação/Mercado"],
  ["SUPERMERCADOS", "Alimentação/Mercado"],
  ["CARREFOUR", "Alimentação/Mercado", "Carrefour"],
  ["ATACADAO", "Alimentação/Mercado", "Atacadão"],
  ["ASSAI", "Alimentação/Mercado", "Assaí"],
  ["PADARIA", "Alimentação/Lanches e cafés"],
  ["ACAI", "Alimentação/Lanches e cafés"],
  ["SORVETE", "Alimentação/Lanches e cafés"],
  ["STARBUCKS", "Alimentação/Lanches e cafés", "Starbucks"],
  ["RESTAURANTE", "Alimentação/Restaurantes"],
  ["PIZZARIA", "Alimentação/Restaurantes"],
  ["SUSHI", "Alimentação/Restaurantes"],
  ["MCDONALDS", "Alimentação/Restaurantes", "McDonald's"],
  ["WELLHUB", "Saúde/Academia", "Wellhub"],
  ["GYMPASS", "Saúde/Academia", "Gympass"],
  ["SMARTFIT", "Saúde/Academia", "Smart Fit"],
  ["DROGA", "Saúde/Farmácia"],
  ["ARAUJO", "Saúde/Farmácia", "Drogaria Araujo"],
  ["PANVEL", "Saúde/Farmácia", "Panvel"],
  ["PACHECO", "Saúde/Farmácia", "Drogaria Pacheco"],
  ["ODONTO", "Saúde/Médicos e dentista"],
  ["CLINICA", "Saúde/Médicos e dentista"],
  ["LABORATORIO", "Saúde/Médicos e dentista"],
  ["PRUDENT", "Seguros/Seguro de vida", "Prudential"],
  ["METROPOLITANLIFE", "Seguros/Seguro de vida", "MetLife"],
  ["METLIFE", "Seguros/Seguro de vida", "MetLife"],
  ["NETFLIX", "Assinaturas/Streaming", "Netflix"],
  ["SPOTIFY", "Assinaturas/Streaming", "Spotify"],
  ["AMAZONPRIME", "Assinaturas/Streaming", "Amazon Prime"],
  ["DISNEY", "Assinaturas/Streaming", "Disney+"],
  ["HBOMAX", "Assinaturas/Streaming", "HBO Max"],
  ["GLOBOPLAY", "Assinaturas/Streaming", "Globoplay"],
  ["YOUTUBE", "Assinaturas/Streaming", "YouTube"],
  ["APPLE.COM", "Assinaturas/Apps e nuvem", "Apple"],
  ["GOOGLE", "Assinaturas/Apps e nuvem", "Google"],
  ["ANTHROPIC", "Assinaturas/Apps e nuvem", "Claude"],
  ["OPENAI", "Assinaturas/Apps e nuvem", "OpenAI"],
  ["MICROSOFT", "Assinaturas/Apps e nuvem", "Microsoft"],
  ["PETZ", "Pets", "Petz"],
  ["COBASI", "Pets", "Cobasi"],
  ["GOLLINHAS", "Lazer/Viagens", "Gol"],
  ["LATAM", "Lazer/Viagens", "Latam"],
  ["AZULLINHAS", "Lazer/Viagens", "Azul"],
  ["AIRBNB", "Lazer/Viagens", "Airbnb"],
  ["BOOKING", "Lazer/Viagens", "Booking"],
  ["HOTEL", "Lazer/Viagens"],
  ["CINEMARK", "Lazer/Passeios", "Cinemark"],
  ["CINEMA", "Lazer/Passeios"],
  ["INGRESSO", "Lazer/Passeios"],
  ["SYMPLA", "Lazer/Passeios", "Sympla"],
  ["MOBLY", "Casa/Móveis e decoração", "Mobly"],
  ["TOKSTOK", "Casa/Móveis e decoração", "Tok&Stok"],
  ["LEROY", "Casa/Móveis e decoração", "Leroy Merlin"],
  ["MOVELARIA", "Casa/Móveis e decoração"],
  ["CORTIN", "Casa/Móveis e decoração"],
  ["VIVARA", "Presentes", "Vivara"],
  ["RIACHUELO", "Roupas", "Riachuelo"],
  ["RENNER", "Roupas", "Renner"],
  ["ZARA", "Roupas", "Zara"],
  ["LIVRARIA", "Educação/Livros"],
  ["IOF", "Impostos e tarifas/Tarifas bancárias", "IOF"],
  ["ANUIDADE", "Impostos e tarifas/Tarifas bancárias", "Anuidade"],
];
