"use client";

import { useMemo, useState } from "react";

import {
  adminApproveAttendanceAction,
  adminBulkApproveAction,
  adminBulkRejectAction,
  adminCancelAttendanceAction,
  adminRejectAttendanceAction,
} from "@/server/actions/admin";
import type { AttendanceSource, AttendanceStatus } from "@/server/db/types";
import { ClientForm, SubmitButton } from "@/components/forms/client-form";
import { ConfirmButton } from "@/components/forms/confirm-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Initials } from "@/components/ui-blocks";
import { ATTENDANCE_SOURCE, ATTENDANCE_STATUS } from "@/lib/labels";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type AttendanceSelectionRow = {
  id: string;
  registeredAt: string;
  source: AttendanceSource;
  status: AttendanceStatus;
  member: {
    fullName: string;
    institutionalEmail: string;
    committees?: string[];
  };
  activity?: { name: string };
};

export function AttendanceSelection({
  rows,
  showActivity = false,
  activityStatus,
}: {
  rows: AttendanceSelectionRow[];
  showActivity?: boolean;
  activityStatus?: "DRAFT" | "OPEN" | "CLOSED" | "PROCESSED" | "CANCELLED";
}) {
  const selectableIds = useMemo(
    () => rows.filter((row) => row.status === "PENDING").map((row) => row.id),
    [rows]
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selectedIds = selectableIds.filter((id) => selected.has(id));
  const allSelected = selectableIds.length > 0 && selectedIds.length === selectableIds.length;
  const canDecide = activityStatus === undefined || activityStatus === "OPEN" || activityStatus === "CLOSED";
  const canCorrect =
    activityStatus === undefined ||
    activityStatus === "OPEN" ||
    activityStatus === "CLOSED" ||
    activityStatus === "PROCESSED";

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(selectableIds) : new Set());
  }

  return (
    <div className="space-y-3">
      {selectableIds.length > 0 && canDecide ? (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-background/95 px-3 py-2 shadow-sm backdrop-blur">
          <label className="mr-auto inline-flex min-h-9 cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="size-4 rounded border-input accent-primary"
              checked={allSelected}
              onChange={(event) => toggleAll(event.target.checked)}
            />
            Seleccionar visibles
          </label>
          <p className="tnum text-xs text-muted-foreground" role="status" aria-live="polite">
            {selectedIds.length} seleccionadas
          </p>
          <ClientForm
            action={adminBulkApproveAction}
            successMessage="Asistencias aprobadas."
            onSuccess={() => setSelected(new Set())}
          >
            {selectedIds.map((id) => (
              <input key={id} type="hidden" name="attendanceIds" value={id} />
            ))}
            <SubmitButton size="sm" pendingLabel="Aprobando…" disabled={selectedIds.length === 0}>
              Aprobar seleccionadas
            </SubmitButton>
          </ClientForm>
          <ConfirmButton
            action={adminBulkRejectAction}
            formData={{ attendanceIds: selectedIds }}
            label="Rechazar seleccionadas"
            title="Rechazar asistencias seleccionadas"
            description={`Se rechazarán ${selectedIds.length} registros. El lote se aplicará completo o no se aplicará.`}
            confirmLabel="Rechazar seleccionadas"
            size="sm"
            disabled={selectedIds.length === 0}
          />
        </div>
      ) : null}

      <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
        <table className="w-full caption-bottom text-sm">
          <caption className="sr-only">Asistencias y acciones disponibles</caption>
          <thead className="bg-muted/70 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="w-12 px-4 py-3"><span className="sr-only">Seleccionar</span></th>
              <th className="px-4 py-3">Integrante</th>
              {showActivity ? <th className="px-4 py-3">Actividad</th> : null}
              <th className="px-4 py-3">Registro</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.id} className={cn(selected.has(row.id) && "bg-primary/5")}>
                <td className="px-4 py-3 align-top">
                  {row.status === "PENDING" && canDecide ? (
                    <input
                      type="checkbox"
                      className="size-4 rounded border-input accent-primary"
                      checked={selected.has(row.id)}
                      onChange={(event) => toggle(row.id, event.target.checked)}
                      aria-label={`Seleccionar asistencia de ${row.member.fullName}`}
                    />
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium">{row.member.fullName}</p>
                  <p className="text-xs text-muted-foreground">{row.member.institutionalEmail}</p>
                  {row.member.committees?.length ? (
                    <p className="mt-1 text-xs text-muted-foreground">{row.member.committees.join(", ")}</p>
                  ) : null}
                </td>
                {showActivity ? <td className="px-4 py-3">{row.activity?.name}</td> : null}
                <td className="px-4 py-3">
                  <p>{formatDateTime(row.registeredAt)}</p>
                  <StatusBadge dictionary={ATTENDANCE_SOURCE} value={row.source} className="mt-1" />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge dictionary={ATTENDANCE_STATUS} value={row.status} />
                </td>
                <td className="px-4 py-3"><RowActions row={row} canDecide={canDecide} canCorrect={canCorrect} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-2 md:hidden">
        {rows.map((row) => (
          <li key={row.id} className={cn("rounded-xl border bg-card p-4", selected.has(row.id) && "border-primary/40 bg-primary/5")}>
            <div className="flex items-start gap-3">
              {row.status === "PENDING" && canDecide ? (
                <input
                  type="checkbox"
                  className="mt-1 size-5 rounded border-input accent-primary"
                  checked={selected.has(row.id)}
                  onChange={(event) => toggle(row.id, event.target.checked)}
                  aria-label={`Seleccionar asistencia de ${row.member.fullName}`}
                />
              ) : (
                <Initials name={row.member.fullName} />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium">{row.member.fullName}</p>
                <p className="truncate text-xs text-muted-foreground">{row.member.institutionalEmail}</p>
                {showActivity ? <p className="mt-1 text-sm">{row.activity?.name}</p> : null}
              </div>
              <StatusBadge dictionary={ATTENDANCE_STATUS} value={row.status} />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <span className="text-xs text-muted-foreground">{formatDateTime(row.registeredAt)}</span>
              <RowActions row={row} canDecide={canDecide} canCorrect={canCorrect} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RowActions({
  row,
  canDecide,
  canCorrect,
}: {
  row: AttendanceSelectionRow;
  canDecide: boolean;
  canCorrect: boolean;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {row.status === "PENDING" && canDecide ? (
        <>
          <ClientForm action={adminApproveAttendanceAction} successMessage="Aprobada.">
            <input type="hidden" name="attendanceId" value={row.id} />
            <SubmitButton size="sm" pendingLabel="…">Aprobar</SubmitButton>
          </ClientForm>
          <ClientForm action={adminRejectAttendanceAction} successMessage="Rechazada.">
            <input type="hidden" name="attendanceId" value={row.id} />
            <SubmitButton size="sm" variant="secondary" pendingLabel="…">Rechazar</SubmitButton>
          </ClientForm>
        </>
      ) : null}
      {(row.status === "APPROVED" || row.status === "PENDING") && canCorrect ? (
        <ClientForm action={adminCancelAttendanceAction} successMessage="Anulada.">
          <input type="hidden" name="attendanceId" value={row.id} />
          <input type="hidden" name="reason" value="Corrección administrativa" />
          <SubmitButton size="sm" variant="destructive" pendingLabel="…">Anular</SubmitButton>
        </ClientForm>
      ) : null}
    </div>
  );
}
