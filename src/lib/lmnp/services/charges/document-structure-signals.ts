/**
 * Deterministic structural signal detection from charge document OCR corpus.
 * Used by DocumentReadingModeResolver — no GPT, no amount extraction.
 */

import { normalizeChargeDocumentText } from "@/lib/lmnp/services/classify-charge-document";
import type { DocumentStructureHints } from "./document-reading-mode-types";

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
  let count = 0;
  for (const line of text.split(/\n+/)) {
    const trimmed = line.trim();
    if (trimmed.length < 8) continue;
    if (TABLE_LINE_PATTERN.test(trimmed)) {
      count++;
      continue;
    }
    const amounts = trimmed.match(AMOUNT_IN_LINE_PATTERN);
    if (amounts && amounts.length >= 2 && trimmed.length < 200) count++;
  }
  return count;
}

function anyPatternMatches(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Derives structural hints from normalized charge OCR corpus.
 */
export function detectDocumentStructureHints(corpus: string): DocumentStructureHints {
  const normalized = normalizeChargeDocumentText(corpus);
  const tableLineCount = countTableLikeLines(corpus);
  const hasTabularLayout = tableLineCount >= 2;

  const hasInvoiceStructure = anyPatternMatches(normalized, INVOICE_SIGNALS);
  const hasNarrativeContractSignals = anyPatternMatches(normalized, NARRATIVE_CONTRACT_SIGNALS);
  const hasFiscalNoticeSignals = anyPatternMatches(normalized, FISCAL_NOTICE_SIGNALS);
  const hasPayableSectionSignals = anyPatternMatches(normalized, PAYABLE_SECTION_SIGNALS);
  const hasFiscalMatrixSignals = anyPatternMatches(normalized, FISCAL_MATRIX_SIGNALS);

  const signalGroups = [
    hasTabularLayout,
    hasInvoiceStructure,
    hasNarrativeContractSignals,
    hasFiscalNoticeSignals,
  ];
  const activeGroups = signalGroups.filter(Boolean).length;
  const mixedLayoutSignals =
    activeGroups >= 2 ||
    (hasTabularLayout && (hasNarrativeContractSignals || hasFiscalNoticeSignals)) ||
    (hasFiscalMatrixSignals && hasPayableSectionSignals);

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
