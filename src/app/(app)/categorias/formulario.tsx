"use client";

import { useActionState, useRef } from "react";
import { criarCategoria } from "@/acoes/categorias";
import type { EstadoFormulario } from "@/acoes/lancamentos";
import { AvisoErro, Campo, classeEntrada } from "@/componentes/campos";

export function FormularioCategoria({
  tipo,
  principais,
}: {
  tipo: "despesa" | "receita";
  principais: { id: string; nome: string }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(async (anterior, form) => {
    const resultado = await criarCategoria(anterior, form);
    if (!resultado.erro) formRef.current?.reset();
    return resultado;
  }, {});

  return (
    <form ref={formRef} action={acao} className="flex flex-col gap-4 rounded-[20px] bg-cartao p-5">
      <h2 className="font-titulo text-[17px] font-semibold">Nova categoria</h2>
      <input type="hidden" name="tipo" value={tipo} />
      <Campo id="nome" rotulo="Nome">
        <input id="nome" name="nome" required maxLength={60} className={classeEntrada} />
      </Campo>
      <Campo id="paiId" rotulo="Dentro de (opcional)">
        <select id="paiId" name="paiId" defaultValue="" className={classeEntrada}>
          <option value="">— é uma categoria principal —</option>
          {principais.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </Campo>
      <AvisoErro mensagem={estado.erro} />
      <button
        type="submit"
        disabled={enviando}
        className="min-h-12 rounded-[14px] bg-marca text-[15px] font-semibold text-white hover:bg-marca-escura disabled:opacity-60"
      >
        {enviando ? "Salvando…" : "Adicionar"}
      </button>
    </form>
  );
}
