import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { categorias, contas, pessoas, transacoes, type Categoria } from "@/db/schema";
import { cicloDaFatura } from "./cartao";
import { primeiroDia, ultimoDia, type DataISO, type MesISO } from "./datas";
import { exigirUsuario } from "./dal";

/** Soma do Postgres vem como texto (bigint/numeric); converte com segurança. */
const somaInt = (expr: ReturnType<typeof sql>) => sql<number>`coalesce(${expr}, 0)::bigint`.mapWith(Number);

export async function listarPessoas() {
  await exigirUsuario();
  return db.select().from(pessoas).orderBy(asc(pessoas.ordem));
}

export type CategoriaComFilhas = Categoria & { filhas: Categoria[] };
export type ArvoreCategorias = Record<Categoria["tipo"], CategoriaComFilhas[]>;

export async function listarCategorias(): Promise<ArvoreCategorias> {
  await exigirUsuario();
  const todas = await db
    .select()
    .from(categorias)
    .where(eq(categorias.ativa, true))
    .orderBy(asc(categorias.ordem), asc(categorias.nome));

  const arvore: ArvoreCategorias = { despesa: [], receita: [], transferencia: [] };
  const pais = new Map<string, CategoriaComFilhas>();
  for (const c of todas.filter((c) => !c.paiId)) {
    const no = { ...c, filhas: [] };
    pais.set(c.id, no);
    arvore[c.tipo].push(no);
  }
  for (const c of todas.filter((c) => c.paiId)) {
    pais.get(c.paiId!)?.filhas.push(c);
  }
  return arvore;
}

export type ContaComSaldo = Awaited<ReturnType<typeof listarContas>>[number];

/**
 * Contas ativas com o saldo de hoje (saldo inicial + tudo que já aconteceu).
 * Para cartões, traz também a fatura aberta e, se ainda não venceu, a fechada.
 */
export async function listarContas(hoje: DataISO, opcoes: { incluirInativas?: boolean } = {}) {
  await exigirUsuario();
  const linhas = await db
    .select({
      conta: contas,
      pessoaNome: pessoas.nome,
      pessoaCor: pessoas.cor,
      // Conta/investimento: o que já passou pelo caixa. Cartão: compras já feitas menos
      // pagamentos já feitos, ou seja, quanto se deve hoje (fica negativo).
      movimentado: somaInt(
        sql`sum(${transacoes.valorCentavos}) filter (where case when ${contas.tipo} = 'cartao'
          then ${transacoes.data} <= ${hoje}
          else ${transacoes.status} = 'realizada' and ${transacoes.dataCaixa} <= ${hoje} end)`,
      ),
    })
    .from(contas)
    .innerJoin(pessoas, eq(pessoas.id, contas.pessoaId))
    .leftJoin(transacoes, eq(transacoes.contaId, contas.id))
    .where(opcoes.incluirInativas ? undefined : eq(contas.ativa, true))
    .groupBy(contas.id, pessoas.id)
    .orderBy(asc(contas.tipo), asc(contas.instituicao), asc(contas.nome));

  // Faturas de cartão: soma das compras (sem pagamentos) por data de vencimento.
  const cartoes = linhas.filter((l) => l.conta.tipo === "cartao" && l.conta.diaFechamento && l.conta.diaVencimento);
  const ciclos = new Map(
    cartoes.map((l) => {
      const f = l.conta.diaFechamento!;
      const v = l.conta.diaVencimento!;
      return [l.conta.id, { aberta: cicloDaFatura(hoje, f, v, 0), fechada: cicloDaFatura(hoje, f, v, -1) }];
    }),
  );
  const totaisFatura = new Map<string, number>();
  if (cartoes.length) {
    const somas = await db
      .select({
        contaId: transacoes.contaId,
        dataCaixa: transacoes.dataCaixa,
        total: somaInt(sql`sum(${transacoes.valorCentavos})`),
      })
      .from(transacoes)
      .where(
        and(
          inArray(
            transacoes.contaId,
            cartoes.map((l) => l.conta.id),
          ),
          ne(transacoes.tipo, "transferencia"),
          gte(transacoes.dataCaixa, [...ciclos.values()].map((c) => c.fechada.vencimento).sort()[0]),
        ),
      )
      .groupBy(transacoes.contaId, transacoes.dataCaixa);
    for (const s of somas) totaisFatura.set(`${s.contaId}|${s.dataCaixa}`, -s.total);
  }

  return linhas.map((l) => {
    const ciclo = ciclos.get(l.conta.id);
    const faturaDe = (c: { fechamento: string; vencimento: string }) => ({
      ...c,
      totalCentavos: totaisFatura.get(`${l.conta.id}|${c.vencimento}`) ?? 0,
    });
    return {
      ...l.conta,
      pessoaNome: l.pessoaNome,
      pessoaCor: l.pessoaCor,
      saldoCentavos: l.conta.saldoInicialCentavos + l.movimentado,
      faturaAberta: ciclo ? faturaDe(ciclo.aberta) : null,
      faturaFechada: ciclo && ciclo.fechada.vencimento >= hoje ? faturaDe(ciclo.fechada) : null,
    };
  });
}

export async function obterConta(id: string) {
  await exigirUsuario();
  return db.query.contas.findFirst({ where: eq(contas.id, id) });
}

const categoriaPai = alias(categorias, "categoria_pai");

