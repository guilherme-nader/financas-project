import Link from "next/link";
import { Suspense } from "react";
import { desativarCategoria } from "@/acoes/categorias";
import { Cabecalho, Esqueleto } from "@/componentes/ui";
import { listarCategorias } from "@/lib/consultas";
import { FormularioCategoria } from "./formulario";

export default function PaginaCategorias(props: PageProps<"/categorias">) {
  return (
    <main className="flex flex-col gap-5">
      <Cabecalho titulo="Categorias" voltar={{ href: "/mais", rotulo: "Mais" }} />
      <Suspense fallback={<Esqueleto linhas={4} />}>
        <Conteudo searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/categorias">["searchParams"] }) {
  const sp = await searchParams;
  const tipo = sp.tipo === "receita" ? "receita" : "despesa";
  const arvore = await listarCategorias();
  const lista = arvore[tipo];

  return (
    <>
      <nav aria-label="Tipo de categoria" className="grid grid-cols-2 gap-1 rounded-2xl bg-cartao p-1">
        {(["despesa", "receita"] as const).map((t) => (
          <Link
            key={t}
            href={`/categorias?tipo=${t}`}
            aria-current={t === tipo ? "page" : undefined}
            className={`flex min-h-11 items-center justify-center rounded-xl text-sm font-semibold ${
              t === tipo ? "bg-tinta text-white" : "text-suave"
            }`}
          >
            {t === "despesa" ? "Saídas" : "Entradas"}
          </Link>
        ))}
      </nav>

      <ul className="rounded-2xl bg-cartao px-4">
        {lista.map((pai) => (
          <li key={pai.id} className="border-t border-linha py-3 first:border-t-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">{pai.nome}</span>
              <BotaoDesativar id={pai.id} nome={pai.nome} />
            </div>
            {pai.filhas.length > 0 && (
              <ul className="mt-1 flex flex-col">
                {pai.filhas.map((f) => (
                  <li key={f.id} className="flex min-h-9 items-center justify-between gap-2 pl-4 text-sm text-suave">
                    {f.nome}
                    <BotaoDesativar id={f.id} nome={f.nome} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <FormularioCategoria tipo={tipo} principais={lista.map((p) => ({ id: p.id, nome: p.nome }))} />

      <p className="text-center text-xs text-suave">
        Transferências (pagamento de fatura, aporte, resgate) são categorias do sistema e não aparecem aqui.
      </p>
    </>
  );
}

function BotaoDesativar({ id, nome }: { id: string; nome: string }) {
  return (
    <form action={desativarCategoria.bind(null, id)}>
      <button
        type="submit"
        aria-label={`Remover ${nome}`}
        className="flex min-h-9 min-w-9 items-center justify-center rounded-full text-lg leading-none text-suave hover:bg-fundo hover:text-erro"
      >
        ×
      </button>
    </form>
  );
}
