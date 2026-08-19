import { GH_POINT_LEVELS } from "@/server/domain/levels-pure";

/**
 * Cada nivel es un metal. No es adorno: la pista de nivel, las medallas del
 * podio y la regla bajo la banda del marcador usan la misma escala.
 */
const METAL_BY_SLUG = {
  novato: "var(--metal-novato)",
  bronce: "var(--metal-bronce)",
  plata: "var(--metal-plata)",
  oro: "var(--metal-oro)",
  elite: "var(--metal-elite)",
} satisfies Record<string, string>;

type LevelSlug = keyof typeof METAL_BY_SLUG;

function isLevelSlug(slug: string): slug is LevelSlug {
  return slug in METAL_BY_SLUG;
}

export function metalForLevel(slug: string): string {
  return isLevelSlug(slug) ? METAL_BY_SLUG[slug] : METAL_BY_SLUG.novato;
}

export function levelScale() {
  return GH_POINT_LEVELS.map((level) => ({ ...level, metal: metalForLevel(level.slug) }));
}
