"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { ValidationInpiBlock } from "@/components/lmnp/validation-workflow/ValidationInpiBlock";
import { ValidationMultiPropertyBlock } from "@/components/lmnp/validation-workflow/ValidationMultiPropertyBlock";
import { PatrimonialIntakeCard } from "@/components/lmnp/documents/PatrimonialIntakeCard";
import { Dispense2033AIntakeCard, type Dispense2033AIntakeValue } from "@/components/lmnp/documents/Dispense2033AIntakeCard";
import { ValidationPricingBlock } from "@/components/lmnp/validation-workflow/ValidationPricingBlock";
import { ValidationPriorHistoryCard } from "@/components/lmnp/validation-workflow/ValidationPriorHistoryCard";
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
import { appendDeclarationVersion } from "@/lib/lmnp/services/declaration/append-declaration-version";
import { resolveDeclarationGenerationGate } from "@/lib/lmnp/services/declaration/declaration-generation-gate";
import { resolvePriorHistoryEligibility } from "@/lib/lmnp/services/declaration/prior-history-eligibility";
import {
  declarePriorHistoryOnServer,
  pollUntil,
  requestCheckout,
} from "@/lib/lmnp/services/payment/entitlement-client";
import { useServerPaymentSync } from "@/components/lmnp/payment/useServerPaymentSync";
import type { PriorHistoryDeclarationStatus } from "@/lib/lmnp/types/domain";
import {
  formatLiasseCoverageMessage,
  resolveLiasseCoverageState,
} from "@/lib/lmnp/services/declaration/liasse-coverage-state";
import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import { resolveImmobilisationsContinuityForGeneration } from "@/lib/lmnp/services/dossier/fiscal-year-cycle";
import {
  canOfferPaymentWithoutCerfa,
  isBlockingAnomaliesInpiOnly,
} from "@/lib/lmnp/services/declaration/payment-readiness";
import { resolveInpiValidationState } from "@/lib/lmnp/services/inpi/resolve-inpi-validation-state";
import { useLmnp } from "@/lib/lmnp/store";
import type { TunnelStepProps } from "@/components/lmnp/documents/frozen-tunnel-step";
import type { BilanInputs } from "@/runtime/capabilities/bilan/types";

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
  const { workspace, dispatch, dossierInpiStatus, updateInpiStatus, inpiStatusUpdating } = useLmnp();
  const { showSuccess } = useFeedback();

  const draft = workspace.declarationDraft;
  const { fiscalYear } = workspace;
  const paid = Boolean(fiscalYear.paidAt);
  const generated = Boolean(fiscalYear.declarationGeneratedAt);

  // P1 — INPI sur Validation. Combine le statut Dossier-level (miroir React,
  // useLmnp()) avec paidAt/declarationGeneratedAt (inchangés) via une
  // fonction pure testée isolément — jamais un nouveau calcul ad hoc ici.
  const inpiValidationState = resolveInpiValidationState({
    inpiStatus: dossierInpiStatus?.status,
    paidAt: fiscalYear.paidAt,
    declarationGeneratedAt: fiscalYear.declarationGeneratedAt,
  });
  const handleDeclareInpiStatus = useCallback(
    (status: Parameters<typeof updateInpiStatus>[0]) => {
      void updateInpiStatus(status, "declared");
    },
    [updateInpiStatus],
  );

  // P0 launch safety — antériorité LMNP au réel non reprise. Recalculée à
  // chaque changement de l'exercice (jamais mise en cache dans le draft) et
  // transmise à la porte : aucun paiement ni génération sans éligibilité.
  const priorHistory = useMemo(() => resolvePriorHistoryEligibility(fiscalYear), [fiscalYear]);
  const priorHistoryBlocked = !priorHistory.eligible;
  const handleDeclarePriorHistory = useCallback(
    (status: PriorHistoryDeclarationStatus) => {
      dispatch({ type: "DECLARE_PRIOR_HISTORY", status });
      // Payment V1 — la réponse est aussi enregistrée côté serveur (c'est elle que
      // lit l'éligibilité avant Stripe). Échec silencieux ici : le checkout la
      // renvoie systématiquement avant de payer.
      void declarePriorHistoryOnServer(fiscalYear.year, status).catch(() => undefined);
    },
    [dispatch, fiscalYear.year],
  );

  const gate = useMemo(
    () =>
      resolveDeclarationGenerationGate({
        draft,
        properties: workspace.properties,
        fiscalYear: fiscalYear.year,
        paid,
        generated,
        // P0-1B (audit du call site, 2026-09-07) — même stocksOuverture que la
        // génération réelle et que les deux autres call sites (canCloseFiscalYear,
        // resolveDeclarationOutOfDate, tous deux corrigés en P0-1A) : sans ce
        // champ, cet écran reproduisait le même faux positif pour un exercice
        // N+1 en continuité réelle (déficits antérieurs/amortissements reportés
        // non nuls), directement visible ici via gate.canGenerate → CTA de
        // régénération. Valeur déjà résolue et persistée sur `fiscalYear`,
        // jamais recalculée ici.
        stocksOuverture: fiscalYear.stocksOuverture?.stocks,
        // Lot 5 B2 — même continuité immobilisations que handleGenerationComplete.
        continuity: resolveImmobilisationsContinuityForGeneration({
          draft,
          properties: workspace.properties,
          propertyIds: fiscalYear.propertyIds,
          immobilisationsOuverture: fiscalYear.immobilisationsOuverture,
        }),
        priorHistory,
      }),
    [
      draft,
      fiscalYear.immobilisationsOuverture,
      fiscalYear.propertyIds,
      fiscalYear.stocksOuverture,
      fiscalYear.year,
      generated,
      paid,
      priorHistory,
      workspace.properties,
    ],
  );
  const snapshot = gate.snapshot;

  const [phase, setPhase] = useState<FlowPhase>("idle");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  // P1 — distingue le paiement suivi d'une génération immédiate ("generate",
  // comportement existant inchangé) du paiement seul ("pay-only", nouveau) :
  // seul ce second mode évite d'appeler runDeclarationGeneration() après
  // confirmation du paiement.
  const [checkoutMode, setCheckoutMode] = useState<"generate" | "pay-only">("generate");

  const canGenerate = gate.canGenerate && phase === "idle";
  // P0 — bloqué : le contenu principal reste affiché (question + blocage
  // visibles, CTA désactivés), y compris pour un exercice déjà généré.
  const showMainContent = phase === "idle" && (priorHistoryBlocked || !generated || gate.canGenerate);
  const blockingAnomalies = gate.blockingAnomalies;
  const missingItems = gate.recoveryItems.length > 0 ? gate.recoveryItems : snapshot.missing;

  // P1 — Découplage paiement / génération (SIREN/SIRET pas encore obtenu via
  // l'INPI). N'affaiblit jamais gate.canGenerate (inchangé, seul juge de la
  // génération réelle) : ce booléen sert uniquement à proposer un paiement
  // distinct quand le blocage ne relève QUE de l'identité INPI. Voir
  // payment-readiness.ts pour la liste documentée des anomalies ignorées.
  const showPayWithoutCerfaCta =
    !gate.canGenerate && canOfferPaymentWithoutCerfa({ gate, paid, phaseIsIdle: phase === "idle" });

  const handleGenerateClick = useCallback(() => {
    if (!gate.canGenerate) return;
    if (gate.canRetryAfterPayment) {
      setCheckoutOpen(false);
      setPhase("generating");
      return;
    }
    setCheckoutMode("generate");
    setCheckoutOpen(true);
    setPhase("checkout");
  }, [gate.canGenerate, gate.canRetryAfterPayment]);

  // P1 — même paiement (mock) que handleGenerateClick, mais n'appelle jamais
  // runDeclarationGeneration() : le SIREN/SIRET requis par
  // validate-liasse-inputs.ts (inchangé) manque encore. gate.canGenerate
  // n'est jamais recalculé ni contourné ici.
  const handlePayWithoutGenerationClick = useCallback(() => {
    if (!showPayWithoutCerfaCta) return;
    setCheckoutMode("pay-only");
    setCheckoutOpen(true);
    setPhase("checkout");
  }, [showPayWithoutCerfaCta]);

  const handleCheckoutClose = useCallback(() => {
    setCheckoutOpen(false);
    setPhase("idle");
  }, []);

  // Payment V1 — l'entitlement serveur (webhook Stripe) est l'autorité ; `paid`
  // ci-dessus n'en est que le miroir local.
  const serverPayment = useServerPaymentSync(fiscalYear.year);
  const [verification, setVerification] = useState<"idle" | "verifying" | "timeout">("idle");
  const [continueAfterPayment, setContinueAfterPayment] = useState(false);
  const returnHandled = useRef(false);

  // Vérifie l'entitlement serveur (borné) après le retour de Stripe : le retour
  // sur l'URL de succès n'est JAMAIS une preuve de paiement.
  const verifyPayment = useCallback(async () => {
    setVerification("verifying");
    const confirmed = await pollUntil(async () => (await serverPayment.refetch()) === "paid");
    if (confirmed) {
      setVerification("idle");
      setContinueAfterPayment(true);
    } else {
      setVerification("timeout");
    }
  }, [serverPayment]);

  useEffect(() => {
    if (returnHandled.current || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("checkout");
    if (!outcome) return;
    returnHandled.current = true;
    const year = Number(params.get("fy"));
    params.delete("checkout");
    params.delete("fy");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    // Annulation : retour propre au tunnel, aucun droit, le client peut réessayer.
    // Volontairement asynchrone : aucun setState synchrone dans le corps de l'effet.
    if (outcome === "success" && year === fiscalYear.year) queueMicrotask(() => void verifyPayment());
  }, [fiscalYear.year, verifyPayment]);

  // Une fois le paiement CONFIRMÉ par le serveur : on poursuit comme avant le
  // paiement (génération si le dossier est générable, sinon suite du parcours).
  useEffect(() => {
    if (!continueAfterPayment || !paid) return;
    queueMicrotask(() => {
      setContinueAfterPayment(false);
      if (generated) return;
      if (gate.canGenerate) setPhase("generating");
      else router.push(LMNP_ROUTES.declarations);
    });
  }, [continueAfterPayment, gate.canGenerate, generated, paid, router]);

  const handleStartCheckout = useCallback(async () => {
    // Défense en profondeur : même résolveur que la porte ; le serveur refait le contrôle avant Stripe.
    if (!resolvePriorHistoryEligibility(fiscalYear).eligible) {
      throw new Error("Votre situation doit être confirmée avant le paiement.");
    }
    const declared = fiscalYear.priorHistoryDeclaration?.status;
    if (declared) await declarePriorHistoryOnServer(fiscalYear.year, declared);
    const outcome = await requestCheckout(fiscalYear.year, {
      previousFiscalYearId: fiscalYear.previousFiscalYearId ?? undefined,
      stocksOuverture: fiscalYear.stocksOuverture,
      stocksOuvertureUnavailableReason: fiscalYear.stocksOuvertureUnavailableReason,
    });
    if (outcome.status === "checkout") {
      window.location.assign(outcome.url);
      return;
    }
    // Déjà payé ou paiement en cours de confirmation : jamais un second paiement.
    setCheckoutOpen(false);
    setPhase("idle");
    await verifyPayment();
  }, [fiscalYear, verifyPayment]);

  // G1-P0 — écrit directement `bilanPatrimonial` sur le draft via le même
  // mécanisme générique que les autres assistants (DECLARATION_PATCH_DRAFT) ;
  // aucune reconstruction, aucun état parallèle.
  const handleBilanPatrimonialChange = useCallback(
    (bilanPatrimonial: BilanInputs | undefined) => {
      dispatch({ type: "DECLARATION_PATCH_DRAFT", patch: { bilanPatrimonial } });
    },
    [dispatch],
  );

  // Dispense 2033-A — même mécanisme générique que bilanPatrimonial ci-dessus,
  // aucune reconstruction, aucun état parallèle.
  const handleDispense2033AChange = useCallback(
    (dispense2033A: Dispense2033AIntakeValue | undefined) => {
      dispatch({ type: "DECLARATION_PATCH_DRAFT", patch: { dispense2033A } });
    },
    [dispatch],
  );

  const handleGenerationComplete = useCallback(() => {
    // P0 — jamais de F-006 avec des stocks d'ouverture par défaut ([] / 0) pour
    // un exercice dont l'antériorité n'est pas établie.
    if (!resolvePriorHistoryEligibility(fiscalYear).eligible) {
      setPhase("idle");
      return;
    }
    // P1-1 — stocks d'ouverture réels de CET exercice (persistés à sa
    // création par persistFiscalYearClosureAndTransition(), jamais
    // recalculés ici) : absent pour un premier exercice ou une continuité
    // indisponible, jamais une valeur inventée.
    // G1-P0 — même bilanPatrimonial que l'aperçu du gate
    // (declaration-generation-gate.ts) : jamais une seconde construction de
    // BilanInputs, transmis tel quel depuis le draft.
    const continuity = resolveImmobilisationsContinuityForGeneration({
      draft,
      properties: workspace.properties,
      propertyIds: fiscalYear.propertyIds,
      immobilisationsOuverture: fiscalYear.immobilisationsOuverture,
    });
    const outcome = runDeclarationGeneration(
      draft,
      fiscalYear.year,
      fiscalYear.stocksOuverture?.stocks,
      draft?.bilanPatrimonial,
      draft?.dispense2033A,
      continuity,
    );

    if (outcome.status === "blocked") {
      setPhase("idle");
      return;
    }

    const now = new Date().toISOString();
    // P0 — DeclarationVersion (Level 2) : les 4 artefacts ci-dessous proviennent
    // du même appel à runDeclarationGeneration() que le miroir courant patché
    // juste en dessous — jamais de fiscalResultFromDraft() (chemin secondaire
    // F-007, structurellement incomplet) comme source du snapshot. Append dans
    // le même dispatch que le miroir : pas de 4e dispatch séparé (atomicité).
    const { declaration, declarationVersions } = appendDeclarationVersion({
      fiscalYearId: fiscalYear.id,
      existingDeclaration: draft?.declaration,
      existingVersions: draft?.declarationVersions,
      fiscalResult: outcome.fiscalResult,
      liasseResult: outcome.liasseResult,
      rfs: outcome.rfs,
      liasseRfs: outcome.liasseRfs,
      now,
    });
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
        declaration,
        declarationVersions,
      },
    });
    dispatch({ type: "JOURNEY_MARK_DECLARATION_GENERATED" });
    showSuccess(
      "Déclaration générée",
      "Vos éléments fiscaux sont générés et disponibles dans votre espace déclaration.",
      LMNP_ROUTES.declarations,
    );
    router.push(LMNP_ROUTES.declarations);
  }, [dispatch, draft, fiscalYear, router, showSuccess]);

  if (generated && paid && !gate.canGenerate && !priorHistoryBlocked) {
    // P0-2a — le statut affiché ne doit jamais suggérer une "liasse complète"
    // au sens officiel (Cerfa/EDI) : `formulairesGeneres` (RFS) atteste
    // seulement qu'un formulaire a été assemblé sans erreur, jamais que ses
    // cases sont réellement alimentées (cf. audit P0-2a). Le décompte
    // formulaires/cases vient de resolveLiasseCoverageState (RFS uniquement) —
    // jamais un wording figé "complet"/"documents officiels".
    const coverage = resolveLiasseCoverageState(draft?.liasseRfs);
    const { coverageLine, disclaimer } = formatLiasseCoverageMessage(coverage);
    const heading = "✓ Vos éléments fiscaux sont générés";
    const body = `${coverageLine} ${disclaimer}`;

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

      {verification !== "idle" ? (
        <div
          role="status"
          className="w-full text-center"
          style={{
            borderRadius: radius.lg,
            border: `1px solid ${colors.warning.border}`,
            backgroundColor: colors.warning.surface,
            padding: spacing.card.md,
          }}
        >
          {verification === "verifying" ? (
            <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>
              Paiement reçu, finalisation en cours… Ne fermez pas cette page.
            </p>
          ) : (
            <>
              <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>
                Nous n&apos;avons pas encore reçu la confirmation de votre paiement. Cela peut prendre quelques
                instants. Vous ne serez pas débité une seconde fois.
              </p>
              <div className="mt-3 flex justify-center">
                <Button variant="secondary" onClick={() => void verifyPayment()}>
                  Vérifier à nouveau
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}

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
            isBlockingAnomaliesInpiOnly(gate) ? (
              // P1 — le SEUL blocage restant relève de l'identité INPI
              // (identite.siret, cf. payment-readiness.ts) : jamais présenté
              // comme une erreur fiscale — le Generation Gate lui-même
              // n'est ni modifié ni contourné, seule sa présentation change.
              <div
                className="w-full animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both] text-center"
                style={{
                  borderRadius: radius.lg,
                  border: `1px solid ${colors.warning.border}`,
                  backgroundColor: colors.warning.surface,
                  boxShadow: shadows.card.default,
                  padding: spacing.card.md,
                }}
              >
                <p
                  style={{
                    fontFamily: typography.fontFamily.display,
                    fontSize: typography.fontSize.lg,
                    color: colors.warning.DEFAULT,
                  }}
                >
                  Votre démarche INPI reste à finaliser
                </p>
                <p className="mx-auto mt-2 max-w-md" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
                  Votre dossier fiscal est prêt. Il ne manque que votre SIREN/SIRET pour générer votre déclaration
                  officielle — cela n&apos;empêche pas de poursuivre.
                </p>
              </div>
            ) : (
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
            )
          ) : null}

          <div className="w-full space-y-3 [&>section]:!mx-0 [&>section]:!w-full [&>section]:!max-w-none">
            <ValidationHero ready={snapshot.isComplete && !snapshot.isMultiProperty && gate.canGenerate} />
          </div>

          <ValidationStatusCards steps={snapshot.steps} cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE} />

          <ValidationIncompleteCard missing={missingItems} cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE} />

          <ValidationPriorHistoryCard
            cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE}
            eligibility={priorHistory}
            declared={fiscalYear.priorHistoryDeclaration?.status}
            onDeclare={handleDeclarePriorHistory}
          />

          <ValidationFiscalSummary
            summary={snapshot.fiscalSummary}
            fiscalResult={gate.fiscalResult}
            cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE}
          />

          <ValidationAiValueBlock cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE} />

          {/*
            P1 — socle INPI. Emplacement produit validé : après le résumé
            fiscal et le rappel de valeur IA, avant les questions
            patrimoniales et le paiement. N'affecte ni le Generation Gate ni
            paidAt/declarationGeneratedAt — updateInpiStatus() écrit
            exclusivement Dossier.inpiStatus (cf. provider.tsx/dossier-db.ts).
          */}
          <ValidationInpiBlock
            cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE}
            state={inpiValidationState}
            siren={draft?.siren}
            busy={inpiStatusUpdating}
            onDeclareStatus={handleDeclareInpiStatus}
          />

          {/*
            G1-P0 — intake patrimonial minimal (2033-A). Volontairement non
            bloquant : comme le reste du bilan simplifié, une réponse absente
            laisse les cases concernées non alimentées plutôt que d'empêcher
            la génération du 2031-SD/2033-B (déjà complets sans ces données).
            G1-P1 — patrimoineOuverture transmis tel quel depuis le FiscalYear
            (résolu une seule fois à sa création par
            resolvePatrimoineOuvertureNPlusUn(), jamais recalculé ici) :
            absent pour un premier exercice ou une continuité indisponible.
          */}
          <PatrimonialIntakeCard
            cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE}
            value={draft?.bilanPatrimonial}
            onChange={handleBilanPatrimonialChange}
            patrimoineOuverture={fiscalYear.patrimoineOuverture}
          />

          {/*
            Dispense 2033-A (CGI, art. 302 septies A bis, VI) — n'affiche
            rien si le dossier n'est pas éligible ou si aucun seuil n'est
            publié pour cet exercice (voir Dispense2033AIntakeCard).
          */}
          <Dispense2033AIntakeCard
            cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE}
            value={draft?.dispense2033A}
            onChange={handleDispense2033AChange}
            exercice={fiscalYear.year}
          />

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
              {showPayWithoutCerfaCta ? (
                // P1 — dossier fiscal prêt hors INPI (SIREN/SIRET manquant) :
                // paiement possible, génération volontairement différée.
                <div className="flex w-full justify-center">
                  <Button disabled={phase !== "idle"} onClick={handlePayWithoutGenerationClick}>
                    Valider et payer mon dossier fiscal
                  </Button>
                </div>
              ) : (
                <ValidationGenerateCta disabled={!canGenerate} onClick={handleGenerateClick} />
              )}
            </>
          )}

          <ValidationSupportFooter />
        </>
      ) : null}

      <ValidationCheckoutOverlay
        open={checkoutOpen}
        fiscalYear={fiscalYear.year}
        onClose={handleCheckoutClose}
        onPay={handleStartCheckout}
        mode={checkoutMode}
      />
    </div>
  );
}
