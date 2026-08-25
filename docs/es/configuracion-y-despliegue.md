# Configuración y despliegue

## Requisitos

- Node.js 24 (ver `engines` en `package.json`).
- PostgreSQL 18 (Docker Compose incluido o instancia local).
- npm.

No hay Redis. No hay SQLite (ADR-001, ADR-015).

## Arranque local

```bash
cp .env.example .env
# Ajusta DATABASE_URL
npm install
npm run db:up          # Postgres 18 en :5432
npx prisma contract emit
npx prisma db init --yes
npm run db:constraints
npm run db:seed
npm run dev            # http://localhost:3000
```

`npm run db:reset` equivale a init + constraints + seed (destructivo).

Postgres Homebrew: en `.env.example` hay un comentario con `postgresql://USER@localhost:5432/ghpoints`. Docker:

```
DATABASE_URL="postgresql://ghpoints:ghpoints@localhost:5432/ghpoints"
```

Cuentas del seed (dominio = primer valor de `INSTITUTIONAL_EMAIL_DOMAINS`):

| Rol | Correo | OTP en desarrollo |
| --- | --- | --- |
| ADMIN | `gh.general@<dominio>` | `OTP_FIXED_CODE` (default `123456`) |
| Líder GEMIS | `lider.gemis@<dominio>` | igual |
| Integrante | `integrante.02@<dominio>` | igual |

Sin `RESEND_API_KEY`, el código y el magic link se imprimen en la consola del servidor.

Health: `GET /api/health` ejecuta `SELECT 1` contra Postgres. `db: "up"` o HTTP 503.

## Variables de entorno

Definidas en `.env.example` y validadas por Zod en `src/server/config/env.ts`. **No documentes valores reales.** `SESSION_SECRET` mínimo 16 caracteres.

| Variable | Obligatoria | Default / comportamiento |
| --- | --- | --- |
| `DATABASE_URL` | Sí | URL Postgres |
| `SESSION_SECRET` | Sí | Firma hashes de sesión, OTP, Entra state, token de asistencia |
| `APP_URL` | Sí | URL pública (QR, magic link, redirect Entra) |
| `INSTITUTIONAL_EMAIL_DOMAINS` | Sí | Lista coma-separada |
| `APP_TIMEZONE` | No | `America/Bogota` — display y ventanas semana/mes |
| `EMAIL_FROM` | No | `GH Points <noreply@localhost>` |
| `RESEND_API_KEY` | No | Vacío → adapter consola |
| `OTP_TTL_SECONDS` | No | `600` |
| `OTP_FIXED_CODE` | No | Solo si `NODE_ENV !== production` |
| `MAGIC_LINK_SECRET` | No | Vacío → `SESSION_SECRET` |
| `IMPORT_SECRET` | No | Bearer de import Forms; si vacío, solo sesión admin |
| `AUTH_PROVIDERS` | No | `email_otp`. Añadir `entra` para SSO |
| `ENTRA_CLIENT_ID` | Si Entra | |
| `ENTRA_CLIENT_SECRET` | Si Entra | |
| `ENTRA_TENANT_ID` | Si Entra | GUID, `organizations` o `common` |
| `ENTRA_ALLOWED_TIDS` | Si tenant multi | tids permitidos |
| `TEAMS_WEBHOOK_URL` | No | Vacío → no-op (`docs/teams.md`) |
| `NODE_ENV` | Next | `development` \| `production` \| `test` |
| `PLAYWRIGHT_BASE_URL` | E2E | default `http://localhost:3000` |

`getEnv()` cachea el parseo; `resetEnvCache()` existe para tests.

Entra: redirect a registrar `{APP_URL}/api/auth/entra/callback`. Guía: [`docs/entra-sso.md`](../entra-sso.md).

## Docker Compose

`docker-compose.yml`: un servicio `db` (`postgres:18-alpine`), user/password/db `ghpoints`, puerto 5432, volumen `ghpoints_pg18` montado en `/var/lib/postgresql` (layout de Postgres 18), healthcheck `pg_isready`. No incluye la app Next: solo la base.

```bash
npm run db:up      # docker compose up -d
npm run db:down    # docker compose down
```

