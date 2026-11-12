import { Suspense } from "react";
import { BotaoLink, Cabecalho, Esqueleto, Vazio } from "@/componentes/ui";
import { listarCategorias, listarContas, listarPessoas } from "@/lib/consultas";
import { exigirUsuario, hoje } from "@/lib/dal";
import { FormularioLancamento } from "./formulario";

export default function PaginaNovoLancamento() {
  return (
    <main className="flex flex-col gap-5">
      <Cabecalho titulo="Novo lançamento" voltar={{ href: "/lancamentos", rotulo: "Lançamentos" }} />
      <Suspense fallback={<Esqueleto linhas={3} />}>
        <Conteudo />
      </Suspense>
    </main>
  );
}

async function Conteudo() {
  const dataHoje = await hoje();
  const [usuario, contas, categorias, pessoas] = await Promise.all([
    exigirUsuario(),
    listarContas(dataHoje),
    listarCategorias(),
    listarPessoas(),
  ]);

  if (contas.length === 0) {
    return (
      <Vazio
        titulo="Primeiro, uma conta"
        texto="Todo lançamento acontece em uma conta corrente, cartão ou investimento."
        acao={<BotaoLink href="/contas/nova">Cadastrar conta</BotaoLink>}
      />
    );
  }

  return (
    <FormularioLancamento
      contas={contas.map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo, pessoaId: c.pessoaId }))}
      categorias={categorias}
      pessoas={pessoas.map((p) => ({ id: p.id, nome: p.nome }))}
      hoje={dataHoje}
      pessoaPadraoId={usuario.pessoaId}
    />
  );
}
