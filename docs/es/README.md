# Documentación de GH Points (español)

GH Points es la plataforma de **asistencia, ledger de puntos y rankings** de una organización estudiantil. Sustituye el flujo Microsoft Forms → Excel → asignación manual. El integrante de negocio es `Member`; la autenticación (OTP, magic link o Entra) es un canal hacia esa identidad.

Este directorio describe el código tal como está en el repositorio. El glosario de nombres de dominio vive en [`CONTEXT.md`](../../CONTEXT.md). Las decisiones que congelan costuras están en [`docs/decisions.md`](../decisions.md). El backlog (fórmulas alternativas, deuda) está en [`docs/backlog.md`](../backlog.md).

## Guía de lectura

1. **Arranque y operación:** [configuracion-y-despliegue.md](./configuracion-y-despliegue.md) — variables, Docker, scripts, seed.
2. **Cómo está armada la app:** [arquitectura.md](./arquitectura.md) — capas, request, server actions vs API.
3. **Vocabulario persistido:** [modelo-de-datos.md](./modelo-de-datos.md) — contrato Prisma, índices, uniques parciales.
4. **Quién entra y con qué rol:** [autenticacion-y-autorizacion.md](./autenticacion-y-autorizacion.md).
5. **Reglas de negocio:** [dominio.md](./dominio.md) — cada módulo de `src/server/domain/`.
6. **Historias extremo a extremo:** [flujos.md](./flujos.md).
7. **Mapa de URLs:** [paginas-y-rutas.md](./paginas-y-rutas.md).
8. **Cómo se ve y por qué:** [diseno.md](./diseno.md) — tokens, tipografía, la banda del marcador, piso de accesibilidad.
9. **Qué cubren los tests:** [testing.md](./testing.md).

Si llegas a un término en mayúsculas (Integrante, Temporada, Ledger, Score de comité), léelo primero en `CONTEXT.md`.

## Índice

| Documento | Contenido |
| --- | --- |
| [arquitectura.md](./arquitectura.md) | Capas `app` / `server` / `domain`, proxy, patrones |
| [modelo-de-datos.md](./modelo-de-datos.md) | Contrato, relaciones, índices, diagrama |
| [autenticacion-y-autorizacion.md](./autenticacion-y-autorizacion.md) | OTP, magic link, Entra, sesiones, RBAC |
| [dominio.md](./dominio.md) | Scoring, puntos, asistencia, badges, rankings, import/export |
| [flujos.md](./flujos.md) | Login, QR, puntos, temporada, importaciones |
| [paginas-y-rutas.md](./paginas-y-rutas.md) | Rutas públicas, `/app`, `/admin`, `/api` |
| [diseno.md](./diseno.md) | Dirección «Marcador»: color, tipografía, componentes, accesibilidad |
| [configuracion-y-despliegue.md](./configuracion-y-despliegue.md) | Env, Docker, npm, health, local |
| [testing.md](./testing.md) | Unit, integration, e2e |

## Documentos hermanos (no duplicar)

Estos archivos ya existían y se mantienen como fuente de verdad de **decisiones** y **operación externa**:

- [`CONTEXT.md`](../../CONTEXT.md) — glosario de costuras del dominio.
- [`docs/decisions.md`](../decisions.md) — ADR-001 a ADR-025.
- [`docs/backlog.md`](../backlog.md) — P0–P3 hecho, fórmulas alternativas, deuda.
- [`docs/entra-sso.md`](../entra-sso.md) — cómo encender OIDC.
- [`docs/teams.md`](../teams.md) — webhook Incoming de Teams.

## Mapa rápido del código

```
src/app/                 páginas App Router y rutas API
src/server/domain/       reglas de negocio (I/O + módulos *-pure.ts)
src/server/auth/         OTP, sesión, Entra, secretos
src/server/actions/      server actions (FormData → dominio)
src/server/config/       env Zod + AppConfig en DB
src/server/db/           cliente Prisma, errores unique, tipos
src/prisma/              contrato, runtime, uniques parciales
src/components/          UI (shadcn + bloques de producto)
src/lib/                 helpers puros (fechas, publicId, texto)
prisma/                  seed y prune
tests/                   unit / integration / e2e
```
