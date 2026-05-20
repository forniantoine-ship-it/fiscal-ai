"use client";

import Link from "next/link";
import { ValidationInbox } from "@/components/lmnp/validation/ValidationInbox";
import { DossierProgressCard } from "@/components/lmnp/shared/DossierProgressCard";
import { PageHeader } from "@/components/lmnp/shared/PageHeader";
import { useLmnp } from "@/lib/lmnp/store";

export default function ValidationPage() {
  const { workspace } = useLmnp();
  const base = `/app/exercices/${workspace.fiscalYear.id}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vérification détaillée"
        description="Vue complète des montants détectés par l’IA. Pour le quotidien, préférez confirmer directement dans Mes loyers ou Mes dépenses."
      >
        <Link
          href={`${base}/recettes`}
          className="rounded-full border border-emerald-500/30 px-4 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-500/10"
        >
          Valider dans mes onglets →
        </Link>
      </PageHeader>
      <DossierProgressCard compact />
      <ValidationInbox />
    </div>
  );
}
