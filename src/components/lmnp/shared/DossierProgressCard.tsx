"use client";

import Link from "next/link";
import { useLmnp } from "@/lib/lmnp/store";
import {
  CONFIDENCE_LEVEL_LABELS,
  FISCAL_YEAR_STATUS_LABELS,
  PILLAR_LABELS,
} from "@/components/lmnp/app-shell/labels";

interface DossierProgressCardProps {
  compact?: boolean;
}

export function DossierProgressCard({ compact = false }: DossierProgressCardProps) {
  const { workspace } = useLmnp();
  const {
    fiscalYear,
    confidence,
    openAlertCount,
    blockingAlertCount,
    warningAlertCount,
    pendingValidationCount,
    validatedFieldCount,
    autoSyncedFieldCount,
    manuallyValidatedFieldCount,
    fullyValidatedDocumentCount,
    analyzedDocumentCount,
    canClose,
  } = workspace;

  const base = `/app/exercices/${fiscalYear.id}`;
  const pillars = [
    { key: "documents" as const, value: confidence.pillars.documents, href: `${base}/documents` },
    { key: "validations" as const, value: confidence.pillars.validations, href: `${base}/validation` },
    { key: "coherence" as const, value: confidence.pillars.coherence, href: `${base}/alertes` },
    { key: "tabs" as const, value: confidence.pillars.tabs, href: `${base}/recettes` },
  ];

  if (compact) {
    return (
      <section className="glass rounded-xl border border-white/5 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Progression dossier
            </p>
            <p className="mt-1 text-lg font-semibold text-zinc-100">
              {confidence.score} % · {CONFIDENCE_LEVEL_LABELS[confidence.level]}
            </p>
          </div>
          <StatusBadge status={fiscalYear.status} canClose={canClose} />
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          {openAlertCount === 0
            ? "Aucune alerte restante"
            : `${openAlertCount} alerte${openAlertCount > 1 ? "s" : ""} restante${openAlertCount > 1 ? "s" : ""}`}
          {blockingAlertCount > 0 && (
            <span className="text-red-400"> · {blockingAlertCount} blocage{blockingAlertCount > 1 ? "s" : ""}</span>
          )}
          {pendingValidationCount > 0 && (
            <span className="text-amber-400">
              {" "}
              · {pendingValidationCount} à confirmer
            </span>
          )}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {pillars.map(({ key, value }) => (
            <PillarRow key={key} label={PILLAR_LABELS[key]} value={value} compact />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="glass rounded-2xl border border-white/5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Progression du dossier
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-zinc-100">{confidence.score} %</p>
          <p className="mt-1 text-sm text-emerald-400/90">
            {CONFIDENCE_LEVEL_LABELS[confidence.level]}
          </p>
        </div>
        <StatusBadge status={fiscalYear.status} canClose={canClose} />
      </div>

      <div className="mt-6 space-y-3">
        {pillars.map(({ key, value, href }) => (
          <PillarRow key={key} label={PILLAR_LABELS[key]} value={value} href={href} />
        ))}
      </div>

      <div className="mt-6 grid gap-3 border-t border-white/5 pt-5 sm:grid-cols-2">
        <Metric
          label="Alertes restantes"
          value={String(openAlertCount)}
          detail={
            openAlertCount === 0
              ? "Rien à traiter"
              : `${blockingAlertCount} blocage${blockingAlertCount > 1 ? "s" : ""}${warningAlertCount > 0 ? ` · ${warningAlertCount} avertissement${warningAlertCount > 1 ? "s" : ""}` : ""}`
          }
          href={openAlertCount > 0 ? `${base}/alertes` : undefined}
          tone={blockingAlertCount > 0 ? "danger" : warningAlertCount > 0 ? "warning" : "neutral"}
        />
        <Metric
          label="Documents validés"
          value={`${fullyValidatedDocumentCount}/${analyzedDocumentCount}`}
          detail={
            analyzedDocumentCount === 0
              ? "Aucun document analysé"
              : `${validatedFieldCount} montant${validatedFieldCount > 1 ? "s" : ""} enregistré${validatedFieldCount > 1 ? "s" : ""}`
          }
          href={analyzedDocumentCount > 0 ? `${base}/documents` : undefined}
          tone="neutral"
        />
      </div>

      {validatedFieldCount > 0 && (
        <p className="mt-4 text-xs text-zinc-600">
          {autoSyncedFieldCount > 0 && (
            <span>
              {autoSyncedFieldCount} synchronisé{autoSyncedFieldCount > 1 ? "s" : ""} automatiquement
              (OCR ≥ 95 %)
            </span>
          )}
          {autoSyncedFieldCount > 0 && manuallyValidatedFieldCount > 0 && " · "}
          {manuallyValidatedFieldCount > 0 && (
            <span>
              {manuallyValidatedFieldCount} confirmé{manuallyValidatedFieldCount > 1 ? "s" : ""} par
              vous
            </span>
          )}
        </p>
      )}
    </section>
  );
}

function PillarRow({
  label,
  value,
  href,
  compact,
}: {
  label: string;
  value: number;
  href?: string;
  compact?: boolean;
}) {
  const bar = (
    <div className={compact ? "" : ""}>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className={href ? "text-zinc-300 hover:text-emerald-400" : "text-zinc-400"}>
          {label}
        </span>
        <span className="tabular-nums text-zinc-500">{value} %</span>
      </div>
      <div className={`overflow-hidden rounded-full bg-white/5 ${compact ? "h-1" : "h-1.5"}`}>
        <div
          className="h-full rounded-full bg-emerald-500/70 transition-all duration-500"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block rounded-lg transition-colors hover:bg-white/[0.02]">
        {bar}
      </Link>
    );
  }

  return bar;
}

function Metric({
  label,
  value,
  detail,
  href,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  href?: string;
  tone: "neutral" | "warning" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "text-red-400"
      : tone === "warning"
        ? "text-amber-400"
        : "text-zinc-100";

  const inner = (
    <>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      <p className="mt-0.5 text-xs text-zinc-600">{detail}</p>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-colors hover:bg-white/[0.04]"
      >
        {inner}
      </Link>
    );
  }

  return <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">{inner}</div>;
}

function StatusBadge({
  status,
  canClose,
}: {
  status: keyof typeof FISCAL_YEAR_STATUS_LABELS;
  canClose: boolean;
}) {
  const label = canClose ? FISCAL_YEAR_STATUS_LABELS.ready_to_close : FISCAL_YEAR_STATUS_LABELS[status];
  const className = canClose
    ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30"
    : status === "analyzing"
      ? "bg-blue-500/15 text-blue-400 ring-blue-500/30"
      : status === "pending_validation"
        ? "bg-amber-500/15 text-amber-400 ring-amber-500/30"
        : "bg-white/5 text-zinc-400 ring-white/10";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${className}`}>
      {label}
    </span>
  );
}
