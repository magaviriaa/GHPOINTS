import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { getMemberDetail } from "@/server/domain/members";
import { listCommittees } from "@/server/domain/committees";
import { sumMemberPoints } from "@/server/domain/points";
import { getActiveSeason } from "@/server/domain/season";
import { getCreditStrategy } from "@/server/config/app-config";
import { adminUpdateMemberAction } from "@/server/actions/admin";
import { ClientForm, SubmitButton } from "@/components/forms/client-form";
import { CheckChip, Field, NativeSelect } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/dates";
import { splitMemberships } from "@/server/domain/members-pure";
import {
  MEMBER_STATUS,
  MEMBER_TYPE,
  POINT_TRANSACTION_TYPE,
  optionsOf,
} from "@/lib/labels";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, SectionHeader, StatCard } from "@/components/ui-blocks";
import { CommitteePicker } from "@/components/admin/committee-picker";
import { MembershipHistory } from "@/components/members/membership-history";
import { CommitteeCreditNote } from "@/components/members/committee-credit-note";

export default async function AdminMemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [member, committees, season, creditStrategy] = await Promise.all([
    getMemberDetail(id),
    listCommittees(),
    getActiveSeason(),
    getCreditStrategy(),
  ]);
  if (!member) notFound();

  const points = season ? await sumMemberPoints(member.id, season.id) : 0;
  const { current: currentMemberships } = splitMemberships(member.committees);
  const isAdminUser = member.roles.some((role) => role.role === "ADMIN");
  const leaderCommitteeIds = new Set(
    member.roles.flatMap((role) =>
      role.role === "COMMITTEE_LEADER" && role.committeeId ? [role.committeeId] : []
    )
  );

  return (
    <div className="space-y-6">
      <Link
        href="/admin/members"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Integrantes
      </Link>

      <SectionHeader
        as="h1"
        title={member.fullName}
        description={member.institutionalEmail}
        action={
          <div className="flex gap-2">
            <StatusBadge dictionary={MEMBER_TYPE} value={member.memberType} />
            <StatusBadge dictionary={MEMBER_STATUS} value={member.status} />
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          label="GH Points"
          value={points}
          hint={season ? `Temporada ${season.name}` : "Sin temporada activa"}
        />
        <StatCard label="Comités" value={currentMemberships.length} />
        <StatCard label="Movimientos" value={member.pointTransactions.length} />
      </div>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="font-display font-bold">Datos y permisos</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Licencia y retiro sacan a la persona del tablero. Honorario puede entrar, pero no
          compite. El historial de puntos se conserva.
        </p>
        <ClientForm
          action={adminUpdateMemberAction}
          className="mt-4 grid gap-4 md:grid-cols-2"
          successMessage="Cambios guardados."
        >
          <input type="hidden" name="memberId" value={member.id} />
          <Field label="Nombre" htmlFor="fullName">
            <Input id="fullName" name="fullName" defaultValue={member.fullName} />
          </Field>
          <Field label="Correo" htmlFor="institutionalEmail">
            <Input
              id="institutionalEmail"
              name="institutionalEmail"
              defaultValue={member.institutionalEmail}
            />
          </Field>
          <Field label="Tipo" htmlFor="memberType">
            <NativeSelect id="memberType" name="memberType" defaultValue={member.memberType}>
              {optionsOf(MEMBER_TYPE).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Estado" htmlFor="status">
            <NativeSelect id="status" name="status" defaultValue={member.status}>
              {optionsOf(MEMBER_STATUS).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <CommitteePicker
            committees={committees}
            defaultIds={currentMemberships.map((item) => item.committeeId)}
          />

          <fieldset className="space-y-2 md:col-span-2">
            <legend className="text-sm font-medium">Líder de comité</legend>
            <p className="mb-1 text-xs text-muted-foreground">
              Puede proponer actividades de su comité y ver su roster. No asigna puntos ni
              aprueba asistencias.
            </p>
            <div className="flex flex-wrap gap-2">
              {committees.map((committee) => (
                <CheckChip
                  key={committee.id}
                  name="leaderCommitteeIds"
                  value={committee.id}
                  color={committee.color}
                  defaultChecked={leaderCommitteeIds.has(committee.id)}
                >
                  {committee.name}
                </CheckChip>
              ))}
            </div>
          </fieldset>

          <fieldset className="md:col-span-2">
            <legend className="sr-only">Administración</legend>
            <CheckChip name="isAdmin" value="on" defaultChecked={isAdminUser}>
              Administrador (GH General)
            </CheckChip>
          </fieldset>

          <div className="md:col-span-2">
            <SubmitButton pendingLabel="Guardando…">Guardar</SubmitButton>
          </div>
        </ClientForm>
      </section>

      <CommitteeCreditNote
        strategy={creditStrategy}
        committeeNames={currentMemberships.map((item) => item.committee.name)}
      />

      <MembershipHistory memberships={member.committees} showCurrent={false} />

      <section className="space-y-3">
        <SectionHeader title="Historial de puntos" />
        {member.pointTransactions.length === 0 ? (
          <EmptyState title="Este integrante todavía no tiene movimientos." />
        ) : (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {member.pointTransactions.map((row) => (
              <li key={row.id} className="flex items-start gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{row.reason}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-2">
                    <StatusBadge dictionary={POINT_TRANSACTION_TYPE} value={row.type} />
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(row.createdAt)}
                    </span>
                  </span>
                </span>
                <span
                  className={`tnum shrink-0 font-bold ${
                    row.points < 0 ? "text-destructive" : "text-success-ink"
                  }`}
                >
                  {row.points > 0 ? "+" : ""}
                  {row.points}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
