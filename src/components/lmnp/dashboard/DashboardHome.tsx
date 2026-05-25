"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { Button } from "@/design-system/components/Button";
import { colors } from "@/design-system/theme/colors";
import { DashboardActiveStepCard } from "@/components/lmnp/dashboard/DashboardActiveStepCard";
import { DashboardDocumentsSection } from "@/components/lmnp/dashboard/DashboardDocumentsSection";
import { DashboardHero } from "@/components/lmnp/dashboard/DashboardHero";
import { DashboardWorkflow } from "@/components/lmnp/dashboard/DashboardWorkflow";
import {
  resolveActiveWorkflowStep,
  resolveDashboardWorkflow,
} from "@/components/lmnp/dashboard/dashboard-workflow-model";
import {
  isDocumentJourneyStarted,
  resolveCurrentDocumentStepHref,
} from "@/lib/lmnp/engine/document-journey-progress";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import { useLmnp } from "@/lib/lmnp/store";
import type { AutosaveStatus } from "@/design-system/layouts/DashboardLayout";

function autosaveLabel(status: AutosaveStatus): { label: string | null; active: boolean } {
  if (status === "saved") return { label: "Dossier enregistré", active: false };
  if (status === "saving") return { label: "Enregistrement…", active: true };
  if (status === "error") return { label: "Erreur de sauvegarde", active: false };
  return { label: null, active: false };
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
  const resumeHref = resolveCurrentDocumentStepHref(workspace.fiscalYear.id, ws);
  const progressValue = completed ? 100 : workspace.journey.percentComplete || workspace.declaration.percentComplete;

  const startJourney = () => {
    dispatch({ type: "START_DOCUMENT_JOURNEY" });
    router.push(LMNP_ROUTES.documents);
  };

  return (
    <div className="relative mx-auto max-w-6xl space-y-12 pb-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-[-12%] top-[-8%] h-[420px]"
        style={{
          backgroundImage: [
            `radial-gradient(ellipse 42% 58% at 0% 40%, ${colors.orange[200]} 0%, ${colors.orange[100]} 28%, transparent 72%)`,
            `radial-gradient(ellipse 42% 58% at 100% 40%, ${colors.orange[200]} 0%, ${colors.orange[100]} 28%, transparent 72%)`,
            `radial-gradient(ellipse 60% 42% at 50% 0%, ${colors.orange[50]} 0%, transparent 72%)`,
          ].join(", "),
        }}
      />

      <div className="relative space-y-12">
        <DashboardHero
          year={workspace.fiscalYear.year}
          progress={progressValue}
          progressLabel={completed ? "Dossier finalisé" : "Avancement du dossier"}
          saveLabel={save.label}
          saveActive={save.active}
        >
          {completed ? (
            <Button href={LMNP_ROUTES.documents} variant="secondary">
              Consulter mes documents
            </Button>
          ) : !started ? (
            <Button onClick={startJourney}>Importer mes documents</Button>
          ) : (
            <>
              <Button href={activeStep.uploadHref}>Importer le document</Button>
              <Button href={resumeHref} variant="secondary">
                Poursuivre le dépôt
              </Button>
            </>
          )}
        </DashboardHero>

        <DashboardWorkflow steps={workflowSteps} />

        {!completed ? <DashboardActiveStepCard step={activeStep} /> : null}

        <DashboardDocumentsSection />
      </div>
    </div>
  );
}
