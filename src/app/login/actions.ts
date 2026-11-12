"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { criarSessao, encerrarSessao } from "@/lib/sessao";

export type EstadoLogin = { erro?: string; email?: string };

const esquema = z.object({
  email: z.string().trim().toLowerCase().email(),
  senha: z.string().min(1),
});

// Hash fixo para comparar quando o e-mail não existe: o tempo de resposta fica igual
// e não dá para descobrir quais e-mails estão cadastrados.
const HASH_FALSO = "$2b$12$VFVfxODJt4YIfAqTcRM77O73vJanX0puH8eHB3p3qPEitk5TVWeJe";

export async function entrar(_anterior: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const dados = esquema.safeParse({ email: form.get("email"), senha: form.get("senha") });
  if (!dados.success) {
    return { erro: "Preencha e-mail e senha.", email: String(form.get("email") ?? "") };
  }

  const usuario = await db.query.usuarios.findFirst({
    where: eq(usuarios.email, dados.data.email),
    columns: { id: true, senhaHash: true },
  });
  const confere = await bcrypt.compare(dados.data.senha, usuario?.senhaHash ?? HASH_FALSO);
  if (!usuario || !confere) {
    return { erro: "E-mail ou senha incorretos.", email: dados.data.email };
  }

  await criarSessao(usuario.id);
  redirect("/");
}

export async function sair() {
  await encerrarSessao();
  redirect("/login");
}
