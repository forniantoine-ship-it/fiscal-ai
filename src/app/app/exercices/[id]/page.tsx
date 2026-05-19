"use client";

import { AlertList } from "@/components/lmnp/shared/AlertList";
import { NextActionCard } from "@/components/lmnp/shared/NextActionCard";
import { PageHeader } from "@/components/lmnp/shared/PageHeader";
import { CONFIDENCE_LEVEL_LABELS } from "@/components/lmnp/app-shell/labels";
import { useLmnp } from "@/lib/lmnp/store";
import Link from "next/link";

export default function ExerciceDashboardPage() {
  const { workspace } = useLmnp();
  const { fiscalYear, confidence, documents, validationItems, alerts } = workspace;
  const base = `/app/exercices/${fiscalYear.id}`;

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Bonjour — exercice ${fiscalYear.year}`}
        description="Votre copilote LMNP : déposez vos documents, confirmez les montants, suivez votre avancement."
      />

      <NextActionCard />

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Documents" value={String(documents.length)} href={`${base}/documents`} />
        <StatCard
          label="À confirmer"
          value={String(workspace.pendingValidationCount)}
          href={`${base}/validation`}
          highlight={workspace.pendingValidationCount > 0}
        />
        <StatCard
          label="Avancement"
          value={`${confidence.score} %`}
          sub={CONFIDENCE_LEVEL_LABELS[confidence.level]}
        />
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-300">Alertes</h2>
          <Link href={`${base}/alertes`} className="text-sm text-emerald-400 hover:text-emerald-300">
            Tout voir
          </Link>
        </div>
        <AlertList alerts={alerts} limit={3} />
      </section>

      <p className="text-center text-xs text-zinc-600">
        {validationItems.filter((v) => v.status === "approved" || v.status === "corrected").length}{" "}
        montants validés par vous · L&apos;IA propose, vous décidez
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  href,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  href?: string;
  highlight?: boolean;
}) {
  const inner = (
    <div
      className={`glass rounded-xl p-5 ${highlight ? "ring-1 ring-amber-500/30" : ""} ${href ? "transition-colors hover:bg-white/[0.04]" : ""}`}
    >
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-100">{value}</p>
      {sub && <p className="mt-1 text-xs text-zinc-500">{sub}</p>}
    </div>
  );
  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}
