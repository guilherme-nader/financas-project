import { Suspense } from "react";
import { Cabecalho, Esqueleto } from "@/componentes/ui";
import { listarContas, listarPessoas } from "@/lib/consultas";
import { exigirUsuario, hoje } from "@/lib/dal";
import { FormularioConta } from "../formulario";

export default function PaginaNovaConta() {
  return (
    <main className="flex flex-col gap-5">
      <Cabecalho titulo="Nova conta" voltar={{ href: "/contas", rotulo: "Contas" }} />
      <Suspense fallback={<Esqueleto linhas={3} />}>
        <Conteudo />
      </Suspense>
    </main>
  );
}

async function Conteudo() {
  const [usuario, pessoas, contas] = await Promise.all([exigirUsuario(), listarPessoas(), listarContas(await hoje())]);
  return (
    <FormularioConta
      inicial={{
        id: null,
        nome: "",
        instituicao: "",
        tipo: "corrente",
        pessoaId: usuario.pessoaId,
        diaFechamento: null,
        diaVencimento: null,
        contaPagamentoId: null,
        saldoInicial: "",
      }}
      pessoas={pessoas.map((p) => ({ id: p.id, nome: p.nome }))}
      contasCorrentes={contas.filter((c) => c.tipo === "corrente").map((c) => ({ id: c.id, nome: c.nome }))}
    />
  );
}
