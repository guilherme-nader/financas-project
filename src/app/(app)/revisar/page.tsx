import Link from "next/link";
import { Suspense } from "react";
import { BotaoLink, Cabecalho, Esqueleto, Vazio } from "@/componentes/ui";
import { listarCategorias, listarParaRevisar, type ItemRevisao } from "@/lib/consultas";
import { chaveEstabelecimento } from "@/lib/importacao/texto";
import { GrupoParaRevisar } from "./grupo";
import { ItemParaRevisar } from "./item";

const POR_PAGINA = 30;

export default function PaginaRevisar(props: PageProps<"/revisar">) {
  return (
    <main className="flex flex-col gap-4">
      <Cabecalho titulo="Revisar" voltar={{ href: "/importar", rotulo: "Importar" }} />
      <Suspense fallback={<Esqueleto linhas={3} />}>
        <Conteudo searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/revisar">["searchParams"] }) {
  const sp = await searchParams;
  const limite = Math.min(Math.max(Number(sp.ver) || POR_PAGINA, POR_PAGINA), 2000);
  const [itens, categorias] = await Promise.all([listarParaRevisar(), listarCategorias()]);

  if (itens.length === 0) {
    return (
      <Vazio
        titulo="Tudo revisado"
        texto="Nenhum lançamento esperando por vocês. Cada categoria confirmada aqui vira regra para as próximas importações."
        acao={<BotaoLink href="/lancamentos">Ver lançamentos</BotaoLink>}
      />
    );
  }

  // Grupos primeiro: um clique resolve muitos. Depois os avulsos, aos poucos (a página fica leve).
  const grupos = agrupar(itens);
  const emGrupo = grupos.filter((g) => g.itens.length >= 3);
  const avulsos = grupos.filter((g) => g.itens.length < 3).flatMap((g) => g.itens);
  const visiveis = avulsos.slice(0, limite);

  return (
    <>
      <p className="text-sm text-suave">
        {itens.length} {itens.length === 1 ? "lançamento precisa" : "lançamentos precisam"} de vocês. Cada resposta vira
        regra, e na próxima fatura o sistema já sabe.
      </p>
      {emGrupo.map((g) => (
        <GrupoParaRevisar
          key={g.chave}
          titulo={g.titulo}
          itens={g.itens}
          categorias={g.itens[0].tipo === "receita" ? categorias.receita : categorias.despesa}
        />
      ))}
      {visiveis.map((item) => (
        <ItemParaRevisar
          key={item.id}
          item={item}
          categorias={item.tipo === "receita" ? categorias.receita : categorias.despesa}
          padrao={chaveEstabelecimento(item.descricaoOriginal ?? item.descricao)}
        />
      ))}
      {avulsos.length > visiveis.length && (
        <Link
          href={`/revisar?ver=${limite + POR_PAGINA}`}
          scroll={false}
          className="flex min-h-12 items-center justify-center rounded-[14px] border-[1.5px] border-marca text-[15px] font-semibold text-marca"
        >
          Mostrar mais {Math.min(POR_PAGINA, avulsos.length - visiveis.length)} (faltam {avulsos.length - visiveis.length})
        </Link>
      )}
    </>
  );
}

/**
 * Pix de/para pessoas diferentes no mesmo dia e conta formam um grupo
 * (ex.: presentes de casamento); o resto fica um a um.
 */
function agrupar(itens: ItemRevisao[]) {
  const grupos = new Map<string, { chave: string; titulo: string; itens: ItemRevisao[] }>();
  for (const item of itens) {
    const exterior = (item.descricaoOriginal ?? "").startsWith("Compra no exterior");
    const pix = item.descricao.startsWith("Pix de ") ? "de" : item.descricao.startsWith("Pix para ") ? "para" : null;
    const chave = exterior ? `${item.contaNome}|exterior` : pix ? `${item.contaNome}|${item.data}|${item.tipo}|${pix}` : item.id;
    const titulo = exterior
      ? "Compras no exterior"
      : pix === "de"
        ? "Pix recebidos de várias pessoas"
        : "Pix enviados para várias pessoas";
    const grupo = grupos.get(chave) ?? { chave, titulo, itens: [] };
    grupo.itens.push(item);
    grupos.set(chave, grupo);
  }
  return [...grupos.values()];
}
