"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { pessoas } from "@/db/schema";
import { exigirUsuario } from "@/lib/dal";
import { reclassificarPendentes } from "@/lib/importacao/reclassificar";

export type EstadoPessoa = { erro?: string; salvo?: boolean; reclassificadas?: number };

/** Um nome por linha, como aparece nos extratos ("FULANO B S SOUZA"). */
export async function salvarNomesNoBanco(pessoaId: string, _anterior: EstadoPessoa, form: FormData): Promise<EstadoPessoa> {
  await exigirUsuario();
  if (!z.string().uuid().safeParse(pessoaId).success) return { erro: "Pessoa inválida." };
  const nomes = String(form.get("nomes") ?? "")
    .split(/\r?\n/)
    .map((n) => n.trim().replace(/\s+/g, " "))
    .filter((n) => n.length >= 3)
    .slice(0, 20);
  const unicos = [...new Map(nomes.map((n) => [n.toUpperCase(), n])).values()];
  const reclassificadas = await db.transaction(async (tx) => {
    await tx.update(pessoas).set({ nomesNoBanco: unicos }).where(eq(pessoas.id, pessoaId));
    return reclassificarPendentes(tx);
  });
  refresh();
  return { salvo: true, reclassificadas };
}
