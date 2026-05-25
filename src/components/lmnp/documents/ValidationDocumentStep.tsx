"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/design-system/components/Button";
import { ActiviteAiProcessing } from "@/components/lmnp/activite/ActiviteAiProcessing";
import {
  DOCUMENT_WORKFLOW_CARD_STYLE,
} from "@/components/lmnp/documents/document-workflow-shared";
import { ValidationAiValueBlock } from "@/components/lmnp/validation-workflow/ValidationAiValueBlock";
import { ValidationCheckoutOverlay } from "@/components/lmnp/validation-workflow/ValidationCheckoutOverlay";
import { ValidationFiscalSummary } from "@/components/lmnp/validation-workflow/ValidationFiscalSummary";
import { ValidationGenerateCta } from "@/components/lmnp/validation-workflow/ValidationGenerateCta";
import { ValidationHero } from "@/components/lmnp/validation-workflow/ValidationHero";
import { ValidationIncompleteCard } from "@/components/lmnp/validation-workflow/ValidationIncompleteCard";
import { ValidationMultiPropertyBlock } from "@/components/lmnp/validation-workflow/ValidationMultiPropertyBlock";
import { ValidationPricingBlock } from "@/components/lmnp/validation-workflow/ValidationPricingBlock";
import { ValidationStatusCards } from "@/components/lmnp/validation-workflow/ValidationStatusCards";
import { ValidationSupportFooter } from "@/components/lmnp/validation-workflow/ValidationSupportFooter";
import { useFeedback } from "@/components/lmnp/shared/FeedbackProvider";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import { buildValidationDossierSnapshot } from "@/lib/lmnp/services/validation-profile";
import { useLmnp } from "@/lib/lmnp/store";

const GENERATION_AI_STEPS = [
  "Validation",
  "Préparation génération",
  "Télétransmission EDI",
  "Génération documents officiels",
] as const;

type FlowPhase = "idle" | "checkout" | "generating";

export function ValidationDocumentStep() {
  const router = useRouter();
  const { workspace, dispatch } = useLmnp();
  const { showSuccess } = useFeedback();

  const draft = workspace.declarationDraft;
  const { fiscalYear } = workspace;
  const paid = Boolean(fiscalYear.paidAt);
  const generated = Boolean(fiscalYear.declarationGeneratedAt);

  const snapshot = useMemo(
    () => buildValidationDossierSnapshot(draft, workspace.properties, fiscalYear.year),
    [draft, workspace.properties, fiscalYear.year],
  );

  const [phase, setPhase] = useState<FlowPhase>("idle");
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const canGenerate =
    snapshot.isComplete && !snapshot.isMultiProperty && !paid && phase === "idle";
  const showMainContent = phase === "idle" && !generated;

  const handleGenerateClick = useCallback(() => {
    if (!snapshot.isComplete || snapshot.isMultiProperty) return;
    setCheckoutOpen(true);
    setPhase("checkout");
  }, [snapshot.isComplete, snapshot.isMultiProperty]);

  const handleCheckoutClose = useCallback(() => {
    setCheckoutOpen(false);
    setPhase("idle");
  }, []);

  const handlePaymentConfirmed = useCallback(() => {
    dispatch({ type: "JOURNEY_MARK_PAID" });
    setCheckoutOpen(false);
    setPhase("generating");
  }, [dispatch]);

  const handleGenerationComplete = useCallback(() => {
    dispatch({ type: "JOURNEY_MARK_DECLARATION_GENERATED" });
    showSuccess(
      "Déclaration générée",
      "Vos documents officiels sont disponibles dans votre espace déclaration.",
      LMNP_ROUTES.declarations,
    );
    router.push(LMNP_ROUTES.declarations);
  }, [dispatch, router, showSuccess]);

  if (generated && paid) {
    return (
      <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-6 pb-16">
        <div className="flex w-full justify-center">
          <Button href={LMNP_ROUTES.dashboard}>Tableau de bord</Button>
        </div>
        <div
          className="w-full animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both] text-center"
          style={{
            borderRadius: radius.lg,
            border: `1px solid ${colors.success.border}`,
            backgroundColor: colors.success.surface,
            boxShadow: shadows.card.default,
            padding: spacing.card.md,
          }}
        >
          <p
            style={{
              fontFamily: typography.fontFamily.display,
              fontSize: typography.fontSize.xl,
              color: colors.success.DEFAULT,
            }}
          >
            ✓ Déclaration générée
          </p>
          <p className="mt-4" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
            Vos documents officiels et le reçu EDI sont disponibles.
          </p>
          <div className="mt-8 flex justify-center">
            <Button href={LMNP_ROUTES.declarations}>Voir ma déclaration</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-6 pb-16">
      <div className="flex w-full justify-center">
        <Button href={LMNP_ROUTES.dashboard}>Tableau de bord</Button>
      </div>

      {phase === "generating" ? (
        <ActiviteAiProcessing
          steps={GENERATION_AI_STEPS}
          finalStepLabel="Génération documents officiels"
          minDurationMs={5200}
          onComplete={handleGenerationComplete}
        />
      ) : null}

      {showMainContent ? (
        <>
          <div className="w-full space-y-3 [&>section]:!mx-0 [&>section]:!w-full [&>section]:!max-w-none">
            <ValidationHero />
          </div>

          <ValidationStatusCards steps={snapshot.steps} cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE} />

          <ValidationIncompleteCard missing={snapshot.missing} cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE} />

          <ValidationFiscalSummary
            summary={snapshot.fiscalSummary}
            cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE}
          />

          <ValidationAiValueBlock cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE} />

          <p
            className="text-center"
            style={{ ...typography.caption.desktop, color: colors.text.muted }}
          >
            {snapshot.deadlineLabel}
          </p>

          {snapshot.isMultiProperty ? (
            <ValidationMultiPropertyBlock cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE} />
          ) : (
            <>
              <ValidationPricingBlock cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE} />
              <ValidationGenerateCta disabled={!canGenerate} onClick={handleGenerateClick} />
            </>
          )}

          <ValidationSupportFooter />
        </>
      ) : null}

      <ValidationCheckoutOverlay
        open={checkoutOpen}
        fiscalYear={fiscalYear.year}
        onClose={handleCheckoutClose}
        onConfirmPayment={handlePaymentConfirmed}
      />
    </div>
  );
}
