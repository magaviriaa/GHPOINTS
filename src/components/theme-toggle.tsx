"use client";

import { Moon, Sun } from "lucide-react";

import { THEME_COOKIE } from "@/lib/constants";
import { parseThemePreference, type ThemePreference } from "@/server/theme/preference";
import { setThemeAction } from "@/server/actions/theme";
import { cn } from "@/lib/utils";

export function ThemeToggle({
  initial,
  onBand = false,
}: {
  initial: ThemePreference;
  onBand?: boolean;
}) {
  const next: ThemePreference = initial === "dark" ? "light" : "dark";
  const label = initial === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro";

  return (
    <form
      action={async (formData) => {
        const theme = parseThemePreference(String(formData.get("theme") ?? ""));
        document.cookie = `${THEME_COOKIE}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
        document.documentElement.classList.toggle("dark", theme === "dark");
        await setThemeAction(formData);
      }}
    >
      <input type="hidden" name="theme" value={next} />
      <button
        className={cn(
          "inline-flex size-9 items-center justify-center rounded-md transition-colors",
          onBand
            ? "text-banda-tenue hover:bg-white/10 hover:text-banda-texto"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
        type="submit"
        title={label}
        aria-pressed={initial === "dark"}
      >
        {initial === "dark" ? (
          <Sun className="size-4" aria-hidden />
        ) : (
          <Moon className="size-4" aria-hidden />
        )}
        <span className="sr-only">{label}</span>
      </button>
    </form>
  );
}
