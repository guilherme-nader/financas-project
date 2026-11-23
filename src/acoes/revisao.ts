"use server";

import { and, eq, inArray } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { categorias, regras, transacoes } from "@/db/schema";
import { exigirUsuario } from "@/lib/dal";
import { encontrarRegra } from "@/lib/importacao/regras";
import { chaveEstabelecimento } from "@/lib/importacao/texto";

export type EstadoRevisao = { erro?: string; aplicadaEmOutras?: number };

const esquema = z.object({
  categoriaId: z.string().uuid(),
  lembrar: z.string().optional(),
});

/**
 * Confirma a categoria de um lançamento importado. Com "lembrar", cria uma regra
 * para o estabelecimento e já aplica nos outros pendentes iguais.
 */
export async function confirmarRevisao(id: string, _anterior: EstadoRevisao, form: FormData): Promise<EstadoRevisao> {
  await exigirUsuario();
  const dados = esquema.safeParse(Object.fromEntries(form));
  if (!dados.success) return { erro: "Escolha uma categoria." };

  const [item, categoria] = await Promise.all([
    db.query.transacoes.findFirst({ where: eq(transacoes.id, id) }),
    db.query.categorias.findFirst({ where: eq(categorias.id, dados.data.categoriaId) }),
  ]);
  if (!item) return { erro: "Lançamento não encontrado." };
  if (!categoria || categoria.tipo !== item.tipo) return { erro: "Categoria inválida para este lançamento." };

  let aplicadaEmOutras = 0;
  await db.transaction(async (tx) => {
    const agora = new Date();
    const alvo = item.grupoParcelamentoId
      ? eq(transacoes.grupoParcelamentoId, item.grupoParcelamentoId)
      : eq(transacoes.id, id);
    await tx
      .update(transacoes)
      .set({ categoriaId: categoria.id, precisaRevisao: false, atualizadoEm: agora })
      .where(alvo);

    if (dados.data.lembrar !== "sim") return;
    const padrao = chaveEstabelecimento(item.descricaoOriginal ?? item.descricao);
    if (padrao.length < 3) return;

    await tx
      .insert(regras)
      .values({ padrao, categoriaId: categoria.id, origem: "usuario", vezesUsada: 1 })
      .onConflictDoUpdate({ target: regras.padrao, set: { categoriaId: categoria.id, origem: "usuario" } });

    // Aplica a nova regra nos outros pendentes do mesmo estabelecimento.
    const pendentes = await tx.query.transacoes.findMany({
      where: and(eq(transacoes.precisaRevisao, true), eq(transacoes.tipo, item.tipo)),
      columns: { id: true, descricao: true, descricaoOriginal: true },
    });
    const regraNova = [{ id: "nova", padrao, categoriaId: categoria.id, nome: null, origem: "usuario" as const }];
    const iguais = pendentes
      .filter((p) => encontrarRegra(p.descricaoOriginal ?? p.descricao, regraNova))
      .map((p) => p.id);
    if (iguais.length) {
      await tx
        .update(transacoes)
        .set({ categoriaId: categoria.id, precisaRevisao: false, atualizadoEm: agora })
        .where(inArray(transacoes.id, iguais));
      aplicadaEmOutras = iguais.length;
    }
  });

  refresh();
  return { aplicadaEmOutras };
}

const esquemaLote = z.object({
  categoriaId: z.string().uuid(),
  ids: z.array(z.string().uuid()).min(1).max(500),
});

/** Categoriza vários pendentes de uma vez (ex.: os Pix de presentes de casamento do mesmo dia). */
export async function confirmarRevisaoEmLote(ids: string[], _anterior: EstadoRevisao, form: FormData): Promise<EstadoRevisao> {
  await exigirUsuario();
  const dados = esquemaLote.safeParse({ categoriaId: form.get("categoriaId"), ids });
  if (!dados.success) return { erro: "Escolha uma categoria." };

  const categoria = await db.query.categorias.findFirst({ where: eq(categorias.id, dados.data.categoriaId) });
  if (!categoria) return { erro: "Categoria inválida." };
  const atualizados = await db
    .update(transacoes)
    .set({ categoriaId: categoria.id, precisaRevisao: false, atualizadoEm: new Date() })
    .where(and(inArray(transacoes.id, dados.data.ids), eq(transacoes.tipo, categoria.tipo), eq(transacoes.precisaRevisao, true)))
    .returning({ id: transacoes.id });
  if (atualizados.length === 0) return { erro: "Essa categoria não é do tipo destes lançamentos." };
  refresh();
  return { aplicadaEmOutras: atualizados.length };
}
