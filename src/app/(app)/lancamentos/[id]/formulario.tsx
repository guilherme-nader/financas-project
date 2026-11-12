"use client";

import { useActionState } from "react";
import { atualizarLancamento, excluirLancamento, type EstadoFormulario } from "@/acoes/lancamentos";
import { AvisoErro, Campo, OpcoesCategoria, classeEntrada } from "@/componentes/campos";
import type { CategoriaComFilhas } from "@/lib/consultas";

type Dados = {
  id: string;
  tipo: "despesa" | "receita" | "transferencia";
  valor: string;
  descricao: string;
  data: string;
  categoriaId: string | null;
  pessoaId: string;
  observacao: string | null;
  parcelado: boolean;
};

export function FormularioEdicao({
  dados,
  categorias,
  pessoas,
}: {
  dados: Dados;
  categorias: CategoriaComFilhas[];
  pessoas: { id: string; nome: string }[];
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    atualizarLancamento.bind(null, dados.id),
    {},
  );
  const erro = estado.campos ?? {};

  return (
    <div className="flex flex-col gap-5">
      <form action={acao} className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 rounded-[20px] bg-cartao p-5">
          <Campo id="valor" rotulo={dados.parcelado ? "Valor desta parcela (R$)" : "Valor (R$)"} erro={erro.valor}>
            <input
              id="valor"
              name="valor"
              inputMode="decimal"
              required
              defaultValue={dados.valor}
              aria-invalid={!!erro.valor}
              className={`${classeEntrada} tabular font-titulo text-2xl font-semibold`}
            />
          </Campo>
          <Campo id="descricao" rotulo="Descrição" erro={erro.descricao}>
            <input id="descricao" name="descricao" required maxLength={200} defaultValue={dados.descricao} className={classeEntrada} />
          </Campo>
          <Campo id="data" rotulo="Data" erro={erro.data}>
            <input id="data" name="data" type="date" required defaultValue={dados.data} className={classeEntrada} />
          </Campo>
          {dados.tipo !== "transferencia" && (
            <Campo id="categoriaId" rotulo="Categoria" erro={erro.categoriaId}>
              <select id="categoriaId" name="categoriaId" defaultValue={dados.categoriaId ?? ""} className={classeEntrada}>
                <option value="">Sem categoria</option>
                <OpcoesCategoria arvore={categorias} />
              </select>
            </Campo>
          )}
          <Campo id="pessoaId" rotulo="De quem é" erro={erro.pessoaId}>
            <select id="pessoaId" name="pessoaId" defaultValue={dados.pessoaId} className={classeEntrada}>
              {pessoas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo id="observacao" rotulo="Observação (opcional)">
            <textarea
              id="observacao"
              name="observacao"
              rows={2}
              maxLength={1000}
              defaultValue={dados.observacao ?? ""}
              className={`${classeEntrada} py-3`}
            />
          </Campo>
          {dados.parcelado && (
            <div className="flex items-center gap-2.5 text-sm">
              <input
                id="aplicarAoGrupo"
                name="aplicarAoGrupo"
                type="checkbox"
                value="sim"
                defaultChecked
                className="h-5 w-5 accent-marca"
              />
              <label htmlFor="aplicarAoGrupo">Usar descrição, categoria e pessoa em todas as parcelas</label>
            </div>
          )}
        </div>
        <AvisoErro mensagem={estado.erro} />
        <button
          type="submit"
          disabled={enviando}
          className="min-h-12 rounded-[14px] bg-marca text-[15px] font-semibold text-white hover:bg-marca-escura disabled:opacity-60"
        >
          {enviando ? "Salvando…" : "Salvar alterações"}
        </button>
      </form>

      <form
        action={excluirLancamento.bind(null, dados.id)}
        onSubmit={(e) => {
          if (!confirm("Excluir este lançamento?")) e.preventDefault();
        }}
        className="flex flex-col gap-3 rounded-[20px] bg-cartao p-5"
      >
        <h2 className="font-titulo text-[17px] font-semibold">Excluir</h2>
        {dados.parcelado && (
          <fieldset className="flex flex-col gap-2 text-sm">
            <legend className="sr-only">O que excluir</legend>
            <label className="flex items-center gap-2.5">
              <input type="radio" name="escopo" value="esta" defaultChecked className="h-5 w-5 accent-erro" />
              Só esta parcela
            </label>
            <label className="flex items-center gap-2.5">
              <input type="radio" name="escopo" value="grupo" className="h-5 w-5 accent-erro" />
              Todas as parcelas desta compra
            </label>
          </fieldset>
        )}
        {dados.tipo === "transferencia" && (
          <p className="text-sm text-suave">Os dois lados da transferência serão excluídos juntos.</p>
        )}
        <button
          type="submit"
          className="min-h-12 rounded-[14px] border-[1.5px] border-erro text-[15px] font-semibold text-erro hover:bg-erro/5"
        >
          Excluir lançamento
        </button>
      </form>
    </div>
  );
}
