"use client";

import { useActionState } from "react";
import { salvarNomesNoBanco, type EstadoPessoa } from "@/acoes/pessoas";
import { AvisoErro, classeEntrada } from "@/componentes/campos";

export function FormularioNomes({ pessoa }: { pessoa: { id: string; nome: string; nomesNoBanco: string[] } }) {
  const [estado, acao, enviando] = useActionState<EstadoPessoa, FormData>(salvarNomesNoBanco.bind(null, pessoa.id), {});
  const id = `nomes-${pessoa.id}`;
  return (
    <form action={acao} className="flex flex-col gap-3 rounded-[20px] bg-cartao p-5">
      <label htmlFor={id} className="flex flex-col gap-0.5">
        <span className="font-titulo text-[17px] font-semibold">{pessoa.nome}</span>
        <span className="text-xs text-suave">Um nome por linha, do jeito que aparece nos extratos.</span>
      </label>
      <textarea
        id={id}
        name="nomes"
        rows={Math.max(3, pessoa.nomesNoBanco.length + 1)}
        defaultValue={pessoa.nomesNoBanco.join("\n")}
        className={`${classeEntrada} py-3 font-mono text-sm uppercase`}
      />
      <AvisoErro mensagem={estado.erro} />
      {!!estado.reclassificadas && (
        <p role="status" className="rounded-xl bg-marca-clara px-3.5 py-2.5 text-sm font-medium text-marca-escura">
          {estado.reclassificadas} Pix que estavam para revisar viraram transferência entre contas.
        </p>
      )}
      <button
        type="submit"
        disabled={enviando}
        className="min-h-11 rounded-[14px] border-[1.5px] border-marca text-sm font-semibold text-marca hover:bg-marca-clara disabled:opacity-60"
      >
        {enviando ? "Salvando…" : estado.salvo ? "Salvo ✓" : "Salvar nomes"}
      </button>
    </form>
  );
}
