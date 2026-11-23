/**
 * OCR de PDFs que são imagem (ex.: extrato da conta XP), feito no NAVEGADOR:
 * a imagem não sai do aparelho; só o texto lido vai para o servidor.
 * Os arquivos do tesseract.js são servidos pelo próprio app em /ocr (ver scripts/copiar-ocr.mjs).
 *
 * Só pode ser importado por componentes de cliente.
 */

export type Progresso = { pagina: number; paginas: number; etapa: "preparando" | "lendo" };

async function abrirPdf(arquivo: File) {
  const { getDocumentProxy } = await import("unpdf");
  return getDocumentProxy(new Uint8Array(await arquivo.arrayBuffer()));
}

/** O PDF tem texto de verdade (gerado pelo banco) ou é só imagem? */
export async function pdfTemTexto(arquivo: File): Promise<boolean> {
  const pdf = await abrirPdf(arquivo);
  const pagina = await pdf.getPage(1);
  const { items } = await pagina.getTextContent();
  return items.some((i) => "str" in i && i.str.trim().length > 0);
}

/** Preto e branco puro: as listras cinzas da tabela atrapalham muito o OCR. */
function binarizar(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  const imagem = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imagem.data;
  for (let i = 0; i < d.length; i += 4) {
    const cinza = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = cinza > 170 ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(imagem, 0, 0);
}

/** Lê o PDF página a página e devolve as linhas de texto. */
export async function lerPdfPorOcr(arquivo: File, aoProgredir?: (p: Progresso) => void): Promise<string[]> {
  const pdf = await abrirPdf(arquivo);
  const { createWorker } = await import("tesseract.js");
  aoProgredir?.({ pagina: 0, paginas: pdf.numPages, etapa: "preparando" });
  const worker = await createWorker("por", 1, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr/core",
    langPath: "/ocr/lang",
  });
  try {
    // "6" = um bloco de texto uniforme (a tabela); manter espaços ajuda a separar colunas.
    await worker.setParameters({ tessedit_pageseg_mode: "6" as never, preserve_interword_spaces: "1" });
    const linhas: string[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      aoProgredir?.({ pagina: n, paginas: pdf.numPages, etapa: "lendo" });
      const pagina = await pdf.getPage(n);
      const viewport = pagina.getViewport({ scale: 3 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await pagina.render({ canvas, viewport }).promise;
      binarizar(canvas);
      const { data } = await worker.recognize(canvas);
      linhas.push(...data.text.split("\n"));
    }
    return linhas;
  } finally {
    await worker.terminate();
  }
}
