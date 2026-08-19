import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { CalendarDays } from "lucide-react";

import { getCurrentActor } from "@/server/auth/session";
import { getPublicActivityRegistration } from "@/server/domain/attendance";
import { formatDateTime } from "@/lib/dates";
import {
  RegisterAttendanceButton,
  RegisteredCard,
} from "@/components/attendance/register-button";
import { Wordmark } from "@/components/brand/wordmark";
import { Marcador } from "@/components/ui-blocks";

export default async function PublicActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { publicId } = await params;
  const { t } = await searchParams;
  const actor = await getCurrentActor();
  const headerStore = await headers();
  const referer = headerStore.get("referer") ?? "";
  const source = referer.includes("/a/") ? "LINK" : "QR";

  if (!actor) {
    const target = `/a/${publicId}${t ? `?t=${encodeURIComponent(t)}` : ""}`;
    redirect(`/login?next=${encodeURIComponent(target)}`);
  }

  const view = await getPublicActivityRegistration(publicId, actor.id, t);
  if (!view) notFound();

  const { activity, attendance, memberships, registrationOpen, tokenRequired, tokenOk } = view;
  const needsApproval = activity.approvalMode === "MANUAL";

  return (
    <div className="min-h-screen bg-background">
      <div className="banda-marcador px-5 pt-5 pb-12">
        <div className="mx-auto max-w-md">
          <Wordmark href="/app" className="text-banda-texto" />
          <p className="mt-7 flex items-center gap-1.5 text-sm text-banda-tenue">
            <CalendarDays className="size-4" aria-hidden />
            {formatDateTime(activity.startsAt)}
          </p>
          <h1 className="font-display mt-1.5 text-3xl leading-[1.05] font-extrabold tracking-tight">
            {activity.name}
          </h1>
          {activity.description ? (
            <p className="mt-3 text-sm leading-relaxed text-banda-tenue">
              {activity.description}
            </p>
          ) : null}
          <Marcador
            className="mt-6"
            label="Vale"
            value={`+${activity.individualPoints}`}
            unit="GH Points"
            size="lg"
            onBand
          />
        </div>
      </div>

      <main id="contenido" className="relative mx-auto -mt-6 max-w-md px-4 pb-16">
        <div className="rounded-xl border bg-card p-5 shadow-lg">
          <p className="font-display font-bold">{actor.fullName}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {memberships.length === 0
              ? "Sin comité"
              : memberships.map((item) => item.committee.name).join(" · ")}
          </p>

          <div className="mt-5">
            {attendance ? (
              <RegisteredCard
                points={activity.individualPoints}
                status={attendance.status}
                detail={formatDateTime(attendance.registeredAt)}
              />
            ) : tokenRequired && !tokenOk ? (
              <div role="alert" className="rounded-xl border border-destructive/40 p-5 text-center">
                <p className="font-display font-bold text-destructive">Este QR ya venció</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  El código se renueva cada pocos minutos. Vuelve a escanear el que está
                  proyectado en la actividad.
                </p>
              </div>
            ) : registrationOpen ? (
              <RegisterAttendanceButton
                publicId={publicId}
                source={source}
                token={t}
                points={activity.individualPoints}
                needsApproval={needsApproval}
              />
            ) : (
              <div className="rounded-xl border border-dashed p-5 text-center">
                <p className="font-display font-bold">El registro está cerrado</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Se cerró el {formatDateTime(activity.registrationEnd)}. Si estuviste en la
                  actividad, pídele a GH General que registre tu asistencia.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
