# GH Points

Plataforma de gamificación, asistencia y GH Points para una Organización Estudiantil. Reemplaza el flujo Microsoft Forms → Excel → puntos manuales.

El MVP funciona **sin** acceso administrativo al tenant de Microsoft 365. La autenticación es correo institucional + OTP.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Node 24, PostgreSQL 18, Prisma
- Tailwind CSS 4 + shadcn/ui
- Zod, Vitest, Playwright

## Arranque local

```bash
cp .env.example .env
# Ajusta DATABASE_URL: Docker Compose o Postgres local (Homebrew)
npm install
npm run db:up          # si usas Docker
# o inicia Postgres local y crea la base `ghpoints`
npx prisma contract emit
npx prisma db init --yes
npm run db:constraints
npm run db:seed
npm run dev
```

`npm run db:reset` hace init + constraints + seed en un paso (destructivo).

En desarrollo, `OTP_FIXED_CODE=123456` evita depender de un proveedor de correo. El adapter de email escribe el código y el enlace mágico en consola si no hay `RESEND_API_KEY`.

Login de administración (mismo OTP, rol ADMIN en seed):

- correo: `gh.general@<dominio de INSTITUTIONAL_EMAIL_DOMAINS>`
- código: `123456`

Un integrante de prueba: `integrante.02@<dominio>`.
Líder de GEMIS: `lider.gemis@<dominio>`.

Entra SSO y Teams son opcionales: si las variables están vacías, la app arranca igual. Health: `GET /api/health` comprueba Postgres.

## Variables

Ver `.env.example`. El dominio institucional **no** va hardcodeado: `INSTITUTIONAL_EMAIL_DOMAINS`.

Nuevas (todas opcionales salvo que se indique):

- `MAGIC_LINK_SECRET` — si vacío, usa `SESSION_SECRET`
- `AUTH_PROVIDERS` — default `email_otp`; añade `entra` para SSO
- `ENTRA_CLIENT_ID` / `ENTRA_CLIENT_SECRET` / `ENTRA_TENANT_ID` / `ENTRA_ALLOWED_TIDS`
- `TEAMS_WEBHOOK_URL` — incoming webhook; si vacío, no-op

## Documentación

La guía completa en español (arquitectura, modelo de datos, dominio, flujos, rutas, tests) está en **[docs/es/README.md](docs/es/README.md)**. Empieza por ahí si vas a tocar el código.

También:

- [Glosario de dominio](CONTEXT.md)
- [Decisiones (ADR)](docs/decisions.md)
- [Backlog](docs/backlog.md)
- [Entra SSO](docs/entra-sso.md)
- [Teams webhook](docs/teams.md)

## Tests

```bash
npm test
npm run test:e2e
```

## Importación Forms

`POST /api/import/forms` con `Authorization: Bearer $IMPORT_SECRET` o sesión admin.
