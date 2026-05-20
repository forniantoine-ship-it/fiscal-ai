"use client";

import { DocumentChecklist } from "@/components/lmnp/documents/DocumentChecklist";
import { DocumentUploadPanel } from "@/components/lmnp/documents/DocumentUploadPanel";
import { PageHeader } from "@/components/lmnp/shared/PageHeader";
import Link from "next/link";
import { useLmnp } from "@/lib/lmnp/store";

export default function DocumentsPage() {
  const { workspace } = useLmnp();
  const base = `/app/exercices/${workspace.fiscalYear.id}`;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Documents"
        description="Ajoutez vos pièces (bail, relevés, factures). Nous les analysons pour pré-remplir votre dossier — vous confirmez ensuite chaque montant."
      >
        {workspace.pendingValidationCount > 0 && (
          <Link
            href={`${base}/validation`}
            className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
          >
            Voir {workspace.pendingValidationCount} à confirmer
          </Link>
        )}
      </PageHeader>
      <DocumentChecklist />
      <DocumentUploadPanel />
    </div>
  );
}
