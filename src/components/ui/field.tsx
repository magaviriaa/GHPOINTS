import * as React from "react";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

/** Alto, foco y fondo en oscuro idénticos a `Input`. */
const controlClass =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20";

export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return <select data-slot="select" className={cn(controlClass, "pr-8", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(controlClass, "min-h-20 h-auto py-2 leading-relaxed", className)}
      {...props}
    />
  );
}

/**
 * Etiqueta, control y ayuda como una sola unidad: así la ayuda queda asociada
 * al control (`aria-describedby`) en vez de ser un párrafo suelto debajo.
 */
export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
  span,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
  span?: boolean;
}) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  return (
    <div className={cn("space-y-1.5", span && "md:col-span-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Casilla con área de toque de verdad y estado visible sin depender del control
 * nativo: las listas de comités eran casillas de 13px pegadas al texto.
 */
export function CheckChip({
  name,
  value,
  defaultChecked,
  checked,
  disabled,
  color,
  onChange,
  children,
}: {
  name: string;
  value: string;
  defaultChecked?: boolean;
  checked?: boolean;
  disabled?: boolean;
  color?: string;
  onChange?: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "inline-flex cursor-pointer items-center gap-2 rounded-full border py-1.5 pr-3 pl-2.5 text-sm transition-colors select-none hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:font-medium",
        disabled && "cursor-not-allowed opacity-50 hover:bg-transparent"
      )}
    >
      <input
        type="checkbox"
        name={name}
        value={value}
        checked={checked}
        defaultChecked={checked === undefined ? defaultChecked : undefined}
        disabled={disabled}
        onChange={onChange ? (event) => onChange(event.target.checked) : undefined}
        className="size-4 accent-[var(--primary)]"
      />
      {color ? (
        <span className="size-2.5 rounded-full" style={{ background: color }} aria-hidden />
      ) : null}
      {children}
    </label>
  );
}

export { controlClass };
