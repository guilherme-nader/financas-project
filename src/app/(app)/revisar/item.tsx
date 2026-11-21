"use client";

import { useActionState } from "react";
import { confirmarRevisao, type EstadoRevisao } from "@/acoes/revisao";
import { AvisoErro, OpcoesCategoria, classeEntrada } from "@/componentes/campos";
import { formatarCentavos } from "@/lib/dinheiro";
import { dataCurta } from "@/lib/datas";
import type { CategoriaComFilhas, ItemRevisao } from "@/lib/consultas";

export function ItemParaRevisar({
  item,
  categorias,
  padrao,
}: {
  item: ItemRevisao;
  categorias: CategoriaComFilhas[];
  /** Como a regra vai ser lembrada (ex.: "LUCASSILVAS"), mostrado de forma legível. */
  padrao: string;
}) {
  const [estado, acao, enviando] = useActionState<EstadoRevisao, FormData>(confirmarRevisao.bind(null, item.id), {});
  const idCategoria = `categoria-${item.id}`;
  const idLembrar = `lembrar-${item.id}`;

  return (
    <article className="flex flex-col gap-3.5 rounded-[20px] bg-cartao p-4.5">
      <div className="flex justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-mono text-[13px] font-semibold break-words">{item.descricaoOriginal ?? item.descricao}</span>
          <span className="text-xs text-suave">
            {dataCurta(item.data)} · {item.contaNome} · {item.pessoaNome}
            {item.parcelaTotal ? ` · parcela ${item.parcelaNumero} de ${item.parcelaTotal}` : ""}
          </span>
        </div>
        <span className="tabular text-base font-bold whitespace-nowrap">{formatarCentavos(item.valorCentavos)}</span>
      </div>
      <form action={acao} className="flex flex-col gap-3">
        <label htmlFor={idCategoria} className="sr-only">
          Categoria
        </label>
        <select id={idCategoria} name="categoriaId" required defaultValue="" className={classeEntrada}>
          <option value="" disabled>
            Escolha a categoria…
          </option>
          <OpcoesCategoria arvore={categorias} />
        </select>
        <div className="flex items-start gap-2.5 text-[13px]">
          <input id={idLembrar} name="lembrar" type="checkbox" value="sim" defaultChecked className="mt-0.5 h-5 w-5 accent-marca" />
          <label htmlFor={idLembrar}>
            Lembrar: sempre que aparecer <strong className="font-mono">{padrao}</strong>, usar esta categoria
          </label>
        </div>
        <AvisoErro mensagem={estado.erro} />
        <button
          type="submit"
          disabled={enviando}
          className="min-h-12 rounded-[14px] bg-marca text-[15px] font-semibold text-white hover:bg-marca-escura disabled:opacity-60"
        >
          {enviando ? "Salvando…" : "Confirmar"}
        </button>
      </form>
    </article>
  );
}