Si el volumen local tiene un esquema viejo, `docker compose down -v` y luego `npm run db:reset`.

## Scripts npm (`package.json`)

| Script | Qué hace |
| --- | --- |
| `dev` / `build` / `start` | Next. `prebuild` emite el contrato (`prisma contract emit`) |
| `lint` | `eslint && oxlint` |
| `typecheck` | `tsc --noEmit` |
| `db:up` / `db:down` | Compose |
| `db:generate` / `contract:emit` | `prisma contract emit` |
| `db:init` | `prisma db init` (base vacía) |
| `db:migrate` | `prisma db update` (local, aplica el contrato) |
| `db:deploy` | `prisma db migrate` (producción, tras un plan) |
| `db:constraints` | Uniques parciales (`src/prisma/apply-constraints.ts`) |
| `db:seed` | `tsx --conditions=react-server prisma/seed.ts` |
| `db:prune` | Borra sesiones vencidas y retos de login de más de 24 h |
| `db:reset` | `prisma db init --yes` + constraints + seed (destructivo) |
| `test` | Vitest **solo** `tests/unit` |
| `test:watch` | Vitest watch (unit + integration según include) |
| `test:integration` | Vitest `tests/integration` (necesita `DATABASE_URL` postgres) |
| `test:e2e` | Playwright; levanta `npm run dev` si no hay servidor |

La condición `react-server` en seed y prune hace que `server-only` resuelva a su módulo vacío; sin ella el proceso muere al importar módulos de dominio.

## Config de build y calidad

- `next.config.ts`: Prisma y `pg` como paquetes externos del server; Turbopack root = repo; cabeceras de seguridad estáticas (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS en producción).
- `src/proxy.ts` (convención de Next 16; antes `middleware.ts`): redirect por presencia de cookie **y** CSP con nonce por request, en modo enforce (ADR-022).
- `tsconfig.json`: paths `@/*` → `src/*`, strict.
- `vitest.config.ts`: alias `@` y `server-only` → `tests/empty.ts`.
- `playwright.config.ts`: Chromium, `fullyParallel: false`, `reuseExistingServer: true`.
- `.oxlintrc.json`: plugin anti-slop en `tools/oxlint/anti-slop`; ignora `src/components/ui/**`.
- `components.json`: shadcn.
- `.github/workflows/ci.yml`: job `static` (lint + typecheck + unit) y job `integration` con Postgres 18, `prisma db init`, constraints y seed. Node 24.

## Persistencia de configuración de negocio

Además del env, `AppConfig` en Postgres guarda `committee_credit_strategy` (editable en `/admin/settings`). El seed también escribe `timezone`, pero la UI de fechas usa `APP_TIMEZONE`.

## Producción (lo que el código asume)

- `NODE_ENV=production`: cookie `Secure`, OTP aleatorio (ignora `OTP_FIXED_CODE`), CSP en enforce con HSTS.
- **`TZ=UTC` en el proceso.** Los helpers de `src/lib/dates.ts` hacen el round-trip a través de la zona local del proceso; con `TZ=UTC` no hay DST que pueda desplazar el inicio de semana o de mes. La zona de *presentación* sigue siendo `APP_TIMEZONE` (ADR-013). El test `tests/unit/timezone.test.ts` fija el proceso en una zona con DST para que una regresión no pase desapercibida.
- Contrato y schema: `prisma contract emit` en `prebuild`; en el servidor, `prisma db migrate` y `npm run db:constraints` si la base es nueva o cambió el contrato.
- Purga periódica: `npm run db:prune` desde un cron (la app también la lanza, como mucho una vez por hora y por instancia, al crear sesión).
- Healthcheck HTTP: `/api/health`.
- No hay Dockerfile de la app en este repo; Compose es solo Postgres.
- `.gitignore` ignora `.env`, DBs SQLite residuales, `.next`, reportes Playwright.

## Notificaciones

Si hay `RESEND_API_KEY`, login y eventos de asistencia salen por Resend. Si hay `TEAMS_WEBHOOK_URL`, se POSTea `{ text }` al Incoming Webhook. Fallos de entrega no revierten el dominio (ADR-020).
