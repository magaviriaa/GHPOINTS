import Link from "next/link";
import { LogOut, Shield } from "lucide-react";

import { logoutAction } from "@/server/actions/auth";
import { canOpenLeaderArea, isAdmin, type Actor } from "@/server/domain/authorization";
import { firstName } from "@/lib/text";
import { ThemeToggle } from "@/components/theme-toggle";
import { Wordmark } from "@/components/brand/wordmark";
import { AppNavBar, AppNavRail } from "@/components/app/nav";
import type { ThemePreference } from "@/server/theme/preference";

/**
 * Una sola barra: marca, navegación de escritorio y acciones. En móvil la
 * navegación baja al pulgar y la barra se queda compacta.
 */
export function AppHeader({ actor, theme }: { actor: Actor; theme: ThemePreference }) {
  const leader = canOpenLeaderArea(actor);

  return (
    <header className="sticky top-0 z-30 bg-tinta text-banda-texto">
      <div className="mx-auto flex h-14 max-w-4xl items-center gap-4 px-4">
        <Wordmark href="/app" className="text-banda-texto" />
        <AppNavRail isLeader={leader} />
        <div className="ml-auto flex items-center gap-1">
          <span className="mr-1 hidden text-sm text-banda-tenue sm:inline">
            {firstName(actor.fullName)}
          </span>
          <ThemeToggle initial={theme} onBand />
          {isAdmin(actor) ? (
            <Link
              className="inline-flex size-9 items-center justify-center rounded-md text-banda-tenue transition-colors hover:bg-white/10 hover:text-banda-texto"
              href="/admin"
              title="Administración"
            >
              <Shield className="size-4" aria-hidden />
              <span className="sr-only">Administración</span>
            </Link>
          ) : null}
          <form action={logoutAction}>
            <button
              className="inline-flex size-9 items-center justify-center rounded-md text-banda-tenue transition-colors hover:bg-white/10 hover:text-banda-texto"
              type="submit"
              title="Cerrar sesión"
            >
              <LogOut className="size-4" aria-hidden />
              <span className="sr-only">Cerrar sesión</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

export function AppNav({ actor }: { actor: Actor }) {
  return <AppNavBar isLeader={canOpenLeaderArea(actor)} />;
}
