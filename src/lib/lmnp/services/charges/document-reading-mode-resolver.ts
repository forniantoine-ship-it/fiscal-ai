/**
 * DocumentReadingModeResolver — determines dominant reading mode BEFORE charge extraction.
 *
 * Answers: "Where is the business truth likely located?" — not "GPT vs parser".
 * Deterministic heuristics only; GPT strategist may refine mixed_layout cases separately.
 */

import type { ChargeDocumentType } from "@/lib/lmnp/services/classify-charge-document";
import { detectDocumentStructureHints } from "./document-structure-signals";
import { logDocumentReadingModeDebug } from "./document-reading-mode-debug";
import type {
  CandidatePoolId,
  DocumentReadingMode,
  DocumentReadingModeDecision,
  DominantSource,
  ResolveDocumentReadingModeInput,
} from "./document-reading-mode-types";
import { logReadingModeTrace } from "./reading-mode-trace-instrumentation";

const COPRO_TYPES: ChargeDocumentType[] = [
  "charges_copropriete",
  "fonds_travaux",
  "avance_tresorerie",
];

const INVOICE_TYPES: ChargeDocumentType[] = ["facture_artisan", "facture_energie"];

function poolsForMode(
  mode: DocumentReadingMode,
  tableContainsTargetData: boolean | null,
): CandidatePoolId[] {
  switch (mode) {
    case "structured_table":
      return ["table_amounts"];
    case "invoice":
      return ["invoice_total", "payable_section", "label_anchored"];
    case "narrative_contract":
      return ["narrative_premium", "label_anchored", "ocr_fields"];
    case "fiscal_notice":
      if (tableContainsTargetData === true) {
        return ["payable_section", "table_amounts", "label_anchored"];
      }
      return ["payable_section", "label_anchored"];
    case "mixed_layout":
      if (tableContainsTargetData === true) {
        return ["table_amounts", "payable_section", "label_anchored", "narrative_premium"];
      }
      return ["payable_section", "label_anchored", "narrative_premium", "ocr_fields"];
  }
}

function dominantSourceForMode(mode: DocumentReadingMode): DominantSource {
  switch (mode) {
    case "structured_table":
      return "parser";
    case "narrative_contract":
      return "semantic";
    case "invoice":
    case "fiscal_notice":
    case "mixed_layout":
      return "hybrid";
  }
}

function inferTableContainsTargetData(
  mode: DocumentReadingMode,
  hints: ReturnType<typeof detectDocumentStructureHints>,
): boolean | null {
  if (!hints.hasTabularLayout) return null;

  if (mode === "structured_table") return true;

  if (mode === "fiscal_notice") {
    // Fiscal matrices often contain rates/bases, not the payable amount.
    if (hints.hasFiscalMatrixSignals && hints.hasPayableSectionSignals) return false;
    if (hints.hasFiscalMatrixSignals && !hints.hasPayableSectionSignals) return false;
    return hints.hasPayableSectionSignals;
  }

  if (mode === "narrative_contract") {
    return hints.hasNarrativeContractSignals && !hints.hasPayableSectionSignals ? false : null;
  }

  if (mode === "invoice") {
    return hints.hasPayableSectionSignals || hints.hasInvoiceStructure;
  }

  if (mode === "mixed_layout") {
    if (hints.hasFiscalMatrixSignals && hints.hasPayableSectionSignals) return false;
    if (hints.hasNarrativeContractSignals && !hints.hasPayableSectionSignals) return false;
    return hints.hasPayableSectionSignals ?? hints.hasTabularLayout;
  }

  return null;
}

