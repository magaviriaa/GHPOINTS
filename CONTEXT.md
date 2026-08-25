# GH Points — domain glossary

Names for the seams this codebase should keep. Decisions that freeze a seam live in [docs/decisions.md](docs/decisions.md).

Documentación detallada en español (capas, Prisma, auth, cada módulo de dominio, rutas): [docs/es/README.md](docs/es/README.md).

## Integrante

A person in the organization (`Member`). Identified by institutional email.

- `memberType` `NEW` or `ACTIVE`: ranking boards (nuevos vs. veteranos). Not the life status.
- `status`: `ACTIVE` (vigente), `ON_LEAVE` (licencia), `HONORARY` (honorario), `INACTIVE` (retirado).
- Login: vigente and honorario. Rankings, badges, and committee eligible count: only vigente.
- A vigente Integrante belongs to 1–3 committees at a time (`MAX_MEMBER_COMMITTEES`). Leaving a committee writes `leftAt` and keeps the row as «Perteneció a».

## Actor

The Integrante currently authenticated, plus roles. Authorization checks the Actor, not the cookie.

## Comité

A working group (`Committee`). An Integrante may belong to 1–3 at a time. Membership is historical: `joinedAt` / `leftAt` matter at Asistencia time, so a semester switch does not rewrite past committee credit.

## Temporada

A scoring window (`Season`). At most one `ACTIVE` at a time. Closing does not delete data. Rankings and the ledger are scoped to a Temporada.

## Actividad

An event that can award GH Points (`Activity`). Public QR/link uses `publicId`, never the internal id. Status drives whether registration is open.

## Asistencia

One Integrante at one Actividad (`Attendance`). Unique per pair. Status: `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`.

## Efectos de asistencia

Derived work that follows a change of Asistencia: Score de comité snapshots and badges. Never inside the Asistencia transaction. `scheduleAttendanceEffects` for the registration path (post-response), `runAttendanceEffects` where an admin must see the result immediately. Coalesced per Actividad, so N concurrent scans collapse into at most two recomputes.

## Crédito de asistencia

The posting of an `ACTIVITY` ledger row when Asistencia becomes `APPROVED`, and the matching `REVERSAL` when it leaves `APPROVED`.

Invariant: `APPROVED` ⇔ one unreverted `ACTIVITY` row for that Asistencia. Any other status ⇔ net zero. A rejected or cancelled Asistencia is not approved again through this module; a later correction is a `MANUAL_ADJUSTMENT`.

## Ledger

`PointTransaction` is the source of truth. Totals are `SUM(points)` for a Temporada. Rows are never edited or deleted. A mistake is a `REVERSAL` (or a manual adjustment).

## Score de comité

Per Actividad: `attendeeCredit / eligibleMemberCount` (relative participation). Season score = mean of those rates on `CLOSED`/`PROCESSED` activities. Snapshots freeze the denominator when the Actividad closes.

Computed by the pure `computeCommitteeSnapshots`; the module with IO only reads, calls it, and upserts. Recomputed **after** the Asistencia commits, not inside it (ADR-021), so it is eventually consistent with registration by design.

## Ranking

Official board = active Temporada. Separate boards for Integrante type `NEW` and `ACTIVE`. Ties share a place (1, 2, 2, 4); visual order of a tie is `fullName` ASC. Comité ranking uses the same competition ranks; visual order of a tie is `slug` ASC.

## Standings de comité

Season totals for ranking, derived from Score de comité snapshots. Ranking reads standings; scoring writes snapshots.

## Vista de integrante

Home and profile pages read through the member-reads module. Pages do not query the database.

## Vista de líder de comité

`COMMITTEE_LEADER` reads the roster and Score de comité of committees they lead (ADR-011). The leader may propose `DRAFT` activities for those committees; ADMIN publishes. Admin may open the same vista. The role does not assign points or approve Asistencia. Pages read through the leader-reads module. Roster listings omit email (ADR-014).
