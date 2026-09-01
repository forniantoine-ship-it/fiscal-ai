import type { DocumentPattern, PatternMatchDetail } from "../patterns/pattern.types";
import { createConfidenceScore } from "../types/confidence-score";
import type { DocumentTunnel } from "../types/document-tunnel";
import { TUNNEL_DOCUMENT_TYPE_PRIOR } from "../types/document-tunnel";
import type { DocumentType } from "../types/document-type";

export type ScoreDocumentInput = {
  normalizedText: string;
  fileName?: string;
  tunnel?: DocumentTunnel | null;
};

export type PatternScoreResult = {
  patternId: string;
  documentType: DocumentType;
  score: number;
  confidence: ReturnType<typeof createConfidenceScore>;
  matchedSignals: string[];
  details: PatternMatchDetail[];
};

function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function signalMatches(
  signal: DocumentPattern["signals"][number],
  text: string,
  fileName: string,
): { matched: boolean; contribution: number } {
  let hit = false;

  if (signal.fileNameKeywords?.length && fileName) {
    const fn = fileName.toLowerCase();
    if (signal.fileNameKeywords.some((k) => fn.includes(k.toLowerCase()))) hit = true;
  }

  if (signal.keywords?.some((k) => text.includes(k.toLowerCase()))) hit = true;

  if (signal.regex?.some((r) => r.test(text))) hit = true;

  return { matched: hit, contribution: hit ? signal.weight : 0 };
}

/**
 * Rule-based pattern scoring — fast, explainable, debuggable.
 */
export function scoreDocumentAgainstPattern(
  pattern: DocumentPattern,
  input: ScoreDocumentInput,
): PatternScoreResult {
  const text = normalizeForMatch(input.normalizedText);
  const fileName = (input.fileName ?? "").toLowerCase();
  const details: PatternMatchDetail[] = [];
  const matchedSignals: string[] = [];
  let totalWeight = 0;
  let earned = 0;

  for (const signal of pattern.signals) {
    totalWeight += signal.weight;
    const { matched, contribution } = signalMatches(signal, text, fileName);
    if (matched) {
      earned += contribution;
      matchedSignals.push(signal.id);
    }
    details.push({
      patternId: pattern.id,
      signalId: signal.id,
      matched,
      contribution: matched ? contribution : 0,
    });
  }

  let score = totalWeight > 0 ? earned / totalWeight : 0;

  const prior = input.tunnel ? TUNNEL_DOCUMENT_TYPE_PRIOR[input.tunnel] : undefined;
  if (prior === pattern.documentType) {
    score = Math.min(1, score + 0.08);
    matchedSignals.push("tunnel.prior");
  }

  const factors = [
    `pattern:${pattern.id}`,
    `matched:${matchedSignals.length}/${pattern.signals.length}`,
    ...(score >= pattern.matchThreshold ? ["threshold:met"] : ["threshold:below"]),
  ];

  return {
    patternId: pattern.id,
    documentType: pattern.documentType,
    score,
    confidence: createConfidenceScore(score, factors),
    matchedSignals,
    details,
  };
}

export function scoreDocumentAgainstPatterns(
  patterns: readonly DocumentPattern[],
  input: ScoreDocumentInput,
): PatternScoreResult[] {
  return patterns
    .map((p) => scoreDocumentAgainstPattern(p, input))
    .sort((a, b) => b.score - a.score);
}
