import { notFound } from "next/navigation";
import { Suspense } from "react";
import { hoje } from "@/lib/dal";
import { alternarContaAtiva } from "@/acoes/contas";
import { Cabecalho, Esqueleto } from "@/componentes/ui";
import { listarContas, listarPessoas, obterConta } from "@/lib/consultas";
import { FormularioConta } from "../formulario";

export default function PaginaConta(props: PageProps<"/contas/[id]">) {
  return (
    <main className="flex flex-col gap-5">
      <Cabecalho titulo="Editar conta" voltar={{ href: "/contas", rotulo: "Contas" }} />
      <Suspense fallback={<Esqueleto linhas={3} />}>
        <Conteudo params={props.params} />
      </Suspense>
    </main>
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function Conteudo({ params }: { params: PageProps<"/contas/[id]">["params"] }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [conta, pessoas, contas] = await Promise.all([obterConta(id), listarPessoas(), listarContas(await hoje())]);
  if (!conta) notFound();

  const saldo = conta.saldoInicialCentavos;
  return (
    <>
      <FormularioConta
        inicial={{
          id: conta.id,
          nome: conta.nome,
          instituicao: conta.instituicao,
          tipo: conta.tipo,
          pessoaId: conta.pessoaId,
          diaFechamento: conta.diaFechamento,
          diaVencimento: conta.diaVencimento,
          contaPagamentoId: conta.contaPagamentoId,
          saldoInicial: saldo ? `${saldo < 0 ? "-" : ""}${(Math.abs(saldo) / 100).toFixed(2).replace(".", ",")}` : "",
        }}
        pessoas={pessoas.map((p) => ({ id: p.id, nome: p.nome }))}
        contasCorrentes={contas
          .filter((c) => c.tipo === "corrente" && c.id !== conta.id)
          .map((c) => ({ id: c.id, nome: c.nome }))}
      />
      {conta.ativa && (
        <form action={alternarContaAtiva.bind(null, conta.id)} className="flex flex-col gap-2 rounded-[20px] bg-cartao p-5">
          <p className="text-sm text-suave">
            Desativar esconde a conta das listas e dos formulários. Os lançamentos antigos continuam valendo.
          </p>
          <button
            type="submit"
            className="min-h-12 rounded-[14px] border-[1.5px] border-borda text-[15px] font-semibold text-tinta hover:bg-fundo"
          >
            Desativar conta
          </button>
        </form>
      )}
    </>
  );
}
