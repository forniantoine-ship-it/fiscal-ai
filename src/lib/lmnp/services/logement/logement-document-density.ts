/**
 * Lightweight table vs narrative density heuristics for logement vision fallback routing.
 * Parser-sovereign structured documents must NOT escalate to Vision.
 */

import {
  hasNarrativeLegalTextSignals,
  isNarrativeLegalDocumentHint,
} from "@/lib/documents/ocr/semantic-text-recovery";

const SPREADSHEET_EXTENSIONS = /\.(csv|xlsx|xls|ods)$/i;

const PARSER_SOVEREIGN_FILENAME_PATTERNS = [
  /amortissement/i,
  /échéancier|echeancier/i,
  /tableau.*pr[eê]t/i,
  /relev[eé].*compte/i,
  /export.*comptable/i,
];

const STRUCTURED_TABLE_LINE =
  /^[^\n]{0,120}(\d[\d\s.,]*\s*(?:€|eur)?\s*){3,}[^\n]{0,40}$/im;

const AMORTIZATION_TABLE_SIGNALS = [
  /capital\s+restant\s+du/i,
  /int[eé]r[eê]ts/i,
  /mensualit[eé]/i,
  /num[eé]ro\s+d['']?échéance/i,
  /date\s+d['']?échéance/i,
];

export type LogementDocumentDensity = {
  tableDensity: number;
  narrativeDensity: number;
  isSpreadsheet: boolean;
  isParserSovereignFilename: boolean;
  isStructuredTableDominant: boolean;
};

function countTableLikeLines(text: string): number {
  const lines = text.split(/\n+/).filter((line) => line.trim().length >= 8);
  if (!lines.length) return 0;
  let count = 0;
  for (const line of lines) {
    if (STRUCTURED_TABLE_LINE.test(line.trim())) count++;
  }
  return count;
}

export function computeLogementDocumentDensity(
  corpus: string,
  fileName: string,
): LogementDocumentDensity {
  const trimmed = corpus.trim();
  const lines = trimmed.split(/\n+/).filter((l) => l.trim().length > 0);
  const lineCount = Math.max(1, lines.length);
  const tableLikeLines = countTableLikeLines(trimmed);
  const tableDensity = Math.min(1, tableLikeLines / lineCount);

  let narrativeSignals = 0;
  if (isNarrativeLegalDocumentHint(fileName)) narrativeSignals += 2;
  if (hasNarrativeLegalTextSignals(trimmed)) narrativeSignals += 2;
  if (/acte|vente|notaire|compromis|attestation|bail|diagnostic/i.test(trimmed)) {
    narrativeSignals += 1;
  }
  const narrativeDensity = Math.min(1, narrativeSignals / 4);

  const isSpreadsheet = SPREADSHEET_EXTENSIONS.test(fileName);
  const isParserSovereignFilename = PARSER_SOVEREIGN_FILENAME_PATTERNS.some((p) =>
    p.test(fileName),
  );
  const amortizationTableSignals = AMORTIZATION_TABLE_SIGNALS.filter((p) =>
    p.test(trimmed),
  ).length;
  const isStructuredTableDominant =
    isParserSovereignFilename ||
    isSpreadsheet ||
    (tableDensity >= 0.35 && tableDensity > narrativeDensity) ||
    amortizationTableSignals >= 3;

  return {
    tableDensity,
    narrativeDensity,
    isSpreadsheet,
    isParserSovereignFilename,
    isStructuredTableDominant,
  };
}
