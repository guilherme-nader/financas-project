import "server-only";
import { getDocumentProxy } from "unpdf";
import type { ItemDeTexto } from "./extrato-itau-pdf";

/** Extrai os pedaços de texto de um PDF com a posição de cada um. */
export async function itensDoPdf(bytes: Uint8Array): Promise<ItemDeTexto[]> {
  const pdf = await getDocumentProxy(bytes);
  const itens: ItemDeTexto[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n);
    const { items } = await pagina.getTextContent();
    for (const item of items) {
      if (!("str" in item) || !item.str.trim()) continue;
      itens.push({ pagina: n, texto: item.str, x: item.transform[4], y: item.transform[5], largura: item.width });
    }
  }
  await pdf.cleanup?.();
  return itens;
}
