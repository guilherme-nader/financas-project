import Link from "next/link";
import { Suspense } from "react";
import { BotaoLink, Cabecalho, Esqueleto, Vazio } from "@/componentes/ui";
import { listarContas, listarImportacoesRecentes } from "@/lib/consultas";
import { hoje } from "@/lib/dal";
import { dataBR } from "@/lib/datas";
import { FormularioImportacao } from "./formulario";
import { FormularioExtrato } from "./formulario-extrato";

export default function PaginaImportar(props: PageProps<"/importar">) {
  return (
    <main className="flex flex-col gap-5">
      <Cabecalho titulo="Importar" />
      <Suspense fallback={<Esqueleto linhas={2} />}>
        <Conteudo searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/importar">["searchParams"] }) {
  const { tipo } = await searchParams;
  const aba = tipo === "extrato" ? "extrato" : "fatura";
  const [contas, recentes] = await Promise.all([listarContas(await hoje()), listarImportacoesRecentes()]);
  const cartoes = contas.filter((c) => c.tipo === "cartao");
  const contasComExtrato = contas.filter((c) => c.tipo !== "cartao");

  return (
    <>
      <nav aria-label="O que importar" className="grid grid-cols-2 gap-1 rounded-2xl bg-cartao p-1">
        {(
          [
            ["fatura", "Fatura de cartão"],
            ["extrato", "Extrato de conta"],
          ] as const
        ).map(([valor, rotulo]) => (
          <Link
            key={valor}
            href={`/importar?tipo=${valor}`}
            aria-current={aba === valor ? "page" : undefined}
            className={`flex min-h-11 items-center justify-center rounded-xl text-sm font-semibold ${
              aba === valor ? "bg-tinta text-white" : "text-suave"
            }`}
          >
            {rotulo}
          </Link>
        ))}
      </nav>

      {aba === "fatura" ? (
        cartoes.length === 0 ? (
          <Vazio
            titulo="Cadastre o cartão primeiro"
            texto="A fatura é importada para um cartão. Cadastre os cartões com o dia de fechamento e de vencimento."
            acao={<BotaoLink href="/contas/nova">Cadastrar cartão</BotaoLink>}
          />
        ) : (
          <FormularioImportacao cartoes={cartoes.map((c) => ({ id: c.id, nome: c.nome, diaVencimento: c.diaVencimento }))} />
        )
      ) : contasComExtrato.length === 0 ? (
        <Vazio
          titulo="Cadastre a conta primeiro"
          texto="O extrato é importado para uma conta corrente. Cadastre a conta do Itaú, do Santander…"
          acao={<BotaoLink href="/contas/nova">Cadastrar conta</BotaoLink>}
        />
      ) : (
        <FormularioExtrato contas={contasComExtrato.map((c) => ({ id: c.id, nome: c.nome }))} />
      )}

      {recentes.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h2 className="px-1 text-xs font-semibold tracking-wide text-suave uppercase">Últimas importações</h2>
          <ul className="rounded-2xl bg-cartao px-4">
            {recentes.map((i) => (
              <li key={i.id} className="flex min-h-14 flex-col justify-center border-t border-linha py-2 first:border-t-0">
                <span className="text-sm font-semibold">
                  {i.contaNome}
                  {i.referencia && ` · ${dataBR(i.referencia)}`}
                </span>
                <span className="text-xs text-suave">
                  {i.arquivoNome} · {i.novas} novas
                  {i.confirmadas ? ` · ${i.confirmadas} confirmadas` : ""}
                  {i.duplicadas ? ` · ${i.duplicadas} já existiam` : ""}
                  {i.paraRevisar ? ` · ${i.paraRevisar} para revisar` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
