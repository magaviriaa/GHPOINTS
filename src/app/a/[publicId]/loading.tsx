import { SkeletonBlock } from "@/components/ui-blocks";

export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="banda-marcador h-56 px-5 py-5" aria-hidden />
      <div className="mx-auto -mt-6 max-w-md px-4 pb-16" role="status" aria-live="polite">
        <span className="sr-only">Cargando la actividad…</span>
        <SkeletonBlock className="h-64 border" />
      </div>
    </div>
  );
}
