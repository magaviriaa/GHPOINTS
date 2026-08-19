import Link from "next/link";

import { cn } from "@/lib/utils";

/** El podio: la misma marca del favicon, para que la pestaña y la cabecera coincidan. */
export function PodiumMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-5", className)} aria-hidden focusable="false">
      <rect x="2" y="15" width="8" height="14" rx="1.5" fill="var(--metal-plata)" />
      <rect x="12" y="7" width="8" height="22" rx="1.5" fill="var(--metal-oro)" />
      <rect x="22" y="19" width="8" height="10" rx="1.5" fill="var(--metal-bronce)" />
    </svg>
  );
}

export function Wordmark({
  href = "/app",
  className,
  size = "md",
}: {
  href?: string;
  className?: string;
  size?: "md" | "lg";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "font-display inline-flex items-center gap-2 font-extrabold tracking-tight",
        size === "lg" ? "text-2xl" : "text-lg",
        className
      )}
    >
      <PodiumMark className={size === "lg" ? "size-7" : "size-5"} />
      GH Points
    </Link>
  );
}
