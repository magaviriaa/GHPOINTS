# Backlog — GH Points

Funcionalidades deliberadamente fuera del núcleo o pendientes de operación externa.

Documentación del código actual: [docs/es/README.md](es/README.md).

## Hecho en esta entrega (P0–P3)

- Roles ADMIN / COMMITTEE_LEADER / MEMBER en UI de integrantes.
- Magic link paralelo al OTP.
- Cola de aprobación: el líder propone `DRAFT`, el admin publica.
- Export XLSX además de CSV (integrantes, asistencias, puntos, rankings, actividad).
- Import histórico Microsoft Forms CSV/XLSX en `/admin/imports`.
- Rechazo masivo de asistencias.
- Selector de semana ISO en rankings.
- Historial de `publicId` al rotar QR; token dinámico opcional.
- Badges, niveles derivados, Hall of Fame al cerrar temporada.
- Entra SSO opcional (OIDC) con fallback OTP.
- Notificaciones email + webhook de Teams opcional.
- Dark mode persistido en cookie.
- Health con chequeo de Postgres.

## Pase de endurecimiento (post-auditoría)

- Redirects validados (`safeRedirectPath`), CSV/XLSX sin formula injection, HTML de correos escapado, cabeceras de seguridad + CSP Report-Only (ADR-022).
- Validación Zod de actividades (puntos, fechas, ventana).
- Trabajo derivado del registro fuera del request y coalescido (ADR-021); `recomputeActivityScores` sin materializar miembros.
- `error.tsx` / `global-error.tsx` / `not-found.tsx` en App Router; `loading.tsx` solo donde no rompe (ADR-024).
- CI en GitHub Actions (lint + typecheck + unit, e integration con Postgres) y script `typecheck`.
- anti-slop completo: las 15 reglas del skill en `error`.

## Segundo pase (post-auditoría)

- `proxy.ts` (convención de Next 16) y CSP en **enforce** con nonce por request (ADR-022).
- `getMemberBoardPosition`: el dashboard y los badges piden un puesto en vez de un tablero completo.
- `decideAttendance`: una sola decisión sobre Asistencia; aprobar notifica siempre (ADR-023).
- Salón de la fama público con su propia cabecera; bearer de import con comparación en tiempo constante; purga de sesiones y retos vencidos (`npm run db:prune`); `TZ=UTC` fijado y cubierto por test.

## Fórmulas de comité alternativas

El prototipo usaba:

```
awarded = round(puntosActividad * asistentes / tamañoComité)
mínimo 2 asistentes o 0 puntos
```

No está en el core. Para activarla haría falta una estrategia en `CommitteeScoringService` (p. ej. `WEIGHTED_ACTIVITY_POINTS`) leyendo `AppConfig`, sin tocar el ledger individual.

Otras fórmulas futuras (brief §28), no hay editor matemático:

- Participación relativa 60%
- Asistencia sostenida 20%
- Objetivos 10%
- Actividades especiales 10%

## Fuera de alcance / operación

- Redis solo si el rate limit en DB o el pool de Postgres se vuelven un problema medido.
- El coalescing de efectos (ADR-021) y el throttle de la purga son por instancia de proceso. Con varias instancias cada una hace su pasada; ambas operaciones son idempotentes, así que coordinarlas exigiría infraestructura sin necesidad medida.
- Power Automate → `POST /api/import/forms` en producción (el endpoint y la UI admin ya existen).
- Graph / sincronización de directorio (sigue prohibido; el roster es la whitelist).

## Deuda consciente

- Rate limit de OTP/magic link es por filas `AuthChallenge`, no distribuido.
- `loading.tsx` en `/app` y `/admin` está bloqueado por un error de hidratación de Next 16.1.6 (ADR-024). **Repro:** crear `src/app/admin/loading.tsx` que devuelva `<p>Cargando…</p>`, abrir `/admin/points` con la consola abierta → «Hydration failed», con el diff `+ <main className="min-w-0 flex-1 p-4 md:p-8">` / `- <Suspense>` apuntando a `admin/layout.tsx:12`. Reintentar al subir de versión.
- El coalescing de efectos es por instancia de proceso; con varias instancias cada una hace su recompute (idempotente, pero no compartido).
- Totales de ranking se agregan en query; no hay materialized view.
- E2E cubre login, registro, rankings y creación admin; no toda la matriz de roles.
