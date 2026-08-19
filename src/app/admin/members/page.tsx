import Link from "next/link";

import { listMembers } from "@/server/domain/members";
import { listCommittees } from "@/server/domain/committees";
import { adminCreateMemberAction } from "@/server/actions/admin";
import { ClientForm, SubmitButton } from "@/components/forms/client-form";
import { CheckChip, Field, NativeSelect } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Disclosure } from "@/components/ui/disclosure";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { MEMBER_STATUS, MEMBER_TYPE, optionsOf } from "@/lib/labels";
import { EmptyState, SectionHeader } from "@/components/ui-blocks";
import { plural } from "@/lib/text";
import { ExportLinks } from "@/components/admin/export-links";

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; committee?: string }>;
}) {
  const params = await searchParams;
  const [members, committees] = await Promise.all([
    listMembers({
      query: params.q,
      memberType: params.type === "NEW" || params.type === "ACTIVE" ? params.type : "all",
      committeeId: params.committee ?? "all",
    }),
    listCommittees(),
  ]);
  const filtered = Boolean(params.q || params.type || params.committee);

  return (
    <div className="space-y-6">
      <SectionHeader
        as="h1"
        title="Integrantes"
        description={`${plural(members.length, "integrante")} con los filtros actuales`}
        action={<ExportLinks type="members" what="los integrantes" />}
      />

      <form className="flex flex-wrap items-end gap-3" method="get" role="search">
        <Field label="Buscar" htmlFor="q" className="min-w-52 flex-1">
          <Input id="q" name="q" placeholder="Nombre o correo" defaultValue={params.q} />
        </Field>
        <Field label="Tipo" htmlFor="type">
          <NativeSelect id="type" name="type" defaultValue={params.type ?? "all"} className="w-40">
            <option value="all">Todos</option>
            {optionsOf(MEMBER_TYPE).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Comité" htmlFor="committee">
          <NativeSelect
            id="committee"
            name="committee"
            defaultValue={params.committee ?? "all"}
            className="w-48"
          >
            <option value="all">Todos</option>
            {committees.map((committee) => (
              <option key={committee.id} value={committee.id}>
                {committee.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
        {filtered ? (
          <Button asChild variant="ghost">
            <Link href="/admin/members">Limpiar</Link>
          </Button>
        ) : null}
      </form>

      <Disclosure title="Crear integrante">
        <ClientForm
          action={adminCreateMemberAction}
          className="grid gap-4 md:grid-cols-2"
          successMessage="Integrante creado."
          resetOnSuccess
        >
          <Field label="Nombre" htmlFor="fullName">
            <Input id="fullName" name="fullName" required />
          </Field>
          <Field label="Correo" htmlFor="institutionalEmail">
            <Input
              id="institutionalEmail"
              name="institutionalEmail"
              type="email"
              autoCapitalize="off"
              required
            />
          </Field>
          <Field
            label="Tipo"
            htmlFor="memberType"
            hint="Los nuevos compiten en su propio tablero."
          >
            <NativeSelect id="memberType" name="memberType">
              {optionsOf(MEMBER_TYPE).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <fieldset className="space-y-2 md:col-span-2">
            <legend className="mb-1 text-sm font-medium">Comités</legend>
            <div className="flex flex-wrap gap-2">
              {committees.map((committee) => (
                <CheckChip
                  key={committee.id}
                  name="committeeIds"
                  value={committee.id}
                  color={committee.color}
                >
                  {committee.name}
                </CheckChip>
              ))}
            </div>
          </fieldset>
          <div className="md:col-span-2">
            <SubmitButton pendingLabel="Creando…">Crear</SubmitButton>
          </div>
        </ClientForm>
      </Disclosure>

      {members.length === 0 ? (
        <EmptyState
          title="Ningún integrante con esos filtros"
          description="Prueba con otro comité o limpia la búsqueda."
          action={
            filtered ? (
              <Button asChild variant="secondary">
                <Link href="/admin/members">Limpiar filtros</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DataTable
          caption="Integrantes"
          rows={members}
          rowKey={(member) => member.id}
          columns={[
            {
              key: "name",
              header: "Nombre",
              primary: true,
              cell: (member) => (
                <>
                  <Link
                    className="font-medium hover:underline"
                    href={`/admin/members/${member.id}`}
                  >
                    {member.fullName}
                  </Link>
                  <p className="text-xs text-muted-foreground">{member.institutionalEmail}</p>
                </>
              ),
            },
            {
              key: "type",
              header: "Tipo",
              cell: (member) => <StatusBadge dictionary={MEMBER_TYPE} value={member.memberType} />,
            },
            {
              key: "committees",
              header: "Comités",
              cell: (member) =>
                member.committees.length === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span className="flex flex-wrap gap-1.5">
                    {member.committees.map((item) => (
                      <span
                        key={item.committee.id}
                        className="inline-flex items-center gap-1.5 text-xs"
                      >
                        <span
                          className="size-2 rounded-full"
                          style={{ background: item.committee.color }}
                          aria-hidden
                        />
                        {item.committee.name}
                      </span>
                    ))}
                  </span>
                ),
            },
            {
              key: "status",
              header: "Estado",
              cell: (member) => <StatusBadge dictionary={MEMBER_STATUS} value={member.status} />,
            },
          ]}
        />
      )}
    </div>
  );
}
