import Link from "next/link";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Los enlaces de exportación dicen qué bajan, no solo el formato del archivo. */
export function ExportLinks({
  type,
  what,
  params,
}: {
  type: string;
  what: string;
  params?: Record<string, string>;
}) {
  const build = (format?: "xlsx") => {
    const search = new URLSearchParams(params);
    if (format) search.set("format", format);
    const query = search.toString();
    return `/api/admin/export/${type}${query ? `?${query}` : ""}`;
  };

  return (
    <div className="flex gap-2">
      <Button asChild variant="secondary" size="sm">
        <Link href={build()} prefetch={false}>
          <Download aria-hidden />
          CSV
          <span className="sr-only"> de {what}</span>
        </Link>
      </Button>
      <Button asChild variant="secondary" size="sm">
        <Link href={build("xlsx")} prefetch={false}>
          <Download aria-hidden />
          XLSX
          <span className="sr-only"> de {what}</span>
        </Link>
      </Button>
    </div>
  );
}
