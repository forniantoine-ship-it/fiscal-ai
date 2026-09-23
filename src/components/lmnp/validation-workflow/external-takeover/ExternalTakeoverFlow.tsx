"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { useLmnp } from "@/lib/lmnp/store";
import { resolveDocumentFile } from "@/lib/lmnp/services/resolve-document-file";
import {
  prepareExternalTakeover,
  persistExternalTakeoverOpening,
  persistExternalTakeoverReviewAnswers,
  type PrepareExternalTakeoverResult,
} from "@/lib/lmnp/services/takeover";
import { requestDepreciationRegisterVisionRows } from "@/lib/lmnp/services/takeover/request-depreciation-register-vision";
import { requestTaxPackageLiasseVisionCases } from "@/lib/lmnp/services/takeover/request-tax-package-liasse-vision";
import { requestTaxPackageLiassePageClassification } from "@/lib/lmnp/services/takeover/request-tax-package-liasse-page-classify";
import type { OpeningProrataConvention } from "@/lib/lmnp/services/fiscal-year-opening/types";
import type { CandidateAssetClassification } from "@/lib/lmnp/services/takeover/asset-candidates";
import type { OpeningDeficitRow } from "@/lib/lmnp/services/fiscal-year-opening/types";
import type { TakeoverReviewAnswers } from "@/lib/lmnp/services/takeover/review-answers";
import { EXTERNAL_TAKEOVER_COPY } from "./external-takeover-copy";
import {
  ExternalTakeoverAnalyzingBanner,
  ExternalTakeoverProgress,
} from "./ExternalTakeoverProgress";
import {
  ExternalTakeoverAutoConfirmed,
  ExternalTakeoverExceptionForms,
} from "./ExternalTakeoverResults";
import { ExternalTakeoverUploadSlots } from "./ExternalTakeoverUploadSlots";
import {
  buildAutoConfirmedRows,
  buildAutoConfirmedRowsFromOpening,
  buildProgress,
  clientExceptionsFromResult,
  controlsLookConcordant,
  countOpenClientQuestions,
  hasBothTakeoverDocuments,
  hasExtractionFailure,
  hasManualReviewState,
  isExternalTakeoverComplete,
  toClientQuestions,
  withArdAmountAnswer,
  withArdNoneAnswer,
  withAssetClassificationAnswer,
  withAssetPropertyAnswer,
  withAssetProrataAnswer,
  withBulkClassificationAnswer,
  withBulkPropertyAnswer,
  withDeficitsNoneAnswer,
  withDeficitsRowsAnswer,
  withPropertyBulkDeclined,
} from "./external-takeover-view-model";

type ExternalTakeoverFlowProps = {
  onChangeAnswer?: () => void;
};

