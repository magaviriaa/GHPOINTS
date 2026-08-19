import type { Metadata } from "next";

import { HallOfFameBoards } from "@/components/hall-of-fame/boards";
import { SectionHeader } from "@/components/ui-blocks";

export const metadata: Metadata = { title: "Salón de la fama" };

export default async function HallOfFamePage() {
  return (
    <div className="space-y-6">
      <SectionHeader
        as="h1"
        title="Salón de la fama"
        description="Quién ganó cada temporada cerrada."
      />
      <HallOfFameBoards />
    </div>
  );
}
