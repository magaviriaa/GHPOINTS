"use client";

import { useState } from "react";

import { CheckChip } from "@/components/ui/field";
import { MAX_MEMBER_COMMITTEES } from "@/lib/constants";

export function CommitteePicker({
  committees,
  name = "committeeIds",
  defaultIds = [],
  max = MAX_MEMBER_COMMITTEES,
}: {
  committees: Array<{ id: string; name: string; color: string }>;
  name?: string;
  defaultIds?: string[];
  max?: number;
}) {
  const [selected, setSelected] = useState(() => new Set(defaultIds));
  const atCap = selected.size >= max;

  return (
    <fieldset className="space-y-2 md:col-span-2">
      <legend className="mb-1 text-sm font-medium">Comités</legend>
      <p className="text-xs text-muted-foreground">
        {selected.size} de {max} a la vez. Al quitar uno, queda en Perteneció a; el score de
        actividades pasadas no se reescribe.
      </p>
      <div className="flex flex-wrap gap-2">
        {committees.map((committee) => {
          const checked = selected.has(committee.id);
          return (
            <CheckChip
              key={committee.id}
              name={name}
              value={committee.id}
              color={committee.color}
              checked={checked}
              disabled={!checked && atCap}
              onChange={(next) => {
                setSelected((prev) => {
                  const copy = new Set(prev);
                  if (next) {
                    if (copy.size >= max) return prev;
                    copy.add(committee.id);
                  } else {
                    copy.delete(committee.id);
                  }
                  return copy;
                });
              }}
            >
              {committee.name}
            </CheckChip>
          );
        })}
      </div>
    </fieldset>
  );
}
