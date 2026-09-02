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
import { WorkflowPageBackLink } from "@/components/lmnp/shared/WorkflowProgressionActions";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import { resolveDeclarationGenerationGate } from "@/lib/lmnp/services/declaration/declaration-generation-gate";
import {
  declarationCompletude,
  runDeclarationGeneration,
} from "@/lib/lmnp/services/declaration/run-declaration-generation";
import { useLmnp } from "@/lib/lmnp/store";
import type { TunnelStepProps } from "@/components/lmnp/documents/frozen-tunnel-step";

// La télétransmission EDI n'est pas encore raccordée à un partenaire (cf. audit
// F-015) : cette liste n'affiche que des étapes réellement exécutées par
// runDeclarationGeneration() (calcul fiscal F-006 puis liasse F-007). Ne jamais
// y remettre "Télétransmission EDI" tant qu'un retour réel de partenaire
// n'existe pas — un ✓ ici confirmerait visuellement une transmission fictive.
const GENERATION_AI_STEPS = [
  "Validation",
  "Calcul fiscal consolidé",
  "Génération documents officiels",
] as const;

type FlowPhase = "idle" | "checkout" | "generating";

export function ValidationDocumentStep({ isActive = true }: TunnelStepProps) {
  const router = useRouter();
  const { workspace, dispatch } = useLmnp();
  const { showSuccess } = useFeedback();

  const draft = workspace.declarationDraft;
  const { fiscalYear } = workspace;
  const paid = Boolean(fiscalYear.paidAt);
  const generated = Boolean(fiscalYear.declarationGeneratedAt);

  const gate = useMemo(
    () =>
      resolveDeclarationGenerationGate({
        draft,
        properties: workspace.properties,
        fiscalYear: fiscalYear.year,
        paid,
        generated,
      }),
    [draft, fiscalYear.year, generated, paid, workspace.properties],
  );
  const snapshot = gate.snapshot;

  const [phase, setPhase] = useState<FlowPhase>("idle");
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const canGenerate = gate.canGenerate && phase === "idle";
  const showMainContent = phase === "idle" && (!generated || gate.canGenerate);
  const blockingAnomalies = gate.blockingAnomalies;
  const missingItems = gate.recoveryItems.length > 0 ? gate.recoveryItems : snapshot.missing;

  const handleGenerateClick = useCallback(() => {
    if (!gate.canGenerate) return;
    if (gate.canRetryAfterPayment) {
      setCheckoutOpen(false);
      setPhase("generating");
      return;
    }
    setCheckoutOpen(true);
    setPhase("checkout");
  }, [gate.canGenerate, gate.canRetryAfterPayment]);

  const handleCheckoutClose = useCallback(() => {
    setCheckoutOpen(false);
    setPhase("idle");
  }, []);

  const handlePaymentConfirmed = useCallback(() => {
    setCheckoutOpen(false);
    setPhase("generating");
  }, []);

  const handleGenerationComplete = useCallback(() => {
    const outcome = runDeclarationGeneration(draft, fiscalYear.year);

    if (outcome.status === "blocked") {
      setPhase("idle");
      return;
    }

    const now = new Date().toISOString();
    dispatch({
      type: "DECLARATION_PATCH_DRAFT",
      patch: {
        fiscalResult: outcome.fiscalResult,
        fiscalResultConfirmedAt: now,
        liasseResult: outcome.liasseResult,
        liasseGeneratedAt: now,
        // Même RFS que celle utilisée pour fiscalResult/liasseResult ci-dessus
        // (un seul appel à runDeclarationGeneration()) — persistée pour que
        // DeclarationReadyView puisse construire le document client sans
        // reconstruire ni recalculer quoi que ce soit.
        rfs: outcome.rfs,
        // Formulaires complémentaires (2031-bis, 2033-A/B/C) — assemblés depuis
        // la même RFS ci-dessus, aucun second calcul. Jusqu'ici calculé par
        // runDeclarationGeneration() mais jamais persisté (P0-1).
        liasseRfs: outcome.liasseRfs,
      },
    });
    if (!paid) {
      dispatch({ type: "JOURNEY_MARK_PAID" });
    }
    dispatch({ type: "JOURNEY_MARK_DECLARATION_GENERATED" });
    showSuccess(
      "Déclaration générée",
      "Vos documents officiels sont disponibles dans votre espace déclaration.",
      LMNP_ROUTES.declarations,
    );
    router.push(LMNP_ROUTES.declarations);
  }, [dispatch, draft, fiscalYear.year, paid, router, showSuccess]);

  if (generated && paid && !gate.canGenerate) {
    // Cycle 25 — le statut affiché ne doit jamais dépasser ce qui est réellement
    // produit : `formulairesManquants` (F-007) fait foi, jamais un wording figé.
    // Ne jamais mentionner un "reçu EDI" : la télétransmission n'est pas raccordée
    // à ce jour (cf. commentaire GENERATION_AI_STEPS ci-dessus).
    const completude = draft?.liasseResult ? declarationCompletude(draft.liasseResult) : "partielle";
    const heading = completude === "complete" ? "✓ Déclaration générée" : "✓ Calcul fiscal généré";
    const body =
      completude === "complete"
        ? "Vos documents officiels sont disponibles."
        : `Votre résultat fiscal et votre formulaire 2031-SD sont disponibles. ${
            draft?.liasseResult?.formulairesManquants.length
              ? `Formulaires restant à générer : ${draft.liasseResult.formulairesManquants.join(", ")}.`
              : ""
          }`;

    return (
      <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-6 pb-16">
        <WorkflowPageBackLink />
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
            {heading}
          </p>
          <p className="mt-4" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
            {body}
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
      <WorkflowPageBackLink />

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
          {blockingAnomalies.length > 0 ? (
            <div
              className="w-full animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both] text-center"
              style={{
                borderRadius: radius.lg,
                border: `1px solid ${colors.error.border}`,
                backgroundColor: colors.error.surface,
                boxShadow: shadows.card.default,
                padding: spacing.card.md,
              }}
            >
              <p
                style={{
                  fontFamily: typography.fontFamily.display,
                  fontSize: typography.fontSize.lg,
                  color: colors.error.DEFAULT,
                }}
              >
                Le calcul fiscal n&apos;a pas pu être finalisé
              </p>
              <ul className="mx-auto mt-4 max-w-md space-y-1 text-left">
                {blockingAnomalies.map((anomaly, index) => (
                  <li
                    key={`${anomaly.field ?? "anomaly"}-${index}`}
                    style={{ ...typography.body.desktop, color: colors.text.secondary }}
                  >
                    • {anomaly.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="w-full space-y-3 [&>section]:!mx-0 [&>section]:!w-full [&>section]:!max-w-none">
            <ValidationHero ready={snapshot.isComplete && !snapshot.isMultiProperty && gate.canGenerate} />
          </div>

          <ValidationStatusCards steps={snapshot.steps} cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE} />

          <ValidationIncompleteCard missing={missingItems} cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE} />

          <ValidationFiscalSummary
            summary={snapshot.fiscalSummary}
            fiscalResult={gate.fiscalResult}
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
