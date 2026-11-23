"use client";

import { useActionState, useState } from "react";
import { confirmarRevisaoEmLote, type EstadoRevisao } from "@/acoes/revisao";
import { AvisoErro, OpcoesCategoria, classeEntrada } from "@/componentes/campos";
import { dataCurta } from "@/lib/datas";
import { formatarCentavos } from "@/lib/dinheiro";
import type { CategoriaComFilhas, ItemRevisao } from "@/lib/consultas";

/** Vários pendentes parecidos (mesmo dia, mesma conta, Pix de pessoas diferentes) resolvidos de uma vez. */
export function GrupoParaRevisar({ titulo, itens, categorias }: { titulo: string; itens: ItemRevisao[]; categorias: CategoriaComFilhas[] }) {
  const ids = itens.map((i) => i.id);
  const [estado, acao, enviando] = useActionState<EstadoRevisao, FormData>(confirmarRevisaoEmLote.bind(null, ids), {});
  const [aberto, setAberto] = useState(false);
  const total = itens.reduce((s, i) => s + i.valorCentavos, 0);
  const idSelect = `lote-${ids[0]}`;
  const datas = itens.map((i) => i.data).sort();
  const periodo = datas[0] === datas.at(-1) ? dataCurta(datas[0]) : `${dataCurta(datas[0])} a ${dataCurta(datas.at(-1)!)}`;

  return (
    <article className="flex flex-col gap-3.5 rounded-[20px] border-[1.5px] border-alerta/30 bg-cartao p-4.5">
      <div className="flex justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold">{titulo}</span>
          <span className="text-xs text-suave">
            {periodo} · {itens[0].contaNome} · {itens.length} lançamentos
          </span>
        </div>
        <span className="tabular text-base font-bold whitespace-nowrap">{formatarCentavos(total)}</span>
      </div>
      <button type="button" onClick={() => setAberto(!aberto)} aria-expanded={aberto} className="self-start text-[13px] font-semibold text-marca">
        {aberto ? "Esconder" : "Ver"} os {itens.length}
      </button>
      {aberto && (
        <ul className="flex max-h-72 flex-col overflow-y-auto rounded-xl bg-fundo px-3 text-[13px]">
          {itens.map((i) => (
            <li key={i.id} className="flex justify-between gap-2 border-t border-linha py-1.5 first:border-t-0">
              <span className="truncate">{i.descricao}</span>
              <span className="tabular whitespace-nowrap">{formatarCentavos(i.valorCentavos)}</span>
            </li>
          ))}
        </ul>
      )}
      <form action={acao} className="flex flex-col gap-3">
        <label htmlFor={idSelect} className="sr-only">
          Categoria para todos
        </label>
        <select id={idSelect} name="categoriaId" required defaultValue="" className={classeEntrada}>
          <option value="" disabled>
            Categoria para todos…
          </option>
          <OpcoesCategoria arvore={categorias} />
        </select>
        <AvisoErro mensagem={estado.erro} />
        <button
          type="submit"
          disabled={enviando}
          className="min-h-12 rounded-[14px] bg-marca text-[15px] font-semibold text-white hover:bg-marca-escura disabled:opacity-60"
        >
          {enviando ? "Salvando…" : `Categorizar os ${itens.length}`}
        </button>
      </form>
    </article>
  );
}
