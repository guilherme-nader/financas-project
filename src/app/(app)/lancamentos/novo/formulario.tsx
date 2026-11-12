"use client";

import { useActionState, useState } from "react";
import { criarLancamento, type EstadoFormulario } from "@/acoes/lancamentos";
import { AvisoErro, Campo, OpcoesCategoria, classeEntrada } from "@/componentes/campos";
import type { ArvoreCategorias } from "@/lib/consultas";

type ContaOpcao = { id: string; nome: string; tipo: "corrente" | "cartao" | "investimento"; pessoaId: string };
type PessoaOpcao = { id: string; nome: string };
type Tipo = "despesa" | "receita" | "transferencia";

const TIPOS: { valor: Tipo; rotulo: string }[] = [
  { valor: "despesa", rotulo: "Saída" },
  { valor: "receita", rotulo: "Entrada" },
  { valor: "transferencia", rotulo: "Transferência" },
];

const NOME_TIPO_CONTA = { corrente: "Contas", cartao: "Cartões", investimento: "Investimentos" } as const;

export function FormularioLancamento({
  contas,
  categorias,
  pessoas,
  hoje,
  pessoaPadraoId,
}: {
  contas: ContaOpcao[];
  categorias: ArvoreCategorias;
  pessoas: PessoaOpcao[];
  hoje: string;
  pessoaPadraoId: string;
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(criarLancamento, {});
  const [tipo, setTipo] = useState<Tipo>("despesa");
  const [contaId, setContaId] = useState(contas[0]?.id ?? "");
  const [pessoaId, setPessoaId] = useState(contas[0]?.pessoaId ?? pessoaPadraoId);
  const erro = estado.campos ?? {};
  const conta = contas.find((c) => c.id === contaId);

  const escolherConta = (id: string) => {
    setContaId(id);
    // Por padrão, o lançamento é de quem é dono da conta.
    const dono = contas.find((c) => c.id === id)?.pessoaId;
    if (dono) setPessoaId(dono);
  };

  return (
    <form action={acao} className="flex flex-col gap-5">
      <fieldset className="grid grid-cols-3 gap-1 rounded-2xl bg-cartao p-1">
        <legend className="sr-only">Tipo de lançamento</legend>
        {TIPOS.map((t) => (
          <label
            key={t.valor}
            className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl text-sm font-semibold has-focus-visible:ring-2 has-focus-visible:ring-marca ${
              tipo === t.valor ? "bg-tinta text-white" : "text-suave"
            }`}
          >
            <input
              type="radio"
              name="tipo"
              value={t.valor}
              checked={tipo === t.valor}
              onChange={() => {
                setTipo(t.valor);
                // Transferência não sai de cartão: troca para a primeira conta que não é cartão.
                if (t.valor === "transferencia" && conta?.tipo === "cartao") {
                  const outra = contas.find((c) => c.tipo !== "cartao");
                  if (outra) escolherConta(outra.id);
                }
              }}
              className="sr-only"
            />
            {t.rotulo}
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-4 rounded-[20px] bg-cartao p-5">
        <Campo id="valor" rotulo="Valor (R$)" erro={erro.valor} dica={tipo === "despesa" ? "Em compra parcelada, o valor total." : undefined}>
          <input
            id="valor"
            name="valor"
            inputMode="decimal"
            placeholder="0,00"
            required
            autoFocus
            aria-invalid={!!erro.valor}
            className={`${classeEntrada} tabular font-titulo text-2xl font-semibold`}
          />
        </Campo>

        <Campo id="descricao" rotulo="Descrição" erro={erro.descricao}>
          <input
            id="descricao"
            name="descricao"
            required
            maxLength={200}
            placeholder={tipo === "transferencia" ? "Ex.: pagamento da fatura" : "Ex.: mercado, salário, iFood"}
            aria-invalid={!!erro.descricao}
            className={classeEntrada}
          />
        </Campo>

        <Campo id="data" rotulo={tipo === "despesa" && conta?.tipo === "cartao" ? "Data da compra" : "Data"} erro={erro.data}>
          <input id="data" name="data" type="date" required defaultValue={hoje} aria-invalid={!!erro.data} className={classeEntrada} />
        </Campo>

        <Campo id="contaId" rotulo={tipo === "transferencia" ? "Sai de" : "Conta ou cartão"} erro={erro.contaId}>
          <select
            id="contaId"
            name="contaId"
            required
            value={contaId}
            onChange={(e) => escolherConta(e.target.value)}
            aria-invalid={!!erro.contaId}
            className={classeEntrada}
          >
            {(["corrente", "cartao", "investimento"] as const).map((t) => {
              const lista = contas.filter((c) => c.tipo === t && (tipo !== "transferencia" || t !== "cartao"));
              return lista.length ? (
                <optgroup key={t} label={NOME_TIPO_CONTA[t]}>
                  {lista.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </select>
        </Campo>

        {tipo === "transferencia" ? (
          <Campo
            id="contaDestinoId"
            rotulo="Vai para"
            erro={erro.contaDestinoId}
            dica="Pagar fatura, aplicar na XP ou mover entre contas. Não conta como gasto."
          >
            <select id="contaDestinoId" name="contaDestinoId" required aria-invalid={!!erro.contaDestinoId} className={classeEntrada}>
              <option value="">Escolha…</option>
              {(["corrente", "cartao", "investimento"] as const).map((t) => {
                const lista = contas.filter((c) => c.tipo === t && c.id !== contaId);
                return lista.length ? (
                  <optgroup key={t} label={NOME_TIPO_CONTA[t]}>
                    {lista.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </optgroup>
                ) : null;
              })}
            </select>
          </Campo>
        ) : (
          <Campo id="categoriaId" rotulo="Categoria" erro={erro.categoriaId}>
            <select key={tipo} id="categoriaId" name="categoriaId" aria-invalid={!!erro.categoriaId} className={classeEntrada}>
              <option value="">Sem categoria (decidir depois)</option>
              <OpcoesCategoria arvore={categorias[tipo]} />
            </select>
          </Campo>
        )}

        <Campo id="pessoaId" rotulo="De quem é" erro={erro.pessoaId}>
          <select
            id="pessoaId"
            name="pessoaId"
            required
            value={pessoaId}
            onChange={(e) => setPessoaId(e.target.value)}
            className={classeEntrada}
          >
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </Campo>

        {tipo === "despesa" && (
          <Campo
            id="parcelas"
            rotulo="Parcelas"
            erro={erro.parcelas}
            dica={conta?.tipo === "cartao" ? "Cada parcela cai na fatura do mês certo." : "Uma por mês, a partir da data."}
          >
            <select id="parcelas" name="parcelas" defaultValue="1" className={classeEntrada}>
              {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? "À vista" : `${n}x`}
                </option>
              ))}
            </select>
          </Campo>
        )}

        <Campo id="observacao" rotulo="Observação (opcional)">
          <textarea id="observacao" name="observacao" rows={2} maxLength={1000} className={`${classeEntrada} py-3`} />
        </Campo>
      </div>

      <AvisoErro mensagem={estado.erro} />

      <button
        type="submit"
        disabled={enviando}
        className="min-h-12 rounded-[14px] bg-marca text-[15px] font-semibold text-white hover:bg-marca-escura disabled:opacity-60"
      >
        {enviando ? "Salvando…" : "Salvar lançamento"}
      </button>
    </form>
  );
}
