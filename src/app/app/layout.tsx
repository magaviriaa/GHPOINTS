import { requirePageActor } from "@/server/auth/guard";
import { AppHeader, AppNav } from "@/components/app/shell";
import { readThemePreference } from "@/server/actions/theme";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePageActor();
  const theme = await readThemePreference();

  return (
    <div className="min-h-screen bg-background pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-12">
      <AppHeader actor={actor} theme={theme} />
      <main id="contenido" className="mx-auto max-w-4xl px-4 py-6">
        {children}
      </main>
      <AppNav actor={actor} />
    </div>
  );
}
