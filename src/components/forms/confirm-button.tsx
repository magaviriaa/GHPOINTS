"use client";

import { useState, useTransition } from "react";

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
import { Feedback } from "@/components/forms/client-form";

type Result = { ok: true } | { ok: false; message: string };

/**
 * Para acciones masivas que no se pueden deshacer con un clic. El diálogo dice
 * exactamente qué va a pasar y con cuántos registros, y el botón que confirma
 * usa el mismo verbo que el que abrió.
 */
export function ConfirmButton({
  action,
  formData,
  label,
  title,
  description,
  confirmLabel,
  variant = "secondary",
  size,
  disabled = false,
  confirmVariant = "destructive",
}: {
  action: (formData: FormData) => Promise<Result>;
  formData: Record<string, string | string[]>;
  label: string;
  title: string;
  description: string;
  confirmLabel: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  disabled?: boolean;
  confirmVariant?: React.ComponentProps<typeof Button>["variant"];
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run() {
    setMessage(null);
    const payload = new FormData();
    for (const [key, value] of Object.entries(formData)) {
      if (Array.isArray(value)) {
        for (const item of value) payload.append(key, item);
      } else {
        payload.append(key, value);
      }
    }
    start(async () => {
      const result = await action(payload);
      if (result.ok) {
        setOpen(false);
      } else {
        setMessage(result.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant={variant} size={size} disabled={disabled}>
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {message ? <Feedback ok={false} message={message} /> : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              Volver
            </Button>
          </DialogClose>
          <Button type="button" variant={confirmVariant} disabled={pending} onClick={run}>
            {pending ? "Aplicando…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
