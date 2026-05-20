import type { FieldKey, LedgerDomain } from "./field-keys";
import type { NormalizedValue } from "./values";

export type FiscalRegime = "micro-bic" | "reel";

export type FiscalYearStatus =
  | "draft"
  | "collecting_documents"
  | "analyzing"
  | "pending_validation"
  | "ready_to_close"
  | "closed";

export type DocumentCategory =
  | "bail"
  | "revenus"
  | "charges"
  | "amortissement"
  | "emprunt"
  | "autre";

export type DocumentType =
  | "lease_contract"
  | "rent_receipt"
  | "rent_bank_statement"
  | "bank_statement"
  | "property_tax"
  | "insurance_invoice"
  | "condo_charges"
  | "works_invoice"
  | "furniture_invoice"
  | "loan_interest_certificate"
  | "loan_schedule"
  | "notary_deed"
  | "unknown";

export type DocumentStatus =
  | "uploaded"
  | "processing"
  | "analyzed"
  | "failed";

export type ValidationStatus =
  | "pending"
  | "approved"
  | "corrected"
  | "ignored"
  | "needs_document";

export type AlertSeverity = "blocking" | "warning" | "info";

export type AlertStatus = "open" | "acknowledged" | "resolved" | "dismissed";

export type AlertCode =
  | "A01_LOW_CONFIDENCE"
  | "A04_REQUIRED_DOCUMENT_MISSING"
  | "A05_LOAN_INTEREST_WITHOUT_CERTIFICATE"
  | "A06_UNRESOLVED_CONFLICT"
  | "A07_PENDING_REQUIRED_VALIDATION"
  | "A11_REQUIRED_FIELD_EMPTY";

export type ConfidenceBand = "high" | "medium" | "low";

export type ExpenseCategory =
  | "property_tax"
  | "insurance"
  | "condo"
  | "works_deductible"
  | "management_fees"
  | "other";

export interface Property {
  id: string;
  label: string;
  address: string;
  city: string;
  postalCode: string;
}

export interface FiscalYear {
  id: string;
  year: number;
  status: FiscalYearStatus;
  regime: FiscalRegime;
  regimeConfirmedAt?: string;
  propertyIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LmnpDocument {
  id: string;
  fiscalYearId: string;
  propertyId?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  category: DocumentCategory;
  documentType: DocumentType;
  status: DocumentStatus;
  uploadedAt: string;
}

export interface Extraction {
  id: string;
  documentId: string;
  fiscalYearId: string;
  fieldKey: FieldKey;
  /** Override label shown in ValidationItem (e.g. TVA, date). */
  displayLabel?: string;
  rawValue: string;
  normalizedValue: NormalizedValue;
  confidence: number;
  validationItemId?: string;
  status: "pending_validation" | "linked" | "superseded" | "discarded";
}

export interface ValidationItem {
  id: string;
  fiscalYearId: string;
  propertyId?: string;
  fieldKey: FieldKey;
  label: string;
  proposedValue: NormalizedValue;
  finalValue?: NormalizedValue;
  status: ValidationStatus;
  isRequired: boolean;
  extractionIds: string[];
  documentId?: string;
  documentFileName?: string;
  confidence: number;
  ledgerEntryId?: string;
  reviewedAt?: string;
  correctionNote?: string;
  createdAt: string;
  updatedAt: string;
}

export type LedgerOrigin =
  | "ai_validated"
  | "ai_auto_synced"
  | "ai_extracted"
  | "manual_edit"
  | "manual";

export interface LedgerEntry {
  id: string;
  fiscalYearId: string;
  propertyId?: string;
  domain: LedgerDomain;
  fieldKey: FieldKey;
  value: NormalizedValue;
  expenseCategory?: ExpenseCategory;
  validationItemId: string;
  sourceDocumentIds: string[];
  sourceDocumentType?: DocumentType;
  origin: LedgerOrigin;
  status: "active" | "voided";
  version: number;
  label?: string;
  editNote?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Alert {
  id: string;
  fiscalYearId: string;
  code: AlertCode;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  message: string;
  fieldKey?: FieldKey;
  documentId?: string;
  validationItemId?: string;
  primaryActionLabel?: string;
  primaryActionHref?: string;
}

export interface UserConfidenceScore {
  score: number;
  level: "starting" | "building" | "advancing" | "almost_ready" | "ready";
  pillars: {
    documents: number;
    validations: number;
    coherence: number;
    tabs: number;
  };
  nextActionLabel: string;
  nextActionHref: string;
}

export interface NextAction {
  title: string;
  description: string;
  href: string;
  estimatedMinutes?: number;
}

export interface LmnpWorkspace {
  fiscalYear: FiscalYear;
  properties: Property[];
  documents: LmnpDocument[];
  extractions: Extraction[];
  validationItems: ValidationItem[];
  ledgerEntries: LedgerEntry[];
  alerts: Alert[];
  confidence: UserConfidenceScore;
  nextAction: NextAction;
  pendingValidationCount: number;
  blockingAlertCount: number;
  canClose: boolean;
  openAlertCount: number;
  warningAlertCount: number;
  validatedFieldCount: number;
  autoSyncedFieldCount: number;
  manuallyValidatedFieldCount: number;
  fullyValidatedDocumentCount: number;
  analyzedDocumentCount: number;
}
