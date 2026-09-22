/**
 * Lot 4B — valeur candidate documentaire.
 *
 * « Une source documentaire propose cette valeur. »
 * ≠ vérité fiscale / comptable d'ouverture (`OpeningFact` / `FiscalYearOpening`).
 *
 * Absence ≠ 0 ≠ [] : never normalize missing → 0 / [].
 */

import type { ConfidenceScore } from "@/lib/documents/types/confidence-score";
import type { FactEvidence } from "@/lib/documents/facts/document-fact";
import type { FieldSource } from "@/runtime/contracts/FieldSource";

/** Nature de la proposition — inferred n'est jamais promu implicitement en Opening. */
export type CandidateValueNature = "direct" | "derived" | "inferred";

/** État de revue humaine sur la proposition (pas une validation Opening). */
export type CandidateReviewState = "original" | "corrected" | "confirmed";

/**
 * Rôle documentaire reprise — vocabulaire takeover, distinct de
 * `PIPELINE_DOCUMENT_TYPES` (inpi / p0i / …).
 */
export type TakeoverDocumentRole =
  | "prior_tax_package"
  | "depreciation_register"
  | "aide_2042"
  | "accountant_note"
  | "other";

/**
 * Provenance minimale d'une proposition.
 * Réutilise `FactEvidence` (snippet + page?) et `ConfidenceScore` existants.
 * Pas de bbox exigée (pipeline actuel ne la fournit pas).
 */
export type CandidateProvenance = {
  documentId: string;
  documentRole?: TakeoverDocumentRole;
  evidence?: FactEvidence;
  /** Label / case / en-tête de colonne source. */
  fieldLabel?: string;
  /** Référence ligne / case / clé extracteur (jamais un ID Fiscal AI stable). */
  sourceRef?: string;
  extractionMethod?: string;
  confidence?: ConfidenceScore;
  /** Réutilise le contrat FieldSource existant lorsqu'applicable. */
  fieldSource?: FieldSource;
};

/**
 * Trace de correction — même intention que `ManualCorrection`, sans imposer
 * `DocumentType` du pipeline intelligence (incompatible avec les docs reprise).
 */
export type CandidateCorrectionTrail = {
  correctedAt: string;
  correctedBy: string | null;
  reason?: string;
  /** Lien optionnel vers un enregistrement ManualCorrection existant. */
  manualCorrectionId?: string;
};

export type CandidateValuePresent<T> = {
  status: "present";
  value: T;
  nature: CandidateValueNature;
  reviewState: CandidateReviewState;
  provenance: CandidateProvenance;
  /**
   * Valeur extraite d'origine lorsque reviewState = corrected | confirmed
   * et qu'une modification a eu lieu — la proposition initiale reste traçable.
   */
  originalValue?: T;
  correction?: CandidateCorrectionTrail;
};

export type CandidateValueAbsent = {
  status: "missing" | "extraction_impossible" | "document_absent";
  reason?: string;
  /** documentId connu même si la valeur ne l'est pas. */
  provenance?: Pick<CandidateProvenance, "documentId" | "documentRole" | "fieldLabel" | "sourceRef">;
};

export type CandidateValue<T> = CandidateValuePresent<T> | CandidateValueAbsent;

export function isCandidatePresent<T>(
  value: CandidateValue<T>,
): value is CandidateValuePresent<T> {
  return value.status === "present";
}

export function isCandidateAbsent<T>(value: CandidateValue<T>): value is CandidateValueAbsent {
  return value.status !== "present";
}

export function presentCandidate<T>(
  value: T,
  nature: CandidateValueNature,
  provenance: CandidateProvenance,
  options?: {
    reviewState?: CandidateReviewState;
    originalValue?: T;
    correction?: CandidateCorrectionTrail;
  },
): CandidateValuePresent<T> {
  return {
    status: "present",
    value,
    nature,
    reviewState: options?.reviewState ?? "original",
    provenance,
    originalValue: options?.originalValue,
    correction: options?.correction,
  };
}

export function missingCandidate(
  reason?: string,
  provenance?: CandidateValueAbsent["provenance"],
): CandidateValueAbsent {
  return provenance
    ? { status: "missing", reason, provenance }
    : reason === undefined
      ? { status: "missing" }
      : { status: "missing", reason };
}

export function extractionImpossibleCandidate(
  reason?: string,
  provenance?: CandidateValueAbsent["provenance"],
): CandidateValueAbsent {
  return provenance
    ? { status: "extraction_impossible", reason, provenance }
    : reason === undefined
      ? { status: "extraction_impossible" }
      : { status: "extraction_impossible", reason };
}

export function documentAbsentCandidate(
  reason?: string,
  provenance?: CandidateValueAbsent["provenance"],
): CandidateValueAbsent {
  return provenance
    ? { status: "document_absent", reason, provenance }
    : reason === undefined
      ? { status: "document_absent" }
      : { status: "document_absent", reason };
}

/**
 * Applique une correction humaine sans effacer la valeur d'origine.
 * Si `originalValue` n'était pas encore posé, la valeur courante devient l'original.
 */
export function applyCandidateCorrection<T>(
  current: CandidateValuePresent<T>,
  correctedValue: T,
  trail: CandidateCorrectionTrail,
): CandidateValuePresent<T> {
  return {
    ...current,
    value: correctedValue,
    reviewState: "corrected",
    originalValue: current.originalValue ?? current.value,
    correction: trail,
    provenance: {
      ...current.provenance,
      fieldSource: "user_correction",
    },
  };
}

/** Marque une proposition présente comme confirmée (valeur inchangée). */
export function confirmCandidate<T>(
  current: CandidateValuePresent<T>,
  trail?: Omit<CandidateCorrectionTrail, "reason"> & { reason?: string },
): CandidateValuePresent<T> {
  return {
    ...current,
    reviewState: "confirmed",
    correction: trail
      ? {
          correctedAt: trail.correctedAt,
          correctedBy: trail.correctedBy,
          reason: trail.reason,
          manualCorrectionId: trail.manualCorrectionId,
        }
      : current.correction,
  };
}
