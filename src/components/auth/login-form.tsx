"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Feedback } from "@/components/forms/client-form";
import { requestOtpAction, verifyOtpAction } from "@/server/actions/auth";

export function LoginForm({
  next,
  entraEnabled,
  error,
}: {
  next: string;
  entraEnabled: boolean;
  error?: string | null;
}) {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [message, setMessage] = useState<string | null>(error ?? null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-5">
      {entraEnabled ? (
        <>
          <a
            className="flex h-12 w-full items-center justify-center rounded-md border bg-background text-sm font-semibold transition-colors hover:bg-muted"
            href={`/api/auth/entra/start?next=${encodeURIComponent(next)}`}
          >
            Entrar con Microsoft
          </a>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />o con tu correo
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : null}

      {step === "email" ? (
        <form
          className="space-y-4"
          action={(formData) => {
            setMessage(null);
            start(async () => {
              const result = await requestOtpAction(formData);
              if (result.ok) {
                setEmail(String(formData.get("email") ?? ""));
                setStep("otp");
              } else {
                setMessage(result.message);
              }
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="email">Correo institucional</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              autoCapitalize="off"
              spellCheck={false}
              required
              placeholder="tucorreo@universidad.edu.co"
              className="h-12"
            />
          </div>
          <Button className="h-12 w-full font-semibold" disabled={pending} type="submit">
            {pending ? "Enviando…" : "Enviar código"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Solo entran los correos que están en la base de integrantes.
          </p>
        </form>
      ) : (
        <form
          className="space-y-4"
          action={(formData) => {
            setMessage(null);
            start(async () => {
              const result = await verifyOtpAction(formData);
              if (result && "ok" in result && result.ok === false) {
                setMessage(result.message);
              }
            });
          }}
        >
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="next" value={next} />
          <p className="text-sm text-muted-foreground">
            Enviamos un código de 6 dígitos y un enlace de acceso a{" "}
            <span className="font-medium text-foreground">{email}</span>.
          </p>
          <div className="space-y-2">
            <Label htmlFor="code">Código de 6 dígitos</Label>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              maxLength={6}
              className="font-mono h-14 text-center text-2xl tracking-[0.4em]"
            />
          </div>
          <Button className="h-12 w-full font-semibold" disabled={pending} type="submit">
            {pending ? "Verificando…" : "Verificar y entrar"}
          </Button>
          <button
            type="button"
            className="w-full text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
            onClick={() => {
              setStep("email");
              setMessage(null);
            }}
          >
            Usar otro correo
          </button>
        </form>
      )}
      {message ? <Feedback ok={false} message={message} /> : null}
    </div>
  );
}
