/**
 * Cria (ou completa) os dados básicos: pessoas, categorias e os dois usuários.
 * Pode rodar quantas vezes quiser: só insere o que falta.
 *
 *   npm run db:seed
 *
 * Senhas vêm do .env (GUILHERME_SENHA, DEBORA_SENHA) e só o hash é salvo.
 * Se o usuário já existe, a senha NÃO é alterada (use `npm run usuario:senha`).
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";

const { pessoas, categorias, usuarios } = schema;

const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
const db = drizzle(sql, { schema });

const PESSOAS = [
  { nome: "Guilherme", cor: "#1E58B0", compartilhada: false, ordem: 1 },
  { nome: "Débora", cor: "#7A35A8", compartilhada: false, ordem: 2 },
  { nome: "Casal", cor: "#3F4654", compartilhada: true, ordem: 0 },
];

type Arvore = Record<string, string[]>;

// Baseado nas abas da planilha "Planejamento oficial" e nas categorias da planilha-modelo.
const DESPESAS: Arvore = {
  Moradia: ["Financiamento", "Aluguel", "Condomínio", "IPTU", "Luz", "Água", "Gás", "Internet", "Reforma e manutenção"],
  Casa: ["Móveis e decoração", "Utensílios", "Serviços domésticos"],
  Alimentação: ["Mercado", "Restaurantes", "Delivery", "Lanches e cafés"],
  Transporte: ["Uber e 99", "Combustível", "Estacionamento", "Manutenção do carro"],
  Saúde: ["Plano de saúde", "Médicos e dentista", "Farmácia", "Academia", "Nutricionista e personal"],
  "Beleza e cuidados": ["Barbearia e salão", "Manicure", "Higiene"],
  Seguros: ["Seguro de vida"],
  Assinaturas: ["Streaming", "Apps e nuvem"],
  Lazer: ["Passeios", "Viagens"],
  Educação: ["Cursos", "Livros"],
  Roupas: [],
  Presentes: [],
  Pets: [],
  Casamento: ["Fornecedores", "Lua de mel"],
  Empresa: ["Contabilidade", "Impostos da empresa", "Taxas e conselho (CAU)", "INSS"],
  "Impostos e tarifas": ["Imposto de renda", "Tarifas bancárias", "Taxas de investimento"],
  Outros: [],
};

const RECEITAS: Arvore = {
  Salário: [],
  "Renda extra": [],
  "Rendimentos de investimentos": [],
  "Aluguel recebido": [],
  "Presentes recebidos": [],
  Reembolsos: [],
  "Outras receitas": [],
};

const TRANSFERENCIAS = [
  "Transferência entre contas",
  "Pagamento de fatura",
  "Aporte em investimento",
  "Resgate de investimento",
];

async function garantirCategoria(
  nome: string,
  tipo: "despesa" | "receita" | "transferencia",
  paiId: string | null,
  ordem: number,
  sistema = false,
): Promise<string> {
  const existente = await db.query.categorias.findFirst({
    where: and(
      eq(categorias.nome, nome),
      eq(categorias.tipo, tipo),
      paiId ? eq(categorias.paiId, paiId) : isNull(categorias.paiId),
    ),
  });
  if (existente) return existente.id;
  const [nova] = await db
    .insert(categorias)
    .values({ nome, tipo, paiId, ordem, sistema })
    .returning({ id: categorias.id });
  return nova.id;
}

async function semearArvore(arvore: Arvore, tipo: "despesa" | "receita") {
  let ordem = 0;
  for (const [pai, filhas] of Object.entries(arvore)) {
    const paiId = await garantirCategoria(pai, tipo, null, ordem++);
    let ordemFilha = 0;
    for (const filha of filhas) {
      await garantirCategoria(filha, tipo, paiId, ordemFilha++);
    }
  }
}

async function main() {
  for (const p of PESSOAS) {
    const existe = await db.query.pessoas.findFirst({ where: eq(pessoas.nome, p.nome) });
    if (!existe) await db.insert(pessoas).values(p);
  }

  await semearArvore(DESPESAS, "despesa");
  await semearArvore(RECEITAS, "receita");
  let ordem = 0;
  for (const nome of TRANSFERENCIAS) {
    await garantirCategoria(nome, "transferencia", null, ordem++, true);
  }

  const usuariosEnv = [
    { pessoa: "Guilherme", email: process.env.GUILHERME_EMAIL, senha: process.env.GUILHERME_SENHA },
    { pessoa: "Débora", email: process.env.DEBORA_EMAIL, senha: process.env.DEBORA_SENHA },
  ];
  for (const u of usuariosEnv) {
    if (!u.email || !u.senha) {
      console.warn(`! ${u.pessoa}: e-mail ou senha não definidos no .env, usuário não criado.`);
      continue;
    }
    if (u.senha.length < 10) {
      throw new Error(`Senha de ${u.pessoa} precisa ter pelo menos 10 caracteres.`);
    }
    const email = u.email.trim().toLowerCase();
    const existe = await db.query.usuarios.findFirst({ where: eq(usuarios.email, email) });
    if (existe) continue;
    const pessoa = await db.query.pessoas.findFirst({ where: eq(pessoas.nome, u.pessoa) });
    await db.insert(usuarios).values({
      email,
      nome: u.pessoa,
      pessoaId: pessoa!.id,
      senhaHash: await bcrypt.hash(u.senha, 12),
    });
    console.log(`✓ usuário ${u.pessoa} criado`);
  }

  const total = await db.$count(categorias);
  console.log(`✓ pessoas e ${total} categorias prontas`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
