import { Suspense } from "react";
import { BarraDeAbas, Navegacao } from "@/componentes/navegacao";

export default function LayoutApp({ children }: LayoutProps<"/">) {
  return (
    <>
      <div className="mx-auto w-full max-w-lg px-5 pt-6 pb-32 md:max-w-2xl">{children}</div>
      <Suspense fallback={<BarraDeAbas caminho={null} />}>
        <Navegacao />
      </Suspense>
    </>
  );
}
