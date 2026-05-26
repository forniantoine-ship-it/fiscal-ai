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
  annualFinancingCharges: number;
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
  collectedAmount: number;
  detectedFees?: number;
}

export interface RevenusPropertyData {
  id: string;
  label: string;
  propertyId?: string;
  annualRevenue: number;
  rentCount: number;
  detectedFees: number;
  months: RevenusMonthlyEntry[];
  hasSecurityDeposit?: boolean;
  incomplete?: boolean;
}

export interface RevenusExtractionData {
  properties: RevenusPropertyData[];
  summary: {
    totalRevenue: number;
    rentCount: number;
    totalFees: number;
    hasSecurityDeposit: boolean;
  };
}

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
  activityStartDate?: string;
  activityType?: LmnpActivityType;
  indivision?: boolean;
  coOwners?: CoOwner[];
  inpiDocumentId?: string;
  inpiConfirmedAt?: string;
  logementDocumentId?: string;
  logementConfirmedAt?: string;
  propertyBackgroundExtraction?: PropertyBackgroundExtraction;
  creditDocumentId?: string;
  creditConfirmedAt?: string;
  creditDeclaredNoneAt?: string;
  creditFinancing?: CreditFinancingData;
  amortissementExistingActivity?: boolean;
  amortissementContinuityDocumentIds?: string[];
  amortissementTravauxDocumentIds?: string[];
  amortissementMobilierDocumentIds?: string[];
  amortissementConfirmedAt?: string;
  amortissementVentilation?: AmortissementVentilationData;
  revenusDocumentIds?: string[];
  revenusConfirmedAt?: string;
  revenusExtraction?: RevenusExtractionData;
  chargesDocumentIds?: string[];
  chargesConfirmedAt?: string;
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
