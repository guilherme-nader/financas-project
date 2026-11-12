import "server-only";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";

export const COOKIE_SESSAO = "sessao";
const DURACAO_DIAS = 30;

type ConteudoSessao = { usuarioId: string };

function chave(): Uint8Array {
  const segredo = process.env.SESSION_SECRET;
  if (!segredo || segredo.length < 32) {
    throw new Error("SESSION_SECRET ausente ou curto demais (mínimo 32 caracteres).");
  }
  return new TextEncoder().encode(segredo);
}

export async function assinar(conteudo: ConteudoSessao): Promise<string> {
  return new SignJWT(conteudo)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DURACAO_DIAS}d`)
    .sign(chave());
}

export async function verificar(token: string | undefined): Promise<ConteudoSessao | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, chave(), { algorithms: ["HS256"] });
    return typeof payload.usuarioId === "string" ? { usuarioId: payload.usuarioId } : null;
  } catch {
    return null;
  }
}

export async function criarSessao(usuarioId: string) {
  const token = await assinar({ usuarioId });
  const loja = await cookies();
  loja.set(COOKIE_SESSAO, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACAO_DIAS * 24 * 60 * 60,
  });
}

export async function lerSessao(): Promise<ConteudoSessao | null> {
  const loja = await cookies();
  return verificar(loja.get(COOKIE_SESSAO)?.value);
}

export async function encerrarSessao() {
  const loja = await cookies();
  loja.delete(COOKIE_SESSAO);
}
