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
  | "A08_DOCUMENT_INCONSISTENCY"
  | "A11_REQUIRED_FIELD_EMPTY";

export type ConfidenceBand = "high" | "medium" | "low";

export type ExpenseCategory =
  | "property_tax"
  | "insurance"
  | "condo"
  | "works_deductible"
  | "management_fees"
  | "other";

export type PropertyType =
  | "appartement"
  | "maison"
  | "meuble-tourisme"
  | "chambre-hote"
  | "non-classe";

export interface PropertyBackgroundExtraction {
  acquisitionPrice?: number;
  notaryFees?: number;
  furnitureAmount?: number;
  coproReferences?: string;
  amortizationHints?: string;
  creditHints?: string;
}

export type LoanDeferralType = "total" | "partial" | "franchise" | "none";

export interface LoanProfile {
  id: string;
  bank: string;
  loanType: string;
  borrowedAmount: number;
  rate: number;
  durationMonths: number;
  monthlyPayment: number;
  insurance: number;
  deferralType?: LoanDeferralType;
  deferralMonths?: number;
  fees: number;
  /** One-time guarantee costs (e.g. caution, hypothèque). */
  loanGuaranteeFees?: number;
  /** One-time bank application / dossier fees at loan origination. */
  loanApplicationFees?: number;
  startDate: string;
  firstPaymentDate: string;
  remainingCapital: number;
  isWorksLoan?: boolean;
}

export interface LoanInstallment {
  date: string;
  totalPayment: number;
  principal: number;
  interest: number;
  insurance: number;
  fees: number;
  comment?: string;
}

export interface CreditFinancingSummary {
  fiscalYearLabel: string;
  annualInterest: number;
  annualInsurance: number;
  /** @deprecated Ambiguous aggregate — prefer annualInterest + annualInsurance. */
  annualFinancingCharges?: number;
  remainingCapital: number;
}

export interface CreditFinancingData {
  loans: LoanProfile[];
  summary: CreditFinancingSummary;
  installments: LoanInstallment[];
}

export type AmortissementAllocation = "charge-immediate" | "immobilisation" | "non-amortizable";

export interface AmortissementComponent {
  id: string;
  label: string;
  category: string;
  ventilationPercent: number;
  amount: number;
  durationYears: number;
  annualAmortization: number;
  allocation: AmortissementAllocation;
  practicedAmortization?: number;
  vnc?: number;
  remainingYears?: number;
  source?: "continuity" | "travaux" | "mobilier" | "dossier" | "charges";
}

export interface AmortissementVentilationData {
  components: AmortissementComponent[];
  summary: {
    componentCount: number;
    travauxTotal: number;
    mobilierTotal: number;
    averageDurationYears: number;
  };
}

export interface RevenusMonthlyEntry {
  month: string;
  monthKey?: string;
  collectedAmount: number;
  detectedFees?: number;
  events?: RevenueEvent[];
  missing?: boolean;
}

export type RevenueEventCategory =
  | "rent"
  | "platform_payout"
  | "charges"
  | "fee"
  | "refund"
  | "unknown";

export type RevenueEventRecurrence = "monthly" | "annual" | "one_shot" | null;

export interface RevenueEvent {
  id: string;
  date: string | null;
  amount: number;
  category: RevenueEventCategory;
  sourceDocumentId?: string;
  sourceType?: string;
  label?: string;
  confidence?: number;
  recurrence?: RevenueEventRecurrence;
  mergedFromIds?: string[];
  deduplicated?: boolean;
}

export interface RevenusPropertyData {
  id: string;
  label: string;
  propertyId?: string;
  events: RevenueEvent[];
  annualRevenue: number;
  rentCount: number;
  detectedFees: number;
  months: RevenusMonthlyEntry[];
  hasSecurityDeposit?: boolean;
  incomplete?: boolean;
  missingMonths?: string[];
  deduplicatedCount?: number;
  annualTotalHint?: number | null;
}

