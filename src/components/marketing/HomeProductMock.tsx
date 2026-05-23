/** Static product preview for marketing — mirrors in-app calm UI without live data. */
export function HomeProductMock({ compact = false }: { compact?: boolean }) {
  const workflow = ["Documents", "Activité", "Dépenses", "Validation", "Déclaration"];
  const activeIndex = 1;

  return (
    <div
      className={`overflow-hidden rounded-[var(--radius-xl)] bg-card text-left shadow-[var(--shadow-soft)] ${
        compact ? "mx-auto max-w-lg" : "w-full"
      }`}
    >
      <div className="border-b border-stone-100/80 px-5 py-3.5 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[12px] font-medium text-stone-600">LMNP 2025</p>
          <p className="text-[11px] text-stone-400">3 documents reçus</p>
        </div>
        <nav
          className="mt-3 flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-hidden
        >
          {workflow.map((label, i) => (
            <span
              key={label}
              className={`shrink-0 rounded-full px-3 py-1 text-[11px] ${
                i === activeIndex
                  ? "bg-stone-800/90 text-white"
                  : i < activeIndex
                    ? "text-stone-500"
                    : "text-stone-400"
              }`}
            >
              {label}
            </span>
          ))}
        </nav>
      </div>

      <div className={`grid gap-0 ${compact ? "" : "sm:grid-cols-[1fr_1.1fr]"}`}>
        <div className="border-b border-stone-100/80 p-5 sm:border-b-0 sm:border-r sm:p-6">
          <p className="text-[11px] uppercase tracking-[0.12em] text-stone-400">Documents</p>
          <div className="mt-4 rounded-2xl border border-dashed border-stone-200/90 bg-subtle/60 px-4 py-8 text-center">
            <p className="text-[13px] text-stone-600">Déposez vos pièces ici</p>
            <p className="mt-1.5 text-[12px] text-stone-400">Baux, quittances, relevés…</p>
          </div>
          <ul className="mt-4 space-y-2">
            {["Bail signé.pdf", "Quittances 2025.pdf"].map((name) => (
              <li
                key={name}
                className="flex items-center justify-between rounded-xl bg-subtle/50 px-3 py-2.5 text-[12px] text-stone-600"
              >
                <span className="truncate">{name}</span>
                <span className="shrink-0 text-stone-400">Analysé</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="p-5 sm:p-6">
          <p className="text-[11px] uppercase tracking-[0.12em] text-stone-400">À confirmer</p>
          <ul className="mt-4 space-y-3">
            {[
              { label: "Loyers perçus", value: "14 280 €" },
              { label: "Charges locatives", value: "1 940 €" },
              { label: "Intérêts d’emprunt", value: "3 120 €" },
            ].map((row) => (
              <li
                key={row.label}
                className="flex items-center justify-between gap-4 rounded-xl border border-stone-100/80 px-3.5 py-3"
              >
                <span className="text-[13px] text-stone-600">{row.label}</span>
                <span className="text-[13px] tabular-nums text-stone-800">{row.value}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-[12px] leading-relaxed text-stone-400">
            L’essentiel est pré-rempli — vous validez en quelques minutes.
          </p>
        </div>
      </div>
    </div>
  );
}
