"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui-blocks";

export default function SegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[gh-points] segment error", error.digest ?? error.message);
  }, [error]);

  return <ErrorState action={<Button onClick={reset}>Reintentar</Button>} />;
}
