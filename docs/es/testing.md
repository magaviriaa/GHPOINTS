# Testing

Tres niveles. `npm test` **no** corre integration ni e2e.

```bash
npm test                  # tests/unit
npm run test:integration  # tests/integration (Postgres)
npm run test:e2e          # Playwright
```

Vitest (`vitest.config.ts`) incluye `tests/unit/**/*.test.ts` y `tests/integration/**/*.test.ts`, environment Node, alias `@` → `src`. El módulo `server-only` se stubbea con `tests/empty.ts` para poder importar dominio en tests.

Los integration se **saltan** si `DATABASE_URL` no empieza por `postgres` (`describe.skipIf`). Vitest corre esos archivos **en serie** (`fileParallelism: false`): todos escriben en la misma base y en paralelo `boardSize` y similares fallan por filas ajenas.

## Unitarios — `tests/unit/domain.test.ts`

Sin base de datos. Cubren funciones puras y contratos de error:

- Scoring: FULL_CREDIT vs FRACTIONAL, participación relativa (comité pequeño gana a uno grande con más cabezas), eligible 0 → 0, promedio, membresía histórica, freeze del denominador.
- Ranking: 1, 2, 2, 4; desempate por nombre.
- Transiciones de asistencia (`assertAttendanceTransition`) y código `CONFLICT`.
- Whitelist de email y `normalizeEmail`.
- `parseEnum` de FormData.
- RBAC de `COMMITTEE_LEADER` vs ADMIN.
- Parseo CSV de import: columnas felices, header desconocido, falta correo.
- Niveles 0/100/250/500/1000.
- Badges: racha 3, 500 puntos, top 10, MVP empatado, MVP 0 no otorga.
- Entra: allowlist `organizations`, matching de tid, email desde claims.
- Semana ISO: parseo y rango de 7 días.
- `rankingWindow`: temporada sin ventana, mes/semana desde `APP_TIMEZONE`, semana ISO explícita, y fallback si la semana es basura.
- Identidad de puesto: `1 + count(total estrictamente mayor)` = `competitionRanks` para cada entrada, empates incluidos.

## Unitarios — `tests/unit/hardening.test.ts`

- `safeRedirectPath`: acepta rutas same-origin con query; rechaza `//host`, `/\host`, URLs absolutas y `javascript:`.
- `escapeSpreadsheetCell`: neutraliza `=`, `+`, `-`, `@`; deja números y `null` intactos.
- `escapeHtml` sobre nombres con markup.
- `parseActivityFields`: NaN, negativos, fraccionarios, nombre vacío (`VALIDATION`), ventana invertida, fecha inválida.
- `computeCommitteeSnapshots`: FULL vs FRACTIONAL, membresía terminada antes de la asistencia, denominador congelado, y el caso del brief (CAS 6/10 supera a GEMIS 12/30).

## Unitarios — `tests/unit/idempotency.test.ts`

`isUniqueConstraint` reconoce la unique de Postgres (`sqlState === "23505"`). El mensaje `ALREADY_REGISTERED` es el contrato de duplicado de asistencia.

## Unitarios — `tests/unit/timezone.test.ts`

Ventanas de semana/mes con el proceso en una zona con DST. `isPast` no trata un timestamptz con offset (p. ej. `-05:00`) como vencido frente al mismo instante en `Z`.

## Integración — Postgres

Crean filas con timestamp en correo/nombre y las borran en `afterAll`.

| Archivo | Qué afirma |
| --- | --- |
| `tests/integration/attendance-credit.test.ts` | Aprobar crea una fila `ACTIVITY` de 20 pts; re-aprobar no duplica; rechazar deja neto 0; re-aprobar tras REJECTED lanza `CONFLICT`. |
| `tests/integration/attendance-unique.test.ts` | Segundo `Attendance.create` del mismo par viola unique (`23505`). Usa una actividad OPEN y un miembro no admin del seed si existen. |
| `tests/integration/inactive-members.test.ts` | `getInactiveMembers(21)` incluye un ACTIVE recién creado sin asistencias. |
| `tests/integration/decide-attendance.test.ts` | Lote de 3 aprobaciones: 3 filas APPROVED, 3 créditos `ACTIVITY`, 3 entradas de auditoría y **3 correos**; un id inexistente en el lote no aplica ninguno; cancelar sin motivo lanza `REASON_REQUIRED`. |
| `tests/integration/member-board-position.test.ts` | `getMemberBoardPosition` coincide con el tablero completo en total, puesto y tamaño para cada entrada; el integrante sin transacciones queda fuera (`rank: null`); sin `board` abarca ambos tableros. |
| `tests/integration/concurrent-registration.test.ts` | 8 `registerAttendance` en paralelo sobre el mismo QR: una sola `Attendance`, 7 `ALREADY_REGISTERED`, 20 puntos netos. Espera los efectos post-commit antes de limpiar. |
| `tests/integration/p1-p2.test.ts` | Bulk reject no crea puntos; `setMemberRoles` asigna líder y conserva MEMBER; cerrar temporada persiste `HallOfFameSeason`; se puede dar y quitar ADMIN si queda otro GH General. |

## E2E — `tests/e2e/happy-path.spec.ts`

Playwright Chromium. Arranca `npm run dev` si no hay servidor. Asume seed + `OTP_FIXED_CODE`.

1. Integrante `integrante.02@<dominio>`: login OTP → `/app/activities` → abre una tarjeta con «pts» → CTA registrar o ya registrado → `/app/rankings` muestra «Podio».
2. Admin `gh.general@<dominio>`: llega a `/admin` Overview; visita actividades; si hay botón Aprobar en asistencias, lo pulsa.
3. Admin crea actividad `E2E Athletic {stamp}` MANUAL y aparece en el listado.
4. El enlace `/a/{publicId}?t=...` abierto sin sesión conserva la query a través del login (regresión de ADR-009 + QR dinámico).
5. Admin crea actividad MANUAL → un integrante se registra por el enlace público → admin aprueba en bloque desde la actividad y la fila queda `APPROVED` (cablea `adminBulkApproveAction` → `decideAttendance`).

No cubre la matriz completa de roles (líder, Entra, import, QR dinámico, Hall of Fame UI). Eso está anotado en `docs/backlog.md`.

Playwright arranca el server con `OTP_MAX_PER_EMAIL`/`OTP_MAX_PER_IP` altos (`playwright.config.ts`): la suite entra varias veces con las mismas cuentas del seed y el rate limit de producción la cortaría.

## Cómo correr con evidencia

Unitarios: no necesitan `.env` de base (salvo que un import de env falle al cargar módulos que llaman `getEnv`; los tests puros no lo hacen). Integration: misma `DATABASE_URL` que la app, preferiblemente una base de desarrollo con `db init` + constraints + seed. E2E: app en 3000, seed aplicado, `INSTITUTIONAL_EMAIL_DOMAINS` coherente con los correos del test (`eafit.edu.co` por defecto en el spec si la env falta).

## Lo que no hay

- No hay tests automáticos de `src/proxy.ts` (redirect por cookie y cabecera CSP). Se verifica a mano con `curl -sI`.
- No hay tests de Resend ni del webhook de Teams (son fire-and-forget).
- `tests/empty.ts` no es un caso de prueba: es el stub de `server-only`.
