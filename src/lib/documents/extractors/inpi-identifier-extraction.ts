/**
 * Semantic fallback patterns for SIREN / SIRET from noisy OCR lines.
 */

import type { PatternTrace } from "./inpi-extraction.debug";
import {
  digitsOnly,
  isValidSiren,
  isValidSiret,
  normalizeSiren,
  normalizeSiret,
} from "./inpi-extraction.helpers";

export type IsolatedIdentifierResult = {
  value: string;
  snippet: string;
  confidence: number;
  lineIndex: number;
};

function lineDigitDensity(line: string): number {
  const digits = (line.match(/\d/g) ?? []).length;
  return digits / Math.max(line.replace(/\s/g, "").length, 1);
}

function isIsolatedNumberLine(line: string, digitCount: number): boolean {
  const trimmed = line.trim();
  const digits = digitsOnly(trimmed);
  if (digits.length !== digitCount) return false;
  if (lineDigitDensity(trimmed) < 0.7) return false;
  if (trimmed.length > digitCount + 12) return false;
  if (/\b(SIREN|SIRET|RCS|APE|NAF|TEL|@)\b/i.test(trimmed) && !/^SIREN|^SIRET/i.test(trimmed)) {
    return false;
  }
  return true;
}

/**
 * Finds an isolated 9- or 14-digit identifier on its own line (OCR fallback).
 */
export function extractIsolatedIdentifier(
  text: string,
  length: 9 | 14,
  trace?: PatternTrace,
): IsolatedIdentifierResult | null {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const candidates: IsolatedIdentifierResult[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    trace?.patternsTried.push(`isolated_${length}_line:${i}`);

    if (!isIsolatedNumberLine(line, length)) {
      trace?.matches.push({
        pattern: `isolated_${length}`,
        snippet: line,
        accepted: false,
        rejectionReason: "not_isolated_number_line",
      });
      continue;
    }

    const value = length === 9 ? normalizeSiren(line) : normalizeSiret(line);
    const valid = length === 9 ? isValidSiren(value) : isValidSiret(value);

    if (!valid) {
      trace?.matches.push({
        pattern: `isolated_${length}`,
        snippet: line,
        value,
        accepted: false,
        rejectionReason: "invalid_checksum_format",
      });
      continue;
    }

    const result: IsolatedIdentifierResult = {
      value,
      snippet: line,
      confidence: length === 9 ? 0.72 : 0.74,
      lineIndex: i,
    };
    candidates.push(result);
    trace?.matches.push({
      pattern: `isolated_${length}`,
      snippet: line,
      value,
      accepted: true,
    });
  }

  if (candidates.length === 0) return null;

  const labeled = candidates.find((c) => /SIREN|SIRET/i.test(c.snippet));
  return labeled ?? candidates[0];
}

/** Semantic fallback: activité = first substantive line after "activité principale". */
export function extractActiviteSemanticFallback(
  text: string,
): { value: string; snippet: string; confidence: number } | null {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    if (!/activit[eé]\s*principale/i.test(lines[i])) continue;

    const inline = lines[i].split(/[:–—-]/).slice(1).join(":").trim();
    if (inline && inline.length >= 5 && inline.length <= 100) {
      return { value: inline, snippet: lines[i], confidence: 0.8 };
    }

    for (let j = 1; j <= 3 && i + j < lines.length; j++) {
      const next = lines[i + j];
      if (!next || /^(nom|prenom|siren|siret|adresse|code)/i.test(next)) break;
      if (next.length >= 5 && next.length <= 100) {
        return { value: next, snippet: `${lines[i]}\n${next}`, confidence: 0.74 };
      }
    }
  }

  return null;
}
