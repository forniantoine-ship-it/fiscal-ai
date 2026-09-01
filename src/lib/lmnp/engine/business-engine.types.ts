/**
 * LMNP Business Engine — Core Domain Types
 *
 * Authority hierarchy:
 *   Documents
 *   → PageClassification        (Layer 0 — relevant vs irrelevant pages)
 *   → ExtractedAccountingFact   (Layer 1 — reliable accounting facts)
 *   → WorkGroup                 (Layer 2 — chantier consolidation proposals)
 *   → BusinessAsset             (Layer 3 — confirmed economic assets)
 *   → FiscalDecision            (Layer 4 — fiscal treatment with explanation)
 *   → AmortizationTable         (Layer 5 — annual amortization schedules)
 *   → FiscalDeclaration         (Layer 6 — multi-property consolidated declaration)
 */

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------

export type AccountingCategory =
  | "travaux"
  | "mobilier"
  | "electromenager"
  | "immeuble"
  | "cuisine"
  | "assurance"
  | "taxe_fonciere"
  | "autre";

export type FiscalTreatmentType = "immobilisation" | "charge";

// ---------------------------------------------------------------------------
// Layer 1 — ExtractedAccountingFact
// ---------------------------------------------------------------------------

/**
 * A reliable accounting fact extracted from a single document page.
 * This is the output of Layer 1 (Document Understanding) and the input
 * to Layer 2 (WorkGroup consolidation).
 *
 * Unlike the raw ExtractedInvoice, this type:
 * - carries explicit keywords for grouping heuristics
 * - tracks project references that link related invoices
 * - distinguishes TTC / HT amounts for fiscal precision
 */
export interface ExtractedAccountingFact {
  /** Source document ID (LmnpDocument.id) */
  documentId: string;
  /** Normalized supplier name — used for grouping */
  supplier?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  /** Amount all taxes included */
  amountTTC: number;
  /** Amount before tax, when extractable */
  amountHT?: number;
  vatRate?: number;
  detectedCategory: AccountingCategory;
  /**
   * Content keywords extracted from the invoice (e.g. "cuisine", "pose",
   * "chantier", "acompte"). Used by the grouping engine to detect related
   * invoices belonging to the same economic project.
   */
  keywords: string[];
  /**
   * Devis number, order reference, or chantier number shared across
   * multiple invoices from the same project. A strong grouping signal.
   */
  projectReference?: string;
  /** 0–1 extraction confidence */
  confidence: number;
}

// ---------------------------------------------------------------------------
// Layer 0 — Page segmentation
// ---------------------------------------------------------------------------

export type PageType =
  | "invoice"       // facture, devis payé — feed into extraction
  | "devis"         // devis non payé — informational only
  | "annexe"        // annexe contractuelle, conditions
  | "plan"          // plan d'architecte, plan de masse
  | "dpe"           // diagnostic de performance énergétique
  | "marketing"     // page commerciale, présentation produit
  | "cgv"           // conditions générales de vente
  | "administrative"// certificat, autorisation, attestation
  | "unknown";      // cannot be determined

/**
 * Classification of a single page within a PDF document.
 * Only `invoice` pages should feed accounting extraction.
 */
export interface PageClassification {
  pageIndex: number;
  pageType: PageType;
  confidence: number;
  /** Signals that drove this classification (for UX transparency) */
  signals: string[];
  /** Whether this page should be included in accounting extraction */
  isAccountingRelevant: boolean;
}

// ---------------------------------------------------------------------------
// Layer 2 — WorkGroup (chantier consolidation proposal)
// ---------------------------------------------------------------------------

export type WorkGroupStatus =
  | "proposed"   // engine detected a potential group — awaiting user decision
  | "confirmed"  // user confirmed the grouping
  | "rejected"   // user chose to keep invoices separate
  | "split";     // user confirmed part of the group and split the rest

/**
 * Immutable audit event recording every lifecycle transition of a WorkGroup.
 * Append-only: never delete or update, only append new events.
 */
export interface WorkGroupAuditEvent {
  id: string;
  workGroupId: string;
  eventType:
    | "created_by_ai"
    | "created_manually"
    | "confirmed"
    | "rejected"
    | "split"
    | "merged"
    | "edited"
    | "invoice_added"
    | "invoice_removed";
  timestamp: string;
  /** Plain-French description of what changed and why */
  explanation: string;
  /** Structured diff data (optional, for restore/undo) */
  metadata?: {
    changedFields?: string[];
    previousValues?: Record<string, unknown>;
    nextValues?: Record<string, unknown>;
    affectedInvoiceIds?: string[];
    mergedFromGroupIds?: string[];
    splitIntoGroupIds?: string[];
  };
}

