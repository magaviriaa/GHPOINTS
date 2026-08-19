export type ThemePreference = "light" | "dark";

export function parseThemePreference(value: string | undefined | null): ThemePreference {
  return value === "dark" ? "dark" : "light";
}
