# Diseño — dirección «Marcador»

El sujeto es una competencia interna entre comités: fixtures, asistencia, podios, temporadas, medallas. La identidad sale de ese mundo —el tablero de resultados de un club— y no de un dashboard corporativo. Todo lo que sigue es normativo: si algo nuevo no cabe aquí, primero se decide aquí.

## Color

Los tokens viven en [`src/app/globals.css`](../../src/app/globals.css). Nunca escribas un hex en un componente: usa la variable o la clase de Tailwind que la expone.

| Token | Claro | Oscuro | Para qué |
| --- | --- | --- | --- |
| `--tinta` | texto | fondo | Negro azulado, la base |
| `--cobalto` → `--primary` | `#1d3fe0` | `#7aa0ff` | Acciones, enlaces, navegación activa |
| `--papel` / `--card` | `#f3f4f7` / `#fff` | `#0b1220` / `#141c2e` | Superficies |
| `--oro` / `--accent` | `#f2b705` | igual | **Relleno**: medallas, pista de nivel, botón de la landing |
| `--accent-ink` | `#8a6200` | `#f5c542` | **Texto** de acento. El oro puro sobre blanco no llega a 4.5:1 |
| `--success` / `--success-ink` / `--success-surface` | | | Asistencia registrada, confirmaciones |
| `--destructive` | | | Errores y acciones destructivas |

**El oro tiene dos tokens y no es un capricho**: `--accent` se rellena, `--accent-ink` se escribe. Usar `text-accent` sobre una tarjeta da ~3:1 y no pasa AA; para eso está `text-accent-ink` (5.5:1). Todos los pares en uso están verificados a 4.5:1 en ambos temas.

### Metales de nivel

`--metal-novato|bronce|plata|oro|elite` mapean uno a uno los `slug` de `GH_POINT_LEVELS` ([`levels-pure.ts`](../../src/server/domain/levels-pure.ts)) a través de [`src/lib/level-style.ts`](../../src/lib/level-style.ts). Los mismos metales pintan las medallas del podio, la pista de nivel y la regla bajo la banda del marcador. No son adorno: si cambian los niveles, cambia el mapa.

### Color de comité

`Committee.color` ya vive en la base. Se usa como franja de identidad —una barra de 4–6px— en roster, filas de ranking, tarjetas y `BarList`. Es estructura que codifica algo verdadero, no decoración.

## Tipografía

Tres roles, todas servidas desde el propio origen por `next/font` (la CSP solo permite `font-src 'self' data:`):

- **`Archivo`** variable con eje `wdth` — display y cifras. Se usa ancha (112) y pesada (700–800). Clase `font-display`, o la utilidad `.marcador` para el número grande.
- **`Public Sans`** — texto y UI. Es la fuente del `body`.
- **`Geist Mono`** — solo cadenas de máquina: OTP, `publicId`, tokens de QR, ids y acciones de auditoría. Nunca prosa.

Las cifras comparables llevan `.tnum` (o `.marcador`, que ya la incluye) para que no bailen entre filas.

## La banda y su firma

`.banda-marcador` es un panel de tinta con una **regla de metales de 3px al pie**. Es la firma de la marca y aparece solo donde hay un resultado que anunciar: landing, login, `/a/[publicId]`, salón de la fama, y los paneles de marcador de `/app` y `/app/me`. No es papel tapiz: las cabeceras internas son planas.

El `::after` de la regla obliga a `overflow-hidden` cuando el panel va redondeado.

## El marcador

`Marcador` y `LevelTrack` ([`ui-blocks.tsx`](../../src/components/ui-blocks.tsx)) son el elemento memorable, y por eso se gastan en tres momentos y en ninguno más:

1. Los GH Points y la posición en `/app` y `/app/me`.
2. El crédito de la actividad en `/a/[publicId]`.
3. El conteo que entra al registrar asistencia.

`LevelTrack` consume el `progress` que `levelForPoints` ya calculaba. Todo lo demás en la página se mantiene callado.

## Movimiento

Un solo momento orquestado: la cifra que entra y cuenta al registrar asistencia (`RegisteredCard`). Con `prefers-reduced-motion: reduce` la duración es cero y el primer cuadro pinta el valor final; `globals.css` además apaga transiciones y animaciones globalmente bajo esa preferencia.

## Piso de calidad

- **Móvil primero.** La barra inferior respeta `env(safe-area-inset-bottom)`. Las tablas caen a tarjetas por debajo de `md` vía `DataTable`.
- **Foco visible.** `:focus-visible` tiene contorno en la capa base, así que también lo tienen las tarjetas envueltas en `<Link>`; los componentes shadcn conservan su propio anillo.
- **Estado activo.** Toda navegación marca dónde estás con `aria-current="page"`.
- **Nada de enums crudos.** Todo estado visible pasa por [`src/lib/labels.ts`](../../src/lib/labels.ts), que además fija el tono del `StatusBadge`.
- **Vacío y error dicen qué hacer.** `EmptyState` acepta una acción; `ErrorState` explica y ofrece salida, sin disculparse.
- **Sin `loading.tsx` en `/app` ni `/admin`** (ADR-024). Los estados de espera vienen de `useTransition` en `ClientForm` y `RegisterAttendanceButton`.
