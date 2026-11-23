// Copia os arquivos do OCR (tesseract.js) para public/ocr, para o app servir tudo sozinho:
// a imagem do extrato é lida no navegador e nenhum serviço externo é chamado.
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const raiz = (pacote) => dirname(require.resolve(`${pacote}/package.json`));
const destino = join(process.cwd(), "public", "ocr");
mkdirSync(join(destino, "core"), { recursive: true });
mkdirSync(join(destino, "lang"), { recursive: true });

copyFileSync(join(raiz("tesseract.js"), "dist", "worker.min.js"), join(destino, "worker.min.js"));
const core = raiz("tesseract.js-core");
for (const arquivo of readdirSync(core).filter((f) => f.endsWith(".wasm.js"))) {
  copyFileSync(join(core, arquivo), join(destino, "core", arquivo));
}
copyFileSync(join(raiz("@tesseract.js-data/por"), "4.0.0", "por.traineddata.gz"), join(destino, "lang", "por.traineddata.gz"));
console.log("✓ arquivos do OCR em public/ocr");
