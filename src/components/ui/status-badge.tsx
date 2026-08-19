import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { labelOf, type LabelEntry, type Tone } from "@/lib/labels";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  info: "bg-primary/10 text-primary",
  success: "bg-success-surface text-success-ink",
  warning: "bg-accent/15 text-accent-ink",
  danger: "bg-destructive/12 text-destructive",
  muted: "bg-muted text-muted-foreground",
};

/**
 * Un estado se ve igual en toda la app porque sale del mismo diccionario.
 * `title` deja el matiz a mano sin cargar la fila de texto.
 */
export function StatusBadge({
  dictionary,
  value,
  className,
}: {
  dictionary: Record<string, LabelEntry>;
  value: string | null | undefined;
  className?: string;
}) {
  const entry = labelOf(dictionary, value);
  return (
    <Badge
      variant="secondary"
      title={entry.hint}
      className={cn("px-2 py-0.5 font-semibold", TONE_CLASS[entry.tone], className)}
    >
      {entry.label}
    </Badge>
  );
}

export function toneClass(tone: Tone) {
  return TONE_CLASS[tone];
}
