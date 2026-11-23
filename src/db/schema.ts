import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  unique,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Convenções do modelo
 * - Dinheiro sempre em centavos (inteiro). Nunca float.
 * - valorCentavos é com sinal: negativo = saiu dinheiro da conta, positivo = entrou.
 * - Datas sem hora são guardadas como texto 'AAAA-MM-DD' (coluna date, mode string),
 *   para não haver confusão de fuso horário.
 * - `data` = quando a compra/evento aconteceu (usado em "onde gastamos" e orçamento).
 *   `dataCaixa` = quando o dinheiro sai/entra de fato (usado em saldo e projeção).
 *   Numa conta corrente as duas são iguais; num cartão, `dataCaixa` é o vencimento da fatura.
 */

export const tipoConta = pgEnum("tipo_conta", ["corrente", "cartao", "investimento"]);
export const tipoMovimento = pgEnum("tipo_movimento", ["despesa", "receita", "transferencia"]);
export const statusTransacao = pgEnum("status_transacao", ["prevista", "realizada"]);
export const origemTransacao = pgEnum("origem_transacao", ["manual", "importacao", "recorrencia"]);
export const statusFatura = pgEnum("status_fatura", ["aberta", "fechada", "paga"]);
export const origemRegra = pgEnum("origem_regra", ["sistema", "usuario"]);

/** Guilherme, Débora e "Casal" (compartilhada = true). */
export const pessoas = pgTable("pessoas", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  cor: text("cor").notNull(),
  compartilhada: boolean("compartilhada").notNull().default(false),
  ordem: smallint("ordem").notNull().default(0),
  /** Como o nome aparece nos extratos ("FULANO B S SOUZA"): Pix para esses nomes é transferência. */
  nomesNoBanco: text("nomes_no_banco")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
});

export const usuarios = pgTable("usuarios", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  nome: text("nome").notNull(),
  senhaHash: text("senha_hash").notNull(),
  pessoaId: uuid("pessoa_id")
    .notNull()
    .references(() => pessoas.id),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const contas = pgTable("contas", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  instituicao: text("instituicao").notNull(),
  tipo: tipoConta("tipo").notNull(),
  pessoaId: uuid("pessoa_id")
    .notNull()
    .references(() => pessoas.id),
  /** Só para cartão: dia em que a fatura fecha e dia em que vence. */
  diaFechamento: smallint("dia_fechamento"),
  diaVencimento: smallint("dia_vencimento"),
  /** Só para cartão: conta corrente que normalmente paga a fatura. */
  contaPagamentoId: uuid("conta_pagamento_id").references((): AnyPgColumn => contas.id),
  saldoInicialCentavos: integer("saldo_inicial_centavos").notNull().default(0),
  /** Caixinha de terceiros (futebol, vaquinha): aparece na lista, mas fora dos totais do casal. */
  foraDosTotais: boolean("fora_dos_totais").notNull().default(false),
  ativa: boolean("ativa").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const categorias = pgTable(
  "categorias",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nome: text("nome").notNull(),
    tipo: tipoMovimento("tipo").notNull(),
    paiId: uuid("pai_id").references((): AnyPgColumn => categorias.id),
    cor: text("cor"),
    ordem: smallint("ordem").notNull().default(0),
    ativa: boolean("ativa").notNull().default(true),
    /** Categorias do sistema (transferências) não podem ser apagadas. */
    sistema: boolean("sistema").notNull().default(false),
  },
  (t) => [unique("categorias_tipo_pai_nome_uq").on(t.tipo, t.paiId, t.nome).nullsNotDistinct()],
);

export const faturas = pgTable(
  "faturas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contaId: uuid("conta_id")
      .notNull()
      .references(() => contas.id, { onDelete: "cascade" }),
    dataFechamento: date("data_fechamento", { mode: "string" }).notNull(),
    dataVencimento: date("data_vencimento", { mode: "string" }).notNull(),
    /** Total que veio impresso na fatura importada, para conferência. */
    totalInformadoCentavos: integer("total_informado_centavos"),
    status: statusFatura("status").notNull().default("aberta"),
  },
  (t) => [uniqueIndex("faturas_conta_vencimento_idx").on(t.contaId, t.dataVencimento)],
);

