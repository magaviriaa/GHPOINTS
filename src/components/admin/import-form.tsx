"use client";

import { useState, useTransition } from "react";
import {
  adminCommitFormsImportAction,
  adminCommitImportAction,
  adminPreviewFormsImportAction,
  adminPreviewImportAction,
} from "@/server/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Feedback } from "@/components/forms/client-form";

type Preview = {
  previewId: string;
  filename: string;
  valid: number;
  warnings: { row: number; message: string }[];
  errors: { row: number; message: string }[];
};

function ImportFileForm({
  previewAction,
  commitAction,
  successMessage,
}: {
  previewAction: typeof adminPreviewImportAction;
  commitAction: typeof adminCommitImportAction;
  successMessage: string;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-4">
      <form
        action={(formData) => {
          start(async () => {
            const result = await previewAction(formData);
            if (result.ok) {
              setPreview(result);
              setMessage(null);
            } else {
              setMessage(result.message);
            }
          });
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <Input
          name="file"
          type="file"
          accept=".csv,.xlsx,.xls"
          required
          aria-label="Archivo CSV o XLSX"
          className="h-auto py-1.5 file:mr-3 file:rounded-md file:bg-secondary file:px-3 file:py-1"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Leyendo…" : "Vista previa"}
        </Button>
      </form>

      {preview ? (
        <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
          <p className="text-sm">
            <span className="tnum font-semibold">{preview.valid}</span> registros válidos ·{" "}
            <span className="tnum font-semibold">{preview.warnings.length}</span> advertencias ·{" "}
            <span className="tnum font-semibold">{preview.errors.length}</span> errores
          </p>
          {preview.errors.map((issue) => (
            <p key={`e-${issue.row}`} className="text-sm text-destructive">
              Fila {issue.row}: {issue.message}
            </p>
          ))}
          {preview.warnings.map((issue) => (
            <p key={`w-${issue.row}`} className="text-sm text-accent-ink">
              Fila {issue.row}: {issue.message}
            </p>
          ))}
          {preview.errors.length === 0 ? (
            <form
              action={(formData) => {
                start(async () => {
                  const result = await commitAction(formData);
                  setMessage(result.ok ? successMessage : result.message);
                });
              }}
            >
              <input type="hidden" name="previewId" value={preview.previewId} />
              <input type="hidden" name="filename" value={preview.filename} />
              <Button type="submit" disabled={pending}>
                {pending ? "Importando…" : "Confirmar importación"}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-destructive">
              No se importa un archivo con errores. Corrígelo y vuelve a cargar.
            </p>
          )}
        </div>
      ) : null}
      {message ? <Feedback ok={message === successMessage} message={message} /> : null}
    </div>
  );
}

export function ImportMembersForm() {
  return (
    <ImportFileForm
      previewAction={adminPreviewImportAction}
      commitAction={adminCommitImportAction}
      successMessage="Importación completada."
    />
  );
}

export function ImportFormsForm() {
  return (
    <ImportFileForm
      previewAction={adminPreviewFormsImportAction}
      commitAction={adminCommitFormsImportAction}
      successMessage="Asistencias de Forms importadas."
    />
  );
}
