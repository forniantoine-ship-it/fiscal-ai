"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/design-system/components/Button";
import { ActiviteAiProcessing } from "@/components/lmnp/activite/ActiviteAiProcessing";
import { CreditFinancingFields } from "@/components/lmnp/credit/CreditFinancingFields";
import { CreditHero } from "@/components/lmnp/credit/CreditHero";
import {
  DOCUMENT_WORKFLOW_CARD_STYLE,
} from "@/components/lmnp/documents/document-workflow-shared";
import { ConfiguredDossierCard } from "@/components/lmnp/shared/ConfiguredDossierCard";
import { useFeedback } from "@/components/lmnp/shared/FeedbackProvider";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { getDocumentJourneyStep } from "@/lib/lmnp/constants/document-journey";
import {
  countCreditDocuments,
  creditFromDraft,
  formValuesToFinancing,
  isCreditDocument,
  isCreditProfileIncomplete,
  MOCK_CREDIT_FINANCING,
  MOCK_CREDIT_FORM,
  MOCK_CREDIT_UNCERTAIN_FIELDS,
  revenueYearFromDeclaration,
  suggestsMultipleLoans,
  type CreditFieldKey,
  type CreditFormValues,
} from "@/lib/lmnp/services/credit-profile";
import { buildCreditConfiguredSummary } from "@/lib/lmnp/services/configured-dossier-summaries";
import { runBulkDocumentAnalysis } from "@/lib/lmnp/services/run-document-analysis";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import { useLmnp } from "@/lib/lmnp/store";
import type { LmnpDocument } from "@/lib/lmnp/types";

const SECTION_REVEAL_DELAYS_MS = [0, 400];
const CREDIT_UPLOAD_CATEGORY = getDocumentJourneyStep("credit-immobilier").category;

const CREDIT_AI_STEPS = [
  "Document reçu",
  "Analyse OCR",
  "Détection des informations",
  "Préparation des échéances",
  "Vérification cohérence",
] as const;

function resolveCreditDocument(
  documents: LmnpDocument[],
  creditDocumentId?: string,
): LmnpDocument | undefined {
  if (creditDocumentId) {
    const linked = documents.find((doc) => doc.id === creditDocumentId);
    if (linked) return linked;
  }

  const sorted = [...documents].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  return sorted.find((doc) => isCreditDocument(doc, creditDocumentId));
}

