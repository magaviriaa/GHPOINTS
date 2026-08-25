"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  Coins,
  LayoutDashboard,
  LogOut,
  ScrollText,
  Settings,
  Trophy,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";

import { logoutAction } from "@/server/actions/auth";
import type { Actor } from "@/server/domain/authorization";
import { ThemeToggle } from "@/components/theme-toggle";
import { PodiumMark, Wordmark } from "@/components/brand/wordmark";
import { cn } from "@/lib/utils";
import type { ThemePreference } from "@/server/theme/preference";

type Item = { href: string; label: string; icon: LucideIcon };

/** Agrupado por lo que se hace, no por el orden en que se construyó. */
const GROUPS: Array<{ title: string; items: Item[] }> = [
  {
    title: "Operación",
    items: [
      { href: "/admin", label: "Overview", icon: LayoutDashboard },
      { href: "/admin/activities", label: "Actividades", icon: CalendarDays },
      { href: "/admin/attendance", label: "Asistencias", icon: ClipboardCheck },
      { href: "/admin/points", label: "Puntos", icon: Coins },
    ],
  },
  {
    title: "Datos",
    items: [
      { href: "/admin/members", label: "Integrantes", icon: Users },
      { href: "/admin/committees", label: "Comités", icon: Boxes },
      { href: "/admin/rankings", label: "Rankings", icon: Trophy },
      { href: "/admin/seasons", label: "Temporadas", icon: CalendarRange },
      { href: "/admin/imports", label: "Importaciones", icon: Upload },
    ],
  },
  {
    title: "Sistema",
    items: [
      { href: "/admin/audit", label: "Auditoría", icon: ScrollText },
      { href: "/admin/settings", label: "Configuración", icon: Settings },
    ],
  },
];

const ALL_ITEMS = GROUPS.flatMap((group) => group.items);

function matches(pathname: string, href: string) {
  return href === "/admin"
    ? pathname === "/admin"
    : pathname === href || pathname.startsWith(`${href}/`);
}

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      {GROUPS.map((group) => (
        <div key={group.title} className="mb-5">
          <p className="px-3 pb-1.5 text-[0.625rem] font-semibold tracking-[0.16em] text-white/45 uppercase">
            {group.title}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = matches(pathname, item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-white/14 font-semibold text-white"
                        : "text-white/70 hover:bg-white/8 hover:text-white"
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}

export function AdminSidebar({ actor, theme }: { actor: Actor; theme: ThemePreference }) {
  const pathname = usePathname();
  const current = ALL_ITEMS.find((item) => matches(pathname, item.href));

  return (
    <>
      {/*
        En móvil el sidebar era un bloque de once enlaces que empujaba el
        contenido fuera de la primera pantalla. Ahora se pliega y el resumen
        dice en qué sección estás sin abrirlo.
      */}
      <details className="bg-tinta text-white md:hidden">
        <summary className="flex h-14 cursor-pointer list-none items-center gap-3 px-4 [&::-webkit-details-marker]:hidden">
          <span className="font-display inline-flex items-center gap-2 text-lg font-extrabold tracking-tight text-white">
            <PodiumMark />
            GH Points
          </span>
          <span className="ml-auto rounded-md bg-white/12 px-3 py-1.5 text-sm font-medium">
            {current?.label ?? "Menú"}
          </span>
        </summary>
        <div className="border-t border-white/10 px-3 pt-4 pb-2">
          <NavList pathname={pathname} />
          <AdminFooter actor={actor} theme={theme} />
        </div>
      </details>

      <aside className="hidden bg-tinta text-white md:flex md:min-h-screen md:w-60 md:shrink-0 md:flex-col">
        <div className="px-5 py-5">
          <Wordmark href="/admin" className="text-white" />
          <p className="mt-1 pl-7 text-xs text-white/55">GH General</p>
        </div>
        <nav className="flex-1 px-3" aria-label="Administración">
          <NavList pathname={pathname} />
        </nav>
        <AdminFooter actor={actor} theme={theme} />
      </aside>
    </>
  );
}

function AdminFooter({ actor, theme }: { actor: Actor; theme: ThemePreference }) {
  return (
    <div className="border-t border-white/10 px-4 py-3">
      <p className="truncate text-sm text-white/80">{actor.fullName}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <Link
          className="rounded-md px-2 py-1.5 text-sm whitespace-nowrap text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          href="/app"
        >
          Ir a la app
        </Link>
        <div className="flex items-center">
          <ThemeToggle initial={theme} onBand />
          <form action={logoutAction}>
            <button
              className="inline-flex size-9 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              type="submit"
              title="Cerrar sesión"
            >
              <LogOut className="size-4" aria-hidden />
              <span className="sr-only">Cerrar sesión</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
