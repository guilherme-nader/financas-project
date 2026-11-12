import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { hojeISO, type DataISO } from "./datas";
import { lerSessao } from "./sessao";

export type UsuarioAtual = { id: string; nome: string; pessoaId: string };

/**
 * Camada de acesso: toda leitura ou escrita de dados passa por aqui primeiro.
 * Os dois usuários enxergam tudo (as finanças são do casal), mas só quem está logado.
 */
export const usuarioAtual = cache(async (): Promise<UsuarioAtual | null> => {
  const sessao = await lerSessao();
  if (!sessao) return null;
  const usuario = await db.query.usuarios.findFirst({
    where: eq(usuarios.id, sessao.usuarioId),
    columns: { id: true, nome: true, pessoaId: true },
  });
  return usuario ?? null;
});

export async function exigirUsuario(): Promise<UsuarioAtual> {
  const usuario = await usuarioAtual();
  if (!usuario) redirect("/login");
  return usuario;
}

/** Data de hoje no fuso de São Paulo, lida só na hora do pedido (nunca no build). */
export async function hoje(): Promise<DataISO> {
  await connection();
  return hojeISO();
}
