import Link from "next/link";
import { Suspense } from "react";
import { sair } from "@/app/login/actions";
import { IconeAvancar } from "@/componentes/icones";
import { Cabecalho } from "@/componentes/ui";
import { usuarioAtual } from "@/lib/dal";

const ITENS = [
  { href: "/contas", titulo: "Contas", texto: "Contas correntes, cartões e investimentos" },
  { href: "/categorias", titulo: "Categorias", texto: "Organize onde o dinheiro vai" },
];

export default function PaginaMais() {
  return (
    <main className="flex flex-col gap-5">
      <Cabecalho titulo="Mais" />
      <ul className="rounded-2xl bg-cartao px-4">
        {ITENS.map((i) => (
          <li key={i.href} className="border-t border-linha first:border-t-0">
            <Link href={i.href} className="flex min-h-16 items-center justify-between gap-3 py-2">
              <span className="flex flex-col">
                <span className="text-sm font-semibold">{i.titulo}</span>
                <span className="text-xs text-suave">{i.texto}</span>
              </span>
              <IconeAvancar tamanho={18} className="text-suave" />
            </Link>
          </li>
        ))}
      </ul>
      <form action={sair} className="flex flex-col gap-2 rounded-2xl bg-cartao p-4">
        <Suspense fallback={<span className="h-5" />}>
          <QuemEsta />
        </Suspense>
        <button
          type="submit"
          className="min-h-12 rounded-[14px] border-[1.5px] border-borda text-[15px] font-semibold hover:bg-fundo"
        >
          Sair
        </button>
      </form>
    </main>
  );
}

async function QuemEsta() {
  const usuario = await usuarioAtual();
  return <span className="text-sm text-suave">Conectado como {usuario?.nome ?? "—"}</span>;
}
