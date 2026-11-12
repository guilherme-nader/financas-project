/**
 * Datas de calendário como texto 'AAAA-MM-DD', sem fuso horário.
 * Toda a aritmética é feita em ano/mês/dia para não sofrer com horário de verão ou UTC.
 */

export type DataISO = string; // 'AAAA-MM-DD'
export type MesISO = string; // 'AAAA-MM'

const NOMES_MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export function partes(data: DataISO): { ano: number; mes: number; dia: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!m) throw new Error(`Data inválida: ${data}`);
  return { ano: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) };
}

export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

export function montarData(ano: number, mes: number, dia: number): DataISO {
  // Normaliza mês fora de 1..12 (ex.: mês 13 = janeiro do ano seguinte).
  const totalMeses = ano * 12 + (mes - 1);
  const a = Math.floor(totalMeses / 12);
  const m = (totalMeses % 12) + 1;
  const d = Math.min(dia, diasNoMes(a, m));
  return `${String(a).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function ehDataValida(texto: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!m) return false;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= diasNoMes(ano, mes);
}

/** Soma meses mantendo o dia; se o dia não existir no mês de destino, usa o último dia. */
export function somarMeses(data: DataISO, meses: number): DataISO {
  const { ano, mes, dia } = partes(data);
  return montarData(ano, mes + meses, dia);
}

export function hojeISO(fuso = "America/Sao_Paulo"): DataISO {
  // en-CA formata como AAAA-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: fuso }).format(new Date());
}

export function mesDe(data: DataISO): MesISO {
  return data.slice(0, 7);
}

export function ehMesValido(texto: string | undefined | null): texto is MesISO {
  return !!texto && /^\d{4}-(0[1-9]|1[0-2])$/.test(texto);
}

export function primeiroDia(mes: MesISO): DataISO {
  return `${mes}-01`;
}

export function ultimoDia(mes: MesISO): DataISO {
  const [a, m] = mes.split("-").map(Number);
  return montarData(a, m, diasNoMes(a, m));
}

export function somarMesesAoMes(mes: MesISO, n: number): MesISO {
  return mesDe(somarMeses(primeiroDia(mes), n));
}

/** "2026-10" -> "Outubro 2026" */
export function nomeDoMes(mes: MesISO): string {
  const [a, m] = mes.split("-").map(Number);
  const nome = NOMES_MESES[m - 1];
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} ${a}`;
}

/** "2026-11-12" -> "12 nov" */
export function dataCurta(data: DataISO): string {
  const { mes, dia } = partes(data);
  return `${String(dia).padStart(2, "0")} ${NOMES_MESES[mes - 1].slice(0, 3)}`;
}

/** "2026-11-12" -> "12/11/2026" */
export function dataBR(data: DataISO): string {
  const { ano, mes, dia } = partes(data);
  return `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`;
}
