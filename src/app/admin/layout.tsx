import { requirePageAdmin } from "@/server/auth/guard";
import { AdminSidebar } from "@/components/admin/sidebar";
import { readThemePreference } from "@/server/actions/theme";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePageAdmin();
  const theme = await readThemePreference();

  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      <AdminSidebar actor={actor} theme={theme} />
      <main id="contenido" className="min-w-0 flex-1 p-4 md:p-8">
        {children}
      </main>
    </div>
  );
}
