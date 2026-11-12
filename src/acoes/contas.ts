"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { contas } from "@/db/schema";
import { exigirUsuario } from "@/lib/dal";
import { lerValorEmCentavos } from "@/lib/dinheiro";
import type { EstadoFormulario } from "./lancamentos";

const dia = z
  .string()
  .optional()
  .transform((v) => (v ? Number(v) : null))
  .pipe(z.number().int().min(1).max(31).nullable());

const esquema = z.object({
  nome: z.string().trim().min(1).max(80),
  instituicao: z.string().trim().min(1).max(80),
  tipo: z.enum(["corrente", "cartao", "investimento"]),
  pessoaId: z.string().uuid(),
  diaFechamento: dia,
  diaVencimento: dia,
  contaPagamentoId: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .pipe(z.string().uuid().nullable()),
  saldoInicial: z.string().optional(),
});

/** Saldo inicial pode ser negativo (cheque especial): aceita "-" na frente. */
function lerSaldoInicial(texto: string | undefined): number | null {
  const limpo = (texto ?? "").trim();
  if (!limpo) return 0;
  const negativo = /^[-−]/.test(limpo);
  const valor = lerValorEmCentavos(limpo);
  if (valor === null) return null;
  return negativo ? -valor : valor;
}

export async function salvarConta(
  id: string | null,
  _anterior: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  await exigirUsuario();
  const dados = esquema.safeParse(Object.fromEntries(form));
  if (!dados.success) {
    const campos: Record<string, string> = {};
    for (const p of dados.error.issues) campos[String(p.path[0])] = "Confira este campo.";
    return { erro: "Confira os campos destacados.", campos };
  }
  const d = dados.data;

  const ehCartao = d.tipo === "cartao";
  if (ehCartao && (!d.diaFechamento || !d.diaVencimento)) {
    return {
      erro: "Cartão precisa do dia de fechamento e do dia de vencimento.",
      campos: {
        ...(d.diaFechamento ? {} : { diaFechamento: "Obrigatório para cartão." }),
        ...(d.diaVencimento ? {} : { diaVencimento: "Obrigatório para cartão." }),
      },
    };
  }

  const saldoInicialCentavos = ehCartao ? 0 : lerSaldoInicial(d.saldoInicial);
  if (saldoInicialCentavos === null) {
    return { erro: "Confira os campos destacados.", campos: { saldoInicial: "Valor inválido." } };
  }

  const valores = {
    nome: d.nome,
    instituicao: d.instituicao,
    pessoaId: d.pessoaId,
    diaFechamento: ehCartao ? d.diaFechamento : null,
    diaVencimento: ehCartao ? d.diaVencimento : null,
    contaPagamentoId: ehCartao ? d.contaPagamentoId : null,
    saldoInicialCentavos,
  };

  if (id) {
    // O tipo não muda depois de criada: mudaria o significado dos lançamentos já feitos.
    await db.update(contas).set(valores).where(eq(contas.id, id));
  } else {
    await db.insert(contas).values({ ...valores, tipo: d.tipo });
  }
  redirect("/contas");
}

export async function alternarContaAtiva(id: string) {
  await exigirUsuario();
  const conta = await db.query.contas.findFirst({ where: eq(contas.id, id), columns: { ativa: true } });
  if (conta) {
    await db.update(contas).set({ ativa: !conta.ativa }).where(eq(contas.id, id));
  }
  refresh();
}
