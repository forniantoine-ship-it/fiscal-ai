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
        title="Vos documents"
        description="Téléversez simplement vos PDF. L’IA les analyse, les classe et remplit votre déclaration — vous n’avez pas à choisir une catégorie comptable."
      >
        {workspace.pendingValidationCount > 0 && (
          <Link
            href={`${base}/recettes`}
            className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
          >
            Vérifier {workspace.pendingValidationCount} montant
            {workspace.pendingValidationCount > 1 ? "s" : ""}
          </Link>
        )}
      </PageHeader>

      <DocumentUploadPanel />
      <DocumentChecklist />
    </div>
  );
}
