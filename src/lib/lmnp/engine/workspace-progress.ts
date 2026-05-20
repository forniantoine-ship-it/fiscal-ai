import type { FiscalYear, FiscalYearStatus, LmnpDocument, ValidationItem } from "../types";
import { HIGH_CONFIDENCE_THRESHOLD } from "../validation/display";

export interface DossierProgressSnapshot {
  validatedFieldCount: number;
  autoSyncedFieldCount: number;
  manuallyValidatedFieldCount: number;
  fullyValidatedDocumentCount: number;
  analyzedDocumentCount: number;
  openAlertCount: number;
  warningAlertCount: number;
}

export function computeDossierProgress(
  documents: LmnpDocument[],
  validationItems: ValidationItem[],
  alerts: { severity: string }[],
): DossierProgressSnapshot {
  const validated = validationItems.filter(
    (v) => v.status === "approved" || v.status === "corrected",
  );
  const autoSyncedFieldCount = validated.filter(
    (v) => v.status === "approved" && v.confidence >= HIGH_CONFIDENCE_THRESHOLD,
  ).length;
  const manuallyValidatedFieldCount = validated.length - autoSyncedFieldCount;

  const analyzedDocumentCount = documents.filter((d) => d.status === "analyzed").length;
  const fullyValidatedDocumentCount = documents.filter((doc) => {
    if (doc.status !== "analyzed") return false;
    const items = validationItems.filter((v) => v.documentId === doc.id);
    return items.length > 0 && items.every((v) => v.status !== "pending");
  }).length;

  return {
    validatedFieldCount: validated.length,
    autoSyncedFieldCount,
    manuallyValidatedFieldCount,
    fullyValidatedDocumentCount,
    analyzedDocumentCount,
    openAlertCount: alerts.length,
    warningAlertCount: alerts.filter((a) => a.severity === "warning").length,
  };
}

export function resolveFiscalYearStatus(
  fiscalYear: FiscalYear,
  documents: LmnpDocument[],
  pendingValidationCount: number,
  canClose: boolean,
): FiscalYearStatus {
  if (documents.some((d) => d.status === "processing")) return "analyzing";
  if (pendingValidationCount > 0) return "pending_validation";
  if (canClose) return "ready_to_close";
  if (documents.some((d) => d.status === "analyzed")) return "pending_validation";
  if (documents.length > 0) return "collecting_documents";
  return fiscalYear.status === "closed" ? "closed" : "draft";
}
