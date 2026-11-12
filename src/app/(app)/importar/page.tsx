import { BotaoLink, Cabecalho, Cartao } from "@/componentes/ui";

export default function PaginaImportar() {
  return (
    <main className="flex flex-col gap-5">
      <Cabecalho titulo="Importar" />
      <Cartao className="flex flex-col gap-3">
        <p className="font-titulo text-lg font-semibold">Chega na Fase 4</p>
        <p className="text-sm text-suave">
          Aqui vocês vão enviar as faturas e extratos do mês (PDF, OFX ou CSV) e o sistema lança tudo sozinho:
          reconhece o banco, separa as parcelas, ignora duplicadas e trata pagamento de fatura como transferência.
        </p>
        <p className="text-sm text-suave">Enquanto isso, dá para lançar à mão.</p>
        <div>
          <BotaoLink href="/lancamentos/novo">Novo lançamento</BotaoLink>
        </div>
      </Cartao>
    </main>
  );
}
