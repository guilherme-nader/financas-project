/**
 * Troca a senha de um usuário.
 *
 *   npm run usuario:senha -- email@exemplo.com
 *
 * A nova senha é pedida no terminal (não fica no histórico do shell).
 */
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("Uso: npm run usuario:senha -- email@exemplo.com");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const senha = await rl.question("Nova senha (mínimo 10 caracteres): ");
  rl.close();
  if (senha.length < 10) throw new Error("Senha curta demais.");

  const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
  const db = drizzle(sql, { schema });
  try {
    const atualizados = await db
      .update(schema.usuarios)
      .set({ senhaHash: await bcrypt.hash(senha, 12) })
      .where(eq(schema.usuarios.email, email))
      .returning({ id: schema.usuarios.id });
    console.log(atualizados.length ? "✓ senha alterada" : "! usuário não encontrado");
  } finally {
    await sql.end();
  }
}

main().catch((erro) => {
  console.error(erro.message ?? erro);
  process.exitCode = 1;
});
