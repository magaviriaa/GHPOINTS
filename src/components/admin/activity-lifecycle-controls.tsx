"use client";

import { useState, useTransition } from "react";
import { Check, Circle, XCircle } from "lucide-react";

import {
  adminCancelActivityAction,
  adminPublishProposalAction,
  adminTransitionActivityAction,
} from "@/server/actions/admin";
import type { ActivityStatus } from "@/server/db/types";
import { ACTIVITY_STATUS } from "@/lib/labels";
import { ClientForm, Feedback, SubmitButton } from "@/components/forms/client-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";

type Result = { ok: true } | { ok: false; message: string };

const FLOW = ["DRAFT", "OPEN", "CLOSED", "PROCESSED"] as const;

const NEXT = {
  DRAFT: { to: "OPEN", label: "Publicar actividad" },
  OPEN: { to: "CLOSED", label: "Cerrar registro" },
  CLOSED: { to: "PROCESSED", label: "Procesar actividad" },
  PROCESSED: undefined,
  CANCELLED: undefined,
} as const satisfies Partial<
  Record<
    ActivityStatus,
    { to: "OPEN" | "CLOSED" | "PROCESSED"; label: string } | undefined
  >
>;

export function ActivityLifecycleControls({
  activityId,
  status,
  needsApproval,
  cancelReason,
}: {
  activityId: string;
  status: ActivityStatus;
  needsApproval: boolean;
  cancelReason: string | null;
}) {
  const next = NEXT[status];

  return (
    <section className="rounded-xl border bg-card p-4" aria-labelledby="activity-lifecycle-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="activity-lifecycle-title" className="font-display font-bold">
            Ciclo de la actividad
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            El avance es secuencial. Una actividad publicada no vuelve a borrador.
          </p>
        </div>
        {status === "CANCELLED" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive">
            <XCircle className="size-3.5" aria-hidden /> Cancelada
          </span>
        ) : null}
      </div>

      <ol className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Estados de la actividad">
        {FLOW.map((step, index) => {
          const currentIndex = FLOW.findIndex((candidate) => candidate === status);
          const complete = status === "CANCELLED" ? false : index < currentIndex;
          const current = step === status;
          const Icon = complete ? Check : Circle;
          return (
            <li
              key={step}
              aria-current={current ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold",
                complete && "border-success/30 bg-success/10 text-success-ink",
                current && "border-primary bg-primary/10 text-primary",
                !complete && !current && "text-muted-foreground"
              )}
            >
              <Icon className="size-3.5 shrink-0" aria-hidden />
              {ACTIVITY_STATUS[step].label}
            </li>
          );
        })}
      </ol>

      {status === "CANCELLED" && cancelReason ? (
        <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm">
          <span className="font-semibold">Motivo:</span> {cancelReason}
        </p>
      ) : null}

      {status !== "CANCELLED" && status !== "PROCESSED" ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
          {next ? (
            <ClientForm
              action={needsApproval && status === "DRAFT" ? adminPublishProposalAction : adminTransitionActivityAction}
              successMessage={`${next.label} completada.`}
            >
              <input type="hidden" name="activityId" value={activityId} />
              <input type="hidden" name="to" value={next.to} />
              <SubmitButton pendingLabel="Aplicando…">{next.label}</SubmitButton>
            </ClientForm>
          ) : null}
          <CancelActivityDialog activityId={activityId} />
        </div>
      ) : status === "PROCESSED" ? (
        <div className="mt-4 border-t pt-4">
          <CancelActivityDialog activityId={activityId} />
        </div>
      ) : null}
    </section>
  );
}

function CancelActivityDialog({ activityId }: { activityId: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const result: Result = await adminCancelActivityAction(formData);
      if (result.ok) setOpen(false);
      else setMessage(result.message);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="destructive">
          Cancelar actividad
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar actividad</DialogTitle>
          <DialogDescription>
            Se anularán las asistencias pendientes y aprobadas. Cada crédito concedido recibirá una
            reversión en el ledger; los movimientos originales no se eliminan.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-3">
          <input type="hidden" name="activityId" value={activityId} />
          <label htmlFor="activity-cancel-reason" className="block text-sm font-medium">
            Motivo de cancelación
          </label>
          <Textarea
            id="activity-cancel-reason"
            name="reason"
            required
            minLength={3}
            placeholder="Explica por qué se cancela y qué debe saber el equipo."
          />
          {message ? <Feedback ok={false} message={message} /> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Volver
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Cancelando…" : "Cancelar y revertir créditos"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
