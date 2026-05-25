"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { DashboardDocumentsSection } from "@/components/lmnp/dashboard/DashboardDocumentsSection";
import { DashboardHero } from "@/components/lmnp/dashboard/DashboardHero";
import { DashboardWorkflow } from "@/components/lmnp/dashboard/DashboardWorkflow";
import {
  resolveActiveWorkflowStep,
  resolveDashboardWorkflow,
} from "@/components/lmnp/dashboard/dashboard-workflow-model";
import { isDocumentJourneyStarted } from "@/lib/lmnp/engine/document-journey-progress";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import { useLmnp } from "@/lib/lmnp/store";
import type { AutosaveStatus } from "@/design-system/layouts/DashboardLayout";

function autosaveLabel(status: AutosaveStatus): { label: string | null; active: boolean } {
  if (status === "saved") return { label: "Dossier enregistré", active: false };
  if (status === "saving") return { label: "Enregistrement…", active: true };
  if (status === "error") return { label: "Erreur de sauvegarde", active: false };
  return { label: "Dossier enregistré", active: false };
}

export function DashboardHome() {
  const router = useRouter();
  const { workspace, dispatch, autosaveStatus } = useLmnp();
  const save = autosaveLabel(autosaveStatus);
  const completed = Boolean(workspace.fiscalYear.transmittedAt);

  const ws = useMemo(
    () => ({
      fiscalYear: workspace.fiscalYear,
      properties: workspace.properties,
      documents: workspace.documents,
      extractions: workspace.extractions,
      validationItems: workspace.validationItems,
      ledgerEntries: workspace.ledgerEntries,
      declarationDraft: workspace.declarationDraft,
    }),
    [workspace],
  );

  const workflowSteps = useMemo(() => resolveDashboardWorkflow(workspace), [workspace]);
  const activeStep = useMemo(() => resolveActiveWorkflowStep(workspace), [workspace]);
  const started = isDocumentJourneyStarted(ws);
  const progressValue = completed ? 100 : workspace.journey.percentComplete || workspace.declaration.percentComplete;

  const startJourney = () => {
    dispatch({ type: "START_DOCUMENT_JOURNEY" });
    router.push(LMNP_ROUTES.documents);
  };

  const primaryLabel = !started
    ? "Commencer votre déclaration"
    : "Poursuivre votre déclaration";

  const primaryHref = started ? activeStep.uploadHref : undefined;
  const onPrimaryClick = !started ? startJourney : undefined;

  return (
    <div className="relative mx-auto max-w-6xl space-y-14 pb-20">
      <div className="relative space-y-14">
        <DashboardHero
          year={workspace.fiscalYear.year}
          progress={progressValue}
          progressLabel="Avancement du dossier"
          saveLabel={save.label}
          saveActive={save.active}
          primaryLabel={primaryLabel}
          primaryHref={completed ? LMNP_ROUTES.documents : primaryHref}
          onPrimaryClick={completed ? undefined : onPrimaryClick}
        />

        <Suspense fallback={null}>
          <DashboardWorkflow steps={workflowSteps} />
        </Suspense>

        <DashboardDocumentsSection />
      </div>
    </div>
  );
}
