# Decisiones arquitectónicas — GH Points

Registro de supuestos del MVP. Las decisiones reversibles se pueden cambiar sin reescribir el ledger: los insumos crudos (asistencias, membresías históricas, transacciones) se conservan.

Cómo está implementado hoy: [docs/es/README.md](es/README.md).

## ADR-001 — Prisma + PostgreSQL

**Decisión:** Prisma sobre Drizzle; PostgreSQL, no SQLite.

**Por qué:** el prototipo ya usaba Prisma. PostgreSQL aporta unique parciales, JSON de auditoría y concurrencia real para el QR masivo. SQLite no es aceptable en producción para este caso.

## ADR-002 — Auth propia (OTP), no Supabase Auth ni NextAuth

**Decisión:** correo institucional + OTP de 6 dígitos, sesión opaca en cookie HttpOnly, tabla `IdentityAccount`.

**Por qué:** el dominio no debe depender del proveedor. Entra SSO se agrega después como otro `AuthProvider`. Supabase Auth y NextAuth acoplarían el modelo de usuario al vendor.

OTP (no magic link) era el canal principal del MVP: al escanear un QR en el teléfono es más fácil copiar un código de 6 dígitos que abrir un enlace en otro contexto.

**Actualización:** el magic link es un canal paralelo. El mismo correo de login incluye código OTP y enlace firmado. Misma sesión, mismo rate limit y TTL.

## ADR-003 — Ledger inmutable; totales derivados

**Decisión:** `PointTransaction` es la fuente de verdad. Los rankings hacen `SUM(points)` por temporada. No hay `member.points` persistido.

**Por qué:** auditoría y reversiones. Corregir un error es crear un `REVERSAL`, nunca borrar ni editar la transacción original.

## ADR-004 — Una temporada ACTIVE

**Decisión:** unique parcial en PostgreSQL: solo una fila `Season` con `status = ACTIVE`.

**Por qué:** el brief pide una temporada activa salvo razón explícita. Cerrar no borra datos.

## ADR-005 — Score de comité = participación relativa

**Decisión:** por actividad, `attendeeCredit / eligibleMemberCount`. Score de temporada = promedio simple de esas tasas en actividades `CLOSED` o `PROCESSED`.

**No se usa** la fórmula del prototipo `round(puntosActividad * asistentes / tamaño)` ni el mínimo de 2 asistentes. Esas variantes viven en `docs/backlog.md`.

**Por qué:** el brief pide evitar que un comité grande gane por volumen bruto, y pide encapsular la fórmula en `CommitteeScoringService`.

Los snapshots (`CommitteeActivityScore`) guardan numerador, denominador y tasa, de modo que una fórmula futura puede recalcularse.

## ADR-006 — FULL_CREDIT para multicomité

**Decisión:** default `committee_credit_strategy = FULL_CREDIT`.

**Por qué:** reproduce Forms, donde el estudiante marcaba todos sus comités. `FRACTIONAL_CREDIT` está implementado en el servicio y se activa por `AppConfig`.

Una persona en GEMIS + PIXEL que asiste cuenta 1.0 en ambos.

## ADR-007 — Membresía histórica en el crédito

**Decisión:** el numerador usa membresías vigentes en `Attendance.registeredAt` (`joinedAt <= registeredAt` y `leftAt` nulo o posterior). El denominador de una actividad se congela al pasar a `CLOSED`/`PROCESSED`.

**Por qué:** un cambio de comité a mitad de semestre no debe reescribir la historia ni inflar el denominador a posteriori.

## ADR-008 — Rankings individuales

**Decisión:** tableros separados `NEW` y `ACTIVE`. Solo `Member.status = ACTIVE`. Ranking oficial = temporada activa. Empate = mismo puesto (1, 2, 2, 4). Orden visual de empate: `fullName` ASC.

Si un integrante pasa de NEW a ACTIVE a mitad de temporada, **cambia de tablero** con el mismo saldo. No se reescriben transacciones.

## ADR-009 — IDs públicos de actividad

**Decisión:** `Activity.publicId` (nanoid) en la URL `/a/{publicId}`. Los IDs internos `cuid(2)` no se exponen en QR ni rankings.

Rotar `publicId` invalida QR impresos y deja el id anterior en `ActivityPublicIdHistory`. El QR dinámico (P3) es un token rotativo opcional (`requireAttendanceToken`); el enlace estático `/a/{publicId}` sigue funcionando hasta que se active.

## ADR-010 — Autorización en servidor, no en middleware Edge

