"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { importarExtratos, type EstadoImportacaoExtrato } from "@/acoes/importacao";
import { AvisoErro, Campo, classeEntrada } from "@/componentes/campos";
import { IconeEnviar } from "@/componentes/icones";
import { dataBR } from "@/lib/datas";
import { formatarCentavos } from "@/lib/dinheiro";
import { lerPdfPorOcr, pdfTemTexto } from "@/lib/ocr-navegador";

type Conta = { id: string; nome: string };

const NOME_BANCO = { itau: "Itaú", santander: "Santander", nubank: "Nubank", ofx: "OFX", xp: "XP (lido por OCR)", wise: "Conta Global (convertida pela PTAX)" } as const;

export function FormularioExtrato({ contas }: { contas: Conta[] }) {
  const [rodada, setRodada] = useState(0);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [estado, acao, enviando] = useActionState<EstadoImportacaoExtrato, FormData>(async (anterior, form) => {
    // PDF que é imagem (extrato da XP) é lido aqui no navegador; só o texto vai para o servidor.
    const envio = new FormData();
    envio.set("contaId", String(form.get("contaId") ?? ""));
    try {
      for (const arquivo of form.getAll("arquivos")) {
        if (!(arquivo instanceof File) || arquivo.size === 0) continue;
        const ehPdf = arquivo.type === "application/pdf" || /\.pdf$/i.test(arquivo.name);
        if (ehPdf && !(await pdfTemTexto(arquivo))) {
          const linhas = await lerPdfPorOcr(arquivo, (p) =>
            setProgresso(
              p.etapa === "preparando"
                ? `Preparando a leitura de ${arquivo.name}…`
                : `Lendo ${arquivo.name}: página ${p.pagina} de ${p.paginas}…`,
            ),
          );
          envio.append("ocr", JSON.stringify({ arquivoNome: arquivo.name, linhas }));
        } else {
          envio.append("arquivos", arquivo);
        }
      }
      setProgresso("Importando…");
      const r = await importarExtratos(anterior, envio);
      if (r.resultados?.length) setRodada((n) => n + 1);
      return r;
    } catch {
      return { erro: "Não foi possível ler um dos arquivos neste aparelho. Tente de novo ou use outro navegador." };
    } finally {
      setProgresso(null);
    }
  }, {});

  return (
    <div className="flex flex-col gap-5">
      <Campos key={rodada} contas={contas} acao={acao} enviando={enviando} erro={estado.erro} progresso={progresso} />
      {(estado.resultados?.length || estado.falhas?.length) && <Resultado estado={estado} />}
    </div>
  );
}

function Campos({
  contas,
  acao,
  enviando,
  erro,
  progresso,
}: {
  contas: Conta[];
  acao: (form: FormData) => void;
  enviando: boolean;
  erro?: string;
  progresso: string | null;
}) {
  const [nomes, setNomes] = useState<string[]>([]);
  return (
    <form action={acao} className="flex flex-col gap-4">
      <label
        htmlFor="arquivos"
        className="flex cursor-pointer flex-col items-center gap-2.5 rounded-[20px] border-2 border-dashed border-[#9fc9be] bg-cartao px-5 py-6 text-center has-focus-visible:ring-2 has-focus-visible:ring-marca"
      >
        <span className="flex h-13 w-13 items-center justify-center rounded-2xl bg-marca-clara text-marca">
          <IconeEnviar tamanho={26} />
        </span>
        <span className="text-base font-semibold">
          {nomes.length === 0 ? "Escolher extrato(s)" : nomes.length === 1 ? nomes[0] : `${nomes.length} arquivos`}
        </span>
        <span className="text-[13px] text-suave">
          OFX (qualquer banco), CSV do Nubank, PDF do Itaú, do Santander e da Conta Global (Wise), ou o PDF da
          conta XP (lido por OCR aqui no aparelho). Pode mandar vários de uma vez.
        </span>
        <input
          id="arquivos"
          name="arquivos"
          type="file"
          accept=".pdf,application/pdf,.ofx,.csv,text/csv"
          multiple
          required
          className="sr-only"
          onChange={(e) => setNomes([...(e.target.files ?? [])].map((f) => f.name))}
        />
      </label>
      <div className="rounded-[20px] bg-cartao p-5">
        <Campo id="contaExtrato" rotulo="Conta">
          <select id="contaExtrato" name="contaId" required className={classeEntrada}>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <AvisoErro mensagem={erro} />
      <button
        type="submit"
        disabled={enviando}
        className="min-h-12 rounded-[14px] bg-marca text-[15px] font-semibold text-white hover:bg-marca-escura disabled:opacity-60"
      >
        {enviando ? "Lendo os extratos…" : "Importar extrato"}
      </button>
      {progresso && (
        <p role="status" className="text-center text-sm text-suave">
          {progresso}
        </p>
      )}
    </form>
  );
}

