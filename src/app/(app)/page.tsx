import Link from "next/link";
import { Suspense } from "react";
import { BotaoLink, Cartao, Esqueleto, SeletorMes, TituloSecao, Vazio, estiloPessoa } from "@/componentes/ui";
import { IconeAlerta } from "@/componentes/icones";
import { listarContas, resumoDoMes } from "@/lib/consultas";
import { usuarioAtual, hoje } from "@/lib/dal";
import { ehMesValido, mesDe, nomeDoMes, somarMesesAoMes, dataCurta } from "@/lib/datas";
import { formatarCentavos } from "@/lib/dinheiro";

export default function PaginaInicio(props: PageProps<"/">) {
  return (
    <main className="flex flex-col gap-5">
      <Suspense fallback={<Esqueleto linhas={4} />}>
        <Conteudo searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const sp = await searchParams;
  const dataHoje = await hoje();
  const mes = ehMesValido(typeof sp.mes === "string" ? sp.mes : null) ? (sp.mes as string) : mesDe(dataHoje);

  const [usuario, resumo, contas] = await Promise.all([usuarioAtual(), resumoDoMes(mes), listarContas(dataHoje)]);
  const saldoContas = contas
    .filter((c) => c.tipo !== "cartao")
    .reduce((soma, c) => soma + c.saldoCentavos, 0);
  const cartoes = contas.filter((c) => c.tipo === "cartao" && c.faturaAberta);
  const maiorCategoria = resumo.porCategoria[0]?.totalCentavos ?? 0;
  const totalPessoas = resumo.porPessoa.reduce((s, p) => s + p.totalCentavos, 0);
  const semMovimento = resumo.entradasCentavos === 0 && resumo.saidasCentavos === 0;

  return (
    <>
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] text-suave">Olá, {usuario?.nome ?? ""}</span>
        <SeletorMes
          rotulo={nomeDoMes(mes)}
          anterior={`/?mes=${somarMesesAoMes(mes, -1)}`}
          proximo={`/?mes=${somarMesesAoMes(mes, 1)}`}
        />
      </div>

      <Cartao className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] text-suave">Resultado do mês</span>
          <span className="tabular font-titulo text-4xl font-semibold tracking-tight">
            {formatarCentavos(resumo.resultadoCentavos, { sinal: true })}
          </span>
          {contas.length > 0 && (
            <span className="text-[13px] text-suave">
              Saldo hoje nas contas e investimentos:{" "}
              <strong className="font-semibold whitespace-nowrap text-tinta">{formatarCentavos(saldoContas)}</strong>
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-0.5 rounded-[14px] bg-marca-clara px-3.5 py-3">
            <span className="text-xs font-medium text-marca-escura">Entradas</span>
            <span className="tabular text-[17px] font-bold text-marca-escura">
              {formatarCentavos(resumo.entradasCentavos, { sinal: true })}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 rounded-[14px] bg-fundo px-3.5 py-3">
            <span className="text-xs font-medium text-suave">Saídas</span>
            <span className="tabular text-[17px] font-bold">{formatarCentavos(-resumo.saidasCentavos)}</span>
          </div>
        </div>
      </Cartao>

      {resumo.paraRevisar > 0 && (
        <section className="flex flex-col gap-2.5 rounded-[20px] bg-alerta-clara px-4.5 py-4">
          <div className="flex items-center gap-2 text-alerta">
            <IconeAlerta tamanho={18} />
            <span className="text-sm font-semibold">Precisa da sua atenção</span>
          </div>
          <Link
            href={`/lancamentos?mes=${mes}`}
            className="flex min-h-11 items-center justify-between rounded-xl bg-cartao px-3.5 text-sm font-medium"
          >
            {resumo.paraRevisar} {resumo.paraRevisar === 1 ? "lançamento" : "lançamentos"} para revisar
            <span className="font-semibold text-alerta">Revisar ›</span>
          </Link>
        </section>
      )}

      {contas.length === 0 ? (
        <Vazio
          titulo="Vamos começar pelas contas"
          texto="Cadastre as contas correntes, cartões e a XP. Depois é só lançar ou importar os extratos."
          acao={<BotaoLink href="/contas/nova">Cadastrar conta</BotaoLink>}
        />
      ) : semMovimento ? (
        <Vazio
          titulo={`Nada lançado em ${nomeDoMes(mes).toLowerCase()}`}
          texto="Quando a importação de extratos chegar, isto se preenche sozinho. Por enquanto, dá para lançar à mão."
          acao={<BotaoLink href="/lancamentos/novo">Novo lançamento</BotaoLink>}
        />
      ) : (
        <>
          <Cartao className="flex flex-col gap-3.5">
            <TituloSecao
              acao={
                <Link href={`/lancamentos?mes=${mes}`} className="text-[13px] font-semibold text-marca">
                  Ver tudo
                </Link>
              }
            >
              Onde foi o dinheiro
            </TituloSecao>
            {resumo.porCategoria.length === 0 && <p className="text-sm text-suave">Nenhuma saída no mês.</p>}
            {resumo.porCategoria.slice(0, 8).map((c) => (
              <div key={c.id ?? "sem"} className="flex flex-col gap-1.5">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{c.nome}</span>
                  <span className="tabular font-semibold">{formatarCentavos(c.totalCentavos)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded bg-linha">
                  <div
                    className="h-2 rounded bg-marca"
                    style={{ width: `${maiorCategoria ? Math.max(2, (c.totalCentavos / maiorCategoria) * 100) : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </Cartao>

          {resumo.porPessoa.length > 0 && (
            <Cartao className="flex flex-col gap-3.5">
              <TituloSecao>Quem gastou</TituloSecao>
              <div
                className="flex h-3 gap-0.5 overflow-hidden rounded-md"
                role="img"
                aria-label={resumo.porPessoa
                  .map((p) => `${p.nome} ${Math.round((p.totalCentavos / totalPessoas) * 100)}%`)
                  .join(", ")}
              >
                {resumo.porPessoa.map((p) => (
                  <div key={p.id} style={{ width: `${(p.totalCentavos / totalPessoas) * 100}%`, background: p.cor }} />
                ))}
              </div>
              <ul className="flex flex-col gap-2.5 text-sm">
                {resumo.porPessoa.map((p) => (
                  <li key={p.id} className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: p.cor }} />
                      {p.nome}
                    </span>
                    <span className="tabular font-semibold">{formatarCentavos(p.totalCentavos)}</span>
                  </li>
                ))}
              </ul>
            </Cartao>
          )}
        </>
      )}

      {cartoes.length > 0 && (
        <Cartao className="flex flex-col gap-1">
          <TituloSecao>Faturas abertas</TituloSecao>
          <ul className="mt-2">
            {cartoes.map((c) => {
              const pessoa = estiloPessoa(c.pessoaCor);
              return (
                <li key={c.id} className="flex min-h-14 items-center justify-between border-t border-linha">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{c.nome}</span>
                    <span className="text-xs text-suave">
                      fecha {dataCurta(c.faturaAberta!.fechamento)} · vence {dataCurta(c.faturaAberta!.vencimento)} ·{" "}
                      <span className={`font-semibold ${pessoa.texto}`}>{c.pessoaNome}</span>
                    </span>
                  </div>
                  <span className="tabular text-sm font-semibold">{formatarCentavos(c.faturaAberta!.totalCentavos)}</span>
                </li>
              );
            })}
          </ul>
        </Cartao>
      )}
    </>
  );
}
