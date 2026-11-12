CREATE TYPE "public"."origem_transacao" AS ENUM('manual', 'importacao', 'recorrencia');--> statement-breakpoint
CREATE TYPE "public"."status_fatura" AS ENUM('aberta', 'fechada', 'paga');--> statement-breakpoint
CREATE TYPE "public"."status_transacao" AS ENUM('prevista', 'realizada');--> statement-breakpoint
CREATE TYPE "public"."tipo_conta" AS ENUM('corrente', 'cartao', 'investimento');--> statement-breakpoint
CREATE TYPE "public"."tipo_movimento" AS ENUM('despesa', 'receita', 'transferencia');--> statement-breakpoint
CREATE TABLE "categorias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"tipo" "tipo_movimento" NOT NULL,
	"pai_id" uuid,
	"cor" text,
	"ordem" smallint DEFAULT 0 NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"sistema" boolean DEFAULT false NOT NULL,
	CONSTRAINT "categorias_tipo_pai_nome_uq" UNIQUE NULLS NOT DISTINCT("tipo","pai_id","nome")
);
--> statement-breakpoint
CREATE TABLE "contas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"instituicao" text NOT NULL,
	"tipo" "tipo_conta" NOT NULL,
	"pessoa_id" uuid NOT NULL,
	"dia_fechamento" smallint,
	"dia_vencimento" smallint,
	"conta_pagamento_id" uuid,
	"saldo_inicial_centavos" integer DEFAULT 0 NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faturas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conta_id" uuid NOT NULL,
	"data_fechamento" date NOT NULL,
	"data_vencimento" date NOT NULL,
	"total_informado_centavos" integer,
	"status" "status_fatura" DEFAULT 'aberta' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pessoas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"cor" text NOT NULL,
	"compartilhada" boolean DEFAULT false NOT NULL,
	"ordem" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saldos_investimento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conta_id" uuid NOT NULL,
	"mes" date NOT NULL,
	"saldo_centavos" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conta_id" uuid NOT NULL,
	"tipo" "tipo_movimento" NOT NULL,
	"data" date NOT NULL,
	"data_caixa" date NOT NULL,
	"descricao" text NOT NULL,
	"descricao_original" text,
	"valor_centavos" integer NOT NULL,
	"categoria_id" uuid,
	"pessoa_id" uuid NOT NULL,
	"status" "status_transacao" DEFAULT 'realizada' NOT NULL,
	"origem" "origem_transacao" DEFAULT 'manual' NOT NULL,
	"fatura_id" uuid,
	"parcela_numero" smallint,
	"parcela_total" smallint,
	"grupo_parcelamento_id" uuid,
	"transferencia_id" uuid,
	"precisa_revisao" boolean DEFAULT false NOT NULL,
	"observacao" text,
	"criado_por_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"nome" text NOT NULL,
	"senha_hash" text NOT NULL,
	"pessoa_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_pai_id_categorias_id_fk" FOREIGN KEY ("pai_id") REFERENCES "public"."categorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contas" ADD CONSTRAINT "contas_pessoa_id_pessoas_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "public"."pessoas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contas" ADD CONSTRAINT "contas_conta_pagamento_id_contas_id_fk" FOREIGN KEY ("conta_pagamento_id") REFERENCES "public"."contas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faturas" ADD CONSTRAINT "faturas_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saldos_investimento" ADD CONSTRAINT "saldos_investimento_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transacoes" ADD CONSTRAINT "transacoes_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transacoes" ADD CONSTRAINT "transacoes_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transacoes" ADD CONSTRAINT "transacoes_pessoa_id_pessoas_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "public"."pessoas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transacoes" ADD CONSTRAINT "transacoes_fatura_id_faturas_id_fk" FOREIGN KEY ("fatura_id") REFERENCES "public"."faturas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transacoes" ADD CONSTRAINT "transacoes_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_pessoa_id_pessoas_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "public"."pessoas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "faturas_conta_vencimento_idx" ON "faturas" USING btree ("conta_id","data_vencimento");--> statement-breakpoint
CREATE UNIQUE INDEX "saldos_investimento_conta_mes_idx" ON "saldos_investimento" USING btree ("conta_id","mes");--> statement-breakpoint
CREATE INDEX "transacoes_data_idx" ON "transacoes" USING btree ("data");--> statement-breakpoint
CREATE INDEX "transacoes_data_caixa_idx" ON "transacoes" USING btree ("data_caixa");--> statement-breakpoint
CREATE INDEX "transacoes_conta_idx" ON "transacoes" USING btree ("conta_id");--> statement-breakpoint
CREATE INDEX "transacoes_grupo_parcelamento_idx" ON "transacoes" USING btree ("grupo_parcelamento_id");--> statement-breakpoint
CREATE INDEX "transacoes_transferencia_idx" ON "transacoes" USING btree ("transferencia_id");