**Decisión:** el middleware solo comprueba presencia de cookie (UX de redirect). `AuthorizationService` + `getCurrentActor()` validan sesión, estado del integrante y roles en runtime Node.

**Por qué:** la cookie no es prueba de autorización.

**Actualización (Next 16):** el archivo pasó a `src/proxy.ts` y el proxy corre **siempre en runtime Node**, así que el motivo original («Prisma no corre de forma fiable en Edge») ya no aplica. La decisión no cambia: la autorización pertenece al dominio, no al transporte. Moverla al proxy añadiría una consulta a la base por request y duplicaría lo que ya validan `getCurrentActor` y `AuthorizationService`.

## ADR-011 — COMMITTEE_LEADER

**Decisión:** el rol existe, ve roster/analytics de sus comités y **propone** actividades `DRAFT` que un ADMIN publica. No muta puntos ni aprueba asistencias.

**Por qué:** el líder conoce la operación del comité; las mutaciones sensibles siguen en GH General.

## ADR-012 — Email: adapter

**Decisión:** `EmailSender` con implementación `console` (dev) y `resend` (prod). `OTP_FIXED_CODE` solo si `NODE_ENV !== production`, para E2E.

## ADR-013 — Timezone

**Decisión:** timestamps en UTC. Display y ventanas de “semana/mes” en `APP_TIMEZONE` (default `America/Bogota`). Las ventanas de registro se comparan con `new Date()` del servidor.

## ADR-014 — Privacidad

**Decisión:** rankings nunca incluyen email, IDs internos ni auditoría. El integrante ve sus propios datos. Admin según RBAC.

## ADR-015 — No migrar SQLite del prototipo

**Decisión:** schema nuevo. Adopción por CSV/XLSX. Seed sintético, sin PII real.

## ADR-016 — Magic link paralelo al OTP

**Decisión:** `AuthChallenge.kind` distingue `OTP` y `MAGIC_LINK`. Un pedido de login crea ambos y envía un solo correo. Consumir uno consume los demás retos abiertos de ese correo.

## ADR-017 — Badges y niveles derivados del ledger

**Decisión:** los badges se otorgan de forma idempotente (`MemberBadge` único por integrante/badge/temporada/periodo) a partir de asistencias aprobadas, `SUM(points)` y rankings. Los niveles (0/100/250/500/1000) no se persisten; se calculan al leer.

## ADR-018 — Hall of Fame al cerrar temporada

**Decisión:** `updateSeasonStatus(CLOSED)` y el snapshot `HallOfFameSeason` van en la misma transacción. Los rankings públicos del salón no incluyen email ni ids internos.

## ADR-019 — Entra SSO opcional

**Decisión:** OIDC con variables de entorno. Si faltan, la app arranca solo con OTP. Allowlist de `tid`, vinculación a `Member` por correo institucional, sin Graph. Fallback OTP si Entra falla.

## ADR-020 — Notificaciones sin tracking

**Decisión:** email (Resend o consola) y webhook de Teams opcional (`TEAMS_WEBHOOK_URL`). Fallos de entrega no revierten el dominio. Sin geolocalización.

## ADR-021 — Trabajo derivado post-commit en el registro de asistencia

**Decisión:** `registerAttendance` retorna cuando la transacción de `Attendance` + `PointTransaction` hace commit. El Score de comité y los badges se recalculan **después**, mediante `scheduleAttendanceEffects` (`after()` de Next dentro de un request; fire-and-forget fuera de él), coalescidos por `activityId` y por integrante.

**Por qué:** cientos de escaneos simultáneos del mismo QR ejecutaban, cada uno y dentro del request, un recompute de todos los comités (~17 upserts sobre filas compartidas) más cuatro agregaciones completas de ranking. Serializaba por contención de filas.

Además, el `catch` de duplicados envolvía ese trabajo derivado: una unique del snapshot de comité se le mostraba al integrante como «Ya registraste tu asistencia» aunque el registro sí se había creado.

**Consecuencia:** Asistencia y Ledger siguen siendo inmediatos y transaccionales; **Score de comité y badges son eventualmente consistentes** respecto al registro (segundos). Las rutas administrativas (aprobar, rechazar, anular, alta manual) usan la variante `runAttendanceEffects`, que sí se espera, para que el admin vea datos frescos al recargar.

`recomputeActivityScores` deja de materializar todos los comités con sus membresías: cuenta elegibles con `groupBy` y delega el cálculo a `computeCommitteeSnapshots` en `scoring-pure`, que es puro y testeable.

## ADR-022 — Cabeceras de seguridad y saneamiento de salidas

