"use client";

import { useEffect, useState } from "react";
import { consumeMagicLinkAction } from "@/server/actions/auth";

export function MagicLinkConsumer({ token, next }: { token: string; next: string }) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const formData = new FormData();
    formData.set("token", token);
    formData.set("next", next);
    void consumeMagicLinkAction(formData).then((result) => {
      if (result && "ok" in result && result.ok === false) {
        setError(result.message);
      }
    });
  }, [token, next]);

  if (error) {
    return (
      <div role="alert">
        <p className="font-display font-bold text-destructive">No pudimos entrar</p>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <a
          href="/login"
          className="mt-4 inline-flex text-sm font-semibold text-primary underline underline-offset-4"
        >
          Pedir un código nuevo
        </a>
      </div>
    );
  }

  return (
    <p role="status" aria-live="polite" className="text-center text-sm text-muted-foreground">
      Entrando…
    </p>
  );
}
