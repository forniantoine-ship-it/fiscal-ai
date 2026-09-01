/**
 * Deep extraction debugging for INPI deterministic parser.
 * Temporary instrumentation — does not alter strict extraction outcomes.
 */

import type { InpiExtractableField } from "./extract-inpi";

export const OCR_PREVIEW_LENGTH = 3000;

export type FieldDebugCandidate = {
  source: "label" | "pattern" | "derived" | "loose";
  labelOrPattern?: string;
  snippet?: string;
  value?: string;
  confidence?: number;
  multiline?: boolean;
};

export type FieldDebugReport = {
  field: InpiExtractableField;
  labelSpecsTried: string[];
  patternsTried: string[];
  matchedCandidates: FieldDebugCandidate[];
  rejectedCandidates: FieldDebugCandidate[];
  rejectionReasons: string[];
  finalDecision:
    | "extracted"
    | "not_found"
    | "low_confidence"
    | "recovered_by_loose_mode"
    | "excluded";
};

export type LabelValueTrace = {
  searchedLabels: string[];
  nearbyText: string[];
  multilineDetection: Array<{
    label: string;
    attempted: boolean;
    matched: boolean;
    snippet?: string;
  }>;
  boundaryFailures: Array<{
    label: string;
    reason: string;
    snippet?: string;
  }>;
  rejected: Array<{
    label: string;
    reason: string;
    snippet?: string;
  }>;
};

export type PatternTrace = {
  patternsTried: string[];
  matches: Array<{
    pattern: string;
    snippet?: string;
    value?: string;
    accepted: boolean;
    rejectionReason?: string;
  }>;
};

export type ExtractionSummary = {
  extractedFields: InpiExtractableField[];
  missingFields: InpiExtractableField[];
  coveragePercentage: number;
  looseRecoveries: InpiExtractableField[];
};

export function createFieldDebugReport(field: InpiExtractableField): FieldDebugReport {
  return {
    field,
    labelSpecsTried: [],
    patternsTried: [],
    matchedCandidates: [],
    rejectedCandidates: [],
    rejectionReasons: [],
    finalDecision: "not_found",
  };
}

export function logOcrPreview(rawText: string): void {
  console.log("[ocr-preview]", {
    length: rawText.length,
    preview: rawText.slice(0, OCR_PREVIEW_LENGTH),
    truncated: rawText.length > OCR_PREVIEW_LENGTH,
  });
}

export function logNormalizedOcrPreview(normalizedText: string): void {
  console.log("[normalized-ocr-preview]", {
    length: normalizedText.length,
    preview: normalizedText.slice(0, OCR_PREVIEW_LENGTH),
    truncated: normalizedText.length > OCR_PREVIEW_LENGTH,
  });
}

export function logFieldDebug(report: FieldDebugReport): void {
  console.log("[field-debug]", report);
}

export function logExtractionSummary(summary: ExtractionSummary): void {
  console.log("[extraction-summary]", summary);
}

export function logLooseRecovery(
  field: InpiExtractableField,
  value: string,
  snippet: string,
  confidence: number,
): void {
  console.log("[field] recovered_by_loose_mode", {
    field,
    value,
    snippet,
    confidence,
  });
}

export function createLabelTrace(): LabelValueTrace {
  return {
    searchedLabels: [],
    nearbyText: [],
    multilineDetection: [],
    boundaryFailures: [],
    rejected: [],
  };
}

export function createPatternTrace(): PatternTrace {
  return {
    patternsTried: [],
    matches: [],
  };
}

export function logFindLabelValueTrace(field: string, trace: LabelValueTrace): void {
  console.log("[findLabelValue]", {
    field,
    searchedLabels: trace.searchedLabels,
    nearbyText: trace.nearbyText.slice(0, 12),
    multilineDetection: trace.multilineDetection,
    boundaryFailures: trace.boundaryFailures,
    rejected: trace.rejected,
  });
}

/** Extra labels attempted only in loose mode */
export const LOOSE_EXTRA_LABELS: Partial<Record<InpiExtractableField, string[]>> = {
  nom: ["nom patronymique"],
  prenom: ["prénom usuel", "prenom usuel"],
  activite: ["activité", "activite", "libellé activité", "libelle activite"],
  adresseEtablissement: ["adresse du siège", "siège social"],
  codeAPE: ["code naf", "naf"],
};

export const LOOSE_CONFIDENCE_PENALTY = 0.12;

/** Focus fields with enhanced OCR-tolerant extraction traces */
export const INPI_FOCUS_FIELDS: InpiExtractableField[] = [
  "nom",
  "prenom",
  "siren",
  "siret",
  "activite",
];

export function logFieldExtractionFailure(
  report: FieldDebugReport,
  options?: {
    nearbyOcrLines?: string[];
    labelCandidates?: string[];
  },
): void {
  if (!INPI_FOCUS_FIELDS.includes(report.field)) return;
  if (report.finalDecision === "extracted" || report.finalDecision === "recovered_by_loose_mode") {
    return;
  }

  console.log("[extraction-trace]", {
    field: report.field,
    nearbyOcrLines: options?.nearbyOcrLines?.slice(0, 8) ?? [],
    matchedLabelCandidates: options?.labelCandidates ?? report.matchedCandidates.map(
      (c) => c.labelOrPattern ?? c.snippet,
    ),
    rejectionReasons: report.rejectionReasons,
    labelSpecsTried: report.labelSpecsTried,
    patternsTried: report.patternsTried,
    rejectedCandidates: report.rejectedCandidates.slice(0, 6),
    finalDecision: report.finalDecision,
  });
}
