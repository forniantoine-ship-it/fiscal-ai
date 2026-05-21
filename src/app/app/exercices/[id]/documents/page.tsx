"use client";

import { DocumentChecklist } from "@/components/lmnp/documents/DocumentChecklist";
import { DocumentUploadPanel } from "@/components/lmnp/documents/DocumentUploadPanel";
import { StepPageShell } from "@/components/lmnp/journey/StepPageShell";
import { useLmnp } from "@/lib/lmnp/store";

export default function DocumentsPage() {
  const { workspace } = useLmnp();
  const isAnalyzing = workspace.documents.some(
    (d) => d.status === "uploaded" || d.status === "processing",
  );

  return (
    <StepPageShell hideNextCta>
      <div className="mx-auto max-w-lg space-y-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
          {isAnalyzing ? "Analyse en cours" : "Documents"}
        </h1>
        <DocumentUploadPanel />
        {!isAnalyzing && workspace.documents.length > 0 && <DocumentChecklist />}
      </div>
    </StepPageShell>
  );
}
