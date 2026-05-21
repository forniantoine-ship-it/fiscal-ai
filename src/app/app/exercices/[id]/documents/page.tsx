"use client";

import { DocumentChecklist } from "@/components/lmnp/documents/DocumentChecklist";
import { DocumentUploadPanel } from "@/components/lmnp/documents/DocumentUploadPanel";
import { StepPageShell } from "@/components/lmnp/journey/StepPageShell";
import { PageHeader } from "@/components/lmnp/shared/PageHeader";
import { useLmnp } from "@/lib/lmnp/store";

export default function DocumentsPage() {
  const { workspace } = useLmnp();
  const isAnalyzing = workspace.documents.some(
    (d) => d.status === "uploaded" || d.status === "processing",
  );

  return (
    <StepPageShell hideNextCta>
      <div className="mx-auto max-w-2xl space-y-8">
        <PageHeader
          title={
            isAnalyzing ? "L’IA analyse vos documents" : "Déposez vos documents"
          }
          description="L’IA lit, classe et pré-remplit votre dossier automatiquement. Vous n’avez rien à saisir."
        />
        <DocumentUploadPanel />
        <DocumentChecklist />
      </div>
    </StepPageShell>
  );
}
