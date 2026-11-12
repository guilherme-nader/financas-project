import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL não configurada. Veja .env.example.");
}

// Em desenvolvimento o Next recarrega módulos; reaproveita a conexão para não abrir dezenas.
const globalParaDb = globalThis as unknown as { __sql?: ReturnType<typeof postgres> };

const sql =
  globalParaDb.__sql ??
  postgres(url, {
    max: 5,
    // Supabase (pooler em modo transaction) não suporta prepared statements.
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") {
  globalParaDb.__sql = sql;
}

export const db = drizzle(sql, { schema });
export type Db = typeof db;
