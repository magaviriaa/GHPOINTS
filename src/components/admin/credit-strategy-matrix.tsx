import type { CommitteeCreditStrategy } from "@/server/db/types";

import {
  COMMITTEE_CREDIT_COUNTS,
  committeeCreditShare,
  formatCredit,
} from "@/server/domain/scoring-pure";
import { cn } from "@/lib/utils";

export function CreditStrategyMatrix({ current }: { current: CommitteeCreditStrategy }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-80 text-sm">
        <caption className="sr-only">
          Crédito de comité por asistencia según cuántos comités tiene la persona
        </caption>
        <thead>
          <tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
            <th className="py-2 pr-3 font-semibold">Comités ese día</th>
            <th
              className={cn(
                "py-2 px-3 font-semibold",
                current === "FULL_CREDIT" && "text-primary"
              )}
            >
              Crédito completo
            </th>
            <th
              className={cn(
                "py-2 pl-3 font-semibold",
                current === "FRACTIONAL_CREDIT" && "text-primary"
              )}
            >
              Crédito repartido
            </th>
          </tr>
        </thead>
        <tbody>
          {COMMITTEE_CREDIT_COUNTS.map((count) => {
            const full = committeeCreditShare("FULL_CREDIT", count);
            const fractional = committeeCreditShare("FRACTIONAL_CREDIT", count);
            return (
              <tr key={count} className="border-b last:border-0">
                <th className="tnum py-2.5 pr-3 text-left font-medium">{count}</th>
                <td
                  className={cn(
                    "tnum py-2.5 px-3",
                    current === "FULL_CREDIT" && "font-semibold"
                  )}
                >
                  {formatCredit(full.creditPerCommittee)} a cada uno
                </td>
                <td
                  className={cn(
                    "tnum py-2.5 pl-3",
                    current === "FRACTIONAL_CREDIT" && "font-semibold"
                  )}
                >
                  {formatCredit(fractional.creditPerCommittee)} a cada uno
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted-foreground">
        Los GH Points de la persona no aparecen aquí: siempre van enteros al ledger. Esta tabla
        solo mueve el numerador del score de comité.
      </p>
    </div>
  );
}
