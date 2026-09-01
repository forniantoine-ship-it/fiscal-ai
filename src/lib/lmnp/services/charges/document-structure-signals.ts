/**
 * Deterministic structural signal detection from charge document OCR corpus.
 * Used by DocumentReadingModeResolver — no GPT, no amount extraction.
 */

import { normalizeChargeDocumentText } from "@/lib/lmnp/services/classify-charge-document";
import type { DocumentStructureHints } from "./document-reading-mode-types";
import {
  countCorpusLines,
  logReadingModeTrace,
} from "./reading-mode-trace-instrumentation";
import {
  logTableLineDebug,
  timedRegexCall,
} from "./table-line-debug-instrumentation";

const INVOICE_SIGNALS: RegExp[] = [
  /facture\s+n[°o]/i,
  /net\s+a\s+payer/i,
  /montant\s+ttc/i,
  /total\s+ttc/i,
  /tva\s+(?:\d|%)/i,
  /num[eé]ro\s+de\s+facture/i,
];

const NARRATIVE_CONTRACT_SIGNALS: RegExp[] = [
  /contrat\s+d['']?assurance/i,
  /prime\s+annuelle/i,
  /cotisation\s+annuelle/i,
  /garantie\s+(?:locative|habitation|multirisque)/i,
  /conditions\s+g[eé]n[eé]rales/i,
  /police\s+d['']?assurance/i,
  /responsabilit[eé]\s+civile/i,
];

const FISCAL_NOTICE_SIGNALS: RegExp[] = [
  /taxe\s+fonci[eè]re/i,
  /avis\s+(?:de\s+)?taxe/i,
  /dgfip|finances\s+publiques/i,
  /impots\.gouv/i,
  /propri[eé]t[eé]s\s+b[aâ]ties/i,
];

const FISCAL_MATRIX_SIGNALS: RegExp[] = [
  /valeur\s+locative\s+cadastrale/i,
  /revenu\s+cadastral/i,
  /base\s+d['']?imposition/i,
  /taux\s+d['']?imposition/i,
  /quote[\s-]?part/i,
];

const PAYABLE_SECTION_SIGNALS: RegExp[] = [
  /net\s+a\s+payer/i,
  /montant\s+a\s+payer/i,
  /total\s+a\s+payer/i,
  /solde\s+a\s+payer/i,
  /total\s+des\s+imp[oô]ts/i,
];

/** Lines with multiple euro amounts separated by whitespace — tabular charge layouts. */
const TABLE_LINE_PATTERN =
  /^[^\n]{0,120}(\d[\d\s.,]*\s*(?:€|eur|eur\s)?){2,}[^\n]{0,40}$/im;

const AMOUNT_IN_LINE_PATTERN = /\d[\d\s.,]*\s*(?:€|eur)\b/gi;

function countTableLikeLines(text: string): number {
  const corpusLength = text.length;
  logReadingModeTrace("countTableLikeLines_entry", corpusLength);
  const lines = text.split(/\n+/);
  const lineCount = lines.length;
  let maxLineLength = 0;
  let maxLineIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    const len = lines[i]!.trim().length;
    if (len > maxLineLength) {
      maxLineLength = len;
      maxLineIndex = i;
    }
  }
  logTableLineDebug({
    phase: "countTableLikeLines_corpus_shape",
    corpusLength,
    lineCount,
    maxLineLength,
    maxLineIndex,
    singleDominantLine: maxLineLength >= corpusLength * 0.9,
  });
  logReadingModeTrace("countTableLikeLines_after_split", corpusLength, {
    lineCount,
    maxLineLength,
    maxLineIndex,
  });
  let count = 0;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]!;
    const trimmed = line.trim();
    if (trimmed.length < 8) continue;
    if (trimmed.length > 500) {
      console.log("[table-line-skipped]", {
        lineIndex,
        lineLength: trimmed.length,
        reason: "length_guard",
      });
      continue;
    }
    const preview = trimmed.slice(0, 120);

    logTableLineDebug({ lineIndex, lineLength: trimmed.length, preview, phase: "before_TABLE_LINE_PATTERN" });

    const tableLineMatched = TABLE_LINE_PATTERN.test(trimmed);
    logTableLineDebug({ lineIndex, result: tableLineMatched, phase: "after_TABLE_LINE_PATTERN" });

    if (tableLineMatched) {
      count++;
      continue;
    }

    logTableLineDebug({ lineIndex, lineLength: trimmed.length, preview, phase: "before_AMOUNT_IN_LINE_PATTERN" });
    const amounts = timedRegexCall(
      "AMOUNT_IN_LINE_PATTERN",
      lineIndex,
      trimmed.length,
      preview,
      () => trimmed.match(AMOUNT_IN_LINE_PATTERN),
    );
    logTableLineDebug({
      lineIndex,
      result: amounts?.length ?? 0,
      phase: "after_AMOUNT_IN_LINE_PATTERN",
    });
    if (amounts && amounts.length >= 2 && trimmed.length < 200) count++;
  }
  logReadingModeTrace("countTableLikeLines_exit", corpusLength, { lineCount, tableLikeLineCount: count });
  return count;
}

