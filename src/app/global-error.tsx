"use client";

/**
 * Este boundary reemplaza el documento entero: `globals.css` puede no haberse
 * aplicado, así que los colores van inline y siguen el esquema del sistema.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <head>
        <meta name="color-scheme" content="light dark" />
        <style>{`
          :root { --g-bg: #f3f4f7; --g-fg: #0b1220; --g-muted: #59637a; --g-btn: #1d3fe0; }
          @media (prefers-color-scheme: dark) {
            :root { --g-bg: #0b1220; --g-fg: #e8ecf5; --g-muted: #96a1b8; --g-btn: #7aa0ff; }
          }
        `}</style>
      </head>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          background: "var(--g-bg)",
          color: "var(--g-fg)",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <div role="alert" style={{ maxWidth: "24rem", textAlign: "center" }}>
          <div
            style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "flex-end" }}
            aria-hidden
          >
            <span style={{ width: 10, height: 18, borderRadius: 2, background: "#8a93a6" }} />
            <span style={{ width: 10, height: 28, borderRadius: 2, background: "#f2b705" }} />
            <span style={{ width: 10, height: 13, borderRadius: 2, background: "#a45b2a" }} />
          </div>
          <h1 style={{ marginTop: "1.25rem", fontSize: "1.5rem", fontWeight: 800 }}>
            GH Points no pudo cargar
          </h1>
          <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "var(--g-muted)" }}>
            Algo falló antes de dibujar la página. Vuelve a intentarlo; si sigue igual, avisa a
            GH General.
          </p>
          {error.digest ? (
            <p
              style={{
                marginTop: "0.5rem",
                fontFamily: "ui-monospace, monospace",
                fontSize: "0.75rem",
                color: "var(--g-muted)",
              }}
            >
              ref: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              height: "2.75rem",
              borderRadius: "0.5rem",
              border: 0,
              padding: "0 1.5rem",
              background: "var(--g-btn)",
              color: "#fff",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
