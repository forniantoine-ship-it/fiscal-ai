/**
 * Cycle 5 (F-011) — adaptateur/orchestrateur pur entre le pipeline documentaire
 * Crédit partagé (Tunnel A, `runCreditDocumentPipeline`) et l'Assistant F-011.
 * Miroir exact de `f010-document-prefill.ts` (upload → pipeline → prefill) et
 * de `F009ActiviteAssistantPanel`'s upload flow. Ne réimplémente ni OCR, ni
 * GPT, ni classification de document — délègue entièrement au pipeline
 * existant. Aucune machine d'état F-011, aucune logique conversationnelle :
 * ce fichier ne connaît pas `F011Step`/`F011Action`.
 */
import { runCreditDocumentPipeline } from "@/lib/lmnp/services/credit-document-pipeline";
import type { CreditGptPipelineResult } from "@/lib/lmnp/services/credit-gpt-pipeline";
import type { LmnpDocument } from "@/lib/lmnp/types";

import {
  mapCreditExtractionToF011Prefill,
  type F011CreditPrefill,
} from "./credit-bridge";

/**
 * Construit un `LmnpDocument` minimal identique à ce que produirait le
 * reducer pour ce même upload (`UPLOAD_DOCUMENTS`) — usage synchrone
 * immédiat par le pipeline, sans dépendre d'une relecture du store React.
 */
export function buildF011SyntheticDocument(params: {
  id: string;
  fiscalYearId: string;
  file: File;
}): LmnpDocument {
  const { id, fiscalYearId, file } = params;
  return {
    id,
    fiscalYearId,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    category: "emprunt",
    documentType: "unknown",
    status: "uploaded",
    uploadedAt: new Date().toISOString(),
  };
}

export type RunF011DocumentAnalysisParams = {
  file: File;
  document: LmnpDocument;
  fiscalYear?: number;
};

/**
 * Seule voie d'analyse documentaire pour F-011. Délègue intégralement à
 * `runCreditDocumentPipeline` (OCR → classification → extraction GPT) —
 * jamais recréé ici.
 */
export async function runF011DocumentAnalysis(
  params: RunF011DocumentAnalysisParams,
): Promise<CreditGptPipelineResult> {
  const { file, document, fiscalYear } = params;
  return runCreditDocumentPipeline({
    document,
    getFile: (id) => (id === document.id ? file : undefined),
    fiscalYear,
  });
}

export type F011ExtractionState = "success" | "partial" | "failed";

export type F011ExtractionOutcome = {
  state: F011ExtractionState;
  hasAnyPrefillField: boolean;
};

/** Champs sans lesquels le prêt ne peut pas être calculé — s'ils manquent tous, l'extraction est un échec. */
const F011_CORE_PREFILL_KEYS = ["capitalInitial", "tauxNominal", "dureeMois", "datePremiereMensualite"] as const;

/**
 * Dérive l'état UX d'extraction propre à F-011 — pure, testable isolément.
 * Miroir de `deriveF010ExtractionState` : un échec pipeline avec au moins un
 * champ exploitable n'est pas un échec (ex. taux introuvable sur un tableau
 * d'amortissement dont le montant/durée/date sont clairs) ; un pipeline
 * "réussi" mais sans aucun champ cœur est un échec côté F-011.
 */
export function deriveF011ExtractionState(input: {
  pipelineSuccess: boolean;
  prefill: F011CreditPrefill;
}): F011ExtractionOutcome {
  const hasAnyPrefillField = Object.keys(input.prefill.fields).length > 0;
  const missingCoreFields = F011_CORE_PREFILL_KEYS.filter((key) => input.prefill.fields[key] === undefined);

  if (!hasAnyPrefillField && !input.pipelineSuccess) {
    return { state: "failed", hasAnyPrefillField: false };
  }
  if (missingCoreFields.length > 0) {
    return { state: "partial", hasAnyPrefillField };
  }
  return { state: "success", hasAnyPrefillField };
}

export type RunF011UploadFlowResult = {
  pipelineResult: CreditGptPipelineResult;
  prefill: F011CreditPrefill;
  outcome: F011ExtractionOutcome;
};

export type RunF011UploadFlowParams = {
  file: File;
  documentId: string;
  fiscalYearId: string;
  fiscalYear?: number;
  /** Injectable pour les tests — par défaut `runF011DocumentAnalysis` (le pipeline réel). */
  analyze?: (params: RunF011DocumentAnalysisParams) => Promise<CreditGptPipelineResult>;
};

/**
 * Orchestration complète upload → pipeline → pont Cycle 4. Ne persiste rien,
 * ne dispatch rien : c'est au panel (React) de le faire autour de cet appel.
 */
export async function runF011UploadFlow(params: RunF011UploadFlowParams): Promise<RunF011UploadFlowResult> {
  const { file, documentId, fiscalYearId, fiscalYear } = params;
  const analyze = params.analyze ?? runF011DocumentAnalysis;
  const document = buildF011SyntheticDocument({ id: documentId, fiscalYearId, file });

  const pipelineResult = await analyze({ file, document, fiscalYear });
  const prefill = mapCreditExtractionToF011Prefill(
    { amortization: pipelineResult.amortization?.extraction, loanOffer: pipelineResult.loanOffer?.extraction },
    documentId,
    new Date().toISOString(),
  );
  const outcome = deriveF011ExtractionState({ pipelineSuccess: pipelineResult.success, prefill });

  return { pipelineResult, prefill, outcome };
}
