import { Suspense } from "react";
import { BotaoLink, Cabecalho, Esqueleto, Vazio } from "@/componentes/ui";
import { listarCategorias, listarParaRevisar, type ItemRevisao } from "@/lib/consultas";
import { chaveEstabelecimento } from "@/lib/importacao/texto";
import { GrupoParaRevisar } from "./grupo";
import { ItemParaRevisar } from "./item";

export default function PaginaRevisar() {
  return (
    <main className="flex flex-col gap-4">
      <Cabecalho titulo="Revisar" voltar={{ href: "/importar", rotulo: "Importar" }} />
      <Suspense fallback={<Esqueleto linhas={3} />}>
        <Conteudo />
      </Suspense>
    </main>
  );
}

async function Conteudo() {
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

  return (
    <>
      <p className="text-sm text-suave">
        {itens.length} {itens.length === 1 ? "lançamento precisa" : "lançamentos precisam"} de vocês. Cada resposta vira
        regra, e na próxima fatura o sistema já sabe.
      </p>
      {agrupar(itens).map((g) =>
        g.itens.length >= 3 ? (
          <GrupoParaRevisar
            key={g.chave}
            titulo={g.titulo}
            itens={g.itens}
            categorias={g.itens[0].tipo === "receita" ? categorias.receita : categorias.despesa}
          />
        ) : (
          g.itens.map((item) => (
            <ItemParaRevisar
              key={item.id}
              item={item}
              categorias={item.tipo === "receita" ? categorias.receita : categorias.despesa}
              padrao={chaveEstabelecimento(item.descricaoOriginal ?? item.descricao)}
            />
          ))
        ),
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
    const pix = item.descricao.startsWith("Pix de ") ? "de" : item.descricao.startsWith("Pix para ") ? "para" : null;
    const chave = pix ? `${item.contaNome}|${item.data}|${item.tipo}|${pix}` : item.id;
    const titulo = pix === "de" ? "Pix recebidos de várias pessoas" : "Pix enviados para várias pessoas";
    const grupo = grupos.get(chave) ?? { chave, titulo, itens: [] };
    grupo.itens.push(item);
    grupos.set(chave, grupo);
  }
  return [...grupos.values()];
}
