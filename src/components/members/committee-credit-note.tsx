import type { CommitteeCreditStrategy } from "@/server/db/types";

import { committeeCreditShare, formatCredit } from "@/server/domain/scoring-pure";
import { CREDIT_STRATEGY, labelOf } from "@/lib/labels";

export function CommitteeCreditNote({
  strategy,
  committeeNames,
}: {
  strategy: CommitteeCreditStrategy;
  committeeNames: string[];
}) {
  const share = committeeCreditShare(strategy, committeeNames.length);
  const strategyLabel = labelOf(CREDIT_STRATEGY, strategy).label;

  if (committeeNames.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Los GH Points de una actividad van enteros a la persona. El crédito de comité se calcula
        con los comités vigentes el día de la asistencia.
      </p>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 text-sm">
      <p>
        Los GH Points de la actividad van enteros al integrante: no se parten. El score de
        comité recibe{" "}
        <span className="tnum font-semibold">{formatCredit(share.creditPerCommittee)}</span> de
        crédito en {committeeNames.length === 1 ? "ese comité" : "cada comité"} ({strategyLabel}
        ).
      </p>
      <ul className="mt-3 space-y-1.5">
        {committeeNames.map((name) => (
          <li key={name} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate">{name}</span>
            <span className="tnum shrink-0 font-semibold">
              {formatCredit(share.creditPerCommittee)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