/**
 * A proposed grouping of related ExtractedAccountingFacts that probably
 * belong to the same economic project (e.g. kitchen renovation, bathroom
 * refit, furniture purchase set).
 *
 * The engine ALWAYS proposes — it NEVER silently merges.
 * The user must confirm before a WorkGroup becomes a BusinessAsset.
 */
export interface WorkGroup {
  id: string;
  propertyId?: string;
  /** Normalized supplier name that dominates the group */
  supplier?: string;
  invoices: ExtractedAccountingFact[];
  totalAmount: number;
  dominantCategory: AccountingCategory;
  /** Human-readable project label (AI-proposed or user-edited) */
  detectedProjectLabel: string;
  /** Proposed amortization duration in years */
  proposedDurationYears: number;
  /** 0–1 grouping confidence */
  confidence: number;
  /**
   * Plain-language explanation displayed to the user explaining WHY
   * these invoices were grouped together.
   * Preserved even if user edits the group — shown as "AI suggested: …"
   */
  explanation: string;
  /** Snapshot of the original AI explanation before any user edits */
  aiExplanationSnapshot?: string;
  status: WorkGroupStatus;
  confirmedAt?: string;
  rejectedAt?: string;
  editedAt?: string;
  /** True when user manually created this group (not AI-proposed) */
  manuallyCreated?: boolean;
  /** Append-only lifecycle audit trail */
  auditTrail?: WorkGroupAuditEvent[];
  /**
   * Fingerprints of invoice combinations the user has explicitly rejected.
   * Prevents the AI from re-proposing the same merge on the next run.
   * Format: sorted documentIds joined with "|"
   */
  rejectedGroupFingerprints?: string[];
}

// ---------------------------------------------------------------------------
// Layer 3 — BusinessAsset
// ---------------------------------------------------------------------------

/**
 * A confirmed economic asset derived from one or more WorkGroups.
 * This is the real accounting source of truth — NOT individual documents.
 *
 * A BusinessAsset corresponds to a physical or economic reality:
 * "Equipped Kitchen", "Bathroom Renovation", "Living Room Furniture Set".
 */
