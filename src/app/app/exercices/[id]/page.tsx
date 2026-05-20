"use client";

import { CopilotGuideCard } from "@/components/lmnp/shared/CopilotGuideCard";
import { DossierProgressCard } from "@/components/lmnp/shared/DossierProgressCard";
import { NextActionCard } from "@/components/lmnp/shared/NextActionCard";
import { PageHeader } from "@/components/lmnp/shared/PageHeader";
import { useLmnp } from "@/lib/lmnp/store";
import Link from "next/link";

export default function ExerciceDashboardPage() {
  const { workspace } = useLmnp();
  const { fiscalYear, documents } = workspace;
  const base = `/app/exercices/${fiscalYear.id}`;
  const isFirstVisit = documents.length === 0;

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Votre déclaration LMNP ${fiscalYear.year}`}
        description="Un assistant pas à pas : déposez vos documents, l’IA remplit tout, vous confirmez. Aucune connaissance comptable requise."
      />

      {isFirstVisit ? (
        <CopilotGuideCard />
      ) : (
        <>
          <CopilotGuideCard />
          <NextActionCard />
        </>
      )}

      <DossierProgressCard />

      <section className="grid gap-4 sm:grid-cols-3">
        <QuickLink
          label="Mes documents"
          detail={`${documents.length} fichier${documents.length > 1 ? "s" : ""} déposé${documents.length > 1 ? "s" : ""}`}
          href={`${base}/documents`}
        />
        <QuickLink
          label="À valider"
          detail={
            workspace.pendingValidationCount > 0
              ? `${workspace.pendingValidationCount} montant${workspace.pendingValidationCount > 1 ? "s" : ""}`
              : "Rien en attente"
          }
          href={`${base}/recettes`}
          highlight={workspace.pendingValidationCount > 0}
        />
        <QuickLink
          label="Points à clarifier"
          detail={
            workspace.openAlertCount === 0
              ? "Tout va bien"
              : `${workspace.openAlertCount} point${workspace.openAlertCount > 1 ? "s" : ""}`
          }
          href={`${base}/alertes`}
          highlight={workspace.blockingAlertCount > 0}
        />
      </section>

      <p className="text-center text-xs text-zinc-600">
        L’IA lit vos PDF et propose les montants — vous gardez toujours le contrôle avant la
        déclaration.
      </p>
    </div>
  );
}

function QuickLink({
  label,
  detail,
  href,
  highlight,
}: {
  label: string;
  detail: string;
  href: string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`glass block rounded-xl p-5 transition-colors hover:bg-white/[0.04] ${
        highlight ? "ring-1 ring-amber-500/30" : ""
      }`}
    >
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-zinc-100">{detail}</p>
    </Link>
  );
}
