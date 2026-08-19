import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/brand/wordmark";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="px-6 pt-6">
        <Wordmark href="/" />
      </div>
      <main
        id="contenido"
        className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 pb-16"
      >
        <p className="marcador text-[clamp(4rem,20vw,7rem)] text-muted-foreground/40">404</p>
        <h1 className="font-display mt-4 text-2xl font-extrabold tracking-tight">
          Esta página no existe
        </h1>
        <p className="mt-2 text-muted-foreground">
          El enlace pudo cambiar, o la actividad ya no está publicada. Si llegaste por un QR
          impreso, pide el código actualizado.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/app">Ir a mi temporada</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/app/activities">Ver actividades</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