function resolveModeFromChargeType(
  chargeType: ChargeDocumentType,
  hints: ReturnType<typeof detectDocumentStructureHints>,
): { mode: DocumentReadingMode; reason: string } {
  if (COPRO_TYPES.includes(chargeType)) {
    if (hints.hasTabularLayout || hints.tableLineCount >= 1) {
      return {
        mode: "structured_table",
        reason: `charge_type_${chargeType}_with_tabular_layout`,
      };
    }
    if (hints.mixedLayoutSignals) {
      return { mode: "mixed_layout", reason: `charge_type_${chargeType}_mixed_signals` };
    }
    return { mode: "structured_table", reason: `charge_type_${chargeType}_default_parser` };
  }

  if (INVOICE_TYPES.includes(chargeType)) {
    return { mode: "invoice", reason: `charge_type_${chargeType}_payable_invoice` };
  }

  if (chargeType === "insurance_habitation") {
    if (hints.hasNarrativeContractSignals) {
      // Substantial line-item tables (premiums breakdown) → mixed; single premium line stays narrative.
      if (hints.hasTabularLayout && hints.tableLineCount >= 3) {
        return {
          mode: "mixed_layout",
          reason: "insurance_with_substantial_line_item_tables",
        };
      }
      return {
        mode: "narrative_contract",
        reason: "insurance_narrative_contract_dominant",
      };
    }
    if (hints.mixedLayoutSignals) {
      return { mode: "mixed_layout", reason: "insurance_with_tables_and_narrative" };
    }
    return { mode: "narrative_contract", reason: "insurance_default_semantic" };
  }

  if (chargeType === "taxe_fonciere") {
    if (hints.mixedLayoutSignals || (hints.hasFiscalMatrixSignals && hints.hasPayableSectionSignals)) {
      return {
        mode: "mixed_layout",
        reason: "fiscal_notice_with_matrix_and_payable_outside",
      };
    }
    return { mode: "fiscal_notice", reason: "fiscal_notice_dgfip_dominant" };
  }

  // inconnu — infer from structural signals
  if (hints.hasFiscalNoticeSignals) {
    return { mode: "fiscal_notice", reason: "inconnu_fiscal_signals" };
  }
  if (hints.hasInvoiceStructure) {
    return { mode: "invoice", reason: "inconnu_invoice_signals" };
  }
  if (hints.hasNarrativeContractSignals) {
    return { mode: "narrative_contract", reason: "inconnu_narrative_signals" };
  }
  if (hints.hasTabularLayout) {
    return { mode: "structured_table", reason: "inconnu_tabular_layout" };
  }
  if (hints.mixedLayoutSignals) {
    return { mode: "mixed_layout", reason: "inconnu_mixed_signals" };
  }
  return { mode: "invoice", reason: "inconnu_default_invoice_fallback" };
}

/**
 * Resolves the dominant document reading mode for a charge document.
 * Runs before parser orchestration — does not extract amounts.
 */
export function resolveDocumentReadingMode(
  input: ResolveDocumentReadingModeInput,
): DocumentReadingModeDecision {
  logReadingModeTrace("resolveDocumentReadingMode_entry", input.corpus.length, {
    chargeDocumentType: input.chargeDocumentType,
    fileName: input.fileName ?? null,
  });
  logReadingModeTrace(
    "resolveDocumentReadingMode_before_detectDocumentStructureHints",
    input.corpus.length,
  );
  const hints = detectDocumentStructureHints(input.corpus);
  logReadingModeTrace(
    "resolveDocumentReadingMode_after_detectDocumentStructureHints",
    input.corpus.length,
    { tableLineCount: hints.tableLineCount },
  );
  logReadingModeTrace(
    "resolveDocumentReadingMode_before_resolveModeFromChargeType",
    input.corpus.length,
  );
  const { mode, reason } = resolveModeFromChargeType(input.chargeDocumentType, hints);
  logReadingModeTrace("resolveDocumentReadingMode_after_resolveModeFromChargeType", input.corpus.length, {
    mode,
    reason,
  });
  logReadingModeTrace(
    "resolveDocumentReadingMode_before_inferTableContainsTargetData",
    input.corpus.length,
  );
  const tableContainsTargetData = inferTableContainsTargetData(mode, hints);
  logReadingModeTrace(
    "resolveDocumentReadingMode_after_inferTableContainsTargetData",
    input.corpus.length,
    { tableContainsTargetData },
  );
  const dominantSource = dominantSourceForMode(mode);
  const candidatePoolsSelected = poolsForMode(mode, tableContainsTargetData);
  logReadingModeTrace("resolveDocumentReadingMode_after_poolsForMode", input.corpus.length, {
    dominantSource,
    candidatePoolCount: candidatePoolsSelected.length,
  });

  const decision: DocumentReadingModeDecision = {
    detectedReadingMode: mode,
    dominantSource,
    tableContainsTargetData,
    routingReason: reason,
    parserDominant: dominantSource === "parser" || dominantSource === "hybrid",
    semanticGuidanceEnabled:
      mode === "narrative_contract" ||
      mode === "mixed_layout" ||
      (mode === "fiscal_notice" && tableContainsTargetData !== true),
    candidatePoolsSelected,
    chargeDocumentType: input.chargeDocumentType,
    structuralHints: hints,
  };

  logReadingModeTrace(
    "resolveDocumentReadingMode_before_logDocumentReadingModeDebug",
    input.corpus.length,
  );
  logDocumentReadingModeDebug("resolve", decision, {
    fileName: input.fileName ?? null,
    workspaceDocumentType: input.workspaceDocumentType ?? null,
    corpusLength: input.corpus.length,
    tableLineCount: hints.tableLineCount,
  });
  logReadingModeTrace("resolveDocumentReadingMode_exit", input.corpus.length, {
    detectedReadingMode: decision.detectedReadingMode,
  });

  return decision;
}

/** Whether semantic arbitration should be deferred to GPT for this reading mode. */
export function shouldEnableSemanticArbitration(decision: DocumentReadingModeDecision): boolean {
  return decision.semanticGuidanceEnabled;
}

/** Whether parser output should be treated as authoritative for structure. */
export function isParserSovereign(decision: DocumentReadingModeDecision): boolean {
  return decision.parserDominant;
}
