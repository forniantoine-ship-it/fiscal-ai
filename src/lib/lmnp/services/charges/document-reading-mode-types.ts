/**
 * Document reading strategy types for heterogeneous charge documents.
 *
 * GPT role = document reading strategist (where business truth lives).
 * Parser role = structural source of truth (tables, rows, candidates).
 *
 * Scope: charges, invoices, fiscal notices, insurance contracts, hybrid charge docs only.
 * Does NOT apply to amortization, financing, or revenue spreadsheet pipelines.
 */

import type { ChargeDocumentType } from "@/lib/lmnp/services/classify-charge-document";

/** Dominant reading mode determined before extraction orchestration. */
export type DocumentReadingMode =
  | "structured_table"
  | "invoice"
  | "narrative_contract"
  | "fiscal_notice"
  | "mixed_layout";

export type DominantSource = "parser" | "semantic" | "hybrid";

/**
 * Parser-extracted candidate pools the orchestrator may prioritize.
 * GPT may only select among candidateIds within these pools — never invent values.
 */
export type CandidatePoolId =
  | "table_amounts"
  | "payable_section"
  | "label_anchored"
  | "ocr_fields"
  | "narrative_premium"
  | "fiscal_matrix"
  | "invoice_total";

/** Lightweight structural signals derived from OCR corpus before extraction. */
export type DocumentStructureHints = {
  hasTabularLayout: boolean;
  tableLineCount: number;
  hasInvoiceStructure: boolean;
  hasNarrativeContractSignals: boolean;
  hasFiscalNoticeSignals: boolean;
  hasPayableSectionSignals: boolean;
  hasFiscalMatrixSignals: boolean;
  /** True when tabular and narrative/fiscal signals coexist. */
  mixedLayoutSignals: boolean;
};

/** Output of DocumentReadingModeResolver — consumed by charge-reading-orchestrator. */
export type DocumentReadingModeDecision = {
  detectedReadingMode: DocumentReadingMode;
  dominantSource: DominantSource;
  /**
   * Whether detected tables likely contain the target business amount.
   * null when no tabular layout is present.
   */
  tableContainsTargetData: boolean | null;
  routingReason: string;
  parserDominant: boolean;
  semanticGuidanceEnabled: boolean;
  candidatePoolsSelected: CandidatePoolId[];
  chargeDocumentType: ChargeDocumentType;
  structuralHints: DocumentStructureHints;
};

export type ResolveDocumentReadingModeInput = {
  corpus: string;
  fileName?: string;
  chargeDocumentType: ChargeDocumentType;
  workspaceDocumentType?: string;
};
