import type { Metadata } from "next";

import { MagicLinkConsumer } from "@/components/auth/magic-link-consumer";
import { safeRedirectPath } from "@/lib/redirect";
import { Wordmark } from "@/components/brand/wordmark";

export const metadata: Metadata = { title: "Enlace de acceso" };

export default async function MagicLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; next?: string }>;
}) {
  const params = await searchParams;
  const token = params.token ?? "";
  const next = safeRedirectPath(params.next);

  return (
    <div className="min-h-screen bg-background">
      <div className="banda-marcador px-6 pt-6 pb-14">
        <div className="mx-auto max-w-md">
          <Wordmark href="/" className="text-banda-texto" />
          <h1 className="font-display mt-8 text-3xl font-extrabold tracking-tight">
            Entrando con tu enlace
          </h1>
        </div>
      </div>
      <main id="contenido" className="relative mx-auto -mt-8 max-w-md px-4 pb-16">
        <div className="rounded-xl border bg-card p-6 shadow-lg">
          {token.length < 16 ? (
            <div role="alert">
              <p className="font-display font-bold text-destructive">Este enlace no sirve</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Puede haber vencido o estar cortado por el cliente de correo. Pide uno nuevo
                desde la pantalla de entrada.
              </p>
              <a
                href="/login"
                className="mt-4 inline-flex text-sm font-semibold text-primary underline underline-offset-4"
              >
                Volver a entrar
              </a>
            </div>
          ) : (
            <MagicLinkConsumer token={token} next={next} />
          )}
        </div>
      </main>
    </div>
  );
}
