/**
 * Lot 5.1 — exceptions destinées à 5.2 (pas d'UI).
 *
 * Réutilise les codes 4F.1 / extraction lorsque possible.
 * Alias stables pour 5.2 : PROPERTY_MATCH_REQUIRED, PRORATA_REQUIRED, etc.
 */

export type TakeoverExceptionAnswerability =
  | "client"
  | "manual_review"
  | "blocked";

export type TakeoverException = {
  code: string;
  message: string;
  /**
   * client = 5.2 peut demander une TakeoverReviewAnswer ;
   * manual_review = revue interne / cabinet ;
   * blocked = non recoverable par simple answer.
   */
  answerability: TakeoverExceptionAnswerability;
  candidateKey?: string;
  documentId?: string;
  fieldPath?: string;
};

const CLIENT_CODES = new Set([
  "PROPERTY_MATCH_REQUIRED",
  "ASSET_PROPERTY_ID_REQUIRED",
  "PRORATA_REQUIRED",
  "ASSET_PRORATA_REQUIRED",
  "ASSET_PLAN_UNAVAILABLE",
  "ASSET_PLAN_START_MISSING",
  "ASSET_PLAN_DURATION_INVALID",
  "CLASSIFICATION_REQUIRED",
  "ASSET_CLASSIFICATION_REQUIRED",
  "DEFICITS_REQUIRED",
  "STOCKS_DEFICITS_UNKNOWN",
  "ARD_REQUIRED",
  "STOCKS_ARD_UNKNOWN",
]);

const MANUAL_CODES = new Set([
  "CONTROL_REVIEW_REQUIRED",
  "CONTROL_TOTAL_GROSS_NOT_COMPARABLE",
  "CONTROL_CUMULATIVE_DEPRECIATION_NOT_COMPARABLE",
  "MANUAL_REVIEW_REQUIRED",
]);

const CODE_ALIASES: Record<string, string> = {
  ASSET_PROPERTY_ID_REQUIRED: "PROPERTY_MATCH_REQUIRED",
  ASSET_PRORATA_REQUIRED: "PRORATA_REQUIRED",
  ASSET_PLAN_UNAVAILABLE: "PRORATA_REQUIRED",
  STOCKS_DEFICITS_UNKNOWN: "DEFICITS_REQUIRED",
  STOCKS_ARD_UNKNOWN: "ARD_REQUIRED",
  CONTROL_TOTAL_GROSS_NOT_COMPARABLE: "CONTROL_REVIEW_REQUIRED",
  CONTROL_CUMULATIVE_DEPRECIATION_NOT_COMPARABLE: "CONTROL_REVIEW_REQUIRED",
};

function normalizeCode(code: string): string {
  return CODE_ALIASES[code] ?? code;
}

function answerabilityFor(code: string): TakeoverExceptionAnswerability {
  const normalized = normalizeCode(code);
  if (CLIENT_CODES.has(code) || CLIENT_CODES.has(normalized)) return "client";
  if (MANUAL_CODES.has(code) || MANUAL_CODES.has(normalized)) return "manual_review";
  if (code.endsWith("_CONFLICT") || code === "DOCUMENT_EXTRACTION_FAILED") {
    return "blocked";
  }
  if (code.startsWith("CONTROL_") && code.includes("CONFLICT")) return "blocked";
  return "blocked";
}

function candidateKeyFromFieldPath(fieldPath?: string): string | undefined {
  if (!fieldPath) return undefined;
  // assets.<id>.… — id Opening, pas candidateKey ; conservé comme indice 5.2.
  const match = /^assets\.([^.]+)/.exec(fieldPath);
  return match?.[1];
}

export function mapIssueToTakeoverException(issue: {
  code: string;
  message: string;
  fieldPath?: string;
  candidateKey?: string;
  documentId?: string;
}): TakeoverException {
  const code = normalizeCode(issue.code);
  return {
    code,
    message: issue.message,
    answerability: answerabilityFor(issue.code),
    candidateKey: issue.candidateKey ?? candidateKeyFromFieldPath(issue.fieldPath),
    documentId: issue.documentId,
    fieldPath: issue.fieldPath,
  };
}

export function mapIssuesToTakeoverExceptions(
  issues: readonly {
    code: string;
    message: string;
    fieldPath?: string;
    candidateKey?: string;
    documentId?: string;
  }[],
): TakeoverException[] {
  return issues.map(mapIssueToTakeoverException);
}
