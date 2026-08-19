import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/login-form";
import { isEntraLoginEnabled } from "@/server/config/env";
import { safeRedirectPath } from "@/lib/redirect";
import { Wordmark } from "@/components/brand/wordmark";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next);
  const entraEnabled = isEntraLoginEnabled();
  const cameFromActivity = next.startsWith("/a/");

  return (
    <div className="min-h-screen bg-background">
      <div className="banda-marcador px-6 pt-6 pb-14">
        <div className="mx-auto max-w-md">
          <Wordmark href="/" className="text-banda-texto" />
          <h1 className="font-display mt-8 text-3xl font-extrabold tracking-tight">
            {cameFromActivity ? "Entra para registrar tu asistencia" : "Entra a tu temporada"}
          </h1>
          <p className="mt-2 text-banda-tenue">
            Con tu correo institucional. Te enviamos un código de 6 dígitos.
          </p>
        </div>
      </div>
      <main id="contenido" className="relative mx-auto -mt-8 max-w-md px-4 pb-16">
        <div className="rounded-xl border bg-card p-6 shadow-lg">
          <LoginForm next={next} entraEnabled={entraEnabled} error={params.error} />
        </div>
      </main>
    </div>
  );
}
