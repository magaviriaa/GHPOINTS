"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  CircleUser,
  Home,
  Medal,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon };

const MEMBER_ITEMS: NavItem[] = [
  { href: "/app", label: "Inicio", icon: Home },
  { href: "/app/activities", label: "Actividades", icon: CalendarDays },
  { href: "/app/rankings", label: "Rankings", icon: Trophy },
  { href: "/app/hall-of-fame", label: "Salón", icon: Medal },
  { href: "/app/me", label: "Perfil", icon: CircleUser },
];

const LEADER_ITEM: NavItem = { href: "/app/committees", label: "Comité", icon: Users };

function items(isLeader: boolean): NavItem[] {
  if (!isLeader) return MEMBER_ITEMS;
  return [...MEMBER_ITEMS.slice(0, 4), LEADER_ITEM, MEMBER_ITEMS[4]!];
}

function useActive() {
  const pathname = usePathname();
  return (href: string) =>
    href === "/app" ? pathname === "/app" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Rail de escritorio, dentro de la barra de cabecera. */
export function AppNavRail({ isLeader }: { isLeader: boolean }) {
  const isActive = useActive();
  return (
    <nav className="hidden md:block" aria-label="Principal">
      <ul className="flex items-center gap-1">
        {items(isLeader).map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-white/12 text-banda-texto"
                    : "text-banda-tenue hover:bg-white/8 hover:text-banda-texto"
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Barra inferior en móvil: icono, etiqueta y de dónde vienes. */
export function AppNavBar({ isLeader }: { isLeader: boolean }) {
  const isActive = useActive();
  const list = items(isLeader);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      aria-label="Principal"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${list.length}, minmax(0, 1fr))` }}>
        {list.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-14 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                {active ? (
                  <span
                    className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-primary"
                    aria-hidden
                  />
                ) : null}
                <Icon className="size-5" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
