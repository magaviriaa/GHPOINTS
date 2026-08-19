"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { registerAttendanceAction } from "@/server/actions/attendance";
import { cn } from "@/lib/utils";

/**
 * El único momento animado de la app: la cifra que acabas de ganar entra y
 * cuenta. Con `prefers-reduced-motion` aparece ya en su valor final.
 */
function useCountUp(target: number, run: boolean) {
  const [value, setValue] = useState(run ? 0 : target);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (!run) return;
    // La animación vive en el rAF, no en el cuerpo del efecto: con
    // `prefers-reduced-motion` la duración es cero y el primer cuadro ya pinta
    // el valor final.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduce || target <= 0 ? 0 : 700;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = duration === 0 ? 1 : Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [target, run]);

  return value;
}

export function RegisteredCard({
  points,
  status,
  detail,
  animate = false,
}: {
  points: number;
  status: "APPROVED" | "PENDING" | string;
  detail?: string;
  animate?: boolean;
}) {
  const approved = status === "APPROVED";
  const shown = useCountUp(points, animate && approved);

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl bg-success-surface px-5 py-6 text-center"
    >
      <span
        className={cn(
          "inline-flex size-10 items-center justify-center rounded-full bg-success text-success-foreground",
          animate && "motion-safe:animate-in motion-safe:zoom-in-75 motion-safe:duration-300"
        )}
        aria-hidden
      >
        <Check className="size-5" strokeWidth={3} />
      </span>
      <p className="font-display mt-3 text-lg font-bold text-success-ink">
        Asistencia registrada
      </p>
      {approved ? (
        <p className="marcador mt-3 text-5xl text-success-ink">+{shown}</p>
      ) : null}
      <p className="mt-2 text-sm text-success-ink">
        {approved
          ? "GH Points acreditados en tu temporada."
          : detail || "Queda pendiente hasta que un admin la apruebe."}
      </p>
      {detail && approved ? (
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      ) : null}
      <Link
        href="/app"
        className="mt-5 inline-flex text-sm font-semibold text-primary underline underline-offset-4"
      >
        Ver mi temporada
      </Link>
    </div>
  );
}

export function RegisterAttendanceButton({
  publicId,
  source,
  token,
  points,
  needsApproval,
}: {
  publicId: string;
  source: "QR" | "LINK";
  token?: string;
  points: number;
  needsApproval: boolean;
}) {
  const [done, setDone] = useState<null | { status: string }>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (done) {
    return <RegisteredCard points={points} status={done.status} animate />;
  }

  return (
    <form
      action={(formData) => {
        start(async () => {
          const result = await registerAttendanceAction(formData);
          if (result.ok) {
            setDone({ status: result.status });
          } else {
            setMessage(result.message);
          }
        });
      }}
    >
      <input type="hidden" name="publicId" value={publicId} />
      <input type="hidden" name="source" value={source} />
      {token ? <input type="hidden" name="token" value={token} /> : null}
      <Button className="h-14 w-full text-base font-semibold" disabled={pending} type="submit">
        {pending ? "Registrando…" : "Registrar asistencia"}
      </Button>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        {needsApproval
          ? "Un admin revisa el registro antes de acreditar los puntos."
          : `Los ${points} GH Points se acreditan al instante.`}
      </p>
      {message ? (
        <p role="alert" className="mt-3 text-center text-sm font-medium text-destructive">
          {message}
        </p>
      ) : null}
    </form>
  );
}
