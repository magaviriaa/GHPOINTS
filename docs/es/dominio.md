# Dominio

Toda la regla de negocio vive en `src/server/domain/`. Los archivos `*-pure.ts` no tocan la base de datos. Los demás importan `server-only` y el cliente Prisma (`db` / `tx.orm`). Las páginas y actions no deben duplicar estas reglas.

Errores: `DomainError` + `ErrorCodes` en `errors.ts`. `toUserMessage` muestra el mensaje de dominio o un genérico y loguea el resto.

Autorización de mutaciones: cada función sensible llama `requireAdmin` / `requireCommitteeLeader` / `requireActor` sobre el `Actor` que recibe, no sobre la cookie.

---

## `errors.ts`

Clase `DomainError` (`code`, `status`, `message`). Códigos: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION`, `INVALID_EMAIL_DOMAIN`, `OTP_*`, `ALREADY_REGISTERED`, `REGISTRATION_CLOSED`, `ACTIVITY_NOT_OPEN`, `ACTIVITY_CANCELLED`, `MEMBER_INACTIVE`, `SEASON_CLOSED`, `REASON_REQUIRED`, `ALREADY_REVERSED`, `IMPORT_INVALID`, `CONFLICT`.

`isDomainError` / `toUserMessage` para boundaries de catch.

---

## `authorization.ts`

Tipos `Actor` y `ActorRole`. Predicados y `require*` descritos en [autenticacion-y-autorizacion.md](./autenticacion-y-autorizacion.md). Es el único sitio que interpreta `RoleCode` para permisos.

---

## Puntos — `points.ts` (I/O)

Ledger inmutable. Recibe el cliente de transacción (`Tx`) para componer con asistencia.

| Función | Comportamiento |
| --- | --- |
| `findActivityTransaction` | Primera fila `ACTIVITY` de una asistencia (haya o no reversión). |
| `findUnreversedActivityTransaction` | `ACTIVITY` sin fila con `reversalOfId` apuntando a ella. |
| `createActivityPoints` | Si ya hay crédito vivo, lo devuelve (idempotente). Si hay `ACTIVITY` ya revertida, lanza `CONFLICT` («Usa un ajuste manual»). Crea la fila; en carrera una unique (`23505`) relee. |
| `reverseTransaction` | No se puede revertir un `REVERSAL`. Si ya existe reversión, la devuelve. Puntos = `-original.points`, `reversalOfId` unique. |
| `createManualPoints` | Tipos `MANUAL_ADJUSTMENT` \| `BONUS` \| `PENALTY`. `reason` no vacío. |
| `sumMemberPoints` | `aggregate` `sum("points")` por integrante y temporada. |
| `listMemberPointHistory` | Historial con actividad, más reciente primero. |

Invariante: una asistencia tiene **como máximo** una fila `ACTIVITY` (unique parcial). Tras revertirla no se vuelve a crear `ACTIVITY` para esa asistencia.

---

## Crédito de asistencia — `attendance-credit.ts`

Une estado de `Attendance` con el ledger. Exporta `assertAttendanceTransition` (también testeado en unitario) y `syncAttendanceCredit`.

### Transiciones permitidas

| Desde | Hacia |
| --- | --- |
| PENDING | PENDING, APPROVED, REJECTED, CANCELLED |
| APPROVED | APPROVED (idempotente), REJECTED, CANCELLED |
| REJECTED | solo REJECTED |
| CANCELLED | solo CANCELLED |

`PENDING` ← `APPROVED` está prohibido. Re-aprobar tras REJECTED/CANCELLED → `CONFLICT` (mensaje de ajuste manual).

### `syncAttendanceCredit`

- Destino `APPROVED` → `createActivityPoints` con `individualPoints` y reason `Asistencia: {nombre}`.
- Cualquier otro destino → si hay crédito vivo, `reverseTransaction`.

---

## Asistencia — `attendance.ts`

Orquesta registro, aprobación y listados. El trabajo derivado (Score de comité y badges) **no** va dentro de la transacción ni del request de registro: sale por `attendance-effects.ts` (ADR-021).

| Función | Quién | Notas |
| --- | --- | --- |
| `registerAttendance` | Actor autenticado | Resuelve actividad por `id` o `publicId`. Rechaza temporada CLOSED, actividad CANCELLED o no OPEN. `assertAttendanceToken` si QR dinámico. Ventana de registro **sin** bypass. Unique → `ALREADY_REGISTERED`. AUTO vs MANUAL. |
| `adminRegisterAttendance` | ADMIN | Puede registrar fuera de ventana, únicamente en OPEN/CLOSED. Source default ADMIN. |
| `upsertApprovedAttendance` | interno (bulk award) | Upsert APPROVED + crédito. Respeta transiciones. |
| `decideAttendance` | ADMIN | **Única** decisión: `to` ∈ APPROVED/REJECTED/CANCELLED, 1 o N ids. Bloquea temporadas y actividades en orden estable, relee cada fila, aplica el lote completo o ninguno, audita cada entidad y notifica tras commit. Aprobar/rechazar solo en OPEN/CLOSED; en PROCESSED únicamente corrige APPROVED mediante CANCELLED. `reason` obligatorio para CANCELLED. |
| `listActivityAttendances` | lectura | Filtro nombre, status, comité activo. |
| `listPendingAttendances` | cola admin | Filtros URL por nombre/correo (`q`), comité y actividad; el correo solo se devuelve a superficies admin. |
| `isRegistrationOpen` | puro de fechas+status | |
| `getPublicActivityRegistration` | página `/a/...` | Token inválido → `registrationOpen=false`, `tokenOk=false`. |
| `countApprovedAttendances` | detalle de actividad | |

Fuente QR vs LINK: la página pública usa el header `referer`; si contiene `/a/` asume LINK (compartido), si no QR (escaneo).

Admin bypass de ventana: `assertRegistrationWindow(..., bypass)` solo se usa con `bypass=false` en el registro del integrante; el admin **no** llama esa aserción.

Tras `registerAttendance` se notifica `ATTENDANCE_REGISTERED`. Tras aprobar, `ATTENDANCE_APPROVED`.

El `catch` de duplicados envuelve **solo** la transacción: un error del recompute ya no se le muestra al integrante como «Ya registraste tu asistencia».

---

## Efectos de asistencia — `attendance-effects.ts`

| Función | Cuándo | Notas |
| --- | --- | --- |
| `scheduleAttendanceEffects` | registro del integrante | `after()` de Next dentro de un request; fire-and-forget fuera (tests, scripts). El integrante no espera el recompute. |
| `runAttendanceEffects` | rutas admin | Se espera: aprobar, rechazar, anular y alta manual dejan los datos frescos. |

`runCoalesced` mantiene un slot por clave (`scores:{activityId}`, `badges:{seasonId}:{memberId}`): quien llega mientras hay un recompute en vuelo se engancha a él y marca **una** pasada más. N escaneos simultáneos del mismo QR se colapsan en dos recomputes, no en N.

Los fallos se registran y nunca revierten el dominio: la Asistencia y el Ledger ya hicieron commit.

---

## Actividades — `activities.ts`

| Función | Quién | Efecto |
| --- | --- | --- |
| `listActivities` | admin UI | Temporada activa por defecto, todos los status. |
| `listPublishedActivities` | integrantes | Status `OPEN`, `CLOSED`, `PROCESSED`, `CANCELLED` (no DRAFT). |
| `getActivityByPublicId` | registro público | Solo id vigente. |
| `getActivityById` / `getPublishedActivityById` | admin / app | Published filtra DRAFT. |
| `createActivity` | ADMIN | Status inicial DRAFT u OPEN, `needsApproval=false`. |
| `proposeActivity` | líder del comité | Status DRAFT, `needsApproval=true`, comité obligatorio y ACTIVE. |
| `updateActivity` | ADMIN | No recibe status. Aplica la matriz de campos editables y usa bloqueo/revalidación para no pisar una edición concurrente. |
| `transitionActivity` | ADMIN | Único comando de avance: DRAFT→OPEN, OPEN→CLOSED, CLOSED→PROCESSED. Procesar exige cero PENDING. |
| `cancelActivity` | ADMIN | Motivo obligatorio; cancelación idempotente de actividad y asistencias PENDING/APPROVED, reversión única de cada crédito y auditoría por entidad en una transacción. |
| `publishProposedActivity` | ADMIN | DRAFT+needsApproval → OPEN, `needsApproval=false`. Dispara Teams `ACTIVITY_OPENED` desde el action. |
| `rejectProposedActivity` | ADMIN | → CANCELLED. |
| `rotateActivityPublicId` | ADMIN | Historial + nanoid nuevo. Invalida QR impresos. |
| `rotateAttendanceToken` / `disableAttendanceToken` | ADMIN | QR dinámico. El action devuelve el token en claro una vez. |
| `assertAttendanceToken` | registro | Si `requireAttendanceToken`, exige `?t=` que hashee igual. |
| `attendanceUrl` | helper | `{APP_URL}/a/{publicId}` opcional `?t=`. |
| `getNextOpenActivity` / `getOpenActivities` | home | Próxima con `startsAt >= now`. |
| `listLeaderProposedActivities` | líder | Si no es admin, solo las que creó él. |

La máquina de estados no permite reaperturas ni transiciones inversas:

| Desde | Hacia |
| --- | --- |
| DRAFT | OPEN o CANCELLED |
| OPEN | CLOSED o CANCELLED |
| CLOSED | PROCESSED o CANCELLED |
| PROCESSED | CANCELLED |
| CANCELLED | ninguna; repetir cancelación es no-op |

Campos editables: DRAFT permite todos; OPEN permite nombre, descripción y fechas/ventana, pero congela puntos y aprobación; CLOSED permite solo nombre y descripción; PROCESSED/CANCELLED son de solo lectura.

Todas las mutaciones de actividad —crear, editar, transicionar/cancelar, publicar/rechazar propuesta, rotar publicId o token— exigen temporada writable (no CLOSED), salvo el reintento de una cancelación ya confirmada. Se bloquea primero la temporada y luego la actividad. `individualPoints` queda fijo al publicar, antes de que pueda existir una asistencia, porque el ledger materializa ese valor.

`attendanceMode` siempre `OPEN_LINK` (default del contrato); no hay UI ni rama para otro modo.

---

## Temporadas — `season.ts`

- `getActiveSeason` / `resolveSeason` / `listSeasons`.
- `createSeason`: ADMIN; unique parcial → `CONFLICT` si ya hay ACTIVE.
- `updateSeasonStatus`: bloquea la temporada; si el destino es `CLOSED`, **en la misma transacción y snapshot** construye y persiste Hall of Fame, cambia el estado y audita (ADR-018). Luego del commit refresca badges.
- `assertSeasonWritable`: CLOSED no admite nuevas actividades.

Cerrar no borra ledger ni asistencias.

---

## Scoring de comité — `scoring-pure.ts` + `scoring.ts`

Fórmula (ADR-005, ADR-006, ADR-007):

\[
\text{rate}_{\text{actividad}} = \frac{\text{attendeeCredit}}{\text{eligibleMemberCount}}
\]

Score de temporada = promedio simple de esas tasas en actividades `CLOSED` o `PROCESSED`.

**No** se usa la fórmula del prototipo `round(puntos * asistentes / tamaño)` ni el mínimo de 2 asistentes (`docs/backlog.md`).

### Puro

- `creditForMember(FULL_CREDIT, n)` = 1 si `n>0`.
- `creditForMember(FRACTIONAL_CREDIT, n)` = `1/n`.
- `participationRate` = 0 si eligible ≤ 0.
- `averageRate`.
- `membershipActiveAt(joinedAt, leftAt, at)`: vigente si `joinedAt <= at` y (`leftAt` nulo o `> at`).
- `snapshotEligibleCount`: si hay que congelar **y** el snapshot ya está `frozen`, conserva el denominador viejo; si no, usa el live.

- `computeCommitteeSnapshots`: el cálculo completo de una actividad. Indexa las membresías por integrante, aplica `membershipActiveAt` en `registeredAt`, reparte crédito según la estrategia y devuelve un snapshot por comité. Lineal en asistencias, no comités × asistencias × membresías.

### I/O `recomputeActivityScores`

1. Carga actividad y asistencias `APPROVED` (solo `memberId` y `registeredAt`).
2. `shouldFreeze` si CLOSED o PROCESSED.
3. Estrategia: `getCreditStrategy()` (`AppConfig` `committee_credit_strategy`, default FULL_CREDIT).
4. Comités `ACTIVE` (solo `id`, `orderBy: id` para fijar el orden de locks) y denominador live por `groupBy` de `MemberCommittee` — no se materializan miembros.
5. Membresías de los asistentes aprobados.
6. `computeCommitteeSnapshots` hace el cálculo; este módulo solo lee, llama y escribe.
7. Upsert `CommitteeActivityScore`.

`recomputeSeasonScores` itera actividades OPEN/CLOSED/PROCESSED. `listActivityCommitteeScores` ordena por tasa desc. `snapshotStrategyLabel` para UI.

Una persona en GEMIS+PIXEL con FULL_CREDIT cuenta 1.0 en ambos. Con FRACTIONAL, 0.5 en cada uno.

---

## Ranking — `ranking-pure.ts` + `ranking.ts`

Puro: `competitionRanks` (1, 2, 2, 4). `withCompetitionRanks` ordena por total desc y desempate opcional. `parseRankingPeriod`: `season` \| `week` \| `month` (default season).

I/O:

- `getIndividualRanking({ board: NEW|ACTIVE, period, isoWeek, seasonId, limit })`: `groupBy` del ledger filtrado por temporada y `createdAt` (semana ISO o inicio de mes en `APP_TIMEZONE`). Solo `Member.status=ACTIVE` y el `memberType` del tablero. Empate visual: `fullName` locale `es`. **No incluye email.**
- `getMemberSeasonStanding`: puesto del integrante en su tablero de temporada.
- `getCommitteeSeasonScores`: agrupa snapshots de actividades CLOSED/PROCESSED; incluye comités ACTIVE con total 0 si no tienen actividades.
- `getCommitteeRanking`: mismas ranks; desempate `slug` ASC.
- `getMemberCommitteeStandings`: membresías activas + puesto del comité.

El ranking semanal con `isoWeek` usa `rangeForIsoWeek`. Sin `isoWeek`, la semana es `startOfWeekUtc(now)` (lunes en TZ de la app) hasta ahora.

---

## Badges — `badges-pure.ts` + `badges.ts`

Umbrales en `src/lib/constants.ts`: racha **3**, puntos **500**, top **10**.

Slugs: `streak`, `500-points`, `top-10`, `monthly-mvp`, `committee-leader`.

Puro: racha consecutiva desde la actividad más reciente; MVP mensual = todos los que empatan el máximo &gt; 0 (puede haber más de uno).

`refreshBadges({ seasonId, memberId? })`:

1. Carga catálogo; si falta un slug (seed incompleto) omite ese badge.
2. Racha: actividades OPEN/CLOSED/PROCESSED de la temporada, orden `startsAt` desc; asistencias APPROVED.
3. Puntos: `groupBy` ledger de la temporada.
4. Top 10: ranks de ambos tableros.
5. MVP: ranking `period=month` de ambos tableros; `periodKey = yyyy-MM` (`yearMonthKey`).
6. Líder: quien tenga rol `COMMITTEE_LEADER` (cualquier comité).
7. `createMany skipDuplicates` respetando unique `(memberId, badgeId, seasonId, periodKey)`.

Los badges **no se revocan** si luego baja el puntaje; solo se otorgan. Se refrescan al registrar/aprobar asistencia, asignar puntos, cerrar temporada y cambiar roles.

---

## Niveles — `levels-pure.ts`

No persistidos (ADR-017). Umbrales: 0 Novato, 100 Bronce, 250 Plata, 500 Oro, 1000 Élite. `levelForPoints` devuelve nivel actual, siguiente y `progress` 0–1. Puntos no finitos o negativos se tratan como 0.

---

## Hall of Fame — `hall-of-fame-pure.ts` + `hall-of-fame.ts`

Al cerrar temporada, `buildHallOfFameSnapshot` toma top 3 de tableros ACTIVE, NEW y comités, más stats (conteos de miembros ACTIVE por tipo — **globales**, no filtrados por temporada —, actividades OPEN/CLOSED/PROCESSED, asistencias APPROVED, suma neta del ledger).

JSON validado con Zod al leer. `listHallOfFameSeasons` ordena por `endDate` desc. IDs de ganador en tabla se persisten null; la UI usa nombres del JSON.

Rutas: `/app/hall-of-fame` (sesión) y `/hall-of-fame` (misma página, **sin** layout `/app`, por tanto pública: nombres y stats, sin email).

---

## Comités — `committees.ts`

`listCommittees` (conteo de membresías activas), `getCommitteeDetail` por id o slug (roster con `member` completo — la página de ranking de comité **no muestra** emails), `createCommittee` / `updateCommittee` (ADMIN). El slug se regenera si cambia el nombre.

---

## Integrantes — `members.ts`

- `listMembers`: filtros query (nombre o correo), tipo, status, comité.
- `getMemberDetail`: membresías históricas, roles, últimas 50 asistencias y transacciones (admin).
- `createMember`: dominio institucional, rol MEMBER, 1–3 membresías iniciales.
- `updateMember`: si cambia email, actualiza `IdentityAccount` EMAIL_OTP `providerUserId`. Licencia o retiro → destruye sesiones.
- `setMemberCommittees`: tope 3; un vigente no puede quedar en 0. Cierra con `leftAt` las que salen; crea nuevas. No borra historia («Perteneció a»).
- `setMemberRoles`: garantiza rol MEMBER; no deja cero ADMIN; sincroniza líderes; refresca badge de líder.
- `setMemberAdmin`: delega en `setMemberRoles`.
- `listActiveMemberships` / `listMemberMemberships` / `listMemberBadges`.

---

## Lecturas de integrante — `member-reads.ts`

Fachada para páginas `/app` (sin consultar la base desde la página):

- `getMemberHome`: standing, comités, últimos 5 movimientos, próxima actividad OPEN futura, membresías, puntos, nivel.
- `getMemberProfile`: historial de temporada, badges, nivel, membresías actuales e históricas, estrategia de crédito.
- `getMemberActivities`: abiertas + publicadas de la temporada.

El «comité» que el home muestra primero es el primero del array de membresías, no necesariamente el mejor rankeado.

---

## Lecturas de líder — `leader-reads.ts`

- `listLeaderCommittees`: ADMIN ve todos los ACTIVE; líder solo los suyos.
- `getCommitteeLeaderView`: 404 si no existe; 403 si no es viewer. Roster: `fullName`, `memberType`, `status`, `joinedAt` — **sin email**. Scores de actividades CLOSED/PROCESSED.

---

## Puntos admin — `admin-points.ts`

- `assignManualPoints`: temporada writable; tipo inferido PENALTY si puntos &lt; 0, si no MANUAL_ADJUSTMENT (salvo override). Audit `POINTS_ASSIGNED` + badges.
- `reversePoints`: solo movimientos manuales/bonus/penalizaciones vivos y temporada abierta; rechaza `ACTIVITY`, `REVERSAL` y una segunda reversión. Audit `POINTS_REVERSED` + badges.
- `bulkAwardActivity`: `upsertApprovedAttendance` por cada id (source ADMIN), luego scores. Audit `POINTS_BULK_ASSIGNED`.
- `listPointTransactions`: ledger reciente para la UI.

---

## Importación — `import.ts`

Dos flujos: integrantes y Forms.

### Parseo tabular

CSV (PapaParse) o XLSX (primera hoja), máximo 10 MB y 10.000 filas. Otro formato, error CSV o exceso de filas se rechaza. Encabezados: alias en español/inglés; **cualquier columna no reconocida o encabezado vacío rechaza el archivo**. Obligatorio integrantes: nombre, correo. Forms: email, actividad.

### Integrantes

Preview valida dominio, duplicados en archivo, comités por slug o nombre slugificado. Tipo desconocido → warning y NEW. `saveMemberImportPreview` guarda job `PREVIEWED`. Commit exige cero errores; upsert por email; **añade** comités, no retira los existentes. Las filas, el cambio del job a `COMMITTED` y la auditoría ocurren en la misma transacción.

### Forms / asistencias históricas

Filas: email + `activityKey` (publicId, nombre o id interno) + fecha opcional. El commit administrativo bloquea temporadas/actividades, relee todas las referencias y crea asistencia APPROVED source `MICROSOFT_FORMS` + crédito + auditoría por fila en una transacción; cualquier fila inválida revierte el lote. Duplicado ya existente se omite. Los scores tocados se recalculan tras commit. API JSON: `formsJsonBodySchema` (`rows[].email`, `activityKey`, `registeredAt` ISO opcional).

---

## Exportación — `export.ts`

Tipos: `members`, `attendances`, `points`, `rankings`, `activity`. Formato `csv` (Papa) o `xlsx`. Rankings de comité exportan `total*100` a un decimal (porcentaje). Rankings individuales: nombre y puntos, sin correo. Listados de integrantes/asistencias/puntos **sí** incluyen correo (uso admin).

Ruta: `GET /api/admin/export/[type]?format=&activityId=&seasonId=`.

---

## Auditoría — `audit.ts`

`writeAuditLog(tx, input)` exige el cliente de transacción; no existe un camino de escritura con conexión global. Miembros, comités, temporadas, actividades, asistencias, puntos, configuración e importaciones persisten dato y auditoría bajo el mismo commit. Si insertar la auditoría falla, la mutación se revierte. En lotes se escribe una entrada por entidad modificada.

`listAuditLogs` busca en action, entityType, entityId y nombre del actor. No hay UI de JSON before/after; la página muestra action, actor, entidad y fecha.

Acciones escritas desde el dominio incluyen, entre otras: `MEMBER_*`, `COMMITTEE_*`, `SEASON_*`, `ACTIVITY_*`, `ATTENDANCE_*`, `POINTS_*`, `MEMBERS_IMPORTED`.

---

## Analytics — `analytics.ts`

`getAdminOverview`: KPIs de temporada activa, barras de asistencia, puntos por semana (`date_trunc('week', createdAt)` en SQL), top 8 comités.

`getInactiveMembers(days=21)`: integrantes `ACTIVE` sin ninguna asistencia con `registeredAt` en esa ventana (cualquier temporada). El overview lista 12.

---

## Módulos de soporte que el dominio usa

No están en `domain/` pero participan en invariantes:

| Módulo | Rol |
| --- | --- |
| `src/server/config/app-config.ts` | Estrategia FULL/FRACTIONAL |
| `src/server/notify/events.ts` | Email/Teams asíncrono; error solo `console.error` |
| `src/lib/public-id.ts` | nanoid 10 |
| `src/lib/dates.ts` | TZ `APP_TIMEZONE` default `America/Bogota` |
| `src/lib/text.ts` | `slugify`, `firstName`, `initials` |
