"use client";

import { createContext, useContext, useRef, useState, useTransition } from "react";
import { CheckCircle2, CircleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Result = { ok: true } | { ok: false; message: string };

const PendingContext = createContext(false);

export function useFormPending() {
  return useContext(PendingContext);
}

export function Feedback({ ok, message }: { ok: boolean; message: string }) {
  const Icon = ok ? CheckCircle2 : CircleAlert;
  return (
    <p
      role={ok ? "status" : "alert"}
      aria-live="polite"
      className={cn(
        "mt-3 flex items-start gap-2 text-sm font-medium",
        ok ? "text-success-ink" : "text-destructive"
      )}
    >
      <Icon className="mt-px size-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </p>
  );
}

/** Botón de envío que dice en qué va, en vez de solo quedarse gris. */
export function SubmitButton({
  children,
  pendingLabel,
  className,
  variant,
  size,
  disabled,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  disabled?: boolean;
}) {
  const pending = useFormPending();
  return (
    <Button type="submit" className={className} variant={variant} size={size} disabled={disabled}>
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}

/**
 * Envoltorio de las server actions que devuelven `{ ok, message }`.
 * `className` cae en el `fieldset`, no en el `form`: cuando iba en el form, las
 * rejillas `md:grid-cols-2` no se aplicaban a los campos porque el fieldset se
 * interponía y todas las formas de administración quedaban en una columna.
 */
export function ClientForm({
  action,
  children,
  className,
  successMessage = "Listo.",
  resetOnSuccess = false,
  onSuccess,
}: {
  action: (formData: FormData) => Promise<Result>;
  children: React.ReactNode;
  className?: string;
  successMessage?: string;
  resetOnSuccess?: boolean;
  onSuccess?: () => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={(formData) => {
        setMessage(null);
        start(async () => {
          const result = await action(formData);
          if (result.ok) {
            setOk(true);
            setMessage(successMessage);
            if (resetOnSuccess) formRef.current?.reset();
            onSuccess?.();
          } else {
            setOk(false);
            setMessage(result.message);
          }
        });
      }}
    >
      <PendingContext value={pending}>
        <fieldset
          disabled={pending}
          className={cn("min-w-0 transition-opacity", className ?? "space-y-3", pending && "opacity-70")}
        >
          {children}
        </fieldset>
      </PendingContext>
      {message ? <Feedback ok={ok} message={message} /> : null}
    </form>
  );
}
