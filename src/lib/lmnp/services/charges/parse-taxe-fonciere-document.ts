/**
 * Deterministic taxe foncière charge parser.
 * Collects monetary candidates from OCR text (layout-agnostic) and ranks them
 * for taxeFonciereAmount orchestration.
 */

import {
  logChargeParserTraces,
  normalizeChargeOcrText,
  parseFrenchCurrencyAmount,
  type ChargeParseTrace,
} from "./charge-parse-utils";
import {
  getDeterministicTaxeFonciereAmount,
  type TaxeFonciereAmountCandidate,
} from "./taxe-fonciere-amount-selection";
import type { TaxeFonciereAmountFieldRanking } from "./taxe-fonciere-field-orchestration";
import { logTaxeFonciereRuntime } from "./taxe-fonciere-runtime-debug";
import { logTaxeFonciereStage } from "./taxe-fonciere-stage-instrumentation";

export type TaxeFonciereChargeDocument = {
  type: "taxe_fonciere";
  montantPayable: number;
  anneeImposition?: string;
  commune?: string;
};

export type TaxeFonciereParseResult = {
  data: TaxeFonciereChargeDocument | null;
  traces: ChargeParseTrace[];
  errors: string[];
  /**
   * Ranked amount candidates for taxeFonciereAmount (deterministic layer).
   * Semantic arbitration may choose among candidates later; parser structure stays authoritative.
   */
  amountFieldRanking?: TaxeFonciereAmountFieldRanking;
};

const PARSER_ID = "taxe-fonciere-parser";

const AMOUNT_CONTEXT_WINDOW = 55;

/** Label-anchored patterns (scan full text — no fixed page/region assumptions). */
const LABEL_BEFORE_AMOUNT_PATTERNS: RegExp[] = [
  /(?:montant|total|net|solde|imp[oô]t)[^.\n]{0,55}(\d[\d\s.,]*)\s*(?:€|eur)?/gi,
  /(?:a\s+payer|à\s+payer)[^.\n]{0,25}(\d[\d\s.,]*)\s*(?:€|eur)?/gi,
  /taxe\s+fonci[eè]re[^.\n]{0,45}(\d[\d\s.]+,\d{2})\s*(?:€|eur)?/gi,
];

const AMOUNT_BEFORE_LABEL_PATTERNS: RegExp[] = [
  /(\d[\d\s.,]*)\s*(?:€|eur)?[^.\n]{0,45}(?:net\s+a\s+payer|montant\s+a\s+payer|total\s+des\s+imp[oô]ts)/gi,
];

const ANNEE_PATTERN =
  /(?:taxe\s+fonci[eè]re|imposition|exercice|annee)\s*(?:de\s+)?(?:l['']?annee\s+)?(20\d{2})/i;

const COMMUNE_PATTERN =
  /(?:commune\s+de|ville\s+de|mairie\s+de)\s+([A-ZÀÂÄÉÈÊËÎÏÔÙÛÜÇ][\w\s'-]{2,40})/i;

function pushTrace(
  traces: ChargeParseTrace[],
  step: string,
  detail: string,
  value?: string | number | boolean | null,
): void {
  traces.push({ step, detail, value });
}

function amountContextWindow(text: string, charIndex: number, matchLength: number): string {
  const from = Math.max(0, charIndex - AMOUNT_CONTEXT_WINDOW);
  const to = Math.min(text.length, charIndex + matchLength + AMOUNT_CONTEXT_WINDOW);
  return text.slice(from, to).replace(/\s+/g, " ").trim();
}

function isLikelyFalsePositiveAmount(amount: number, raw: string): boolean {
  const trimmed = raw.replace(/\s/g, "");
  if (/^20\d{2}$/.test(trimmed)) return true;
  if (amount < 10 && !/,/.test(raw)) return true;
  return false;
}

function registerAmountCandidate(
  map: Map<string, TaxeFonciereAmountCandidate>,
  params: { text: string; charIndex: number; matchLength: number; amount: number; raw: string },
): void {
  if (isLikelyFalsePositiveAmount(params.amount, params.raw)) return;
  const key = `${params.charIndex}:${params.amount}`;
  if (map.has(key)) return;
  map.set(key, {
    amount: params.amount,
    nearbyText: amountContextWindow(params.text, params.charIndex, params.matchLength),
  });
}

function scanLabelAnchoredPatterns(
  text: string,
  patterns: RegExp[],
  label: string,
  map: Map<string, TaxeFonciereAmountCandidate>,
  traces: ChargeParseTrace[],
): void {
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const raw = match[1]!.trim();
      const amount = parseFrenchCurrencyAmount(raw, { min: 1, max: 50_000 });
      if (amount === null) {
        pushTrace(traces, "amount-reject", `Malformed amount for ${label}`, raw);
        continue;
      }
      registerAmountCandidate(map, {
        text,
        charIndex: match.index,
        matchLength: match[0]!.length,
        amount,
        raw,
      });
      pushTrace(traces, "amount-candidate", `${label} → ${amount}`, raw);
    }
  }
}

