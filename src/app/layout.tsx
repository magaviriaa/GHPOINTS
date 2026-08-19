import type { Metadata, Viewport } from "next";
import { Archivo, Geist_Mono, Public_Sans } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { THEME_COOKIE } from "@/lib/constants";
import { parseThemePreference } from "@/server/theme/preference";

/** La voz del marcador: Archivo ancha y pesada para cifras y títulos. */
const display = Archivo({
  variable: "--ff-display",
  subsets: ["latin"],
  axes: ["wdth"],
});

/** Texto y UI. Aguanta la densidad de las tablas de administración. */
const body = Public_Sans({
  variable: "--ff-body",
  subsets: ["latin"],
});

/** Solo para cadenas de máquina: OTP, publicId, tokens de QR, digests. */
const mono = Geist_Mono({
  variable: "--ff-mono",
  subsets: ["latin"],
});

/**
 * `getEnv()` lanza si falta una variable, y la metadata se evalúa en build.
 * La URL base es cosmética (Open Graph): si no está, se omite en vez de romper.
 */
function metadataBase(): URL | undefined {
  try {
    return new URL(process.env.APP_URL ?? "");
  } catch {
    return undefined;
  }
}

export const metadata: Metadata = {
  metadataBase: metadataBase(),
  title: {
    default: "GH Points",
    template: "%s · GH Points",
  },
  description:
    "Asistencia, GH Points y rankings de la Organización Estudiantil. Escanea, registra y sigue tu temporada.",
  applicationName: "GH Points",
  appleWebApp: { capable: true, title: "GH Points", statusBarStyle: "black-translucent" },
  openGraph: {
    type: "website",
    siteName: "GH Points",
    locale: "es_CO",
    title: "GH Points",
    description: "Asistencia, GH Points y rankings de la Organización Estudiantil.",
  },
  twitter: { card: "summary_large_image" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f4f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
  colorScheme: "light dark",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const theme = parseThemePreference((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html lang="es" className={theme === "dark" ? "dark" : undefined}>
      <body className={`${display.variable} ${body.variable} ${mono.variable} antialiased`}>
        <a
          href="#contenido"
          className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-primary focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-semibold focus-visible:text-primary-foreground"
        >
          Saltar al contenido
        </a>
        {children}
      </body>
    </html>
  );
}
