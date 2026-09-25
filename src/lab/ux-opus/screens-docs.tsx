"use client";

import { useState } from "react";

import { MobileBar, PageTitle } from "./chrome";
import { useScenario } from "./context";
import { DOMAINS } from "./meta";
import type { ScenarioId } from "./model";
import { visibleDocs } from "./scenarios";
import { Card, Icon, Pill, PrimaryButton, SecondaryButton, TextButton, serif } from "./ui";

export function DocumentsScreen({ s }: { s: ScenarioId }) {
  const { def, state, view, openDoc, openPanel, go, notify } = useScenario(s);
  const docs = visibleDocs(def, state);
  const years = Array.from(new Set(docs.map((d) => d.year))).sort((a, b) => b - a);
  const [year, setYear] = useState(def.year);
  const shown = docs.filter((d) => d.year === year);
  const addDoc = () => notify("Prototype : dans le produit réel, le document serait lu et rapproché de votre dossier, comme au premier dépôt.");

  return (
    <main className="mx-auto max-w-[1180px] px-4 pb-36 pt-8 md:px-8 md:pb-24 md:pt-12">
      <PageTitle
        eyebrow={`Vos documents · ${view.owner}`}
        title="Chaque document, et ce qu’il m’a appris."
        lead="Rien n’est simplement rangé ici : chaque document reste relié aux montants qu’il justifie. Ouvrez-en un pour voir exactement ce que j’y ai lu."
      />

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        {years.length > 1 ? (
          <div role="tablist" aria-label="Exercices" className="flex gap-1 rounded-full bg-[var(--o-sand)] p-1">
            {years.map((y) => (
              <button
                key={y}
                type="button"
                role="tab"
                aria-selected={year === y}
                onClick={() => setYear(y)}
                className={`rounded-full px-4 py-1.5 text-[14px] font-medium ${year === y ? "bg-[var(--o-surface)] text-[var(--o-ink)] shadow-[0_1px_3px_rgba(28,25,23,0.08)]" : "text-[var(--o-ink-3)]"}`}
              >
                {y}
                {s === "b" && y === 2025 ? " · reprise" : ""}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[14px] text-[var(--o-ink-3)]">Exercice {def.year} · {docs.length} documents</p>
        )}
        <div className="hidden md:block">
          <SecondaryButton onClick={addDoc}>
            <Icon name="plus" /> Ajouter un document
          </SecondaryButton>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {shown.map((d) => {
          const pointStatus = d.pointId ? state.points[d.pointId]?.status : undefined;
          const needsYou = d.status === "attention" && pointStatus !== "answered";
          return (
            <Card key={d.id} className="flex flex-col p-5 md:p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--o-sand)] text-[var(--o-ink-2)]">
                    <Icon name="doc" />
                  </span>
                  <div className="min-w-0">
                    <p className={`${serif} text-[20px] leading-tight text-[var(--o-ink)]`}>{d.kind}</p>
                    <p className="truncate text-[12.5px] text-[var(--o-ink-3)]">{d.file}</p>
                  </div>
                </div>
                {needsYou ? (
                  <Pill tone="warn">
                    <Icon name="alert" className="h-3 w-3" /> Besoin de vous
                  </Pill>
                ) : (
                  <Pill tone="ok">
                    <Icon name="check" className="h-3 w-3" /> Analysé
                  </Pill>
                )}
              </div>
              <ul className="mt-4 grid gap-1.5">
                {d.findings.map((f) => (
                  <li key={f.label} className="text-[14px] leading-5 text-[var(--o-ink-2)]">
                    <span className="text-[var(--o-ink-4)]">→ </span>
                    {f.label} : <span className="text-[var(--o-ink)]">{f.value}</span>
                  </li>
                ))}
              </ul>
              {needsYou && d.pointId && (
                <div className="mt-4 rounded-xl bg-[var(--o-accent-soft)] px-4 py-3 text-[14px] text-[var(--o-ink)]">
                  {d.statusNote}.{" "}
                  <TextButton onClick={() => go("points", d.pointId ?? null)}>
                    Régler ce point <Icon name="arrow" />
                  </TextButton>
                </div>
              )}
              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-5">
                <div className="flex flex-wrap gap-1.5">
                  {d.usedIn.map((u) => (
                    <button key={u} type="button" onClick={() => openPanel(u)} className="rounded-full border border-[var(--o-line)] px-2.5 py-0.5 text-[12px] text-[var(--o-ink-2)] hover:border-[#DAD3C8] hover:text-[var(--o-ink)]">
                      {DOMAINS[u].title}
                    </button>
                  ))}
                </div>
                <TextButton onClick={() => openDoc(d.id)}>
                  <Icon name="eye" /> Consulter
                </TextButton>
              </div>
            </Card>
          );
        })}
      </div>

      <MobileBar>
        <PrimaryButton className="w-full" onClick={() => go("dossier")}>
          Revenir à mon dossier
        </PrimaryButton>
      </MobileBar>
    </main>
  );
}
