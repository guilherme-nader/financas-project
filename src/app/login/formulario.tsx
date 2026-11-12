"use client";

import { useActionState } from "react";
import { entrar, type EstadoLogin } from "./actions";

export function FormularioLogin() {
  const [estado, acao, enviando] = useActionState<EstadoLogin, FormData>(entrar, {});

  return (
    <form action={acao} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={estado.email}
          className="min-h-12 rounded-xl border border-borda bg-cartao px-4 text-base outline-none focus:border-marca focus:ring-2 focus:ring-marca/20"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="senha" className="text-sm font-medium">
          Senha
        </label>
        <input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          className="min-h-12 rounded-xl border border-borda bg-cartao px-4 text-base outline-none focus:border-marca focus:ring-2 focus:ring-marca/20"
        />
      </div>
      {estado.erro && (
        <p role="alert" className="rounded-xl bg-alerta-clara px-4 py-3 text-sm font-medium text-alerta">
          {estado.erro}
        </p>
      )}
      <button
        type="submit"
        disabled={enviando}
        className="min-h-12 rounded-xl bg-marca text-base font-semibold text-white transition hover:bg-marca-escura disabled:opacity-60"
      >
        {enviando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
