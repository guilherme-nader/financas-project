import Link from "next/link";
import { Suspense } from "react";
import { hoje } from "@/lib/dal";
import { alternarContaAtiva } from "@/acoes/contas";
import { BotaoLink, Cabecalho, Cartao, Esqueleto, Vazio, estiloPessoa } from "@/componentes/ui";
import { listarContas, type ContaComSaldo } from "@/lib/consultas";
import { dataCurta} from "@/lib/datas";
import { formatarCentavos } from "@/lib/dinheiro";

const GRUPOS = [
  { tipo: "corrente", titulo: "Contas correntes" },
  { tipo: "cartao", titulo: "Cartões de crédito" },
  { tipo: "investimento", titulo: "Investimentos" },
] as const;

export default function PaginaContas(props: PageProps<"/contas">) {
  return (
    <main className="flex flex-col gap-5">
      <Cabecalho titulo="Contas" voltar={{ href: "/mais", rotulo: "Mais" }} />
      <Suspense fallback={<Esqueleto linhas={3} />}>
        <Conteudo searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/contas">["searchParams"] }) {
  const { inativas } = await searchParams;
  const mostrarInativas = inativas === "1";
  const contas = await listarContas(await hoje(), { incluirInativas: mostrarInativas });

  if (contas.length === 0) {
    return (
      <Vazio
        titulo="Nenhuma conta ainda"
        texto="Cadastre as contas correntes, os cartões e a conta de investimento da XP."
        acao={<BotaoLink href="/contas/nova">Cadastrar conta</BotaoLink>}
      />
    );
  }

  // Cartões entram com o saldo negativo (quanto se deve hoje).
  const patrimonio = contas.filter((c) => c.ativa).reduce((s, c) => s + c.saldoCentavos, 0);

  return (
    <>
      <Cartao className="flex flex-col gap-1">
        <span className="text-[13px] text-suave">Patrimônio do casal hoje</span>
        <span className="tabular font-titulo text-3xl font-semibold">{formatarCentavos(patrimonio)}</span>
        <span className="text-xs text-suave">Contas + investimentos − o que se deve nos cartões</span>
      </Cartao>

      {GRUPOS.map(({ tipo, titulo }) => {
        const lista = contas.filter((c) => c.tipo === tipo);
        if (!lista.length) return null;
        return (
          <section key={tipo} className="flex flex-col gap-1.5">
            <h2 className="px-1 text-xs font-semibold tracking-wide text-suave uppercase">{titulo}</h2>
            <ul className="rounded-2xl bg-cartao px-4">
              {lista.map((c) => (
                <li key={c.id} className="border-t border-linha first:border-t-0">
                  <LinhaConta conta={c} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <div className="flex flex-col gap-3">
        <BotaoLink href="/contas/nova">Nova conta</BotaoLink>
        <Link href={mostrarInativas ? "/contas" : "/contas?inativas=1"} className="text-center text-sm font-semibold text-marca">
          {mostrarInativas ? "Esconder contas desativadas" : "Mostrar contas desativadas"}
        </Link>
      </div>
    </>
  );
}

function LinhaConta({ conta: c }: { conta: ContaComSaldo }) {
  const pessoa = estiloPessoa(c.pessoaCor);
  return (
    <div className={`flex min-h-16 items-center gap-3 py-2.5 ${c.ativa ? "" : "opacity-60"}`}>
      <Link href={`/contas/${c.id}`} className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold">
          {c.nome}
          {!c.ativa && <span className="ml-2 text-xs font-medium text-suave">(desativada)</span>}
        </span>
        <span className="text-xs text-suave">
          {c.instituicao} · <span className={`font-semibold ${pessoa.texto}`}>{c.pessoaNome}</span>
          {c.faturaAberta && ` · fecha ${dataCurta(c.faturaAberta.fechamento)}, vence ${dataCurta(c.faturaAberta.vencimento)}`}
        </span>
      </Link>
      <div className="flex flex-col items-end gap-0.5">
        {c.tipo === "cartao" ? (
          <>
            <span className="tabular text-sm font-bold">{formatarCentavos(c.faturaAberta?.totalCentavos ?? 0)}</span>
            <span className="text-[11px] text-suave">fatura aberta</span>
            {c.faturaFechada && c.faturaFechada.totalCentavos > 0 && (
              <span className="text-[11px] font-semibold text-alerta">
                + {formatarCentavos(c.faturaFechada.totalCentavos)} vence {dataCurta(c.faturaFechada.vencimento)}
              </span>
            )}
          </>
        ) : (
          <span className={`tabular text-sm font-bold ${c.saldoCentavos < 0 ? "text-erro" : ""}`}>
            {formatarCentavos(c.saldoCentavos)}
          </span>
        )}
        {!c.ativa && (
          <form action={alternarContaAtiva.bind(null, c.id)}>
            <button type="submit" className="min-h-8 text-xs font-semibold text-marca">
              Reativar
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