function collectEuroSuffixAmounts(
  rawText: string,
  map: Map<string, TaxeFonciereAmountCandidate>,
  traces: ChargeParseTrace[],
): void {
  const euroPattern = /(\d{1,3}(?:\s\d{3})*,\d{2}|\d+,\d{2})\s*(?:€|eur)\b/gi;
  let lineOffset = 0;
  for (const line of rawText.split(/\n+/)) {
    const lineStart = rawText.indexOf(line, lineOffset);
    lineOffset = lineStart >= 0 ? lineStart + line.length : lineOffset + line.length + 1;
    const lineNorm = normalizeChargeOcrText(line);

    euroPattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = euroPattern.exec(lineNorm)) !== null) {
      const raw = match[0]!;
      const amount = parseFrenchCurrencyAmount(raw, { min: 1, max: 50_000 });
      if (amount === null) {
        pushTrace(traces, "amount-reject", "Malformed euro-suffix amount", raw);
        continue;
      }
      const charIndex = lineStart >= 0 ? lineStart + (match.index ?? 0) : 0;
      registerAmountCandidate(map, {
        text: rawText,
        charIndex,
        matchLength: raw.length,
        amount,
        raw: match[1] ?? raw,
      });
      pushTrace(traces, "amount-candidate", `euro-suffix → ${amount}`, raw);
    }
  }
}

/** Dense lines (tables): register each monetary token with the full line as context. */
function collectLineTableAmounts(
  rawText: string,
  map: Map<string, TaxeFonciereAmountCandidate>,
  traces: ChargeParseTrace[],
): void {
  const lines = rawText.split(/\n+/);
  let offset = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    const lineStart = rawText.indexOf(line, offset);
    offset = lineStart >= 0 ? lineStart + line.length : offset + line.length + 1;

    const tokens = [...trimmed.matchAll(/(\d{1,3}(?:\s\d{3})*,\d{2}|\d+,\d{2})/g)];
    if (tokens.length < 2) continue;

    const normalizedLine = trimmed.replace(/\s+/g, " ");
    for (const token of tokens) {
      const amount = parseFrenchCurrencyAmount(token[1]!, { min: 1, max: 50_000 });
      if (amount === null) continue;
      const charIndex = lineStart >= 0 ? lineStart + (token.index ?? 0) : 0;
      const key = `${charIndex}:${amount}`;
      if (map.has(key)) continue;
      map.set(key, {
        amount,
        nearbyText: normalizedLine.slice(0, 280),
      });
      pushTrace(traces, "amount-candidate", `table-line → ${amount}`, normalizedLine.slice(0, 80));
    }
  }
}

function collectTaxeFonciereAmountCandidates(
  normalized: string,
  rawText: string,
  traces: ChargeParseTrace[],
): TaxeFonciereAmountCandidate[] {
  const map = new Map<string, TaxeFonciereAmountCandidate>();

  scanLabelAnchoredPatterns(
    normalized,
    LABEL_BEFORE_AMOUNT_PATTERNS,
    "label-before-amount",
    map,
    traces,
  );
  scanLabelAnchoredPatterns(
    normalized,
    AMOUNT_BEFORE_LABEL_PATTERNS,
    "amount-before-label",
    map,
    traces,
  );
  collectEuroSuffixAmounts(rawText, map, traces);
  collectLineTableAmounts(rawText, map, traces);

  return [...map.values()];
}