/** Cada arquivo importado (fatura, extrato): o que entrou e o que foi ignorado. */
export const importacoes = pgTable("importacoes", {
  id: uuid("id").primaryKey().defaultRandom(),
  contaId: uuid("conta_id")
    .notNull()
    .references(() => contas.id, { onDelete: "cascade" }),
  formato: text("formato").notNull(),
  arquivoNome: text("arquivo_nome").notNull(),
  /** Para faturas: o vencimento. */
  referencia: date("referencia", { mode: "string" }),
  totalLinhas: integer("total_linhas").notNull().default(0),
  novas: integer("novas").notNull().default(0),
  confirmadas: integer("confirmadas").notNull().default(0),
  duplicadas: integer("duplicadas").notNull().default(0),
  paraRevisar: integer("para_revisar").notNull().default(0),
  criadoPorId: uuid("criado_por_id").references(() => usuarios.id, { onDelete: "set null" }),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const transacoes = pgTable(
  "transacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contaId: uuid("conta_id")
      .notNull()
      .references(() => contas.id, { onDelete: "cascade" }),
    tipo: tipoMovimento("tipo").notNull(),
    data: date("data", { mode: "string" }).notNull(),
    dataCaixa: date("data_caixa", { mode: "string" }).notNull(),
    descricao: text("descricao").notNull(),
    /** Texto cru como veio do banco (ex.: "PAG*JOSEFRANCISCO"). */
    descricaoOriginal: text("descricao_original"),
    /** Em Pix/TED importados: o nome de quem pagou ou recebeu, como o banco escreveu. */
    contraparte: text("contraparte"),
    valorCentavos: integer("valor_centavos").notNull(),
    categoriaId: uuid("categoria_id").references(() => categorias.id, { onDelete: "set null" }),
    pessoaId: uuid("pessoa_id")
      .notNull()
      .references(() => pessoas.id),
    status: statusTransacao("status").notNull().default("realizada"),
    origem: origemTransacao("origem").notNull().default("manual"),
    faturaId: uuid("fatura_id").references(() => faturas.id, { onDelete: "set null" }),
    parcelaNumero: smallint("parcela_numero"),
    parcelaTotal: smallint("parcela_total"),
    /** Todas as parcelas de uma mesma compra compartilham este id. */
    grupoParcelamentoId: uuid("grupo_parcelamento_id"),
    /** Os dois lados de uma transferência (saída e entrada) compartilham este id. */
    transferenciaId: uuid("transferencia_id"),
    precisaRevisao: boolean("precisa_revisao").notNull().default(false),
    importacaoId: uuid("importacao_id").references(() => importacoes.id, { onDelete: "set null" }),
    /** Identidade da linha no arquivo de origem: reimportar o mesmo arquivo não duplica. */
    chaveImportacao: text("chave_importacao"),
    observacao: text("observacao"),
    criadoPorId: uuid("criado_por_id").references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("transacoes_data_idx").on(t.data),
    index("transacoes_data_caixa_idx").on(t.dataCaixa),
    index("transacoes_conta_idx").on(t.contaId),
    index("transacoes_grupo_parcelamento_idx").on(t.grupoParcelamentoId),
    index("transacoes_transferencia_idx").on(t.transferenciaId),
    uniqueIndex("transacoes_conta_chave_idx")
      .on(t.contaId, t.chaveImportacao)
      .where(sql`${t.chaveImportacao} is not null`),
  ],
);

/** Saldo de uma conta de investimento no fim de cada mês (vem do extrato da corretora). */
export const saldosInvestimento = pgTable(
  "saldos_investimento",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contaId: uuid("conta_id")
      .notNull()
      .references(() => contas.id, { onDelete: "cascade" }),
    /** Primeiro dia do mês de referência. */
    mes: date("mes", { mode: "string" }).notNull(),
    saldoCentavos: integer("saldo_centavos").notNull(),
  },
  (t) => [uniqueIndex("saldos_investimento_conta_mes_idx").on(t.contaId, t.mes)],
);

/** "Se a descrição contém `padrao`, a categoria é esta." */
export const regras = pgTable(
  "regras",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Forma compacta: sem acento, maiúsculo, sem espaços (ver lib/importacao/texto.ts). */
    padrao: text("padrao").notNull(),
    categoriaId: uuid("categoria_id")
      .notNull()
      .references(() => categorias.id, { onDelete: "cascade" }),
    /** Nome bonito para a descrição (ex.: "Uber"). */
    nome: text("nome"),
    origem: origemRegra("origem").notNull().default("usuario"),
    vezesUsada: integer("vezes_usada").notNull().default(0),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("regras_padrao_idx").on(t.padrao)],
);

export type Pessoa = typeof pessoas.$inferSelect;
export type Usuario = typeof usuarios.$inferSelect;
export type Conta = typeof contas.$inferSelect;
export type Categoria = typeof categorias.$inferSelect;
export type Fatura = typeof faturas.$inferSelect;
export type Transacao = typeof transacoes.$inferSelect;
export type NovaTransacao = typeof transacoes.$inferInsert;
export type Regra = typeof regras.$inferSelect;
export type Importacao = typeof importacoes.$inferSelect;
