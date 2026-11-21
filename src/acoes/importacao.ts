"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contas } from "@/db/schema";
import { exigirUsuario } from "@/lib/dal";
import { ehDataValida } from "@/lib/datas";
import { ErroDeFormato, lerFaturaXpCsv } from "@/lib/importacao/fatura-xp-csv";
import { gravarFatura, type ResumoImportacao } from "@/lib/importacao/gravar-fatura";

export type EstadoImportacao = {
  erro?: string;
  resumo?: ResumoImportacao & { contaNome: string; arquivoNome: string; vencimento: string };
};

const TAMANHO_MAXIMO = 512 * 1024; // CSV de fatura tem poucos KB.

export async function importarFatura(_anterior: EstadoImportacao, form: FormData): Promise<EstadoImportacao> {
  const usuario = await exigirUsuario();

  const arquivo = form.get("arquivo");
  const contaId = String(form.get("contaId") ?? "");
  const vencimento = String(form.get("vencimento") ?? "");

  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Escolha o arquivo da fatura (.csv)." };
  if (arquivo.size > TAMANHO_MAXIMO) return { erro: "Arquivo grande demais para uma fatura em CSV." };
  if (!ehDataValida(vencimento)) return { erro: "Informe a data de vencimento da fatura." };

  const conta = await db.query.contas.findFirst({ where: eq(contas.id, contaId) });
  if (!conta || conta.tipo !== "cartao") return { erro: "Escolha o cartão desta fatura." };

  let fatura;
  try {
    fatura = lerFaturaXpCsv(await arquivo.text());
  } catch (erro) {
    if (erro instanceof ErroDeFormato) return { erro: erro.message };
    throw erro;
  }

  const resumo = await gravarFatura({
    conta,
    vencimento,
    fatura,
    arquivoNome: arquivo.name,
    usuarioId: usuario.id,
  });
  return { resumo: { ...resumo, contaNome: conta.nome, arquivoNome: arquivo.name, vencimento } };
}