export function ExternalTakeoverFlow({ onChangeAnswer }: ExternalTakeoverFlowProps) {
  const { workspace, dispatch, getFile } = useLmnp();
  const fiscalYear = workspace.fiscalYear;
  const docsMeta = fiscalYear.externalTakeoverDocuments;
  const persistedOpening = fiscalYear.externalTakeoverOpening?.opening;
  const complete = isExternalTakeoverComplete(persistedOpening);

  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<PrepareExternalTakeoverResult | undefined>();
  const [runError, setRunError] = useState<string | null>(null);
  const runIdRef = useRef(0);

  const taxDoc = workspace.documents.find(
    (d) => d.id === docsMeta?.priorTaxPackageDocumentId,
  );
  const registerDoc = workspace.documents.find(
    (d) => d.id === docsMeta?.priorDepreciationRegisterDocumentId,
  );
  const documentsReady = hasBothTakeoverDocuments(docsMeta);

  const persistAnswers = useCallback(
    (reviewAnswers: TakeoverReviewAnswers) => {
      const nextFy = persistExternalTakeoverReviewAnswers({
        fiscalYear,
        reviewAnswers,
        updatedAt: new Date().toISOString(),
      });
      dispatch({
        type: "SET_EXTERNAL_TAKEOVER_REVIEW_ANSWERS",
        reviewAnswers: nextFy.externalTakeoverReviewAnswers!,
      });
    },
    [dispatch, fiscalYear],
  );

  const runPrepare = useCallback(async () => {
    if (!docsMeta?.priorTaxPackageDocumentId || !docsMeta?.priorDepreciationRegisterDocumentId) {
      return;
    }
    const taxDocument = workspace.documents.find(
      (d) => d.id === docsMeta.priorTaxPackageDocumentId,
    );
    const registerDocument = workspace.documents.find(
      (d) => d.id === docsMeta.priorDepreciationRegisterDocumentId,
    );
    if (!taxDocument || !registerDocument) {
      setRunError(EXTERNAL_TAKEOVER_COPY.extractionFailed);
      return;
    }

    const runId = ++runIdRef.current;
    setAnalyzing(true);
    setRunError(null);

    try {
      const [taxFile, registerFile] = await Promise.all([
        resolveDocumentFile(taxDocument, getFile, {
          onCached: (id, file) => dispatch({ type: "REGISTER_FILE", documentId: id, file }),
        }),
        resolveDocumentFile(registerDocument, getFile, {
          onCached: (id, file) => dispatch({ type: "REGISTER_FILE", documentId: id, file }),
        }),
      ]);

      if (runId !== runIdRef.current) return;

      const takeoverId = `takeover-${fiscalYear.id}`;
      const prepared = await prepareExternalTakeover({
        openingId: `opening-${fiscalYear.id}`,
        dossierId: fiscalYear.dossierId ?? fiscalYear.id,
        takeoverId,
        targetFiscalYear: fiscalYear.year,
        sourceFiscalYear: fiscalYear.year - 1,
        formYear: fiscalYear.year,
        register: {
          role: "prior_depreciation_register",
          documentId: registerDocument.id,
          file: registerFile,
        },
        taxPackage: {
          role: "prior_tax_package",
          documentId: taxDocument.id,
          file: taxFile,
        },
        reviewAnswers: fiscalYear.externalTakeoverReviewAnswers,
        validatedAt: new Date().toISOString(),
        validator: "lot5.2-external-takeover-ui",
        registerVisionRequester: requestDepreciationRegisterVisionRows,
        // Lot 5.5-A — chemin scan/Vision liasse N-1 : sans ces deux requesters,
        // resolveTaxPackageFacts bloque immédiatement (DOCUMENT_EXTRACTION_FAILED)
        // toute liasse sans texte natif, même si l'extraction Vision existe.
        pageClassifier: requestTaxPackageLiassePageClassification,
        visionRequester: requestTaxPackageLiasseVisionCases,
      });

      if (runId !== runIdRef.current) return;
      setResult(prepared);

      if (prepared.status === "built") {
        const persisted = persistExternalTakeoverOpening({
          fiscalYear,
          opening: prepared.opening,
          sourceRef: takeoverId,
          updatedAt: new Date().toISOString(),
        });
        if (persisted.status === "persisted" && persisted.fiscalYear.externalTakeoverOpening) {
          dispatch({
            type: "SET_EXTERNAL_TAKEOVER_OPENING",
            opening: persisted.fiscalYear.externalTakeoverOpening,
          });
        }
      }
    } catch (err) {
      if (runId !== runIdRef.current) return;
      const message = err instanceof Error ? err.message : EXTERNAL_TAKEOVER_COPY.extractionFailed;
      setRunError(message);
      setResult(undefined);
    } finally {
      if (runId === runIdRef.current) setAnalyzing(false);
    }
  }, [dispatch, docsMeta, fiscalYear, getFile, workspace.documents]);

  // Auto-analyse quand les deux documents sont là (et reprise pas encore terminée).
  useEffect(() => {
    if (complete) return;
    if (!documentsReady) return;
    void runPrepare();
    // Relance quand documents / answers changent.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- answers via fiscalYear.externalTakeoverReviewAnswers
  }, [
    complete,
    documentsReady,
    docsMeta?.priorTaxPackageDocumentId,
    docsMeta?.priorDepreciationRegisterDocumentId,
    fiscalYear.externalTakeoverReviewAnswers,
  ]);

  const handleUpload = useCallback(
    (
      role: "prior_tax_package" | "prior_depreciation_register",
      files: File[],
      meta?: { supabaseDocumentIds: string[]; filePaths: string[] },
    ) => {
      if (!files.length) return;
      const documentIds = files.map(
        (_, index) => meta?.supabaseDocumentIds?.[index] ?? crypto.randomUUID(),
      );
      dispatch({
        type: "UPLOAD_DOCUMENTS",
        files: files.map((file, index) => ({
          file,
          category: "autre" as const,
          documentId: documentIds[index],
          isSupabaseDocumentId: Boolean(meta?.supabaseDocumentIds?.[index]),
          storagePath: meta?.filePaths?.[index],
          fiscalYear: fiscalYear.year,
          documentRole: "annual_evidence" as const,
        })),
      });
      const documentId = documentIds[0];
      if (!documentId) return;
      dispatch({
        type: "SET_EXTERNAL_TAKEOVER_DOCUMENTS",
        documents:
          role === "prior_tax_package"
            ? { priorTaxPackageDocumentId: documentId }
            : { priorDepreciationRegisterDocumentId: documentId },
      });
      setResult(undefined);
    },
    [dispatch, fiscalYear.year],
  );

  const answerAndRerun = useCallback(
    (next: TakeoverReviewAnswers) => {
      persistAnswers(next);
      // useEffect relance prepare via dépendance reviewAnswers
    },
    [persistAnswers],
  );

  const now = () => new Date().toISOString();

  const clientExceptions = clientExceptionsFromResult(result);
  const questions = toClientQuestions(clientExceptions, result?.assets, {
    properties: workspace.properties,
    reviewAnswers: fiscalYear.externalTakeoverReviewAnswers,
  });
  const autoRows = complete && persistedOpening
    ? buildAutoConfirmedRowsFromOpening(persistedOpening)
    : buildAutoConfirmedRows(result?.assets);
  const controlsOk = controlsLookConcordant(result);
  const manualReview = hasManualReviewState(result);
  const extractionFailed = hasExtractionFailure(result) || Boolean(runError);

  const progress = useMemo(
    () =>
      buildProgress({
        documentsReady,
        analyzing,
        hasResult: Boolean(result),
        clientExceptionCount: countOpenClientQuestions(questions),
        complete,
        labels: EXTERNAL_TAKEOVER_COPY.progress,
      }),
    [analyzing, complete, documentsReady, questions, result],
  );

  if (complete) {
    return (
      <div className="space-y-4">
        <ExternalTakeoverProgress steps={progress} />
        <div
          role="status"
          style={{
            borderRadius: radius.md,
            border: `1px solid ${colors.border.selected}`,
            backgroundColor: colors.surface.selected,
            padding: spacing.scale[3],
          }}
        >
          <p style={{ ...typography.body.desktop, color: colors.text.primary, fontWeight: typography.fontWeight.medium }}>
            {EXTERNAL_TAKEOVER_COPY.completedTitle}
          </p>
          <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>
            {EXTERNAL_TAKEOVER_COPY.completedBody}
          </p>
        </div>
        <ExternalTakeoverAutoConfirmed rows={autoRows} controlsOk />
        {onChangeAnswer ? (
          <button
            type="button"
            onClick={onChangeAnswer}
            style={{ ...typography.caption.desktop, color: colors.text.accent }}
          >
            {EXTERNAL_TAKEOVER_COPY.changeAnswer}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 style={{ ...typography.body.desktop, color: colors.text.primary, fontWeight: typography.fontWeight.medium }}>
          {EXTERNAL_TAKEOVER_COPY.title}
        </h3>
        <p style={{ ...typography.body.desktop, color: colors.text.secondary, marginTop: spacing.scale[2] }}>
          {EXTERNAL_TAKEOVER_COPY.intro}
        </p>
      </div>

      <ExternalTakeoverProgress steps={progress} />

      <ExternalTakeoverUploadSlots
        fiscalYear={fiscalYear.year}
        taxPackageFileName={taxDoc?.fileName}
        registerFileName={registerDoc?.fileName}
        onUploaded={handleUpload}
      />

      {analyzing ? (
        <ExternalTakeoverAnalyzingBanner message={EXTERNAL_TAKEOVER_COPY.analyzing} />
      ) : null}

      {extractionFailed ? (
        <div
          role="alert"
          className="space-y-2"
          style={{
            borderRadius: radius.md,
            border: `1px solid ${colors.warning.border}`,
            backgroundColor: colors.warning.surface,
            padding: spacing.scale[3],
          }}
        >
          <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>
            {EXTERNAL_TAKEOVER_COPY.extractionFailed}
          </p>
          <button
            type="button"
            onClick={() => void runPrepare()}
            style={{ ...typography.body.desktop, color: colors.text.accent }}
          >
            {EXTERNAL_TAKEOVER_COPY.retry}
          </button>
        </div>
      ) : null}

      {manualReview && !extractionFailed ? (
        <div
          role="alert"
          style={{
            borderRadius: radius.md,
            border: `1px solid ${colors.warning.border}`,
            backgroundColor: colors.warning.surface,
            padding: spacing.scale[3],
          }}
        >
          <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>
            {EXTERNAL_TAKEOVER_COPY.manualReview}
          </p>
        </div>
      ) : null}

      {!analyzing && result && !extractionFailed ? (
        <ExternalTakeoverAutoConfirmed rows={autoRows} controlsOk={controlsOk} />
      ) : null}

      {!analyzing && !manualReview && !extractionFailed ? (
        <ExternalTakeoverExceptionForms
          questions={questions}
          properties={workspace.properties}
          onProperty={(candidateKey, propertyId) =>
            answerAndRerun(
              withAssetPropertyAnswer(
                fiscalYear.externalTakeoverReviewAnswers,
                candidateKey,
                propertyId,
                now(),
              ),
            )
          }
          onPropertyBulkYes={(candidateKeys, propertyId) =>
            answerAndRerun(
              withBulkPropertyAnswer(
                fiscalYear.externalTakeoverReviewAnswers,
                candidateKeys,
                propertyId,
                now(),
              ),
            )
          }
          onPropertyBulkNo={() =>
            answerAndRerun(
              withPropertyBulkDeclined(fiscalYear.externalTakeoverReviewAnswers, now()),
            )
          }
          onProrata={(candidateKey, value: OpeningProrataConvention) =>
            answerAndRerun(
              withAssetProrataAnswer(
                fiscalYear.externalTakeoverReviewAnswers,
                candidateKey,
                value,
                now(),
              ),
            )
          }
          onClassification={(candidateKey, value: CandidateAssetClassification) =>
            answerAndRerun(
              withAssetClassificationAnswer(
                fiscalYear.externalTakeoverReviewAnswers,
                candidateKey,
                value,
                now(),
              ),
            )
          }
          onClassificationSuggestionsConfirm={(items) =>
            answerAndRerun(
              withBulkClassificationAnswer(
                fiscalYear.externalTakeoverReviewAnswers,
                items,
                now(),
              ),
            )
          }
          onDeficitsNone={() =>
            answerAndRerun(
              withDeficitsNoneAnswer(fiscalYear.externalTakeoverReviewAnswers, now()),
            )
          }
          onDeficitsRows={(rows: OpeningDeficitRow[]) =>
            answerAndRerun(
              withDeficitsRowsAnswer(fiscalYear.externalTakeoverReviewAnswers, rows, now()),
            )
          }
          onArdNone={() =>
            answerAndRerun(withArdNoneAnswer(fiscalYear.externalTakeoverReviewAnswers, now()))
          }
          onArdAmount={(amount) =>
            answerAndRerun(
              withArdAmountAnswer(fiscalYear.externalTakeoverReviewAnswers, amount, now()),
            )
          }
        />
      ) : null}

      {onChangeAnswer ? (
        <button
          type="button"
          onClick={onChangeAnswer}
          style={{ ...typography.caption.desktop, color: colors.text.accent }}
        >
          {EXTERNAL_TAKEOVER_COPY.changeAnswer}
        </button>
      ) : null}
    </div>
  );
}