export interface RevenusExtractionData {
  properties: RevenusPropertyData[];
  events?: RevenueEvent[];
  summary: {
    totalRevenue: number;
    rentCount: number;
    totalFees: number;
    hasSecurityDeposit: boolean;
    eventCount?: number;
    missingMonthCount?: number;
    deduplicatedCount?: number;
    lowConfidenceCount?: number;
  };
  deduplicationNotes?: string[];
}

export type RevenueMonthlyGridRow = {
  monthKey: string;
  month: string;
  loyers: number;
  autresRevenus: number;
  charges: number;
};

export type RevenueTransactionDirection = "credit" | "debit";

export type RevenueLineKind = "atomic" | "total" | "subtotal" | "balance" | "summary";

export type RevenueRawLineSourceType =
  | "bank_statement"
  | "excel"
  | "rent_receipt"
  | "attestation"
  | "platform_export";

export type RevenueTransactionCategory =
  | "rent"
  | "additional_income"
  | "deposit"
  | "caf_subsidy"
  | "reimbursement"
  | "internal_transfer"
  | "owner_contribution"
  | "owner_transfer"
  | "platform_payout"
  | "charges"
  | "fee"
  | "unknown";

/** Atomic line extracted from a document — never a document total. */
export interface RevenueRawLine {
  id?: string;
  date?: string | null;
  label?: string;
  amount: number;
  direction: RevenueTransactionDirection;
  sourceDocumentId: string;
  sourceType: RevenueRawLineSourceType | string;
  confidence: number;
  accountContext?: string;
  counterparty?: string;
  lineKind?: RevenueLineKind;
  explicitlyMarkedAsRent?: boolean;
  /** Column header from a structured table (e.g. "Loyer", "Complément"). */
  sourceColumnHeader?: string;
  structuredTable?: boolean;
  monthLabel?: string;
}

export interface RevenueTransaction {
  id: string;
  date: string | null;
  description: string;
  label?: string;
  amount: number;
  direction: RevenueTransactionDirection;
  category: RevenueTransactionCategory;
  confidence?: number;
  accountContext?: string;
  counterparty?: string;
  clusterId?: string;
  recurrenceScore?: number;
  userValidated?: boolean;
  lineKind?: RevenueLineKind;
  explicitlyMarkedAsRent?: boolean;
  sourceDocumentId?: string;
  sourceType?: string;
  deduplicated?: boolean;
  mergedFromIds?: string[];
  /** Mapped deterministically from a structured table column header. */
  structuredMapping?: boolean;
  /** Month row label from structured tables (e.g. "Avril") when date is missing. */
  monthLabel?: string;
}

export type RevenuePropertySession = {
  id: string;
  label: string;
  propertyId?: string;
  rows: RevenueMonthlyGridRow[];
  transactions?: RevenueTransaction[];
  lowConfidenceTransactions?: RevenueTransaction[];
  isolatedTransactions?: RevenueTransaction[];
  /** When true, AI aggregation must not overwrite user-edited grid rows. */
  gridUserEdited?: boolean;
};

export type RevenueGptSession = {
  properties: RevenuePropertySession[];
  mode?: "upload" | "manual";
  ui?: {
    expandedPropertyIds?: string[];
  };
  meta?: {
    deduplicatedCount?: number;
    hasSecurityDeposit?: boolean;
    lowConfidenceCount?: number;
    transactionCount?: number;
    gridSource?: "ocr_lines" | "mock_lines" | "persisted_session" | "user_manual";
  };
  /** Legacy raw events — not used for grid rendering. */
  events?: RevenueEvent[];
};

export type ChargesExpenseSource = "upload" | "credit" | "revenus" | "amortissement";

export interface ChargesExpenseLine {
  id: string;
  label: string;
  amount: number;
  vatAmount?: number;
  date?: string;
  propertyLabel?: string;
  recoverable: boolean;
  recurring?: boolean;
  source?: ChargesExpenseSource;
}

export type ChargesAmortizationSuggestionStatus = "pending" | "transferred" | "kept_as_charge";

