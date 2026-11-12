import Link from "next/link";
import { Suspense } from "react";
import { hoje } from "@/lib/dal";
import { IconeMais } from "@/componentes/icones";
import { BotaoLink, Esqueleto, SeletorMes, Valor, Vazio, estiloPessoa } from "@/componentes/ui";
import { listarLancamentos, listarPessoas, type ItemLancamento } from "@/lib/consultas";
import { dataCurta, ehMesValido, mesDe, nomeDoMes, somarMesesAoMes } from "@/lib/datas";

export default function PaginaLancamentos(props: PageProps<"/lancamentos">) {
  return (
    <main className="flex flex-col gap-4">
      <Suspense fallback={<Esqueleto linhas={5} />}>
        <Conteudo searchParams={props.searchParams} />
      </Suspense>
      <Link
        href="/lancamentos/novo"
        aria-label="Novo lançamento"
        className="fixed right-5 bottom-28 z-10 flex h-14 w-14 items-center justify-center rounded-[18px] bg-tinta text-white shadow-lg md:right-[calc(50%-20rem)]"
      >
        <IconeMais tamanho={24} />
      </Link>
    </main>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/lancamentos">["searchParams"] }) {
  const sp = await searchParams;
  const mes = ehMesValido(typeof sp.mes === "string" ? sp.mes : null) ? (sp.mes as string) : mesDe(await hoje());
  const pessoaId = typeof sp.pessoa === "string" ? sp.pessoa : undefined;

  const pessoas = await listarPessoas();
  const pessoaValida = pessoas.find((p) => p.id === pessoaId)?.id;
  const itens = await listarLancamentos(mes, { pessoaId: pessoaValida });

  const link = (params: { mes?: string; pessoa?: string | null }) => {
    const q = new URLSearchParams({ mes: params.mes ?? mes });
    const p = params.pessoa === undefined ? pessoaValida : params.pessoa;
    if (p) q.set("pessoa", p);
    return `/lancamentos?${q}`;
  };

  const porDia = new Map<string, ItemLancamento[]>();
  for (const item of itens) {
    porDia.set(item.data, [...(porDia.get(item.data) ?? []), item]);
  }

  const filtros = [{ id: null, nome: "Todos" }, ...pessoas.map((p) => ({ id: p.id, nome: p.nome }))];

  return (
    <>
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] text-suave">Lançamentos</span>
        <SeletorMes
          rotulo={nomeDoMes(mes)}
          anterior={link({ mes: somarMesesAoMes(mes, -1) })}
          proximo={link({ mes: somarMesesAoMes(mes, 1) })}
        />
      </div>

      <nav aria-label="Filtrar por pessoa" className="flex flex-wrap gap-2">
        {filtros.map((f) => {
          const ativo = (f.id ?? undefined) === pessoaValida;
          return (
            <Link
              key={f.id ?? "todos"}
              href={link({ pessoa: f.id })}
              aria-current={ativo ? "true" : undefined}
              className={`flex min-h-10 items-center rounded-full border-[1.5px] px-4 text-sm ${
                ativo ? "border-tinta bg-tinta font-semibold text-white" : "border-borda bg-cartao font-medium"
              }`}
            >
              {f.nome}
            </Link>
          );
        })}
      </nav>

      {itens.length === 0 ? (
        <Vazio
          titulo="Nenhum lançamento"
          texto={`Não há lançamentos em ${nomeDoMes(mes).toLowerCase()}${pessoaValida ? " para esse filtro" : ""}.`}
          acao={<BotaoLink href="/lancamentos/novo">Novo lançamento</BotaoLink>}
        />
      ) : (
        [...porDia.entries()].map(([dia, lista]) => (
          <section key={dia} className="flex flex-col gap-1.5">
            <h2 className="px-1 text-xs font-semibold tracking-wide text-suave uppercase">{dataCurta(dia)}</h2>
            <ul className="rounded-2xl bg-cartao px-3.5">
              {lista.map((t) => (
                <li key={t.id} className="border-t border-linha first:border-t-0">
                  <ItemDaLista item={t} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}

function ItemDaLista({ item }: { item: ItemLancamento }) {
  const pessoa = estiloPessoa(item.pessoaCor);
  const categoria = item.categoriaPaiNome ? `${item.categoriaPaiNome} › ${item.categoriaNome}` : item.categoriaNome;
  const detalhes =
    item.tipo === "transferencia"
      ? [item.contaNome, "fora dos totais"]
      : [
          categoria ?? "Sem categoria",
          item.contaNome,
          item.parcelaTotal ? `parcela ${item.parcelaNumero} de ${item.parcelaTotal}` : null,
          item.status === "prevista" ? "prevista" : null,
        ].filter(Boolean);

  return (
    <Link href={`/lancamentos/${item.id}`} className="flex min-h-16 items-center gap-3 py-2">
      <span
        className={`flex h-9 w-9 flex-none items-center justify-center rounded-full text-sm font-bold ${pessoa.fundo} ${pessoa.texto}`}
        aria-hidden="true"
      >
        {item.descricao.charAt(0).toUpperCase()}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold">
          {item.descricao}
          {item.precisaRevisao && (
            <span className="ml-2 rounded-md bg-alerta-clara px-1.5 py-0.5 text-[11px] font-semibold text-alerta">revisar</span>
          )}
        </span>
        <span className="truncate text-xs text-suave">{detalhes.join(" · ")}</span>
      </span>
      <span className="flex flex-col items-end gap-0.5">
        <Valor centavos={item.valorCentavos} tipo={item.tipo} className="text-sm" />
        <span className={`text-[11px] font-semibold ${pessoa.texto}`}>{item.pessoaNome}</span>
      </span>
    </Link>
  );
}