function Resultado({ estado }: { estado: EstadoImportacaoExtrato }) {
  const r = estado.resultados ?? [];
  const soma = (
    k: "novas" | "duplicadas" | "transferenciasProprias" | "naCaixinha" | "pareadas" | "categorizadas" | "paraRevisar" | "reclassificadas" | "suspeitos",
  ) =>
    r.reduce((s, x) => s + x[k], 0);
  const naoBatem = r.flatMap((x) => x.diasQueNaoBatem.map((d) => ({ ...d, arquivo: x.arquivoNome })));
  const paraRevisar = soma("paraRevisar");

  return (
    <section aria-live="polite" className="flex flex-col gap-3 rounded-[20px] bg-cartao p-5">
      {r.length > 0 && (
        <>
          <h2 className="font-titulo text-[17px] font-semibold">
            {estado.contaNome} · {r.length} {r.length === 1 ? "extrato" : "extratos"}
          </h2>
          <ul className="flex flex-col gap-1 text-xs text-suave">
            {r.map((x) => (
              <li key={x.importacaoId}>
                {NOME_BANCO[x.banco]} {x.periodo ? `${dataBR(x.periodo.inicio)} a ${dataBR(x.periodo.fim)}` : ""} ·{" "}
                {x.movimentos} lançamentos
              </li>
            ))}
          </ul>
          <ul className="flex flex-col gap-2 text-sm">
            <Numero n={soma("categorizadas")} cor="text-marca" texto="receitas e despesas categorizadas sozinhas" />
            <Numero n={soma("naCaixinha")} cor="text-suave" texto="na caixinha (aparecem na lista, fora dos totais)" />
            <Numero n={soma("transferenciasProprias")} cor="text-tinta" texto="transferências entre contas de vocês (fora dos totais)" />
            <Numero n={soma("pareadas")} cor="text-tinta" texto="transferências ligadas ao outro lado (outra conta ou cartão)" />
            <Numero n={soma("reclassificadas")} cor="text-marca" texto="Pix de importações anteriores reconhecidos agora como transferência" />
            <Numero n={paraRevisar} cor="text-alerta" texto="precisam da sua confirmação" />
            <Numero n={soma("suspeitos")} cor="text-alerta" texto="lidos por OCR com valor a conferir (estão no Revisar)" />
            <Numero n={soma("duplicadas")} cor="text-suave" texto="já estavam importados (ignorados)" />
          </ul>
          {!r.some((x) => x.saldoConferivel) ? (
            <p className="text-xs text-suave">
              Este formato não traz saldos dia a dia; a proteção contra duplicados vem do identificador de cada lançamento.
            </p>
          ) : naoBatem.length === 0 ? (
            <p className="rounded-xl bg-marca-clara px-3.5 py-2.5 text-sm font-medium text-marca-escura">
              ✓ Saldo conferido dia a dia: tudo bate com o que o banco informa.
            </p>
          ) : (
            <p className="rounded-xl bg-alerta-clara px-3.5 py-2.5 text-sm font-medium text-alerta">
              Em {naoBatem.length} {naoBatem.length === 1 ? "dia" : "dias"} o saldo não bateu (ex.: {dataBR(naoBatem[0].data)}:
              esperado {formatarCentavos(naoBatem[0].esperado)}, banco diz {formatarCentavos(naoBatem[0].informado)}).
            </p>
          )}
          {r.some((x) => x.saldoInicialAjustado !== null) && (
            <p className="text-xs text-suave">O saldo inicial da conta foi ajustado pelo primeiro extrato.</p>
          )}
          {paraRevisar > 0 && (
            <Link
              href="/revisar"
              className="flex min-h-12 items-center justify-center rounded-[14px] bg-alerta text-[15px] font-semibold text-white"
            >
              Revisar {paraRevisar}
            </Link>
          )}
        </>
      )}
      {estado.falhas?.map((f) => (
        <p key={f.arquivoNome} className="rounded-xl bg-alerta-clara px-3.5 py-2.5 text-sm text-alerta">
          <strong>{f.arquivoNome}:</strong> {f.motivo}
        </p>
      ))}
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
