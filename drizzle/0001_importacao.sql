CREATE TYPE "public"."origem_regra" AS ENUM('sistema', 'usuario');--> statement-breakpoint
CREATE TABLE "importacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conta_id" uuid NOT NULL,
	"formato" text NOT NULL,
	"arquivo_nome" text NOT NULL,
	"referencia" date,
	"total_linhas" integer DEFAULT 0 NOT NULL,
	"novas" integer DEFAULT 0 NOT NULL,
	"confirmadas" integer DEFAULT 0 NOT NULL,
	"duplicadas" integer DEFAULT 0 NOT NULL,
	"para_revisar" integer DEFAULT 0 NOT NULL,
	"criado_por_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"padrao" text NOT NULL,
	"categoria_id" uuid NOT NULL,
	"nome" text,
	"origem" "origem_regra" DEFAULT 'usuario' NOT NULL,
	"vezes_usada" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transacoes" ADD COLUMN "importacao_id" uuid;--> statement-breakpoint
ALTER TABLE "transacoes" ADD COLUMN "chave_importacao" text;--> statement-breakpoint
ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras" ADD CONSTRAINT "regras_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "regras_padrao_idx" ON "regras" USING btree ("padrao");--> statement-breakpoint
ALTER TABLE "transacoes" ADD CONSTRAINT "transacoes_importacao_id_importacoes_id_fk" FOREIGN KEY ("importacao_id") REFERENCES "public"."importacoes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transacoes_conta_chave_idx" ON "transacoes" USING btree ("conta_id","chave_importacao") WHERE "transacoes"."chave_importacao" is not null;