**Decisión:** `next.config.ts` emite `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` y `Strict-Transport-Security` (solo producción). La **CSP se emite desde `src/proxy.ts`** y está en modo **enforce**.

**Por qué:** el proxy genera un nonce por request, lo propaga en la cabecera `Content-Security-Policy` de la petición y de la respuesta. Next extrae el nonce de esa cabecera y lo estampa en sus scripts inline, así que `script-src` puede quedar en `'self' 'nonce-…' 'strict-dynamic'` sin `unsafe-inline`.

`style-src` conserva `'unsafe-inline'`: Next y Tailwind inyectan etiquetas de estilo inline y hoy no hay ruta de nonce para ellas. En desarrollo se añaden `'unsafe-eval'` (refresh de Next) y `ws:`/`wss:` (HMR).

Complementos de la misma decisión: los destinos de redirect se validan con `safeRedirectPath` (rechaza `//host` y `/\host`), las celdas de texto de CSV/XLSX se neutralizan si empiezan por `= + - @`, y los nombres interpolados en el HTML de los correos se escapan.

## ADR-024 — Sin `loading.tsx` en los segmentos con guard de sesión

**Decisión:** `error.tsx`, `global-error.tsx` y `not-found.tsx` en toda la app; `loading.tsx` **solo** donde el segmento no tiene un layout con guard: `/a/[publicId]`.

**Por qué:** en Next 16.1.6 con Turbopack, un `loading.tsx` en `/app` o `/admin` produce un error de hidratación recuperable — el servidor emite `<main>` donde el cliente espera el `<Suspense>` que introduce el boundary. Verificado en navegador: el fallo aparece con cualquier `loading.tsx` en esos segmentos (incluso uno que solo devuelve un `<p>`), desaparece al quitarlo, y **no** ocurre en `/login` ni en `/a/[publicId]`, cuyos layouts no llaman a `requirePageActor` / `requirePageAdmin`.

El disparador es la combinación de layout `async` que puede hacer `redirect()` con el boundary de Suspense. Un error de hidratación recuperable hace que React descarte y vuelva a renderizar el árbol en cliente: peor que no tener esqueleto.

**Los estados de carga que el usuario realmente ve siguen ahí**: `ClientForm` y `RegisterAttendanceButton` usan `useTransition` con el fieldset deshabilitado durante cada mutación.

Revisar cuando suba la versión de Next: la repro está en `docs/backlog.md`.

## ADR-023 — Una sola decisión sobre Asistencia, y notificación simétrica

**Decisión:** `decideAttendance({ actor, attendanceIds, to, reason, ip })` reemplaza a `approveAttendance`, `rejectAttendance`, `cancelAttendance`, `bulkApproveAttendances` y `bulkRejectAttendances`. Singular y masivo son el mismo camino con 1 o N ids.

**Por qué:** los cinco repetían `requireAdmin → cargar → transición → transacción → audit → efectos` y habían divergido en silencio: solo el bulk validaba las transiciones antes de abrir la transacción, los retornos eran distintos, y **aprobar una asistencia notificaba al integrante mientras aprobar cuarenta no notificaba a nadie**.

**Conducta unificada:**

- Todas las transiciones se validan antes de la transacción: un id inválido en el lote no aplica ninguno.
- Una transacción para todo el lote.
- `reason` obligatorio solo para `CANCELLED`.
- Una entrada de auditoría por asistencia.
- **Aprobar siempre notifica**, para 1 y para N. El despacho sale por el seam post-commit (`dispatchAppEvent`), así que cuarenta correos no bloquean al admin, y los destinatarios se cargan en una sola consulta.

Consecuencia operativa: una aprobación masiva de N integrantes envía N correos. Es deliberado — el integrante se entera de sus puntos por el mismo canal, lo decidan solo o en bloque.

## ADR-025 — Estados de vida y tope de 3 comités

**Decisión:** `MemberStatus` es el eje de vida (`ACTIVE` vigente, `ON_LEAVE` licencia, `HONORARY` honorario, `INACTIVE` retirado). `MemberType` sigue siendo solo el tablero (NEW / ACTIVE). Un integrante vigente pertenece a 1–3 comités; al salir, la fila queda con `leftAt` y se muestra como «Perteneció a».

**Puntos:** el ledger individual no se parte. El crédito de comité sí, según `committee_credit_strategy` y cuántos comités tenía la persona *el día de la asistencia* (ADR-006 + ADR-007). FULL_CREDIT: 1,0 a cada comité. FRACTIONAL_CREDIT: 1/n a cada uno.

**Login:** vigente y honorario. Ranking, badges y denominador de comité: solo vigente. Licencia y retiro destruyen sesiones.

