import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Checagem otimista: sem cookie de sessão válido, manda para /login.
 * É só a primeira barreira; cada leitura de dados confere a sessão de novo (src/lib/dal.ts).
 */
export async function proxy(req: NextRequest) {
  const token = req.cookies.get("sessao")?.value;
  const logado = token ? await tokenValido(token) : false;
  const naLogin = req.nextUrl.pathname === "/login";

  if (!logado && !naLogin) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
  if (logado && naLogin) {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }
  return NextResponse.next();
}

async function tokenValido(token: string): Promise<boolean> {
  const segredo = process.env.SESSION_SECRET;
  if (!segredo) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(segredo), { algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest).*)"],
};
