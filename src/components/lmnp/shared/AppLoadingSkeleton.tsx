interface AppLoadingSkeletonProps {
  message?: string;
}

export function AppLoadingSkeleton({ message }: AppLoadingSkeletonProps) {
  return (
    <div className="min-h-screen">
      <div className="border-b border-stone-200 px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="space-y-2">
            <div className="h-4 w-32 animate-pulse rounded bg-stone-100" />
            <div className="h-3 w-48 animate-pulse rounded bg-stone-100" />
          </div>
          <div className="h-9 w-9 animate-pulse rounded-full bg-stone-100" />
        </div>
      </div>
      <div className="mx-auto flex max-w-7xl">
        <aside className="hidden w-56 shrink-0 border-r border-stone-200 p-4 sm:block">
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-9 animate-pulse rounded-lg bg-stone-100" />
            ))}
          </div>
        </aside>
        <main className="flex-1 px-8 py-8">
          <div className="h-8 w-64 animate-pulse rounded bg-stone-100" />
          <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded bg-stone-100" />
          <div className="mt-8 h-40 animate-pulse rounded-2xl bg-stone-100/80" />
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-stone-100/80" />
            ))}
          </div>
        </main>
      </div>
      {message ? (
        <p className="fixed bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full border border-stone-200 bg-card/95 px-4 py-2 text-sm text-stone-600 shadow-sm backdrop-blur-sm">
          {message}
        </p>
      ) : null}
      <p className="sr-only">{message ?? "Chargement de votre dossier…"}</p>
    </div>
  );
}