export interface BusinessAsset {
  id: string;
  /** Human-readable asset label (e.g. "Cuisine équipée SCHMIDT") */
  label: string;
  propertyId?: string;
  /** WorkGroup IDs that were merged into this asset */
  sourceWorkGroupIds: string[];
  /** Original document IDs — kept for audit trail */
  sourceDocumentIds: string[];
  category: AccountingCategory;
  /** Total amount in euros */
  amount: number;
  /** Amortization duration in years (0 = charge immédiate) */
  amortizationYears: number;
  /**
   * Date from which amortization starts (typically the invoice date
   * of the last invoice in the project, or acquisition date).
   */
  amortizationStartDate: string;
  fiscalTreatment: FiscalTreatmentType;
  /**
   * Plain-language explanation of the fiscal treatment — always shown
   * to the user so they understand what the software decided and why.
   */
  explanation: string;
  /** True once the user has explicitly reviewed and validated this asset */
  userValidated: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Layer 4 — FiscalDecision
// ---------------------------------------------------------------------------

/**
 * The output of the Fiscal Decision Engine for a single BusinessAsset.
 * Always includes a human-readable explanation in plain French.
 */
export interface FiscalDecision {
  assetId: string;
  treatment: FiscalTreatmentType;
  category: AccountingCategory;
  durationYears: number;
  /** Short paragraph displayed in the UI explaining the decision */
  explanation: string;
  /** Bullet-point reasons why this treatment was chosen */
  reasons: string[];
  annualAmortization: number;
}

// ---------------------------------------------------------------------------
// Layer 5 — AmortizationScheduleRow
// ---------------------------------------------------------------------------

/** One year in an amortization schedule for a BusinessAsset. */
export interface AmortizationScheduleRow {
  year: number;
  openingVNC: number;
  annualAmortization: number;
  closingVNC: number;
  isPracticed: boolean;
}

export interface AmortizationSchedule {
  assetId: string;
  assetLabel: string;
  category: AccountingCategory;
  startDate: string;
  totalAmount: number;
  durationYears: number;
  annualAmortization: number;
  rows: AmortizationScheduleRow[];
}

// ---------------------------------------------------------------------------
// Engine output aggregate
// ---------------------------------------------------------------------------

/**
 * Complete output of the Business Engine for one property / fiscal year.
 * Used by the dashboard and declaration generation.
 */
export interface BusinessEngineResult {
  propertyId?: string;
  facts: ExtractedAccountingFact[];
  workGroupProposals: WorkGroup[];
  confirmedAssets: BusinessAsset[];
  fiscalDecisions: FiscalDecision[];
  schedules: AmortizationSchedule[];
  summary: {
    totalImmobilisations: number;
    totalCharges: number;
    totalAnnualAmortization: number;
    pendingGroupProposals: number;
    pendingUserValidation: number;
  };
}

// ---------------------------------------------------------------------------
// Priority 3 — Fiscal Knowledge Rules
// ---------------------------------------------------------------------------

/**
 * A pedagogical rule that drives consistent fiscal explanations across
 * all assets of the same category.
 *
 * Rules are NEVER randomly generated — they are a deterministic registry
 * so users always see consistent, trustworthy explanations.
 */
export interface FiscalKnowledgeRule {
  id: string;
  category: AccountingCategory;
  /** Canonical recommended duration for V1 model */
  suggestedDurationYears: number;
  durationRangeMin: number;
  durationRangeMax: number;
  /**
   * Template string for user-facing explanations.
   * Variables: {amount}, {duration}, {label}, {annualAmort}
   */
  explanationTemplate: string;
  /** Concrete real-world examples shown as educational context */
  examples: string[];
  /** Rules that guide the engine's confidence scoring */
  confidenceRules: string[];
  /** Simplified regulatory basis (never expose as jargon, only as context) */
  fiscalBasis: string;
}

// ---------------------------------------------------------------------------
// Priority 4 — Multi-property Declaration Aggregation
// ---------------------------------------------------------------------------

/** Per-property fiscal summary within a declaration. */
export interface PropertyFiscalSummary {
  propertyId: string;
  propertyLabel: string;
  assets: BusinessAsset[];
  decisions: FiscalDecision[];
  annualAmortization: number;
  totalCharges: number;
  totalImmobilisations: number;
}

/**
 * Complete LMNP fiscal declaration aggregating all properties.
 * This is the final accounting output used for declaration generation.
 */
export interface FiscalDeclaration {
  id: string;
  dossierId: string;
  fiscalYear: number;
  regime: "reel" | "micro-bic";
  /** All properties included in this declaration */
  propertyIds: string[];
  /** All confirmed business assets across all properties */
  businessAssets: BusinessAsset[];
  /** All fiscal decisions with explanations */
  fiscalDecisions: FiscalDecision[];
  /** All amortization schedules */
  amortizationSchedules: AmortizationSchedule[];
  /** Per-property breakdown (for visibility) */
  byProperty: PropertyFiscalSummary[];
  /** Global declaration totals */
  totals: {
    totalRevenue: number;
    totalCharges: number;
    totalAnnualAmortization: number;
    netResult: number;
  };
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Priority 5 — Smart User Guidance
// ---------------------------------------------------------------------------

export type GuidanceType =
  | "fiscal_explanation"   // Why is this amortized / charged?
  | "risk_prevention"      // This might be maintenance, not immobilizable
  | "confidence_signal"    // High / medium / low confidence on a grouping
  | "missing_information"  // Cannot determine category — needs user input
  | "tip"                  // Educational tip about LMNP accounting
  | "action_required";     // Blocking: user must act before proceeding

export type GuidanceSeverity = "info" | "warning" | "success" | "blocking";

/**
 * A contextual guidance message shown to the user.
 * Always written in plain French for non-accountants.
 * Never exposes accounting jargon.
 */
export interface GuidanceMessage {
  id: string;
  type: GuidanceType;
  severity: GuidanceSeverity;
  /** Short headline (≤60 chars) */
  title: string;
  /** Full explanation in plain French (1–3 sentences) */
  body: string;
  /** If true, a CTA button is shown alongside the message */
  actionable: boolean;
  actionLabel?: string;
  /** Arbitrary payload for the action handler */
  actionData?: Record<string, unknown>;
  /** Links back to the source of this message */
  relatedAssetId?: string;
  relatedWorkGroupId?: string;
  relatedDocumentId?: string;
}