export function CreditDocumentStep() {
  const { workspace, dispatch, getFile } = useLmnp();
  const { showSuccess, showInfo } = useFeedback();
  const analyzingRef = useRef(false);
  const pendingUploadRef = useRef(false);

  const draft = workspace.declarationDraft;
  const revenueYear = revenueYearFromDeclaration(workspace.fiscalYear.year);

  const creditDoc = useMemo(
    () => resolveCreditDocument(workspace.documents, draft?.creditDocumentId),
    [workspace.documents, draft?.creditDocumentId],
  );
  const uploadedCount = useMemo(
    () => countCreditDocuments(workspace.documents, draft?.creditDocumentId),
    [workspace.documents, draft?.creditDocumentId],
  );

  const confirmed = Boolean(draft?.creditConfirmedAt);
  const declaredNone = Boolean(draft?.creditDeclaredNoneAt) && !confirmed;

  const [hasUploaded, setHasUploaded] = useState(
    () => Boolean(draft?.creditDocumentId || draft?.creditConfirmedAt),
  );
  const [noCreditDeclared, setNoCreditDeclared] = useState(() => declaredNone);
  const [aiAnimationDone, setAiAnimationDone] = useState(false);
  const [visibleSections, setVisibleSections] = useState(0);
  const [uncertainFields, setUncertainFields] = useState<CreditFieldKey[]>([]);
  const [detectedLoansCount, setDetectedLoansCount] = useState(1);
  const [validatedSuccess, setValidatedSuccess] = useState(() => confirmed);
  const [isEditing, setIsEditing] = useState(false);
  const [formValues, setFormValues] = useState<CreditFormValues>(() => creditFromDraft(draft));

  const isProcessing = hasUploaded && !confirmed && !aiAnimationDone && !noCreditDeclared;
  const isFailed = creditDoc?.status === "failed" && !aiAnimationDone;
  const showInitialExtras = !hasUploaded && !confirmed && !noCreditDeclared;
  const showConfiguredCard =
    ((validatedSuccess || confirmed) && !isEditing) ||
    (noCreditDeclared && !hasUploaded && !isEditing);
  const showExtractionForm =
    aiAnimationDone && !isProcessing && !showConfiguredCard && !noCreditDeclared;

  const applyExtractedForm = useCallback((multiLoan: boolean) => {
    setFormValues(multiLoan ? MOCK_CREDIT_FORM : { ...MOCK_CREDIT_FORM, loans: [MOCK_CREDIT_FORM.loans[0]] });
    setDetectedLoansCount(multiLoan ? MOCK_CREDIT_FINANCING.loans.length : 1);
    setUncertainFields(MOCK_CREDIT_UNCERTAIN_FIELDS);
  }, []);

  const handleAiAnimationComplete = useCallback(() => {
    setAiAnimationDone(true);
    const multiLoan = Boolean(creditDoc && suggestsMultipleLoans(creditDoc.fileName));
    applyExtractedForm(multiLoan);
  }, [applyExtractedForm, creditDoc]);

  useEffect(() => {
    if (!showExtractionForm) {
      setVisibleSections(0);
      return;
    }

    const timers = SECTION_REVEAL_DELAYS_MS.map((delay, index) =>
      window.setTimeout(() => setVisibleSections(index + 1), delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [showExtractionForm]);

  useEffect(() => {
    if (confirmed) {
      setHasUploaded(true);
      setValidatedSuccess(true);
      setIsEditing(false);
      setAiAnimationDone(true);
      setFormValues(creditFromDraft(draft));
      setVisibleSections(2);
      setUncertainFields([]);
      setDetectedLoansCount(draft?.creditFinancing?.loans.length ?? 1);
      return;
    }

    if (draft?.creditDocumentId && creditDoc?.status === "analyzed" && !aiAnimationDone) {
      setHasUploaded(true);
      setAiAnimationDone(true);
      setFormValues(creditFromDraft(draft));
      setVisibleSections(2);
      setDetectedLoansCount(draft?.creditFinancing?.loans.length ?? 1);
    }
  }, [confirmed, creditDoc, aiAnimationDone, draft?.creditDocumentId, draft, draft?.creditFinancing?.loans.length]);

  useEffect(() => {
    if (!pendingUploadRef.current || !creditDoc) return;
    pendingUploadRef.current = false;
    if (draft?.creditDocumentId !== creditDoc.id) {
      dispatch({
        type: "DECLARATION_PATCH_DRAFT",
        patch: { creditDocumentId: creditDoc.id, creditDeclaredNoneAt: undefined },
      });
    }
    setNoCreditDeclared(false);
  }, [creditDoc, draft?.creditDocumentId, dispatch]);

  const runAnalysis = useCallback(
    async (documentId: string) => {
      if (analyzingRef.current) return;
      analyzingRef.current = true;

      try {
        await runBulkDocumentAnalysis({
          documents: workspace.documents,
          documentIds: [documentId],
          getFile,
          dispatch,
          fiscalYear: workspace.fiscalYear.year,
        });
      } finally {
        analyzingRef.current = false;
      }
    },
    [workspace.documents, workspace.fiscalYear.year, getFile, dispatch],
  );

  useEffect(() => {
    if (!creditDoc || creditDoc.status !== "uploaded" || analyzingRef.current) return;
    void runAnalysis(creditDoc.id);
  }, [creditDoc?.id, creditDoc?.status, runAnalysis]);

  function handleUpload(files: File[]) {
    if (!files.length) return;

    setNoCreditDeclared(false);
    setValidatedSuccess(false);
    setAiAnimationDone(false);
    setVisibleSections(0);
    setUncertainFields([]);
    setHasUploaded(true);
    pendingUploadRef.current = true;

    dispatch({
      type: "UPLOAD_DOCUMENTS",
      files: files.map((file) => ({ file, category: CREDIT_UPLOAD_CATEGORY })),
    });

    if (draft?.creditDeclaredNoneAt) {
      dispatch({
        type: "DECLARATION_PATCH_DRAFT",
        patch: { creditDeclaredNoneAt: undefined },
      });
    }

    showInfo(
      `${files.length} fichier${files.length > 1 ? "s" : ""} reçu${files.length > 1 ? "s" : ""}`,
      "L'IA analyse vos documents de prêt.",
    );
  }

  function handleFormChange(next: CreditFormValues) {
    setFormValues(next);
    setUncertainFields((prev) =>
      prev.filter((key) => {
        const loanHasValue = next.loans.some((loan) => {
          const value = loan[key as keyof typeof loan];
          return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
        });
        return !loanHasValue;
      }),
    );
  }

  function handleRetry() {
    if (!creditDoc) return;
    setAiAnimationDone(false);
    setVisibleSections(0);
    dispatch({ type: "DOCUMENT_SET_STATUS", documentId: creditDoc.id, status: "uploaded" });
  }

  function handleManualContinue() {
    setAiAnimationDone(true);
    setFormValues(creditFromDraft(draft));
    setUncertainFields([]);
    setDetectedLoansCount(1);
  }

  function handleNoCredit() {
    setNoCreditDeclared(true);
    dispatch({
      type: "DECLARE_NO_CREDIT",
    });
    showInfo("Aucun financement", "Vous pourrez ajouter vos documents de prêt à tout moment.");
  }

  function handleConfirm() {
    const financing = formValuesToFinancing(formValues, revenueYear);
    dispatch({
      type: "CONFIRM_CREDIT_FINANCING",
      financing,
      documentId: creditDoc?.id,
    });
    setValidatedSuccess(true);
    setIsEditing(false);
    showSuccess(
      "Financement configuré",
      "Vos données seront réutilisées pour les amortissements, les charges et les prochaines déclarations.",
      LMNP_ROUTES.dashboard,
    );
  }

  const incomplete = isCreditProfileIncomplete(formValues);

  return (
    <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-6 pb-16">
      <div className="flex w-full justify-center">
        <Button href={LMNP_ROUTES.dashboard}>Tableau de bord</Button>
      </div>

      <div className="w-full space-y-3 [&>section]:!mx-0 [&>section]:!w-full [&>section]:!max-w-none">
        <CreditHero
          onFiles={handleUpload}
          uploadState={hasUploaded ? "uploaded" : "idle"}
          uploadedFileName={creditDoc?.fileName}
          uploadedCount={Math.max(uploadedCount, hasUploaded ? 1 : 0)}
          detectedLoansCount={detectedLoansCount}
          showNoCreditLink={showInitialExtras}
          onNoCredit={handleNoCredit}
        />
      </div>

      {showConfiguredCard ? (
        <ConfiguredDossierCard
          title="✓ Crédit configuré"
          rows={
            noCreditDeclared && !confirmed
              ? [{ label: "Statut", value: "Aucun financement déclaré" }]
              : buildCreditConfiguredSummary(formValues, detectedLoansCount).rows
          }
          footnote={
            noCreditDeclared && !confirmed
              ? "Vous pourrez déposer vos documents de prêt à tout moment."
              : buildCreditConfiguredSummary(formValues, detectedLoansCount).footnote
          }
          onEdit={() => {
            setIsEditing(true);
            if (noCreditDeclared && !hasUploaded) {
              setNoCreditDeclared(false);
              dispatch({
                type: "DECLARATION_PATCH_DRAFT",
                patch: { creditDeclaredNoneAt: undefined },
              });
              return;
            }
            setVisibleSections(2);
            setFormValues(creditFromDraft(draft));
            setDetectedLoansCount(draft?.creditFinancing?.loans.length ?? 1);
          }}
        />
      ) : null}

      {isProcessing ? (
        <ActiviteAiProcessing onComplete={handleAiAnimationComplete} steps={CREDIT_AI_STEPS} />
      ) : null}

      {showExtractionForm ? (
        <CreditFinancingFields
          values={formValues}
          onChange={handleFormChange}
          revenueYear={revenueYear}
          installments={MOCK_CREDIT_FINANCING.installments}
          showIncompleteWarning={incomplete}
          onConfirm={handleConfirm}
          cardStyle={DOCUMENT_WORKFLOW_CARD_STYLE}
          visibleSections={visibleSections}
          uncertainFields={uncertainFields}
          showConfirm={visibleSections >= 2}
        />
      ) : null}


      {isFailed ? (
        <div
          className="w-full text-center animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
          style={{
            borderRadius: radius.lg,
            border: `1px solid ${colors.border.subtle}`,
            backgroundColor: colors.surface.primary,
            boxShadow: shadows.card.default,
            padding: spacing.card.md,
          }}
        >
          <p
            style={{
              fontFamily: typography.fontFamily.display,
              fontSize: typography.fontSize.xl,
              color: colors.text.primary,
            }}
          >
            Certaines informations n&apos;ont pas pu être détectées automatiquement.
          </p>
          <p className="mt-3" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
            Essayez une autre version du document ou complétez les champs manuellement.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button onClick={handleRetry}>Réessayer l&apos;import</Button>
            <Button variant="secondary" onClick={handleManualContinue}>
              Compléter manuellement
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
