# Páginas y rutas

Next.js App Router. Autorización de página: layout `/app` exige sesión (`requirePageActor`); layout `/admin` exige ADMIN (`requirePageAdmin`). Proxy (`src/proxy.ts`): exige presencia de cookie en `/app` y `/admin`; la sesión real se valida en servidor (ver [arquitectura.md](./arquitectura.md)).

Las mutaciones van a server actions salvo las API listadas al final.

## Públicas

| Ruta | Archivo | Qué hace | Auth |
| --- | --- | --- | --- |
| `/` | `src/app/page.tsx` | Landing. CTA a `/login` o `/app` si hay actor. | Opcional (`getCurrentActor`) |
| `/login` | `src/app/login/page.tsx` | `LoginForm`: OTP y, si aplica, Microsoft. Query `next`, `error`. | La página valida el actor; una cookie inválida no provoca un loop. `next` solo admite destinos internos fuera de auth |
| `/login/magic` | `src/app/login/magic/page.tsx` | Consume token. Actions: `consumeMagicLinkAction`. | Token en query |
| `/a/[publicId]` | `src/app/a/[publicId]/page.tsx` | Registro de asistencia. `getPublicActivityRegistration`, `RegisterAttendanceButton` → `registerAttendanceAction`. Query `t` = token dinámico. | Redirige a login si no hay actor. El proxy no lo redirige; la guarda está en la página |
| `/hall-of-fame` | `src/app/hall-of-fame/page.tsx` | Reexporta la página del salón. **Sin** layout `/app`. | Pública (nombres, sin email) |

## App del integrante (`/app`)

Layout: `src/app/app/layout.tsx` — `AppHeader` (barra de tinta con marca, rail de escritorio y acciones) y `AppNav` (barra inferior en móvil, con iconos y estado activo). Nav extra «Comité» si líder o admin.

| Ruta | Archivo | Lecturas de dominio | Actions | Quién |
| --- | --- | --- | --- | --- |
| `/app` | `app/page.tsx` | `getMemberHome` | — | MEMBER+ |
| `/app/me` | `app/me/page.tsx` | `getMemberProfile` | — | MEMBER+ |
| `/app/activities` | `app/activities/page.tsx` | `getMemberActivities`; enlaces a `/a/{publicId}` | — | MEMBER+ |
| `/app/activities/[id]` | `app/activities/[id]/page.tsx` | `getPublishedActivityById` (**id interno**), scores, conteo aprobados | — | MEMBER+; 404 si DRAFT |
| `/app/rankings` | `app/rankings/page.tsx` | `getIndividualRanking`, `getCommitteeRanking`; query `period`, `isoWeek` | GET nativo del selector de semana | MEMBER+ |
| `/app/rankings/committees/[slug]` | `.../committees/[slug]/page.tsx` | `getCommitteeDetail`, `getCommitteeRanking` | — | MEMBER+ |
| `/app/hall-of-fame` | `app/hall-of-fame/page.tsx` | `listHallOfFameSeasons` | — | MEMBER+ |
| `/app/committees` | `app/committees/page.tsx` | `listLeaderCommittees` o empty state | — | Cualquier sesión; vacío si no lidera |
| `/app/committees/[slug]` | `app/committees/[slug]/page.tsx` | `getCommitteeLeaderView`, `listLeaderProposedActivities` | `leaderProposeActivityAction` | Líder de ese comité o ADMIN; resto 404 |

## Admin (`/admin`)

Sidebar: `src/components/admin/sidebar.tsx`. Agrupado en Operación / Datos / Sistema, con estado activo; en móvil se pliega en un `<details>` cuyo resumen dice la sección actual. Etiqueta «GH General».

| Ruta | Archivo | Lecturas | Actions principales | Quién |
| --- | --- | --- | --- | --- |
| `/admin` | `admin/page.tsx` | `getAdminOverview`, `getInactiveMembers(21)` | — | ADMIN |
| `/admin/members` | `admin/members/page.tsx` | `listMembers`, `listCommittees` | `adminCreateMemberAction` | ADMIN |
| `/admin/members/[id]` | `admin/members/[id]/page.tsx` | `getMemberDetail`, puntos de temporada | `adminUpdateMemberAction` (datos, comités, roles) | ADMIN |
| `/admin/committees` | `admin/committees/page.tsx` | `listCommittees` | create/update committee | ADMIN |
| `/admin/activities` | `admin/activities/page.tsx` | `listActivities`, `listProposedActivities` | create, publish/reject proposal | ADMIN |
| `/admin/activities/[id]` | `admin/activities/[id]/page.tsx` | actividad, asistencias, scores, QR | edición por estado, transición contextual, cancelación con motivo/reversión, rotate QR, selección o todos, add attendance | ADMIN |
| `/admin/attendance` | `admin/attendance/page.tsx` | pendientes filtrados por `q`, `committee`, `activity` | aprobar/rechazar selección o todos con confirmación | ADMIN |
| `/admin/points` | `admin/points/page.tsx` | miembros, ledger, actividades | assign, reverse, bulk award | ADMIN |
| `/admin/rankings` | `admin/rankings/page.tsx` | mismos rankings de temporada | export links | ADMIN |
| `/admin/seasons` | `admin/seasons/page.tsx` | `listSeasons` | create, update status | ADMIN |
| `/admin/imports` | `admin/imports/page.tsx` | — | preview/commit members y forms | ADMIN |
| `/admin/audit` | `admin/audit/page.tsx` | `listAuditLogs` | — (GET `q`) | ADMIN |
| `/admin/settings` | `admin/settings/page.tsx` | `getCreditStrategy`, env no secreto | `adminSaveConfigAction` | ADMIN |