/** Resumo do mês pela data da compra (onde o dinheiro foi), sem transferências. */
export async function resumoDoMes(mes: MesISO) {
  await exigirUsuario();
  const noMes = and(
    gte(transacoes.data, primeiroDia(mes)),
    lte(transacoes.data, ultimoDia(mes)),
    ne(transacoes.tipo, "transferencia"),
  );

  const [totais] = await db
    .select({
      entradas: somaInt(sql`sum(${transacoes.valorCentavos}) filter (where ${transacoes.tipo} = 'receita')`),
      saidas: somaInt(sql`-sum(${transacoes.valorCentavos}) filter (where ${transacoes.tipo} = 'despesa')`),
      paraRevisar: sql<number>`count(*) filter (where ${transacoes.precisaRevisao})`.mapWith(Number),
    })
    .from(transacoes)
    .where(noMes);

  const grupoId = sql<string | null>`coalesce(${categoriaPai.id}, ${categorias.id})`;
  const grupoNome = sql<string | null>`coalesce(${categoriaPai.nome}, ${categorias.nome})`;
  const porCategoria = await db
    .select({
      id: grupoId,
      nome: grupoNome,
      totalCentavos: somaInt(sql`-sum(${transacoes.valorCentavos})`),
    })
    .from(transacoes)
    .leftJoin(categorias, eq(categorias.id, transacoes.categoriaId))
    .leftJoin(categoriaPai, eq(categoriaPai.id, categorias.paiId))
    .where(and(noMes, eq(transacoes.tipo, "despesa")))
    .groupBy(grupoId, grupoNome)
    .orderBy(desc(sql`3`));

  const porPessoa = await db
    .select({
      id: pessoas.id,
      nome: pessoas.nome,
      cor: pessoas.cor,
      totalCentavos: somaInt(sql`-sum(${transacoes.valorCentavos})`),
    })
    .from(transacoes)
    .innerJoin(pessoas, eq(pessoas.id, transacoes.pessoaId))
    .where(and(noMes, eq(transacoes.tipo, "despesa")))
    .groupBy(pessoas.id)
    .orderBy(desc(sql`4`));

  return {
    entradasCentavos: totais.entradas,
    saidasCentavos: totais.saidas,
    resultadoCentavos: totais.entradas - totais.saidas,
    paraRevisar: totais.paraRevisar,
    porCategoria: porCategoria.map((c) => ({ ...c, nome: c.nome ?? "Sem categoria" })),
    porPessoa,
  };
}

export type ItemLancamento = Awaited<ReturnType<typeof listarLancamentos>>[number];

export async function listarLancamentos(mes: MesISO, filtro: { pessoaId?: string } = {}) {
  await exigirUsuario();
  const linhas = await db
    .select({
      id: transacoes.id,
      tipo: transacoes.tipo,
      transferenciaId: transacoes.transferenciaId,
      data: transacoes.data,
      dataCaixa: transacoes.dataCaixa,
      descricao: transacoes.descricao,
      valorCentavos: transacoes.valorCentavos,
      status: transacoes.status,
      parcelaNumero: transacoes.parcelaNumero,
      parcelaTotal: transacoes.parcelaTotal,
      precisaRevisao: transacoes.precisaRevisao,
      contaNome: contas.nome,
      contaTipo: contas.tipo,
      categoriaNome: categorias.nome,
      categoriaPaiNome: categoriaPai.nome,
      pessoaId: pessoas.id,
      pessoaNome: pessoas.nome,
      pessoaCor: pessoas.cor,
    })
    .from(transacoes)
    .innerJoin(contas, eq(contas.id, transacoes.contaId))
    .innerJoin(pessoas, eq(pessoas.id, transacoes.pessoaId))
    .leftJoin(categorias, eq(categorias.id, transacoes.categoriaId))
    .leftJoin(categoriaPai, eq(categoriaPai.id, categorias.paiId))
    .where(
      and(
        gte(transacoes.data, primeiroDia(mes)),
        lte(transacoes.data, ultimoDia(mes)),
        filtro.pessoaId ? eq(transacoes.pessoaId, filtro.pessoaId) : undefined,
      ),
    )
    .orderBy(desc(transacoes.data), desc(transacoes.criadoEm), asc(transacoes.valorCentavos));

  // Uma transferência tem duas linhas (sai de uma conta, entra na outra).
  // Na lista ela aparece uma vez só, pelo lado que sai, com "origem → destino".
  const destinos = new Map<string, string>();
  for (const l of linhas) {
    if (l.transferenciaId && l.valorCentavos > 0) destinos.set(l.transferenciaId, l.contaNome);
  }
  return linhas
    .filter((l) => !(l.transferenciaId && l.valorCentavos > 0))
    .map((l) => {
      const destino = l.transferenciaId ? destinos.get(l.transferenciaId) : undefined;
      return { ...l, contaNome: destino ? `${l.contaNome} → ${destino}` : l.contaNome };
    });
}

export async function obterLancamento(id: string) {
  await exigirUsuario();
  const [linha] = await db
    .select({ transacao: transacoes, conta: contas })
    .from(transacoes)
    .innerJoin(contas, eq(contas.id, transacoes.contaId))
    .where(eq(transacoes.id, id));
  if (!linha) return null;

  // Numa transferência, o "outro lado" é a linha com o mesmo transferenciaId.
  let par: { transacao: typeof linha.transacao; conta: typeof linha.conta } | null = null;
  if (linha.transacao.transferenciaId) {
    const [outra] = await db
      .select({ transacao: transacoes, conta: contas })
      .from(transacoes)
      .innerJoin(contas, eq(contas.id, transacoes.contaId))
      .where(and(eq(transacoes.transferenciaId, linha.transacao.transferenciaId), ne(transacoes.id, id)));
    par = outra ?? null;
  }
  return { ...linha, par };
}
