"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { importarFatura, type EstadoImportacao } from "@/acoes/importacao";
import { AvisoErro, Campo, classeEntrada } from "@/componentes/campos";
import { IconeEnviar } from "@/componentes/icones";
import { dataBR } from "@/lib/datas";
import { formatarCentavos } from "@/lib/dinheiro";

type Cartao = { id: string; nome: string; diaVencimento: number | null };

export function FormularioImportacao({ cartoes }: { cartoes: Cartao[] }) {
  // A cada importação concluída, o formulário é recriado limpo (arquivo, cartão e data).
  const [rodada, setRodada] = useState(0);
  const [estado, acao, enviando] = useActionState<EstadoImportacao, FormData>(async (anterior, form) => {
    const resultado = await importarFatura(anterior, form);
    if (resultado.resumo) setRodada((n) => n + 1);
    return resultado;
  }, {});

  return (
    <div className="flex flex-col gap-5">
      <Campos key={rodada} cartoes={cartoes} acao={acao} enviando={enviando} erro={estado.erro} />
      {estado.resumo && <Resumo r={estado.resumo} />}
    </div>
  );
}

function Campos({
  cartoes,
  acao,
  enviando,
  erro,
}: {
  cartoes: Cartao[];
  acao: (form: FormData) => void;
  enviando: boolean;
  erro?: string;
}) {
  const [arquivoNome, setArquivoNome] = useState("");
  const [contaId, setContaId] = useState(cartoes[0]?.id ?? "");
  const vencimentoRef = useRef<HTMLInputElement>(null);

  const ehPdf = /\.pdf$/i.test(arquivoNome);
  const escolherArquivo = (arquivo: File | undefined) => {
    setArquivoNome(arquivo?.name ?? "");
    // A XP põe o vencimento no nome: "Fatura2026-10-10.csv".
    const m = arquivo?.name.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m && vencimentoRef.current) {
      vencimentoRef.current.value = `${m[1]}-${m[2]}-${m[3]}`;
      // Escolhe o cartão que vence nesse dia, se houver um só.
      const dia = Number(m[3]);
      const candidatos = cartoes.filter((c) => c.diaVencimento === dia);
      if (candidatos.length === 1) setContaId(candidatos[0].id);
    }
  };

  return (
    <form action={acao} className="flex flex-col gap-4">
      <label
        htmlFor="arquivo"
        className="flex cursor-pointer flex-col items-center gap-2.5 rounded-[20px] border-2 border-dashed border-[#9fc9be] bg-cartao px-5 py-6 text-center has-focus-visible:ring-2 has-focus-visible:ring-marca"
      >
        <span className="flex h-13 w-13 items-center justify-center rounded-2xl bg-marca-clara text-marca">
          <IconeEnviar tamanho={26} />
        </span>
        <span className="text-base font-semibold">{arquivoNome || "Escolher a fatura"}</span>
        <span className="text-[13px] text-suave">
          Fatura do cartão XP exportada em CSV. O vencimento é lido do nome do arquivo.
        </span>
        <input
          id="arquivo"
          name="arquivo"
          type="file"
          accept=".csv,text/csv"
          required
          className="sr-only"
          onChange={(e) => escolherArquivo(e.target.files?.[0])}
        />
      </label>

      <div className="flex flex-col gap-4 rounded-[20px] bg-cartao p-5">
        <Campo id="contaId" rotulo="Cartão">
          <select
            id="contaId"
            name="contaId"
            required
            value={contaId}
            onChange={(e) => setContaId(e.target.value)}
            className={classeEntrada}
          >
            {cartoes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </Campo>
        {!ehPdf && (
          <Campo id="vencimento" rotulo="Vencimento da fatura">
            <input ref={vencimentoRef} id="vencimento" name="vencimento" type="date" required className={classeEntrada} />
          </Campo>
        )}
      </div>

      <AvisoErro mensagem={erro} />
      <button
        type="submit"
        disabled={enviando}
        className="min-h-12 rounded-[14px] bg-marca text-[15px] font-semibold text-white hover:bg-marca-escura disabled:opacity-60"
      >
        {enviando ? "Importando…" : "Importar fatura"}
      </button>
    </form>
  );
}

function Resumo({ r }: { r: NonNullable<EstadoImportacao["resumo"]> }) {
  return (
    <section aria-live="polite" className="flex flex-col gap-3 rounded-[20px] bg-cartao p-5">
      <h2 className="font-titulo text-[17px] font-semibold">
        {r.contaNome} · vence {dataBR(r.vencimento)}
      </h2>
      <p className="text-sm text-suave">
        {r.compras} compras, total <strong className="text-tinta">{formatarCentavos(r.totalCentavos)}</strong>
      </p>
      {r.totalConfere !== null && (
        <p
          className={`rounded-xl px-3.5 py-2.5 text-sm font-medium ${
            r.totalConfere ? "bg-marca-clara text-marca-escura" : "bg-alerta-clara text-alerta"
          }`}
        >
          {r.totalConfere
            ? `✓ Total confere com o valor impresso na fatura (${formatarCentavos(r.totalInformadoCentavos ?? 0)}).`
            : `A soma lida não bate com o valor impresso na fatura (${formatarCentavos(r.totalInformadoCentavos ?? 0)}).`}
        </p>
      )}
      <ul className="flex flex-col gap-2 text-sm">
        <Numero n={r.categorizadas} cor="text-marca" texto="categorizadas sozinhas" />
        <Numero n={r.paraRevisar} cor="text-alerta" texto="precisam da sua confirmação" />
        <Numero n={r.confirmadas} cor="text-tinta" texto="parcelas que estavam previstas e foram confirmadas" />
        <Numero n={r.futuras} cor="text-tinta" texto="parcelas futuras lançadas na projeção" />
        <Numero n={r.duplicadas} cor="text-suave" texto="já estavam importadas (ignoradas)" />
        <Numero n={r.linhasIgnoradas} cor="text-erro" texto="linhas ilegíveis no arquivo" />
      </ul>
      {r.conferencias.map((c) => (
        <p
          key={c.vencimento}
          className={`rounded-xl px-3.5 py-2.5 text-sm font-medium ${
            c.confere ? "bg-marca-clara text-marca-escura" : "bg-alerta-clara text-alerta"
          }`}
        >
          {c.confere
            ? `✓ Pagamento de ${formatarCentavos(c.pagamento)} confere com a fatura de ${dataBR(c.vencimento)}.`
            : `Pagamento de ${formatarCentavos(c.pagamento)} não bate com a fatura de ${dataBR(c.vencimento)} (${formatarCentavos(c.totalFatura)}).`}
        </p>
      ))}
      {r.paraRevisar > 0 && (
        <Link
          href="/revisar"
          className="flex min-h-12 items-center justify-center rounded-[14px] bg-alerta text-[15px] font-semibold text-white"
        >
          Revisar {r.paraRevisar} {r.paraRevisar === 1 ? "compra" : "compras"}
        </Link>
      )}
    </section>
  );
}

function Numero({ n, cor, texto }: { n: number; cor: string; texto: string }) {
  if (!n) return null;
  return (
    <li className="flex items-baseline gap-3">
      <span className={`tabular min-w-10 text-right font-titulo text-xl font-semibold ${cor}`}>{n}</span>
      <span>{texto}</span>
    </li>
  );
}