No hay `/admin/login`: el login unificado es `/login`.

## API

| Método y ruta | Archivo | Auth | Respuesta |
| --- | --- | --- | --- |
| `GET /api/health` | `api/health/route.ts` | Ninguna | `{ ok, service, db }` 200 o 503 |
| `GET /api/auth/entra/start` | `api/auth/entra/start/route.ts` | — | 302 a Microsoft o `/login?error=` |
| `GET /api/auth/entra/callback` | `api/auth/entra/callback/route.ts` | code/state | Sesión + 302 `/app` o `/admin` |
| `GET /api/admin/export/[type]` | `api/admin/export/[type]/route.ts` | ADMIN sesión | CSV o XLSX. `type`: members, attendances, points, rankings, activity |
| `POST /api/import/forms` | `api/import/forms/route.ts` | Bearer `IMPORT_SECRET` **o** ADMIN | JSON `{ created, skipped, errors }` |

## Server actions (índice)

### `src/server/actions/auth.ts`

`requestOtpAction`, `verifyOtpAction`, `consumeMagicLinkAction`, `logoutAction`.

### `src/server/actions/attendance.ts`

`registerAttendanceAction` — campos `publicId`, `source` (`QR`\|`LINK`), `token` opcional.

### `src/server/actions/leader.ts`

`leaderProposeActivityAction`.

### `src/server/actions/theme.ts`

`setThemeAction`, `readThemePreference`.

### `src/server/actions/admin.ts`

`adminCreateMemberAction`, `adminUpdateMemberAction`, `adminCreateCommitteeAction`, `adminUpdateCommitteeAction`, `adminCreateSeasonAction`, `adminUpdateSeasonStatusAction`, `adminCreateActivityAction`, `adminUpdateActivityAction`, `adminTransitionActivityAction`, `adminCancelActivityAction`, `adminRotateQrAction`, `adminApproveAttendanceAction`, `adminBulkApproveAction`, `adminRejectAttendanceAction`, `adminBulkRejectAction`, `adminCancelAttendanceAction`, `adminAddAttendanceAction`, `adminAssignPointsAction`, `adminReversePointsAction`, `adminBulkAwardAction`, `adminSaveConfigAction`, `adminPreviewImportAction`, `adminCommitImportAction`, `adminPreviewFormsImportAction`, `adminCommitFormsImportAction`, `adminPublishProposalAction`, `adminRejectProposalAction`, `adminRotateAttendanceTokenAction` (devuelve token), `adminDisableAttendanceTokenAction`.

## Componentes de producto (no shadcn)

| Archivo | Uso |
| --- | --- |
| `components/auth/login-form.tsx` | Login OTP + enlace Entra |
| `components/auth/magic-link-consumer.tsx` | Consume magic link al montar |
| `components/attendance/register-button.tsx` | CTA de `/a/[publicId]` y `RegisteredCard` (el conteo animado del crédito) |
| `components/forms/client-form.tsx` | Wrapper de actions `{ok, message}`; exporta `Feedback` y `SubmitButton`. El `className` cae en el `fieldset` |
| `components/forms/confirm-button.tsx` | Confirmación en diálogo para acciones masivas destructivas |
| `components/admin/sidebar.tsx` | Nav admin agrupada, con estado activo |
| `components/admin/dynamic-qr-controls.tsx` | Activar/rotar token |
| `components/admin/import-form.tsx` | Preview + commit CSV/XLSX |
| `components/admin/export-links.tsx` | Botones CSV/XLSX de exportación |
| `components/app/shell.tsx` | `AppHeader` del integrante |
| `components/app/nav.tsx` | `AppNavRail` (escritorio) y `AppNavBar` (móvil), estado activo con `usePathname` |
| `components/brand/wordmark.tsx` | Marca del podio + logotipo |
| `components/podium/podium.tsx` | Podio (metales) y lista de ranking |
| `components/hall-of-fame/boards.tsx` | Tableros de temporadas cerradas |
| `components/ui-blocks.tsx` | `Marcador`, `LevelTrack`, `StatCard`, `BarList`, `SectionHeader`, `SegmentedLinks`, `EmptyState`, `ErrorState`, `Initials`, esqueletos |
| `components/theme-toggle.tsx` | Claro/oscuro |
| `components/ui/field.tsx` | `Field`, `NativeSelect`, `Textarea`, `CheckChip` |
| `components/ui/data-table.tsx` | Tabla con caída a tarjetas por debajo de `md` |
| `components/ui/status-badge.tsx` | Estado con etiqueta y tono desde `lib/labels.ts` |
| `components/ui/disclosure.tsx` | `<details>` uniforme de los formularios de creación |
| `components/ui/*` | Primitivos shadcn (Button, Input, Tabs, …) |

Convenciones de presentación: ningún enum del contrato se muestra crudo — todo pasa por `src/lib/labels.ts`. Los metales de nivel salen de `src/lib/level-style.ts`. La dirección visual está en [diseno.md](./diseno.md).

## Layout raíz

`src/app/layout.tsx`: metadata «GH Points» (con Open Graph y `viewport.themeColor`), fuentes Archivo / Public Sans / Geist Mono, enlace «Saltar al contenido», `lang="es"`, clase `dark` según cookie. Iconos y manifiesto: `src/app/icon.svg`, `src/app/apple-icon.tsx`, `src/app/manifest.ts`.
