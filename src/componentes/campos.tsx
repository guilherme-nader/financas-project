import type { ReactNode } from "react";
import type { CategoriaComFilhas } from "@/lib/consultas";

export const classeEntrada =
  "min-h-12 w-full rounded-xl border border-borda bg-cartao px-3.5 text-base outline-none focus:border-marca focus:ring-2 focus:ring-marca/20 aria-[invalid=true]:border-erro";

export function Campo({
  id,
  rotulo,
  erro,
  dica,
  children,
}: {
  id: string;
  rotulo: string;
  erro?: string;
  dica?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {rotulo}
      </label>
      {children}
      {dica && !erro && <span className="text-xs text-suave">{dica}</span>}
      {erro && (
        <span id={`${id}-erro`} className="text-xs font-medium text-erro">
          {erro}
        </span>
      )}
    </div>
  );
}

export function AvisoErro({ mensagem }: { mensagem?: string }) {
  if (!mensagem) return null;
  return (
    <p role="alert" className="rounded-xl bg-alerta-clara px-4 py-3 text-sm font-medium text-alerta">
      {mensagem}
    </p>
  );
}

/** <option>s de categoria agrupadas: a principal e as subcategorias logo abaixo. */
export function OpcoesCategoria({ arvore }: { arvore: CategoriaComFilhas[] }) {
  return (
    <>
      {arvore.map((pai) =>
        pai.filhas.length === 0 ? (
          <option key={pai.id} value={pai.id}>
            {pai.nome}
          </option>
        ) : (
          <optgroup key={pai.id} label={pai.nome}>
            <option value={pai.id}>{pai.nome} (geral)</option>
            {pai.filhas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </optgroup>
        ),
      )}
    </>
  );
}
