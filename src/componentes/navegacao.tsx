"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconeEnviar, IconeGrafico, IconeInicio, IconeLista, IconeMenu } from "./icones";

const ABAS = [
  { href: "/", rotulo: "Início", Icone: IconeInicio },
  { href: "/lancamentos", rotulo: "Lançamentos", Icone: IconeLista },
  { href: "/importar", rotulo: "Importar", Icone: IconeEnviar, destaque: true },
  { href: "/projecao", rotulo: "Projeção", Icone: IconeGrafico },
  { href: "/mais", rotulo: "Mais", Icone: IconeMenu },
];

const SOB_MAIS = ["/mais", "/contas", "/categorias"];

/** Lê a URL atual para destacar a aba certa. */
export function Navegacao() {
  return <BarraDeAbas caminho={usePathname()} />;
}

/** A barra em si; com `caminho` nulo (enquanto a URL não chega) nenhuma aba fica destacada. */
export function BarraDeAbas({ caminho }: { caminho: string | null }) {
  const ativa = (href: string) =>
    caminho === null
      ? false
      : href === "/"
      ? caminho === "/"
      : href === "/mais"
        ? SOB_MAIS.some((p) => caminho.startsWith(p))
        : caminho.startsWith(href);

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-borda bg-cartao pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-lg items-start justify-around pt-2 pb-3">
        {ABAS.map(({ href, rotulo, Icone, destaque }) => {
          const atual = ativa(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={atual ? "page" : undefined}
                className={`flex min-h-12 min-w-16 flex-col items-center gap-0.5 text-[11px] ${
                  atual ? "font-semibold text-marca" : "font-medium text-suave"
                }`}
              >
                {destaque ? (
                  <span
                    className={`-mt-5 flex h-11 w-11 items-center justify-center rounded-full bg-marca text-white ${
                      atual ? "ring-4 ring-marca-clara" : ""
                    }`}
                  >
                    <Icone />
                  </span>
                ) : (
                  <Icone />
                )}
                {rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
