# Teams (opcional)

GH Points no usa Microsoft Graph ni permisos de tenant. Si existe `TEAMS_WEBHOOK_URL` (Incoming Webhook del canal), se envía un mensaje de texto cuando hay una asistencia nueva o una actividad publicada. Si la variable está vacía, no hace nada.

Los eventos concretos (`ATTENDANCE_REGISTERED`, `ATTENDANCE_APPROVED`, `ACTIVITY_OPENED`) están en `src/server/notify/events.ts`. Narrativa: [docs/es/dominio.md](es/dominio.md).
