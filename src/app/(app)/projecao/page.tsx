import { Cabecalho, Cartao } from "@/componentes/ui";

export default function PaginaProjecao() {
  return (
    <main className="flex flex-col gap-5">
      <Cabecalho titulo="Projeção" />
      <Cartao className="flex flex-col gap-3">
        <p className="font-titulo text-lg font-semibold">Chega na Fase 3</p>
        <p className="text-sm text-suave">
          A visão de meses × contas da aba Geral, calculada sozinha: realizado, mês em andamento e meses futuros
          com recorrências (financiamento, condomínio, salários) e as parcelas que já estão nos cartões.
        </p>
      </Cartao>
    </main>
  );
}
