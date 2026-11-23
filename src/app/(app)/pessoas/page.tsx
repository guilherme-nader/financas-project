import { Suspense } from "react";
import { Cabecalho, Esqueleto } from "@/componentes/ui";
import { listarPessoas } from "@/lib/consultas";
import { FormularioNomes } from "./formulario";

export default function PaginaPessoas() {
  return (
    <main className="flex flex-col gap-5">
      <Cabecalho titulo="Nomes nos bancos" voltar={{ href: "/mais", rotulo: "Mais" }} />
      <p className="text-sm text-suave">
        Pix e TED para esses nomes são dinheiro mudando de bolso entre as contas de vocês: entram como
        transferência, fora dos totais. Abreviações e nomes cortados (“FULANO B S SOUZA”, “Fulano Beltrano So”)
        são reconhecidos. O nome do titular de cada extrato importado é aprendido sozinho.
      </p>
      <Suspense fallback={<Esqueleto linhas={2} />}>
        <Conteudo />
      </Suspense>
    </main>
  );
}

async function Conteudo() {
  const pessoas = (await listarPessoas()).filter((p) => !p.compartilhada);
  return (
    <>
      {pessoas.map((p) => (
        <FormularioNomes key={p.id} pessoa={{ id: p.id, nome: p.nome, nomesNoBanco: p.nomesNoBanco }} />
      ))}
    </>
  );
}
