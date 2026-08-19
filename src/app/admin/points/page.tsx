import { listMembers } from "@/server/domain/members";
import { listPointTransactions } from "@/server/domain/admin-points";
import { listActivities } from "@/server/domain/activities";
import {
  adminAssignPointsAction,
  adminBulkAwardAction,
  adminReversePointsAction,
} from "@/server/actions/admin";
import { ClientForm, SubmitButton } from "@/components/forms/client-form";
import { CheckChip, Field, NativeSelect } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Disclosure } from "@/components/ui/disclosure";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { POINT_TRANSACTION_TYPE } from "@/lib/labels";
import { formatDateTime } from "@/lib/dates";
import { EmptyState, SectionHeader } from "@/components/ui-blocks";
import { ExportLinks } from "@/components/admin/export-links";

export default async function AdminPointsPage() {
  const [members, transactions, activities] = await Promise.all([
    listMembers({ status: "ACTIVE" }),
    listPointTransactions({ take: 40 }),
    listActivities(),
  ]);

  return (
    <div className="space-y-6">
      <SectionHeader
        as="h1"
        title="Puntos"
        description="El ledger no se edita. Un error se corrige con una reversión."
        action={<ExportLinks type="points" what="el ledger" />}
      />

      <section className="rounded-xl border bg-card p-4">
        <h2 className="font-display font-bold">Asignar a una persona</h2>
        <ClientForm
          action={adminAssignPointsAction}
          className="mt-4 grid gap-4 md:grid-cols-2"
          successMessage="Puntos asignados."
          resetOnSuccess
        >
          <Field label="Integrante" htmlFor="memberId" span>
            <NativeSelect id="memberId" name="memberId" required>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.fullName}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Puntos" htmlFor="points" hint="Negativo para descontar.">
            <Input id="points" name="points" type="number" defaultValue={30} required />
          </Field>
          <Field label="Motivo" htmlFor="reason" hint="Queda visible en el historial del integrante.">
            <Input id="reason" name="reason" required placeholder="Apoyo logístico" />
          </Field>
          <div className="md:col-span-2">
            <SubmitButton pendingLabel="Asignando…">Asignar</SubmitButton>
          </div>
        </ClientForm>
      </section>

      <Disclosure
        title="Asignación masiva por actividad"
        description="Acredita los puntos de una actividad a varias personas de una vez."
      >
        <ClientForm
          action={adminBulkAwardAction}
          className="space-y-4"
          successMessage="Puntos asignados a los seleccionados."
        >
          <Field label="Actividad" htmlFor="activityId">
            <NativeSelect id="activityId" name="activityId" required className="max-w-lg">
              {activities.map((activity) => (
                <option key={activity.id} value={activity.id}>
                  {activity.name} (+{activity.individualPoints})
                </option>
              ))}
            </NativeSelect>
          </Field>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Integrantes</legend>
            <div className="flex max-h-72 flex-wrap gap-2 overflow-auto rounded-lg border p-3">
              {members.map((member) => (
                <CheckChip key={member.id} name="memberIds" value={member.id}>
                  {member.fullName}
                </CheckChip>
              ))}
            </div>
          </fieldset>
          <SubmitButton pendingLabel="Asignando…">Asignar a los seleccionados</SubmitButton>
        </ClientForm>
      </Disclosure>

      <section className="space-y-3">
        <SectionHeader title="Ledger reciente" description="Los últimos 40 movimientos." />
        {transactions.length === 0 ? (
          <EmptyState title="Todavía no hay movimientos en el ledger." />
        ) : (
          <DataTable
            caption="Movimientos recientes del ledger"
            rows={transactions}
            rowKey={(row) => row.id}
            columns={[
              {
                key: "member",
                header: "Integrante",
                primary: true,
                cell: (row) => (
                  <>
                    <span className="font-medium">{row.member.fullName}</span>
                    <p className="text-xs text-muted-foreground">{row.reason}</p>
                  </>
                ),
              },
              {
                key: "type",
                header: "Tipo",
                cell: (row) => (
                  <StatusBadge dictionary={POINT_TRANSACTION_TYPE} value={row.type} />
                ),
              },
              {
                key: "when",
                header: "Cuándo",
                cell: (row) => (
                  <span className="text-muted-foreground">{formatDateTime(row.createdAt)}</span>
                ),
              },
              {
                key: "points",
                header: "Puntos",
                numeric: true,
                cell: (row) => (
                  <span className={row.points < 0 ? "text-destructive" : undefined}>
                    {row.points > 0 ? "+" : ""}
                    {row.points}
                  </span>
                ),
              },
              {
                key: "action",
                header: "Acción",
                actions: true,
                cell: (row) =>
                  row.type !== "REVERSAL" ? (
                    <ClientForm action={adminReversePointsAction} successMessage="Revertido.">
                      <input type="hidden" name="transactionId" value={row.id} />
                      <input type="hidden" name="reason" value="Reversión administrativa" />
                      <SubmitButton size="sm" variant="secondary" pendingLabel="Revirtiendo…">
                        Revertir
                      </SubmitButton>
                    </ClientForm>
                  ) : (
                    <span className="text-xs text-muted-foreground">ya es una reversión</span>
                  ),
              },
            ]}
          />
        )}
      </section>
    </div>
  );
}
