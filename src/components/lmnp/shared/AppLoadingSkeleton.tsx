interface AppLoadingSkeletonProps {
  message?: string;
}

export function AppLoadingSkeleton({ message }: AppLoadingSkeletonProps) {
  return (
    <div className="min-h-screen bg-[#06060b]">
      <div className="border-b border-white/5 px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="space-y-2">
            <div className="h-4 w-32 animate-pulse rounded bg-white/5" />
            <div className="h-3 w-48 animate-pulse rounded bg-white/5" />
          </div>
          <div className="h-9 w-9 animate-pulse rounded-full bg-white/5" />
        </div>
      </div>
      <div className="mx-auto flex max-w-7xl">
        <aside className="hidden w-56 shrink-0 border-r border-white/5 p-4 sm:block">
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-9 animate-pulse rounded-lg bg-white/5" />
            ))}
          </div>
        </aside>
        <main className="flex-1 px-8 py-8">
          <div className="h-8 w-64 animate-pulse rounded bg-white/5" />
          <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded bg-white/5" />
          <div className="mt-8 h-40 animate-pulse rounded-2xl bg-white/[0.03]" />
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-white/[0.03]" />
            ))}
          </div>
        </main>
      </div>
      {message ? (
        <p className="fixed bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full border border-white/10 bg-black/60 px-4 py-2 text-sm text-zinc-400 backdrop-blur-sm">
          {message}
        </p>
      ) : null}
      <p className="sr-only">{message ?? "Chargement de votre dossier…"}</p>
    </div>
  );
}