export type ChargesAmortizationWorkType =
  | "operating_charge"
  | "light_maintenance"
  | "durable_improvement"
  | "furniture"
  | "equipment";

export interface ChargesAmortizationSuggestion {
  id: string;
  expenseLineId: string;
  label: string;
  amount: number;
  propertyLabel?: string;
  amortCategory: string;
  durationYears: number;
  natureSummary: string;
  workType: ChargesAmortizationWorkType;
  status: ChargesAmortizationSuggestionStatus;
  decidedAt?: string;
  transferredAt?: string;
}

export interface AmortissementFromChargesItem {
  id: string;
  suggestionId: string;
  expenseLineId: string;
  label: string;
  category: string;
  amount: number;
  durationYears: number;
  propertyLabel?: string;
  transferredAt: string;
}

export interface ChargesCategoryData {
  id: string;
  category: ExpenseCategory;
  label: string;
  annualTotal: number;
  propertyId?: string;
  propertyLabel?: string;
  lines: ChargesExpenseLine[];
  recurring?: boolean;
}

export interface ChargesExtractionData {
  categories: ChargesCategoryData[];
  recoveredFromOtherSteps: number;
  amortizationSuggestions: ChargesAmortizationSuggestion[];
  summary: {
    totalCharges: number;
    categoryCount: number;
    recoverableTotal: number;
    nonRecoverableTotal: number;
  };
}

export interface Property {
  id: string;
  label: string;
  address: string;
  addressLine2?: string;
  city: string;
  postalCode: string;
  propertyType?: PropertyType;
  coproperty?: boolean;
  surface?: number;
  acquisitionDate?: string;
  status?: string;
  notaryDocumentId?: string;
}

export type JourneyStepId =
  | "documents"
  | "analysis"
  | "validation"
  | "dossier"
  | "generate"
  | "payment"
  | "transmission";

export type JourneyStepStatus = "completed" | "active" | "locked";

export interface JourneyStepView {
  id: JourneyStepId;
  title: string;
  description: string;
  href: string;
  cta: string;
  status: JourneyStepStatus;
  stepNumber: number;
}

export interface LmnpJourney {
  steps: JourneyStepView[];
  currentStepId: JourneyStepId;
  currentStepIndex: number;
  totalSteps: number;
  percentComplete: number;
  isComplete: boolean;
}

export type AssistantInsightTone = "ai" | "success" | "pending";

export interface AssistantInsight {
  id: string;
  tone: AssistantInsightTone;
  text: string;
}

export interface AssistantBrief {
  headline: string;
  insights: AssistantInsight[];
}

