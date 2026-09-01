"use client";

import { Suspense, useCallback, useMemo, useState } from "react";

import { DashboardConseillerSection } from "@/components/lmnp/dashboard/DashboardConseillerSection";
import { DashboardWorkflow } from "@/components/lmnp/dashboard/DashboardWorkflow";
import { SectionHeader } from "@/components/lmnp/dashboard/SectionHeader";
import { VaultSection } from "@/components/lmnp/dashboard/VaultSection";
import {
  resolveActiveWorkflowStep,
  resolveDashboardWorkflow,
} from "@/components/lmnp/dashboard/dashboard-workflow-model";
import { resolveDashboardHeroState } from "@/components/lmnp/dashboard/workflow-progression";
import { Chapter, FullHeightChapters } from "@/design-system/layouts/FullHeightChapters";
import { DashboardFooter } from "@/design-system/layouts/DashboardLayout";
import { motions } from "@/design-system/theme/motions";
import { useLmnp } from "@/lib/lmnp/store";
import { WorkflowInspector } from "@/components/lmnp/dev/WorkflowInspector";
import { deriveStatutDossier } from "@/lib/lmnp/engine/dossier-status";
import { compareDossierStatusShadow } from "@/lib/lmnp/engine/dossier-status-shadow";
import { compareDossierCompletenessShadow } from "@/lib/lmnp/engine/dossier-completeness-shadow";
import { scrollChapterPanelIntoView } from "@/components/lmnp/dashboard/dashboard-chapter-scroll";

const CHAPTER_WORKFLOW_ID = "dashboard-chapter-workflow";

const highlightHoldMs =
  Number.parseInt(motions.duration.extended, 10) +
  Number.parseInt(motions.duration.deliberate, 10);

export function DashboardHome() {
  const { workspace, dispatch } = useLmnp();
  const [highlightStepId, setHighlightStepId] = useState<string | null>(null);
  const [highlightActive, setHighlightActive] = useState(false);

  const workflowSteps = useMemo(() => resolveDashboardWorkflow(workspace), [workspace]);
  const heroState = useMemo(() => resolveDashboardHeroState(workspace), [workspace]);
  const currentStep = useMemo(() => resolveActiveWorkflowStep(workspace), [workspace]);

  const firstName = workspace.declarationDraft?.exploitantFirstName?.trim();
  const greeting = firstName ? `Bonjour ${firstName},` : "Bonjour,";
  const fiscalYear = workspace.fiscalYear.year;

  const derivedStatus = useMemo(() => deriveStatutDossier(workspace), [workspace]);
  const shadowComparison = useMemo(() => compareDossierStatusShadow(workspace), [workspace]);
  const completenessComparison = useMemo(
    () => compareDossierCompletenessShadow(workspace),
    [workspace],
  );

  const handlePrimaryAction = useCallback(() => {
    scrollChapterPanelIntoView(CHAPTER_WORKFLOW_ID);

    if (heroState.startJourney) {
      dispatch({ type: "START_DOCUMENT_JOURNEY" });
    }

    const highlightDelay = Number.parseInt(motions.duration.deliberate, 10);

    window.setTimeout(() => {
      setHighlightStepId(heroState.highlightStepId);
      setHighlightActive(true);
      window.setTimeout(() => setHighlightActive(false), highlightHoldMs);
    }, highlightDelay);
  }, [dispatch, heroState.highlightStepId, heroState.startJourney]);

  return (
    <>
      <FullHeightChapters>
        <Chapter aria-label="Votre Conseiller" variant="panel">
          <SectionHeader
            number={1}
            surtitle="VOTRE CONSEILLER"
            title={greeting}
            showRailAbove={false}
            showRailBelow
          />
          <DashboardConseillerSection
            title={heroState.title}
            explanation={heroState.explanation}
            conseillerObservation={heroState.conseillerObservation}
            heroKind={heroState.kind}
            primaryLabel={heroState.primaryLabel}
            onPrimaryClick={handlePrimaryAction}
            currentStep={currentStep}
          />
        </Chapter>

        <Chapter
          id={CHAPTER_WORKFLOW_ID}
          aria-label="Vos étapes de déclaration"
          variant="panel"
        >
          <SectionHeader
            number={2}
            surtitle="VOS ÉTAPES DE DÉCLARATION"
            title="Suivez votre progression étape par étape."
            showRailAbove
            showRailBelow
            touchAction="pan-y"
          />
          <Suspense fallback={null}>
            <DashboardWorkflow
              steps={workflowSteps}
              highlightStepId={highlightStepId}
              highlightActive={highlightActive}
            />
          </Suspense>
        </Chapter>

        <Chapter aria-label="Votre Coffre-fort" variant="panel">
          <SectionHeader
            number={3}
            surtitle={`VOTRE COFFRE-FORT ${fiscalYear}`}
            title="Vos documents en toute sécurité"
            showRailAbove
            showRailBelow={false}
          />
          <VaultSection />
        </Chapter>

        <Chapter aria-label="Pied de page" variant="flow">
          <DashboardFooter />
        </Chapter>
      </FullHeightChapters>

      <WorkflowInspector
        phase={derivedStatus}
        localState={{
          fiscalYearStatus: workspace.fiscalYear.status,
          heroTitle: heroState.title,
          heroKind: heroState.kind,
        }}
        derivedState={{
          "STATE-001 (dérivé)": derivedStatus,
          "declaration.currentStepId": shadowComparison.declarationCurrentStepId,
          "phase attendue": shadowComparison.expectedPhase,
          "phase observée": shadowComparison.actualPhase,
          "divergent (declaration)": shadowComparison.divergent,
          "businessStepsComplete()": completenessComparison.businessStepsComplete,
          "DOSSIER_COMPLET (dérivé)": completenessComparison.derivedIsDossierComplet,
          "divergent (complétude)": completenessComparison.divergent,
        }}
        blockers={[
          ...(shadowComparison.divergent
            ? ["Divergence STATE-001 ↔ declaration-progress — voir RT-002 §3.4 bis"]
            : []),
          ...(completenessComparison.divergent
            ? ["Divergence businessStepsComplete ↔ DOSSIER_COMPLET — voir RT-002 §3.4 ter"]
            : []),
        ]}
      />
    </>
  );
}
