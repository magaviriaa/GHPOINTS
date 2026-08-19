# Integración: Microsoft Entra ID (OIDC)

GH Points funciona **sin** Entra. El OTP (y el magic link) bastan. Entra es opcional y se enciende con variables de entorno.

Detalle de sesión, PKCE y matching a `Member`: [docs/es/autenticacion-y-autorizacion.md](es/autenticacion-y-autorizacion.md).

```
Email OTP / magic link ──┐
                         ├── IdentityAccount → Member
Microsoft SSO ───────────┘
```

La aplicación nunca trata el `oid` de Microsoft como el ID de negocio. El integrante es `Member`. El proveedor es `IdentityAccount`.

## Encender SSO

1. App registration (redirect `https://<app>/api/auth/entra/callback`).
2. Permisos delegados: `openid`, `profile`, `email`. **No** `User.Read.All`.
3. Variables (ver `.env.example`):
   - `AUTH_PROVIDERS=email_otp,entra`
   - `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `ENTRA_TENANT_ID`
   - `ENTRA_ALLOWED_TIDS` si el tenant es `organizations` o `common`
4. Si falta cualquiera, el botón de Microsoft no aparece y OTP sigue.

Rutas: `GET /api/auth/entra/start` y `GET /api/auth/entra/callback`.

## Account linking

Al primer SSO: validar `tid`, normalizar email/UPN, buscar `Member` por `institutionalEmail`. Si no existe o está inactivo, no se crea integrante. Un `Member` puede tener `EMAIL_OTP` y `MICROSOFT_ENTRA` a la vez.

## Fallback

Si Entra está caído o mal configurado, el login OTP sigue disponible. No se bloquea el registro de asistencia.