function anyPatternMatches(
  text: string,
  patterns: RegExp[],
  signalGroup: string,
  corpusLength: number,
): boolean {
  logReadingModeTrace("anyPatternMatches_entry", corpusLength, {
    signalGroup,
    patternCount: patterns.length,
  });
  for (let patternIndex = 0; patternIndex < patterns.length; patternIndex++) {
    const pattern = patterns[patternIndex]!;
    logReadingModeTrace("anyPatternMatches_before_pattern_test", corpusLength, {
      signalGroup,
      patternIndex,
      patternSource: pattern.source,
    });
    if (pattern.test(text)) {
      logReadingModeTrace("anyPatternMatches_after_pattern_match", corpusLength, {
        signalGroup,
        patternIndex,
        matched: true,
      });
      logReadingModeTrace("anyPatternMatches_exit", corpusLength, { signalGroup, matched: true });
      return true;
    }
    logReadingModeTrace("anyPatternMatches_after_pattern_test", corpusLength, {
      signalGroup,
      patternIndex,
      matched: false,
    });
  }
  logReadingModeTrace("anyPatternMatches_exit", corpusLength, { signalGroup, matched: false });
  return false;
}

/**
 * Derives structural hints from normalized charge OCR corpus.
 */
export function detectDocumentStructureHints(corpus: string): DocumentStructureHints {
  const corpusLength = corpus.length;
  const lineCount = countCorpusLines(corpus);
  logReadingModeTrace("detectDocumentStructureHints_entry", corpusLength, { lineCount });
  logReadingModeTrace("detectDocumentStructureHints_before_normalizeChargeDocumentText", corpusLength, {
    lineCount,
  });
  const normalized = normalizeChargeDocumentText(corpus);
  logReadingModeTrace("detectDocumentStructureHints_after_normalizeChargeDocumentText", corpusLength, {
    lineCount,
    normalizedLength: normalized.length,
  });
  logReadingModeTrace("detectDocumentStructureHints_before_countTableLikeLines", corpusLength, {
    lineCount,
  });
  const tableLineCount = countTableLikeLines(corpus);
  logReadingModeTrace("detectDocumentStructureHints_after_countTableLikeLines", corpusLength, {
    lineCount,
    tableLineCount,
  });
  const hasTabularLayout = tableLineCount >= 2;
  logReadingModeTrace("detectDocumentStructureHints_after_hasTabularLayout", corpusLength, {
    lineCount,
    hasTabularLayout,
  });

  const hasInvoiceStructure = anyPatternMatches(
    normalized,
    INVOICE_SIGNALS,
    "invoice",
    corpusLength,
  );
  const hasNarrativeContractSignals = anyPatternMatches(
    normalized,
    NARRATIVE_CONTRACT_SIGNALS,
    "narrative_contract",
    corpusLength,
  );
  const hasFiscalNoticeSignals = anyPatternMatches(
    normalized,
    FISCAL_NOTICE_SIGNALS,
    "fiscal_notice",
    corpusLength,
  );
  const hasPayableSectionSignals = anyPatternMatches(
    normalized,
    PAYABLE_SECTION_SIGNALS,
    "payable_section",
    corpusLength,
  );
  const hasFiscalMatrixSignals = anyPatternMatches(
    normalized,
    FISCAL_MATRIX_SIGNALS,
    "fiscal_matrix",
    corpusLength,
  );
  logReadingModeTrace("detectDocumentStructureHints_after_signal_pattern_groups", corpusLength, {
    lineCount,
    hasInvoiceStructure,
    hasNarrativeContractSignals,
    hasFiscalNoticeSignals,
    hasPayableSectionSignals,
    hasFiscalMatrixSignals,
  });

  const signalGroups = [
    hasTabularLayout,
    hasInvoiceStructure,
    hasNarrativeContractSignals,
    hasFiscalNoticeSignals,
  ];
  const activeGroups = signalGroups.filter(Boolean).length;
  logReadingModeTrace("detectDocumentStructureHints_before_mixedLayoutSignals", corpusLength, {
    lineCount,
    activeGroups,
  });
  const mixedLayoutSignals =
    activeGroups >= 2 ||
    (hasTabularLayout && (hasNarrativeContractSignals || hasFiscalNoticeSignals)) ||
    (hasFiscalMatrixSignals && hasPayableSectionSignals);
  logReadingModeTrace("detectDocumentStructureHints_exit", corpusLength, {
    lineCount,
    mixedLayoutSignals,
    tableLineCount,
  });

  return {
    hasTabularLayout,
    tableLineCount,
    hasInvoiceStructure,
    hasNarrativeContractSignals,
    hasFiscalNoticeSignals,
    hasPayableSectionSignals,
    hasFiscalMatrixSignals,
    mixedLayoutSignals,
  };
}
