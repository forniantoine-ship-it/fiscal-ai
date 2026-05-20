"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  EXPECTED_DOCUMENT_NAMES,
  buildCopilotFeedMessages,
  buildCopilotGuideSteps,
} from "@/lib/lmnp/constants/copilot-copy";
import {
  computeDocumentChecklist,
  countMissingRequired,
} from "@/lib/lmnp/services/document-checklist";
import { useLmnp } from "@/lib/lmnp/store";

export function CopilotGuideCard() {
  const { workspace } = useLmnp();
  const base = `/app/exercices/${workspace.fiscalYear.id}`;

  const checklist = useMemo(
    () =>
      computeDocumentChecklist({
        fiscalYear: workspace.fiscalYear,
        properties: workspace.properties,
        documents: workspace.documents,
        validationItems: workspace.validationItems,
        ledgerEntries: workspace.ledgerEntries,
      }),
    [workspace],
  );

  const missingRequired = countMissingRequired(checklist);
  const analyzedCount = workspace.documents.filter((d) => d.status === "analyzed").length;

  const steps = buildCopilotGuideSteps({
    base,
    documentCount: workspace.documents.length,
    analyzedCount,
    pendingValidationCount: workspace.pendingValidationCount,
    missingDocumentCount: missingRequired,
    canClose: workspace.canClose,
  });

  const feed = buildCopilotFeedMessages({
    documents: workspace.documents,
    checklist,
    pendingValidationCount: workspace.pendingValidationCount,
    canClose: workspace.canClose,
  });

  const active = steps.find((s) => s.active) ?? steps[0];

  return (
    <section className="glass overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.06] to-transparent">
      <div className="border-b border-white/5 px-6 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400/90">
          Votre assistant LMNP
        </p>
        <h2 className="mt-1 text-xl font-semibold text-zinc-100">{active.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">{active.description}</p>
        <Link
          href={active.href}
          className="mt-4 inline-flex rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400"
        >
          {active.cta}
        </Link>
      </div>

      <div className="grid gap-6 px-6 py-5 lg:grid-cols-2">
        <ol className="space-y-3">
          {steps.map((step) => (
            <li
              key={step.step}
              className={`flex gap-3 rounded-xl px-3 py-2.5 ${
                step.active ? "bg-white/[0.04] ring-1 ring-emerald-500/25" : ""
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  step.done
                    ? "bg-emerald-500/20 text-emerald-400"
                    : step.active
                      ? "bg-emerald-500 text-zinc-950"
                      : "bg-white/5 text-zinc-500"
                }`}
              >
                {step.done ? "✓" : step.step}
              </span>
              <div className="min-w-0">
                <p
                  className={`text-sm font-medium ${step.active ? "text-zinc-100" : "text-zinc-400"}`}
                >
                  {step.title}
                </p>
                {!step.done && step.active && (
                  <p className="mt-0.5 text-xs text-zinc-500">{step.description}</p>
                )}
              </div>
            </li>
          ))}
        </ol>

        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-zinc-500">Documents utiles</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {EXPECTED_DOCUMENT_NAMES.map((name) => (
                <li
                  key={name}
                  className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-zinc-400 ring-1 ring-white/10"
                >
                  {name}
                </li>
              ))}
            </ul>
          </div>

          {feed.length > 0 && (
            <div className="rounded-xl border border-white/5 bg-black/20 p-3">
              <p className="text-xs font-medium text-zinc-500">Ce que l’IA vous dit</p>
              <ul className="mt-2 space-y-1.5">
                {feed.map((msg) => (
                  <li key={msg} className="text-sm text-zinc-300">
                    {msg}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