export interface FiscalYear {
  id: string;
  year: number;
  status: FiscalYearStatus;
  regime: FiscalRegime;
  regimeConfirmedAt?: string;
  declarationGeneratedAt?: string;
  paidAt?: string;
  transmittedAt?: string;
  propertyIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CoOwner {
  id: string;
  name: string;
  percentage: number;
}

export type LmnpActivityType = "LMNP" | "LMP";

export interface DeclarationDraft {
  completedSteps: string[];
  documentStepsCompleted?: string[];
  journeyStartedAt?: string;
  siren?: string;
  siret?: string;
  exploitantFirstName?: string;
  exploitantLastName?: string;
  exploitantEmail?: string;
  exploitantTelephone?: string;
  personalAddress?: string;
  personalCity?: string;
  personalPostalCode?: string;
  /** @deprecated Use personalAddress — kept for hydration of older workspaces */
  entrepreneurAddress?: string;
  entrepreneurCity?: string;
  entrepreneurPostalCode?: string;
  establishmentAddress?: string;
  establishmentCity?: string;
  establishmentPostalCode?: string;
  activityStartDate?: string;
  activityType?: LmnpActivityType;
  indivision?: boolean;
  coOwners?: CoOwner[];
  inpiDocumentId?: string;
  /** Set after first GPT prefill — blocks automatic re-extraction on hydration. */
  inpiGptPrefillAppliedAt?: string;
  /** Per-field locks: user edits always win over GPT re-prefill. */
  activiteUserValidatedFields?: Partial<Record<string, boolean>>;
  /**
   * Cross-tunnel governed field store — canonical metadata per extracted field.
   * @see GovernedFieldMetadata in @/lib/documents/types/governed-field
   */
  governedFields?: Record<string, import("@/lib/documents/types/governed-field").GovernedFieldMetadata>;
  inpiConfirmedAt?: string;
  logementDocumentId?: string;
  logementConfirmedAt?: string;
  /** In-progress logement form — restored passively on tunnel navigation. */
  logementWorkspaceForm?: import("@/lib/lmnp/services/logement-profile").LogementFormValues;
  propertyBackgroundExtraction?: PropertyBackgroundExtraction;
  creditDocumentId?: string;
  creditConfirmedAt?: string;
  creditDeclaredNoneAt?: string;
  creditFinancing?: CreditFinancingData;
  /** In-progress credit form — restored passively on tunnel navigation. */
  creditWorkspaceForm?: import("@/lib/lmnp/services/credit-profile").CreditFormValues;
  /** Persisted GPT extraction session (amortization + loan offer) — no rerun on navigation. */
  creditGptSession?: import("@/lib/lmnp/services/credit-gpt-ui-prefill").CreditExtractionSession;
  /** Fields manually edited by the user — preserved over GPT re-hydration. */
  creditUserValidatedFields?: Partial<Record<string, boolean>>;
  amortissementExistingActivity?: boolean;
  amortissementContinuityDocumentIds?: string[];
  amortissementTravauxDocumentIds?: string[];
  amortissementMobilierDocumentIds?: string[];
  amortissementConfirmedAt?: string;
  amortissementVentilation?: AmortissementVentilationData;
  /** Real extraction results persisted after runBulkDocumentExtraction — replaces mock invoices on remount. */
  amortissementExtractedInvoices?: import("@/lib/lmnp/services/amortissement-profile").ExtractedInvoice[];
  revenusDocumentIds?: string[];
  revenusConfirmedAt?: string;
  revenusExtraction?: RevenusExtractionData;
  revenueGptSession?: RevenueGptSession;
  chargesDocumentIds?: string[];
  chargesConfirmedAt?: string;
  /** User opted in to import charges from Crédit / Revenus / Amortissements. */
  chargesCrossStepRecoveryEnabled?: boolean;
  chargesExtraction?: ChargesExtractionData;
  chargesAmortizationDecisions?: ChargesAmortizationSuggestion[];
  amortissementFromCharges?: AmortissementFromChargesItem[];
  usagesPersonnelsConfirmed?: boolean;
  baremeCarburantConfirmed?: boolean;
  regimeSocial?: string;
  tvaRegime?: string;
  signedAt?: string;
}

export interface DocumentOcrMeta {
  documentTypeConfidence: number;
  amountPeriod: "monthly" | "annual" | "one_time" | "unknown";
  amountKind: "ttc" | "ht" | "unknown";
  warnings: string[];
  inconsistencies: { code: string; severity: "warning" | "info"; message: string }[];
  fieldsDetected: number;
  fieldsRejected: number;
  trustedForAutoSync: boolean;
  usedHeuristicFallback: boolean;
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
  /** Supabase Storage path when the document was uploaded remotely. */
  storagePath?: string;
  /** True when restored from Supabase without a local IndexedDB blob. */
  remoteRestored?: boolean;
  ocrMeta?: DocumentOcrMeta;
}

export type OcrFieldKey =
  | "totalAmount"
  | "vatAmount"
  | "supplierName"
  | "invoiceDate"
  | "address";

export interface OcrFieldRegion {
  x: number;
  y: number;
  width: number;
  height: number;
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
  /** Source OCR field for preview highlighting. */
  ocrFieldKey?: OcrFieldKey;
  region?: OcrFieldRegion;
  warnings?: string[];
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
  cta: string;
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
  journey: LmnpJourney;
  assistant: AssistantBrief;
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
