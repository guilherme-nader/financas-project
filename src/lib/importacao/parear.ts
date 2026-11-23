import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { transacoes } from "@/db/schema";
import { partes, type DataISO } from "../datas";
import type { db } from "@/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const diasEntre = (a: DataISO, b: DataISO) => {
  const pa = partes(a);
  const pb = partes(b);
  return Math.abs(Date.UTC(pa.ano, pa.mes - 1, pa.dia) - Date.UTC(pb.ano, pb.mes - 1, pb.dia)) / 86_400_000;
};

/**
 * Liga os dois lados de transferências importadas de arquivos diferentes:
 * uma saída numa conta e uma entrada do mesmo valor em OUTRA conta, até 3 dias de diferença
 * (Pix entre contas próprias, pagamento de fatura no extrato e no cartão, aporte na corretora).
 * Os dois lados passam a compartilhar o mesmo transferenciaId.
 */
export async function parearTransferencias(tx: Tx): Promise<number> {
  const soltas = await tx
    .select({ id: transacoes.id, contaId: transacoes.contaId, data: transacoes.data, valor: transacoes.valorCentavos })
    .from(transacoes)
    .where(and(eq(transacoes.tipo, "transferencia"), isNull(transacoes.transferenciaId)));

  const entradas = soltas.filter((t) => t.valor > 0);
  const usadas = new Set<string>();
  let pares = 0;

  for (const saida of soltas.filter((t) => t.valor < 0).sort((a, b) => a.data.localeCompare(b.data))) {
    const candidatas = entradas
      .filter((e) => !usadas.has(e.id) && e.contaId !== saida.contaId && e.valor === -saida.valor && diasEntre(e.data, saida.data) <= 3)
      .sort((a, b) => diasEntre(a.data, saida.data) - diasEntre(b.data, saida.data));
    const par = candidatas[0];
    if (!par) continue;
    usadas.add(par.id);
    await tx
      .update(transacoes)
      .set({ transferenciaId: crypto.randomUUID(), atualizadoEm: new Date() })
      .where(inArray(transacoes.id, [saida.id, par.id]));
    pares++;
  }
  return pares;
}
