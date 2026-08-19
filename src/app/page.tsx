import Link from "next/link";

import { getCurrentActor } from "@/server/auth/session";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/brand/wordmark";
import { levelScale } from "@/lib/level-style";

export default async function HomePage() {
  const actor = await getCurrentActor();
  const levels = levelScale();

  return (
    <div className="banda-marcador min-h-screen">
      <main id="contenido" className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-8">
        <Wordmark href="/" className="text-banda-texto" />

        <div className="flex flex-1 flex-col justify-center py-12">
          <p className="text-xs font-semibold tracking-[0.2em] text-banda-tenue uppercase">
            Organización Estudiantil
          </p>
          <h1 className="font-display mt-4 text-[clamp(2.75rem,12vw,4.5rem)] leading-[0.92] font-extrabold tracking-tight">
            Aquí se lleva
            <br />
            la cuenta.
          </h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-banda-tenue">
            Escaneas el QR de la actividad, quedan tus GH Points y tu comité sube en el
            ranking. Sin Forms, sin Excel, sin nombres escritos a mano.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button
              asChild
              className="h-12 bg-oro px-6 font-semibold text-tinta hover:bg-oro/90"
            >
              <Link href={actor ? "/app" : "/login"}>
                {actor ? "Ir a mi temporada" : "Entrar con correo institucional"}
              </Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              className="h-12 px-6 text-banda-texto hover:bg-white/10 hover:text-banda-texto"
            >
              <Link href="/hall-of-fame">Ver el salón de la fama</Link>
            </Button>
          </div>
        </div>

        {/* La escalera de niveles es el juego, dicho con los datos reales del dominio. */}
        <section aria-labelledby="niveles" className="border-t border-white/12 pt-6">
          <h2
            id="niveles"
            className="text-xs font-semibold tracking-[0.16em] text-banda-tenue uppercase"
          >
            Cómo se sube
          </h2>
          <ol className="mt-4 grid grid-cols-5 gap-2">
            {levels.map((level) => (
              <li key={level.slug} className="min-w-0">
                <span className="block h-1.5 rounded-full" style={{ background: level.metal }} />
                <span className="mt-2 block truncate text-sm font-semibold">{level.name}</span>
                <span className="tnum block text-xs text-banda-tenue">
                  {level.minPoints === 0 ? "desde 0" : `${level.minPoints}+`}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}