function extractPayableAmount(
  normalized: string,
  rawText: string,
  traces: ChargeParseTrace[],
  arbitrationMode?: "deterministic_only" | "pending_semantic",
): { amount: number | null; ranking: TaxeFonciereAmountFieldRanking | null } {
  const candidates = collectTaxeFonciereAmountCandidates(normalized, rawText, traces);

  logTaxeFonciereStage("after_collectTaxeFonciereAmountCandidates", {
    candidateCount: candidates.length,
  });

  logTaxeFonciereRuntime("extractPayableAmount_candidates", {
    candidateCount: candidates.length,
    candidates: candidates.map((candidate) => ({
      amount: candidate.amount,
      contextPreview: candidate.nearbyText.slice(0, 200),
    })),
  });

  if (candidates.length === 0) {
    pushTrace(traces, "amount", "No valid payable amount candidates", null);
    logTaxeFonciereRuntime("extractPayableAmount_result", { amount: null, reason: "no_candidates" });
    return { amount: null, ranking: null };
  }

  const { amount, ranking } = getDeterministicTaxeFonciereAmount(candidates, { arbitrationMode });

  logTaxeFonciereRuntime("extractPayableAmount_result", {
    amount,
    targetField: ranking.targetField,
    arbitrationMode: ranking.arbitration.mode,
    deterministicDefault: ranking.deterministicDefault,
    rankedCandidateCount: ranking.candidates.length,
  });

  for (const candidate of ranking.candidates) {
    pushTrace(
      traces,
      candidate.deterministicRankWinner
        ? "amount"
        : candidate.hardExcluded
          ? "amount-reject"
          : "amount-candidate",
      candidate.deterministicRankWinner
        ? `Deterministic rank #${candidate.rank} (score=${candidate.score})`
        : candidate.hardExcluded
          ? `Hard-excluded (score=${candidate.score})`
          : `Rank #${candidate.rank} score=${candidate.score}`,
      candidate.amount,
    );
  }

  if (amount === null) {
    pushTrace(traces, "amount", "No eligible payable amount after deterministic ranking", null);
    return { amount: null, ranking };
  }

  return { amount, ranking };
}

function extractAnneeImposition(text: string, traces: ChargeParseTrace[]): string | undefined {
  const match = text.match(ANNEE_PATTERN) ?? text.match(/\b(20\d{2})\b/);
  if (!match?.[1]) {
    pushTrace(traces, "annee", "No imposition year matched", null);
    return undefined;
  }
  pushTrace(traces, "annee", "Imposition year", match[1]);
  return match[1];
}

function extractCommune(text: string, traces: ChargeParseTrace[]): string | undefined {
  const match = text.match(COMMUNE_PATTERN);
  if (!match?.[1]) {
    pushTrace(traces, "commune", "No commune label matched", null);
    return undefined;
  }
  const commune = match[1].trim().replace(/\s+/g, " ");
  pushTrace(traces, "commune", "Commune", commune);
  return commune;
}

export type ParseTaxeFonciereDocumentOptions = {
  logTraces?: boolean;
  /** Semantic arbitration mode — set by charge-reading-orchestrator. */
  arbitrationMode?: "deterministic_only" | "pending_semantic";
};

export function parseTaxeFonciereDocument(
  rawOcrText: string,
  options?: ParseTaxeFonciereDocumentOptions,
): TaxeFonciereParseResult {
  logTaxeFonciereStage("parseTaxeFonciereDocument_entry", {
    corpusLength: rawOcrText.length,
  });
  logTaxeFonciereRuntime("parseTaxeFonciereDocument_entry", {
    rawOcrTextLength: rawOcrText.length,
    rawOcrPreview: rawOcrText.slice(0, 280),
  });

  const traces: ChargeParseTrace[] = [];
  const errors: string[] = [];
  const logTraces = options?.logTraces !== false;

  const normalized = normalizeChargeOcrText(rawOcrText);
  pushTrace(traces, "normalize", "OCR text normalized", normalized.length);

  if (!normalized) {
    errors.push("empty_ocr_text");
    if (logTraces) logChargeParserTraces(PARSER_ID, traces, { ok: false, errors });
    return { data: null, traces, errors };
  }

  const { amount: montantPayable, ranking: amountFieldRanking } = extractPayableAmount(
    normalized,
    rawOcrText,
    traces,
    options?.arbitrationMode,
  );
  const anneeImposition = extractAnneeImposition(normalized, traces);
  const commune = extractCommune(rawOcrText, traces);

  if (montantPayable === null) errors.push("missing_or_invalid_montant_payable");

  const ok = montantPayable !== null;

  const data: TaxeFonciereChargeDocument | null = ok
    ? {
        type: "taxe_fonciere",
        montantPayable: montantPayable!,
        ...(anneeImposition ? { anneeImposition } : {}),
        ...(commune ? { commune } : {}),
      }
    : null;

  pushTrace(traces, "result", ok ? "Parse succeeded" : "Parse incomplete", ok);

  if (logTraces) {
    logChargeParserTraces(PARSER_ID, traces, {
      ok,
      errors,
      montantPayable,
      anneeImposition: anneeImposition ?? null,
      commune: commune ?? null,
    });
  }

  return { data, traces, errors, amountFieldRanking: amountFieldRanking ?? undefined };
}
