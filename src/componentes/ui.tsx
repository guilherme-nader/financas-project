import Link from "next/link";
import type { ReactNode } from "react";
import { formatarCentavos } from "@/lib/dinheiro";
import { IconeAvancar, IconeVoltar } from "./icones";

export function Cartao({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[20px] bg-cartao p-5 ${className}`}>{children}</section>;
}

export function TituloSecao({ children, acao }: { children: ReactNode; acao?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="font-titulo text-[17px] font-semibold">{children}</h2>
      {acao}
    </div>
  );
}

export function Cabecalho({ titulo, subtitulo, voltar }: { titulo: string; subtitulo?: string; voltar?: { href: string; rotulo: string } }) {
  return (
    <header className="flex flex-col gap-1">
      {voltar && (
        <Link href={voltar.href} className="-ml-1.5 flex min-h-11 items-center gap-0.5 self-start text-sm font-semibold text-marca">
          <IconeVoltar tamanho={20} />
          {voltar.rotulo}
        </Link>
      )}
      {subtitulo && <span className="text-[13px] text-suave">{subtitulo}</span>}
      <h1 className="font-titulo text-[26px] font-semibold leading-tight">{titulo}</h1>
    </header>
  );
}

/** Valor com sinal e cor: entrada em verde-petróleo, saída em tinta, transferência em cinza. */
export function Valor({ centavos, tipo, className = "" }: { centavos: number; tipo?: "despesa" | "receita" | "transferencia"; className?: string }) {
  const cor = tipo === "transferencia" ? "text-suave" : centavos > 0 ? "text-marca" : "text-tinta";
  const texto = tipo === "transferencia" ? formatarCentavos(Math.abs(centavos)) : formatarCentavos(centavos, { sinal: true });
  return <span className={`tabular whitespace-nowrap font-bold ${cor} ${className}`}>{texto}</span>;
}

export function SeletorMes({ rotulo, anterior, proximo }: { rotulo: string; anterior: string; proximo: string }) {
  return (
    <div className="flex items-center gap-1">
      <Link href={anterior} aria-label="Mês anterior" className="-ml-3 flex h-11 w-11 items-center justify-center rounded-full hover:bg-black/5">
        <IconeVoltar tamanho={20} />
      </Link>
      <h1 className="font-titulo text-[22px] font-semibold">{rotulo}</h1>
      <Link href={proximo} aria-label="Próximo mês" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-black/5">
        <IconeAvancar tamanho={20} />
      </Link>
    </div>
  );
}

export function Vazio({ titulo, texto, acao }: { titulo: string; texto: string; acao?: ReactNode }) {
  return (
    <Cartao className="flex flex-col items-center gap-2 py-8 text-center">
      <p className="font-titulo text-lg font-semibold">{titulo}</p>
      <p className="max-w-xs text-sm text-suave">{texto}</p>
      {acao && <div className="mt-3">{acao}</div>}
    </Cartao>
  );
}

export function BotaoLink({ href, children, variante = "primario" }: { href: string; children: ReactNode; variante?: "primario" | "secundario" }) {
  const estilo =
    variante === "primario"
      ? "bg-marca text-white hover:bg-marca-escura"
      : "border-[1.5px] border-marca text-marca hover:bg-marca-clara";
  return (
    <Link href={href} className={`inline-flex min-h-12 items-center justify-center rounded-[14px] px-5 text-[15px] font-semibold ${estilo}`}>
      {children}
    </Link>
  );
}

export function Esqueleto({ linhas = 3 }: { linhas?: number }) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className="h-28 animate-pulse rounded-[20px] bg-cartao" />
      ))}
    </div>
  );
}

const CORES_PESSOA: Record<string, { texto: string; fundo: string }> = {
  "#1E58B0": { texto: "text-gui", fundo: "bg-gui-clara" },
  "#7A35A8": { texto: "text-deb", fundo: "bg-deb-clara" },
};

export function estiloPessoa(cor: string) {
  return CORES_PESSOA[cor.toUpperCase()] ?? { texto: "text-casal", fundo: "bg-casal-clara" };
}
