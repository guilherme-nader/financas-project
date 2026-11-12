"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { categorias } from "@/db/schema";
import { exigirUsuario } from "@/lib/dal";
import type { EstadoFormulario } from "./lancamentos";

const esquema = z.object({
  nome: z.string().trim().min(1).max(60),
  tipo: z.enum(["despesa", "receita"]),
  paiId: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .pipe(z.string().uuid().nullable()),
});

export async function criarCategoria(_anterior: EstadoFormulario, form: FormData): Promise<EstadoFormulario> {
  await exigirUsuario();
  const dados = esquema.safeParse(Object.fromEntries(form));
  if (!dados.success) return { erro: "Escreva o nome da categoria." };
  const d = dados.data;

  if (d.paiId) {
    const pai = await db.query.categorias.findFirst({ where: eq(categorias.id, d.paiId) });
    if (!pai || pai.tipo !== d.tipo || pai.paiId) return { erro: "Categoria principal inválida." };
  }

  const repetida = await db.query.categorias.findFirst({
    where: and(eq(categorias.nome, d.nome), eq(categorias.tipo, d.tipo)),
  });
  if (repetida?.ativa) return { erro: `Já existe a categoria "${d.nome}".` };
  if (repetida) {
    // Estava desativada: reativa em vez de duplicar.
    await db.update(categorias).set({ ativa: true, paiId: d.paiId }).where(eq(categorias.id, repetida.id));
  } else {
    await db.insert(categorias).values({ nome: d.nome, tipo: d.tipo, paiId: d.paiId, ordem: 100 });
  }
  refresh();
  return {};
}

export async function desativarCategoria(id: string) {
  await exigirUsuario();
  const categoria = await db.query.categorias.findFirst({ where: eq(categorias.id, id) });
  if (!categoria || categoria.sistema) return;
  // Desativa a categoria e as filhas; lançamentos antigos continuam com ela.
  await db.update(categorias).set({ ativa: false }).where(eq(categorias.id, id));
  await db.update(categorias).set({ ativa: false }).where(eq(categorias.paiId, id));
  refresh();
}
