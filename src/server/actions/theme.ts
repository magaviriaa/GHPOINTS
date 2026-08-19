"use server";

import { cookies } from "next/headers";
import { THEME_COOKIE } from "@/lib/constants";
import { parseThemePreference, type ThemePreference } from "@/server/theme/preference";

export async function setThemeAction(formData: FormData) {
  const theme = parseThemePreference(String(formData.get("theme") ?? ""));
  const store = await cookies();
  store.set(THEME_COOKIE, theme, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}

export async function readThemePreference(): Promise<ThemePreference> {
  const store = await cookies();
  return parseThemePreference(store.get(THEME_COOKIE)?.value);
}
