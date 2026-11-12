"use client";

import { useActionState, useState } from "react";
import { salvarConta } from "@/acoes/contas";
import type { EstadoFormulario } from "@/acoes/lancamentos";
import { AvisoErro, Campo, classeEntrada } from "@/componentes/campos";

type Tipo = "corrente" | "cartao" | "investimento";

type Inicial = {
  id: string | null;
  nome: string;
  instituicao: string;
  tipo: Tipo;
  pessoaId: string;
  diaFechamento: number | null;
  diaVencimento: number | null;
  contaPagamentoId: string | null;
  saldoInicial: string;
};

const TIPOS: { valor: Tipo; rotulo: string; dica: string }[] = [
  { valor: "corrente", rotulo: "Conta corrente", dica: "Extrato: salário, Pix, boletos" },
  { valor: "cartao", rotulo: "Cartão de crédito", dica: "Fatura: compras e parcelas" },
  { valor: "investimento", rotulo: "Investimento", dica: "Aportes, resgates e rendimentos" },
];

export function FormularioConta({
  inicial,
  pessoas,
  contasCorrentes,
}: {
  inicial: Inicial;
  pessoas: { id: string; nome: string }[];
  contasCorrentes: { id: string; nome: string }[];
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(salvarConta.bind(null, inicial.id), {});
  const [tipo, setTipo] = useState<Tipo>(inicial.tipo);
  const erro = estado.campos ?? {};
  const editando = !!inicial.id;

  return (
    <form action={acao} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2" disabled={editando}>
        <legend className="mb-1.5 text-sm font-medium">Tipo{editando && " (não muda depois de criada)"}</legend>
        {TIPOS.map((t) => (
          <label
            key={t.valor}
            className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-[1.5px] bg-cartao px-4 has-focus-visible:ring-2 has-focus-visible:ring-marca ${
              tipo === t.valor ? "border-marca" : "border-transparent"
            } ${editando ? "cursor-default opacity-70" : ""}`}
          >
            <input
              type="radio"
              name="tipo"
              value={t.valor}
              checked={tipo === t.valor}
              onChange={() => setTipo(t.valor)}
              className="h-5 w-5 accent-marca"
            />
            <span className="flex flex-col">
              <span className="text-sm font-semibold">{t.rotulo}</span>
              <span className="text-xs text-suave">{t.dica}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {/* Campo desabilitado não é enviado; garante o tipo na edição. */}
      {editando && <input type="hidden" name="tipo" value={inicial.tipo} />}

      <div className="flex flex-col gap-4 rounded-[20px] bg-cartao p-5">
        <Campo id="nome" rotulo="Nome" erro={erro.nome} dica="Como vai aparecer nas listas. Ex.: Nubank cartão Gui">
          <input id="nome" name="nome" required maxLength={80} defaultValue={inicial.nome} className={classeEntrada} />
        </Campo>
        <Campo id="instituicao" rotulo="Banco ou corretora" erro={erro.instituicao}>
          <input
            id="instituicao"
            name="instituicao"
            required
            maxLength={80}
            list="bancos"
            defaultValue={inicial.instituicao}
            className={classeEntrada}
          />
          <datalist id="bancos">
            {["Nubank", "Itaú", "Santander", "XP", "Caixa"].map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </Campo>
        <Campo id="pessoaId" rotulo="De quem é" erro={erro.pessoaId}>
          <select id="pessoaId" name="pessoaId" defaultValue={inicial.pessoaId} className={classeEntrada}>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </Campo>

        {tipo === "cartao" ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Campo id="diaFechamento" rotulo="Fecha no dia" erro={erro.diaFechamento}>
                <input
                  id="diaFechamento"
                  name="diaFechamento"
                  type="number"
                  min={1}
                  max={31}
                  required
                  defaultValue={inicial.diaFechamento ?? ""}
                  className={classeEntrada}
                />
              </Campo>
              <Campo id="diaVencimento" rotulo="Vence no dia" erro={erro.diaVencimento}>
                <input
                  id="diaVencimento"
                  name="diaVencimento"
                  type="number"
                  min={1}
                  max={31}
                  required
                  defaultValue={inicial.diaVencimento ?? ""}
                  className={classeEntrada}
                />
              </Campo>
            </div>
            <p className="-mt-2 text-xs text-suave">
              Compras no dia do fechamento ou depois já entram na fatura seguinte.
            </p>
            <Campo id="contaPagamentoId" rotulo="Fatura paga pela conta (opcional)">
              <select
                id="contaPagamentoId"
                name="contaPagamentoId"
                defaultValue={inicial.contaPagamentoId ?? ""}
                className={classeEntrada}
              >
                <option value="">—</option>
                {contasCorrentes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </Campo>
          </>
        ) : (
          <Campo
            id="saldoInicial"
            rotulo="Saldo inicial (R$)"
            erro={erro.saldoInicial}
            dica="O saldo antes do primeiro lançamento. Use - na frente se estiver negativo."
          >
            <input
              id="saldoInicial"
              name="saldoInicial"
              inputMode="decimal"
              placeholder="0,00"
              defaultValue={inicial.saldoInicial}
              className={`${classeEntrada} tabular`}
            />
          </Campo>
        )}
      </div>

      <AvisoErro mensagem={estado.erro} />
      <button
        type="submit"
        disabled={enviando}
        className="min-h-12 rounded-[14px] bg-marca text-[15px] font-semibold text-white hover:bg-marca-escura disabled:opacity-60"
      >
        {enviando ? "Salvando…" : editando ? "Salvar alterações" : "Cadastrar conta"}
      </button>
    </form>
  );
}
