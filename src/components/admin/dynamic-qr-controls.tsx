"use client";

import { useState, useTransition } from "react";
import { adminRotateAttendanceTokenAction } from "@/server/actions/admin";
import { Button } from "@/components/ui/button";

export function DynamicQrControls({
  activityId,
  enabled,
  staticUrl,
}: {
  activityId: string;
  enabled: boolean;
  staticUrl: string;
}) {
  const [tokenUrl, setTokenUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-2 text-left text-sm">
      <p className="text-muted-foreground">
        {enabled
          ? "QR dinámico activo: el enlace estático ya no registra asistencia."
          : "QR estático activo. Puedes exigir un token rotativo para invalidar impresiones viejas."}
      </p>
      <form
        action={(formData) => {
          start(async () => {
            const result = await adminRotateAttendanceTokenAction(formData);
            if (result.ok) {
              const url = `${staticUrl.split("?")[0]}?t=${encodeURIComponent(result.token)}`;
              setTokenUrl(url);
              setMessage("Copia este enlace ahora. El token no se vuelve a mostrar.");
            } else {
              setMessage(result.message);
            }
          });
        }}
      >
        <input type="hidden" name="activityId" value={activityId} />
        <Button type="submit" variant="secondary" className="w-full" disabled={pending}>
          {pending ? "Generando…" : enabled ? "Rotar token" : "Activar QR dinámico"}
        </Button>
      </form>
      {tokenUrl ? (
        <p className="font-mono rounded-md bg-muted p-2 text-xs break-all" role="status">
          {tokenUrl}
        </p>
      ) : null}
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}
