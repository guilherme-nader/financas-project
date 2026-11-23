import "server-only";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { db } from "@/db";
import { categorias, pessoas, transacoes } from "@/db/schema";
import { mesmaPessoa } from "./classificar";
import { descricaoAmigavel } from "./texto";
import { parearTransferencias } from "./parear";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Pix/TED que ficaram para revisão porque, na hora da importação, o app ainda não conhecia
 * o nome (ex.: o extrato da Débora entrou depois). Quando um nome novo é aprendido ou salvo,
 * eles viram transferência entre contas e são ligados ao outro lado. Assim a ordem em que
 * os extratos são importados não importa.
 */
export async function reclassificarPendentes(tx: Tx): Promise<number> {
  const nomes = (await tx.select({ n: pessoas.nomesNoBanco }).from(pessoas)).flatMap((p) => p.n);
  if (nomes.length === 0) return 0;

  const pendentes = await tx
    .select({ id: transacoes.id, contraparte: transacoes.contraparte, valor: transacoes.valorCentavos })
    .from(transacoes)
    .where(and(eq(transacoes.precisaRevisao, true), isNotNull(transacoes.contraparte)));
  const proprios = pendentes.filter((p) => nomes.some((n) => mesmaPessoa(p.contraparte!, n)));
  if (proprios.length === 0) return 0;

  const categoria = await tx.query.categorias.findFirst({
    where: and(eq(categorias.tipo, "transferencia"), eq(categorias.nome, "Transferência entre contas")),
    columns: { id: true },
  });
  for (const p of proprios) {
    const quem = descricaoAmigavel(p.contraparte!);
    await tx
      .update(transacoes)
      .set({
        tipo: "transferencia",
        categoriaId: categoria?.id ?? null,
        precisaRevisao: false,
        descricao: p.valor > 0 ? `Pix recebido de ${quem}` : `Pix enviado para ${quem}`,
        atualizadoEm: new Date(),
      })
      .where(inArray(transacoes.id, [p.id]));
  }
  await parearTransferencias(tx);
  return proprios.length;
}
