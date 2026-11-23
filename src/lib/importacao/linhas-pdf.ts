import type { ItemDeTexto } from "./extrato-itau-pdf";

/** Remonta as linhas de texto de um PDF a partir dos pedaços posicionados (de cima para baixo). */
export function linhasDoPdf(itens: ItemDeTexto[]): string[] {
  const linhas: string[] = [];
  const paginas = [...new Set(itens.map((i) => i.pagina))].sort((a, b) => a - b);
  for (const pagina of paginas) {
    const grupos: ItemDeTexto[][] = [];
    for (const item of itens.filter((i) => i.pagina === pagina).sort((a, b) => b.y - a.y)) {
      const grupo = grupos.find((g) => Math.abs(g[0].y - item.y) <= 2);
      if (grupo) grupo.push(item);
      else grupos.push([item]);
    }
    for (const grupo of grupos.sort((a, b) => b[0].y - a[0].y)) {
      linhas.push(
        grupo
          .sort((a, b) => a.x - b.x)
          .map((i) => i.texto.trim())
          .filter(Boolean)
          .join("  "),
      );
    }
  }
  return linhas;
}
