import { FormularioLogin } from "./formulario";

export default function PaginaLogin() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-5 py-10">
      <div className="flex flex-col gap-2">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-marca font-titulo text-lg font-bold text-white">
          G&amp;D
        </span>
        <h1 className="font-titulo text-3xl font-semibold">Finanças G&amp;D</h1>
        <p className="text-suave">Entre com o seu e-mail e senha.</p>
      </div>
      <div className="rounded-3xl bg-cartao p-6">
        <FormularioLogin />
      </div>
    </main>
  );
}
