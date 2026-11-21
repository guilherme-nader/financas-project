import { Suspense } from "react";
import { BotaoLink, Cabecalho, Esqueleto, Vazio } from "@/componentes/ui";
import { listarContas, listarImportacoesRecentes } from "@/lib/consultas";
import { hoje } from "@/lib/dal";
import { dataBR } from "@/lib/datas";
import { FormularioImportacao } from "./formulario";

export default function PaginaImportar() {
  return (
    <main className="flex flex-col gap-5">
      <Cabecalho titulo="Importar" subtitulo="Faturas de cartão" />
      <Suspense fallback={<Esqueleto linhas={2} />}>
        <Conteudo />
      </Suspense>
    </main>
  );
}

async function Conteudo() {
  const [contas, recentes] = await Promise.all([listarContas(await hoje()), listarImportacoesRecentes()]);
  const cartoes = contas.filter((c) => c.tipo === "cartao");

  if (cartoes.length === 0) {
    return (
      <Vazio
        titulo="Cadastre o cartão primeiro"
        texto="A fatura é importada para um cartão. Cadastre os cartões XP com o dia de fechamento e de vencimento."
        acao={<BotaoLink href="/contas/nova">Cadastrar cartão</BotaoLink>}
      />
    );
  }

  return (
    <>
      <FormularioImportacao cartoes={cartoes.map((c) => ({ id: c.id, nome: c.nome, diaVencimento: c.diaVencimento }))} />
      <p className="text-center text-xs text-suave">
        Extratos de conta (OFX, CSV e PDF) chegam no próximo passo.
      </p>
      {recentes.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h2 className="px-1 text-xs font-semibold tracking-wide text-suave uppercase">Últimas importações</h2>
          <ul className="rounded-2xl bg-cartao px-4">
            {recentes.map((i) => (
              <li key={i.id} className="flex min-h-14 flex-col justify-center border-t border-linha py-2 first:border-t-0">
                <span className="text-sm font-semibold">
                  {i.contaNome}
                  {i.referencia && ` · vence ${dataBR(i.referencia)}`}
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
