import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getCurrentActor } from "@/server/auth/session";
import { HallOfFameBoards } from "@/components/hall-of-fame/boards";
import { Wordmark } from "@/components/brand/wordmark";

export const metadata: Metadata = { title: "Salón de la fama" };

/**
 * Entrada pública al salón. Vive fuera del layout `/app`, así que lleva su
 * propia cabecera y una forma de entrar; si no, un visitante cae en una lista
 * sin navegación.
 */
export default async function PublicHallOfFamePage() {
  const actor = await getCurrentActor();

  return (
    <div className="min-h-screen bg-background">
      <header className="banda-marcador px-6 pt-6 pb-12">
        <div className="mx-auto max-w-3xl">
          <Wordmark href="/" className="text-banda-texto" />
          <h1 className="font-display mt-8 text-[clamp(2.25rem,9vw,3.25rem)] leading-[0.95] font-extrabold tracking-tight">
            Salón de la fama
          </h1>
          <p className="mt-3 max-w-md text-banda-tenue">
            Las temporadas cerradas y quienes las ganaron. Queda escrito.
          </p>
          <Button asChild className="mt-6 h-11 bg-oro px-5 font-semibold text-tinta hover:bg-oro/90">
            <Link href={actor ? "/app" : "/login"}>
              {actor ? "Ir a mi temporada" : "Entrar con correo institucional"}
            </Link>
          </Button>
        </div>
      </header>
      <main id="contenido" className="mx-auto max-w-3xl px-4 py-8">
        <HallOfFameBoards />
      </main>
    </div>
  );
}
