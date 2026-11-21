import { Suspense } from "react";
import { BotaoLink, Cabecalho, Esqueleto, Vazio } from "@/componentes/ui";
import { listarCategorias, listarParaRevisar } from "@/lib/consultas";
import { chaveEstabelecimento } from "@/lib/importacao/texto";
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
      {itens.map((item) => (
        <ItemParaRevisar
          key={item.id}
          item={item}
          categorias={item.tipo === "receita" ? categorias.receita : categorias.despesa}
          padrao={chaveEstabelecimento(item.descricaoOriginal ?? item.descricao)}
        />
      ))}
    </>
  );
}
