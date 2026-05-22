"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLmnp } from "@/lib/lmnp/store";
import {
  documentJourneyStepHref,
  resolveCurrentDocumentStepId,
} from "@/lib/lmnp/engine/document-journey-progress";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";

export default function DocumentsRedirectPage() {
  const router = useRouter();
  const { workspace, isReady } = useLmnp();

  useEffect(() => {
    if (!isReady) return;
    const ws: PersistedWorkspace = {
      fiscalYear: workspace.fiscalYear,
      properties: workspace.properties,
      documents: workspace.documents,
      extractions: workspace.extractions,
      validationItems: workspace.validationItems,
      ledgerEntries: workspace.ledgerEntries,
      declarationDraft: workspace.declarationDraft,
    };
    const stepId = resolveCurrentDocumentStepId(ws);
    router.replace(documentJourneyStepHref(workspace.fiscalYear.id, stepId));
  }, [isReady, router, workspace]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-stone-500">
      Redirection…
    </div>
  );
}
