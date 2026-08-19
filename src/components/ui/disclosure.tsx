import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/** Los formularios de creación se pliegan igual en todas las pantallas de admin. */
export function Disclosure({
  title,
  description,
  defaultOpen = false,
  children,
  className,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <details
      open={defaultOpen}
      className={cn("group overflow-hidden rounded-xl border bg-card", className)}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
        <span className="min-w-0">
          <span className="block font-medium">{title}</span>
          {description ? (
            <span className="block text-sm text-muted-foreground">{description}</span>
          ) : null}
        </span>
      </summary>
      <div className="border-t px-4 py-4">{children}</div>
    </details>
  );
}
