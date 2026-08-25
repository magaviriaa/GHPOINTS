# Flujos de usuario

Flujos extremo a extremo según el código actual. Los nombres de dominio coinciden con [`CONTEXT.md`](../../CONTEXT.md).

## Login (OTP + magic link)

```mermaid
sequenceDiagram
  participant U as Integrante
  participant UI as /login
  participant A as requestOtpAction / verifyOtpAction
  participant OTP as otp.ts
  participant Mail as EmailSender
  participant S as Session

  U->>UI: correo institucional
  UI->>A: requestOtpAction
  A->>OTP: requestOtp
  alt no está en roster o INACTIVE
    OTP-->>UI: ok (sin correo)
  else ACTIVE
    OTP->>OTP: AuthChallenge OTP + MAGIC_LINK
    OTP->>Mail: código + enlace
    U->>UI: código 6 dígitos
    UI->>A: verifyOtpAction
    A->>OTP: consume retos + IdentityAccount
    A->>S: cookie gh_session
    A-->>U: /app o /admin si ADMIN
  end
```

El enlace `{APP_URL}/login/magic?token=` llama `consumeMagicLinkAction`. Consumir OTP o enlace invalida el otro. En desarrollo, `OTP_FIXED_CODE=123456` y el adapter de consola imprimen el correo.

Si Entra está encendido, el botón redirige a `/api/auth/entra/start`. Detalle en [autenticacion-y-autorizacion.md](./autenticacion-y-autorizacion.md).

## Registrar asistencia (QR estático / dinámico / publicId)

```mermaid
flowchart TD
  Scan["Escanea QR o abre /a/publicId"] --> Auth{"¿gh_session?"}
  Auth -->|no| Login["/login?next=/a/publicId"]
  Login --> Scan
  Auth -->|sí| Load["getPublicActivityRegistration"]
  Load --> Exists{"¿asistencia previa?"}
  Exists -->|sí| Done["Pantalla verde: APPROVED / PENDING"]
  Exists -->|no| Token{"requireAttendanceToken?"}
  Token -->|sí y t inválido| Bad["Este QR ya no es válido"]
  Token -->|no o t ok| Win{"OPEN y ahora en ventana?"}
  Win -->|no| Closed["Registro cerrado"]
  Win -->|sí| Click["Registrar asistencia"]
  Click --> TX["insertAttendance + syncAttendanceCredit"]
  TX --> Score["recomputeActivityScores"]
  TX --> Badge["refreshBadges"]
  TX --> Notify["email + Teams"]
```

- URL pública: `/a/{publicId}`. El id interno no se expone en el QR (ADR-009).
- **QR estático:** `APP_URL/a/{publicId}` generado en admin con la librería `qrcode`. Regenerar (`rotateActivityPublicId`) cambia `publicId` y archiva el anterior: el cartel viejo deja de resolver (`getActivityByPublicId` busca el vigente).
- **QR dinámico:** admin activa token; el enlace es `/a/{publicId}?t={token}`. El estático **deja de registrar** (`assertAttendanceToken`). Rotar emite un token nuevo; el anterior falla el hash. El token no se vuelve a mostrar.
- `approvalMode=AUTO`: status APPROVED y fila `ACTIVITY` en el ledger en la misma transacción.
- `MANUAL`: PENDING, sin puntos hasta que un ADMIN apruebe.
- Duplicado: unique `(activityId, memberId)` → «Ya registraste tu asistencia.»
- Temporada CLOSED o actividad no OPEN: error de dominio.

Admin puede añadir asistencia a mano o masiva (`bulkAwardActivity`) sin ventana de registro.

## Otorgar y revertir puntos

1. **Por asistencia:** automático al pasar a APPROVED (`individualPoints`).
2. **Manual:** `/admin/points` → `assignManualPoints`. Motivo obligatorio. Negativo → tipo `PENALTY`.
3. **Masiva por actividad:** checkboxes de integrantes → asistencias APPROVED + crédito de la actividad.
4. **Reversión:** botón en el ledger → fila `REVERSAL` (`-puntos`). No borra la original. No se revierte una reversión.
5. Tras REJECTED/CANCELLED de una asistencia ya acreditada: se revierte el `ACTIVITY`. **No** se puede volver a APPROVED; hace falta ajuste manual.

## Rankings

- Integrantes autenticados: `/app/rankings` (tabs Activos / Nuevos / Comités). Periodo temporada, mes o semana ISO (`?period=week&isoWeek=2026-W33`).
- Admin: `/admin/rankings` (temporada activa, sin selector de semana).
- Puesto: ranking de competición; empate comparte lugar. Orden visual: nombre (personas) o slug (comités).
- Comité: el score de temporada solo usa actividades **cerradas o procesadas**. Mientras están OPEN, el snapshot puede existir pero el ranking de comité no lo promedio.
- Detalle público-de-app: `/app/rankings/committees/[slug]` (cualquier miembro logueado; muestra KPIs y evolución, no emails).

## Hall of Fame

Admin pone la temporada en `CLOSED` → snapshot JSON en la misma transacción → `/app/hall-of-fame` y `/hall-of-fame` listan temporadas cerradas (top 3 por tablero y comités, stats). No hay emails ni ids internos.

## Importaciones

### Integrantes (CSV/XLSX)

`/admin/imports` → vista previa (`adminPreviewImportAction`) → job PREVIEWED → confirmar (`adminCommitImportAction`). Cero errores para commit. Upsert por correo; suma comités.

### Forms histórico

Misma UI con columnas correo + actividad. O `POST /api/import/forms` con JSON y `Authorization: Bearer IMPORT_SECRET` o sesión admin. Asistencias APPROVED, duplicados omitidos.

## Exportaciones

Enlaces CSV/XLSX en admin (integrantes, asistencias, puntos, rankings, actividad) → `GET /api/admin/export/{type}`. Solo ADMIN.

## Temporada

`/admin/seasons`: crear UPCOMING o ACTIVE (falla si ya hay ACTIVE). Cambiar a CLOSED congela Hall of Fame y refresca badges. Las actividades nuevas no se pueden crear en temporada cerrada. El ledger de esa temporada permanece.

## Propuesta de líder

Líder (o admin en vista de comité) en `/app/committees/[slug]` envía `leaderProposeActivityAction` → actividad DRAFT `needsApproval`. GH General en `/admin/activities` publica (OPEN + Teams) o rechaza (CANCELLED). El líder no aprueba asistencias ni asigna puntos.

## Tema claro/oscuro

`ThemeToggle` escribe cookie `gh_theme` en cliente y servidor (`setThemeAction`). El root layout aplica `class="dark"` en `<html>`.
