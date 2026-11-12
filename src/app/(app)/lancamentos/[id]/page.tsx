import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Cabecalho, Esqueleto } from "@/componentes/ui";
import { listarCategorias, listarPessoas, obterLancamento } from "@/lib/consultas";
import { dataBR, mesDe } from "@/lib/datas";
import { formatarCentavos } from "@/lib/dinheiro";
import { FormularioEdicao } from "./formulario";

export default function PaginaLancamento(props: PageProps<"/lancamentos/[id]">) {
  return (
    <main className="flex flex-col gap-5">
      <Suspense fallback={<Esqueleto linhas={3} />}>
        <Conteudo params={props.params} />
      </Suspense>
    </main>
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function Conteudo({ params }: { params: PageProps<"/lancamentos/[id]">["params"] }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [item, categorias, pessoas] = await Promise.all([obterLancamento(id), listarCategorias(), listarPessoas()]);
  if (!item) notFound();
  const { transacao: t, conta, par } = item;

  const origemDestino =
    t.tipo === "transferencia" && par
      ? t.valorCentavos < 0
        ? `${conta.nome} → ${par.conta.nome}`
        : `${par.conta.nome} → ${conta.nome}`
      : conta.nome;

  const info = [
    origemDestino,
    t.parcelaTotal ? `parcela ${t.parcelaNumero} de ${t.parcelaTotal}` : null,
    conta.tipo === "cartao" ? `fatura que vence em ${dataBR(t.dataCaixa)}` : null,
    t.status === "prevista" ? "prevista" : null,
  ].filter(Boolean);

  return (
    <>
      <Cabecalho
        titulo={t.descricao}
        subtitulo={`${formatarCentavos(t.valorCentavos, { sinal: t.tipo !== "transferencia" })} · ${info.join(" · ")}`}
        voltar={{ href: `/lancamentos?mes=${mesDe(t.data)}`, rotulo: "Lançamentos" }}
      />
      <FormularioEdicao
        dados={{
          id: t.id,
          tipo: t.tipo,
          valor: (Math.abs(t.valorCentavos) / 100).toFixed(2).replace(".", ","),
          descricao: t.descricao,
          data: t.data,
          categoriaId: t.categoriaId,
          pessoaId: t.pessoaId,
          observacao: t.observacao,
          parcelado: !!t.grupoParcelamentoId,
        }}
        categorias={t.tipo === "transferencia" ? [] : categorias[t.tipo]}
        pessoas={pessoas.map((p) => ({ id: p.id, nome: p.nome }))}
      />
    </>
  );
}
