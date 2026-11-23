ALTER TABLE "contas" ADD COLUMN "fora_dos_totais" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pessoas" ADD COLUMN "nomes_no_banco" text[] DEFAULT '{}'::text[] NOT NULL;