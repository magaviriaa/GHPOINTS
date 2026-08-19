import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GH Points",
    short_name: "GH Points",
    description:
      "Asistencia, GH Points y rankings de la Organización Estudiantil.",
    start_url: "/app",
    display: "standalone",
    background_color: "#0b1220",
    theme_color: "#0b1220",
    lang: "es",
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { src: "/apple-icon", type: "image/png", sizes: "180x180" },
    ],
  };
}
