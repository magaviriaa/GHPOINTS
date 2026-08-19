import * as React from "react";

import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Numérico: alineado a la derecha y con cifras tabulares. */
  numeric?: boolean;
  /** En móvil la tabla se vuelve lista; la columna primaria es el título. */
  primary?: boolean;
  /** Botones: en la tarjeta móvil van al pie, sin etiqueta que los nombre. */
  actions?: boolean;
};

/**
 * Una tabla en un teléfono de 390px no se lee: por debajo de `md` cada fila se
 * convierte en tarjeta con la columna primaria de título y el resto como pares
 * etiqueta/valor. Arriba, tabla real con cabecera pegajosa.
 */
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  className,
}: {
  caption: string;
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  className?: string;
}) {
  const primary = columns.find((column) => column.primary) ?? columns[0]!;
  const actions = columns.filter((column) => column.actions);
  const rest = columns.filter((column) => column !== primary && !column.actions);

  return (
    <>
      <div className={cn("hidden overflow-hidden rounded-xl border bg-card md:block", className)}>
        <Table>
          <caption className="sr-only">{caption}</caption>
          <TableHeader className="sticky top-0 z-10 bg-muted/70 backdrop-blur">
            <TableRow className="hover:bg-transparent">
              {columns.map((column) => (
                <TableHead
                  key={column.key}
                  scope="col"
                  className={cn(
                    "px-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase",
                    column.numeric && "text-right"
                  )}
                >
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={rowKey(row)}>
                {columns.map((column) => (
                  <TableCell
                    key={column.key}
                    className={cn(
                      "px-4 py-3 whitespace-normal",
                      column.numeric && "tnum text-right"
                    )}
                  >
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className={cn("space-y-2 md:hidden", className)}>
        {rows.map((row) => (
          <li key={rowKey(row)} className="rounded-xl border bg-card p-4">
            <div className="font-medium">{primary.cell(row)}</div>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {rest.map((column) => (
                <React.Fragment key={column.key}>
                  <dt className="text-muted-foreground">{column.header}</dt>
                  <dd className={cn("text-right", column.numeric && "tnum")}>
                    {column.cell(row)}
                  </dd>
                </React.Fragment>
              ))}
            </dl>
            {actions.length > 0 ? (
              <div className="mt-3 flex flex-wrap justify-end gap-2 border-t pt-3">
                {actions.map((column) => (
                  <React.Fragment key={column.key}>{column.cell(row)}</React.Fragment>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
