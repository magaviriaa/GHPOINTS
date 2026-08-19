"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui-blocks";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[gh-points] unhandled route error", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <div className="w-full">
        <ErrorState action={<Button onClick={reset}>Reintentar</Button>} />
        {error.digest ? (
          <p className="font-mono mt-4 text-center text-xs text-muted-foreground">
            ref: {error.digest}
          </p>
        ) : null}
      </div>
    </div>
  );
}
