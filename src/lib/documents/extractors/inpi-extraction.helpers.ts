/**
 * Reusable deterministic helpers for INPI / Kbis OCR extraction.
 * Accent normalization, fuzzy labels, multiline values, pattern extraction.
 */

import { CONFIDENCE_THRESHOLDS } from "../types/confidence-score";
import { LOOSE_CONFIDENCE_PENALTY, LOOSE_EXTRA_LABELS } from "./inpi-extraction.debug";
import type { LabelValueTrace, PatternTrace } from "./inpi-extraction.debug";
import type { InpiExtractableField } from "./extract-inpi";
import { findLabelValueContextual } from "./inpi-label-extraction";
import {
  normalizeForLabelMatch,
  normalizeOcrText,
  stripAccents,
} from "./inpi-ocr-normalize";
import { logFallbackExtractorEntered } from "../pipelines/activite-runtime-trace";

export { normalizeForLabelMatch, normalizeOcrText, stripAccents, collapseForLabelMatch } from "./inpi-ocr-normalize";

export type LabelSpec = {
  /** Longer / more specific labels first */
  labels: string[];
  /** Skip value if the matched line also contains one of these label fragments */
  rejectLineContaining?: string[];
};

export type FindLabelValueResult = {
  value: string;
  snippet: string;
  labelMatched: string;
  confidence: number;
  multiline: boolean;
  loose?: boolean;
};

export type PatternSpec = {
  /** Named capture group 1 = value */
  pattern: RegExp;
  confidence: number;
  normalize?: (raw: string, match: RegExpMatchArray) => string;
  validate?: (value: string) => boolean;
  /** When true, validation is skipped in loose mode */
  looseOptional?: boolean;
};

export type PatternExtractionResult = {
  value: string;
  snippet: string;
  confidence: number;
  pattern: string;
  loose?: boolean;
};

export type FindLabelValueOptions = {
  maxValueLength?: number;
  valuePattern?: RegExp;
  trace?: LabelValueTrace;
  mode?: "strict" | "loose";
  fieldName?: InpiExtractableField;
};

export type ExtractWithPatternsOptions = {
  trace?: PatternTrace;
  mode?: "strict" | "loose";
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildFlexibleLabelPattern(label: string, loose = false): string {
  const normalized = normalizeForLabelMatch(label);
  const parts = normalized.split(/\s+/).filter(Boolean).map(escapeRegex);
  const joined = parts.join("\\s+");
  if (loose) return joined;
  return `(?<![a-z0-9])${joined}(?![a-z0-9])`;
}

function cleanExtractedValue(raw: string, maxLength = 120): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/^[\s:;|–—-]+/, "")
    .replace(/[\s:;|–—-]+$/, "")
    .trim()
    .slice(0, maxLength);
}

function lineRejected(line: string, rejectFragments?: string[]): boolean {
  if (!rejectFragments?.length) return false;
  const normalized = normalizeForLabelMatch(line);
  return rejectFragments.some((frag) => normalized.includes(normalizeForLabelMatch(frag)));
}

function scoreLabelConfidence(
  label: string,
  matched: string,
  multiline: boolean,
  loose = false,
): number {
  const exact = normalizeForLabelMatch(matched).includes(normalizeForLabelMatch(label));
  let score = exact ? 0.92 : 0.84;
  if (multiline) score -= 0.03;
  if (label.includes(" ")) score += 0.02;
  if (loose) score -= LOOSE_CONFIDENCE_PENALTY;
  return Math.max(0.45, Math.min(0.97, score));
}

function collectNearbyText(text: string, label: string): string[] {
  const normalizedLabel = normalizeForLabelMatch(label);
  return text
    .split("\n")
    .filter((line) => normalizeForLabelMatch(line).includes(normalizedLabel))
    .slice(0, 5)
    .map((line) => line.trim());
}

function resolveLabels(spec: LabelSpec, options?: FindLabelValueOptions): string[] {
  const base = [...spec.labels];
  if (options?.mode === "loose" && options.fieldName) {
    const extras = LOOSE_EXTRA_LABELS[options.fieldName] ?? [];
    return [...base, ...extras.filter((l) => !base.includes(l))];
  }
  return base;
}

function looksLikeLabelLine(line: string): boolean {
  return /:\s*$/.test(line) || /^(nom|prenom|prénom|siren|siret|adresse|activit|code|email|tel)/i.test(line);
}

/** Fuzzy check: accent-insensitive substring match on normalized text. */
export function fuzzyLabelIncludes(haystack: string, label: string): boolean {
  const h = normalizeForLabelMatch(haystack);
  const l = normalizeForLabelMatch(label);
  return h.includes(l);
}

/**
 * Finds a labelled value using exact then fuzzy label matching.
 * Supports same-line (`Nom : DUPONT`) and multiline (`Nom de naissance\nDUPONT`).
 */
export function findLabelValue(
  rawText: string,
  spec: LabelSpec,
  options?: FindLabelValueOptions,
): FindLabelValueResult | null {
  const text = normalizeOcrText(rawText);
  const contextual = findLabelValueContextual(text, spec, options);
  if (contextual) return contextual;

  logFallbackExtractorEntered({
    fieldName: options?.fieldName,
    contextualMiss: true,
  });

  const maxLen = options?.maxValueLength ?? 120;
  const loose = options?.mode === "loose";
  const trace = options?.trace;
  const valueGuard =
    options?.valuePattern ??
    (loose ? /[\s\S]/ : /[0-9A-Za-zÀ-ÖØ-öø-ÿ@.''+\-/]/);

  const labels = resolveLabels(spec, options);
  trace?.searchedLabels.push(...labels);

  for (const label of labels) {
    const nearby = collectNearbyText(text, label);
    if (nearby.length) trace?.nearbyText.push(...nearby);

    const labelPattern = buildFlexibleLabelPattern(label, loose);

    const sameLineRe = new RegExp(
      `(?:^|\\n)\\s*${labelPattern}\\s*[:\\-–—]?\\s*([^\\n;|]{1,${maxLen}})`,
      "i",
    );
    const sameLine = text.match(sameLineRe);
    if (sameLine?.[1]) {
      const line = sameLine[0];
      if (lineRejected(line, spec.rejectLineContaining)) {
        trace?.rejected.push({
          label,
          reason: "line_rejected_by_filter",
          snippet: line.trim(),
        });
      } else {
        const value = cleanExtractedValue(sameLine[1], maxLen);
        if (value && valueGuard.test(value)) {
          return {
            value,
            snippet: line.trim(),
            labelMatched: label,
            confidence: scoreLabelConfidence(label, line, false, loose),
            multiline: false,
            loose,
          };
        }
        trace?.boundaryFailures.push({
          label,
          reason: "same_line_value_failed_guard",
          snippet: line.trim(),
        });
      }
    }

    const multilineRe = new RegExp(
      `(?:^|\\n)\\s*${labelPattern}\\s*[:\\-–—]?\\s*\\n\\s*([^\\n;|]{1,${maxLen}})`,
      "i",
    );
    const multiline = text.match(multilineRe);
    trace?.multilineDetection.push({
      label,
      attempted: true,
      matched: Boolean(multiline?.[1]),
      snippet: multiline?.[0]?.trim(),
    });

    if (multiline?.[1]) {
      const line = multiline[0];
      if (lineRejected(line, spec.rejectLineContaining)) {
        trace?.rejected.push({
          label,
          reason: "multiline_rejected_by_filter",
          snippet: line.trim(),
        });
      } else {
        const value = cleanExtractedValue(multiline[1], maxLen);
        if (value && valueGuard.test(value)) {
          return {
            value,
            snippet: line.trim(),
            labelMatched: label,
            confidence: scoreLabelConfidence(label, line, true, loose),
            multiline: true,
            loose,
          };
        }
        trace?.boundaryFailures.push({
          label,
          reason: "multiline_value_failed_guard",
          snippet: line.trim(),
        });
      }
    } else {
      trace?.boundaryFailures.push({
        label,
        reason: "multiline_no_match",
      });
    }
  }

  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (lineRejected(line, spec.rejectLineContaining)) continue;

    for (const label of labels) {
      if (!fuzzyLabelIncludes(line, label)) continue;

      const colonIdx = line.search(/[:–—-]/);
      if (colonIdx >= 0) {
        const afterColon = line.slice(colonIdx + 1).trim();
        if (afterColon && valueGuard.test(afterColon)) {
          return {
            value: cleanExtractedValue(afterColon, maxLen),
            snippet: line.trim(),
            labelMatched: label,
            confidence: scoreLabelConfidence(label, line, false, loose),
            multiline: false,
            loose,
          };
        }
        trace?.rejected.push({
          label,
          reason: "fuzzy_colon_value_failed_guard",
          snippet: line.trim(),
        });
        continue;
      }

      const next = lines[i + 1]?.trim();
      if (next && valueGuard.test(next) && (loose || !looksLikeLabelLine(next))) {
        return {
          value: cleanExtractedValue(next, maxLen),
          snippet: `${line}\n${next}`,
          labelMatched: label,
          confidence: scoreLabelConfidence(label, line, true, loose),
          multiline: true,
          loose,
        };
      }

      trace?.rejected.push({
        label,
        reason: next ? "fuzzy_next_line_rejected" : "fuzzy_no_next_line",
        snippet: line.trim(),
      });
    }
  }

  return null;
}

/**
 * Runs ordered regex patterns; returns first valid match with snippet + confidence.
 */
export function extractWithPatterns(
  rawText: string,
  specs: PatternSpec[],
  options?: ExtractWithPatternsOptions,
): PatternExtractionResult | null {
  const text = normalizeOcrText(rawText);
  const loose = options?.mode === "loose";
  const trace = options?.trace;

  for (const spec of specs) {
    trace?.patternsTried.push(spec.pattern.source.slice(0, 80));
    const match = text.match(spec.pattern);
    if (!match?.[1] && !match?.[0]) {
      trace?.matches.push({
        pattern: spec.pattern.source.slice(0, 60),
        accepted: false,
        rejectionReason: "no_match",
      });
      continue;
    }

    const raw = match[1] ?? match[0];
    const value = spec.normalize ? spec.normalize(raw, match) : cleanExtractedValue(raw);
    if (!value) {
      trace?.matches.push({
        pattern: spec.pattern.source.slice(0, 60),
        snippet: match[0].trim(),
        accepted: false,
        rejectionReason: "normalize_empty",
      });
      continue;
    }

    const skipValidate = loose && spec.looseOptional;
    if (spec.validate && !skipValidate && !spec.validate(value)) {
      trace?.matches.push({
        pattern: spec.pattern.source.slice(0, 60),
        snippet: match[0].trim(),
        value,
        accepted: false,
        rejectionReason: "validation_failed",
      });
      continue;
    }

    trace?.matches.push({
      pattern: spec.pattern.source.slice(0, 60),
      snippet: match[0].trim(),
      value,
      accepted: true,
    });

    return {
      value,
      snippet: match[0].trim(),
      confidence: loose ? Math.max(0.45, spec.confidence - LOOSE_CONFIDENCE_PENALTY) : spec.confidence,
      pattern: spec.pattern.source.slice(0, 60),
      loose,
    };
  }

  return null;
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function isLowConfidence(confidence: number): boolean {
  return confidence < CONFIDENCE_THRESHOLDS.review;
}

export function normalizeFrenchPhone(raw: string): string {
  const digits = digitsOnly(raw);
  if (digits.startsWith("33") && digits.length >= 11) {
    return `0${digits.slice(2, 11)}`;
  }
  return digits.slice(0, 10);
}

export function normalizeSiren(raw: string): string {
  return digitsOnly(raw).slice(0, 9);
}

export function normalizeSiret(raw: string): string {
  return digitsOnly(raw).slice(0, 14);
}

export function isValidSiren(value: string): boolean {
  return /^\d{9}$/.test(value);
}

export function isValidSiret(value: string): boolean {
  return /^\d{14}$/.test(value);
}

export function isValidCodeApe(value: string): boolean {
  return /^\d{4}[A-Z]$/.test(value);
}

export const INPI_LABEL_SPECS = {
  nom: {
    labels: ["nom de naissance", "nom", "denomination", "dénomination"],
    rejectLineContaining: ["nom d'usage", "nom d usage", "prenom", "prénom"],
  },
  prenom: {
    labels: ["prénom", "prenom", "prénoms", "prenoms"],
    rejectLineContaining: ["nom de naissance"],
  },
  activite: {
    labels: [
      "activité principale",
      "activite principale",
      "nature de l'activité",
      "nature de l activite",
    ],
    rejectLineContaining: [
      "date début",
      "date debut",
      "début activité",
      "debut activite",
      "date de",
    ],
  },
  adresseEtablissement: {
    labels: [
      "adresse de l'établissement",
      "adresse de l etablissement",
      "adresse de l'établissement principal",
      "adresse établissement",
      "adresse etablissement",
      "siège social",
      "siege social",
    ],
    rejectLineContaining: ["adresse du logement", "du logement"],
  },
  codeAPE: {
    labels: ["code ape", "code a.p.e", "ape", "naf"],
  },
} as const satisfies Record<string, LabelSpec>;

export const INPI_PATTERN_SPECS = {
  siret: [
    {
      pattern: /\bSIRET\s*:?\s*((?:\d{3}\s*){3}\d{5})\b/i,
      confidence: 0.95,
      normalize: (raw: string) => normalizeSiret(raw),
      validate: isValidSiret,
    },
    {
      pattern: /\b(\d{3}\s+\d{3}\s+\d{3}\s+\d{5})\b/,
      confidence: 0.9,
      normalize: (raw: string) => normalizeSiret(raw),
      validate: isValidSiret,
    },
    {
      pattern: /\bSIRET\s*:?\s*(\d{14})\b/i,
      confidence: 0.94,
      normalize: (raw: string) => normalizeSiret(raw),
      validate: isValidSiret,
    },
    {
      pattern: /\b(\d{14})\b/,
      confidence: 0.68,
      normalize: (raw: string) => normalizeSiret(raw),
      validate: isValidSiret,
      looseOptional: true,
    },
  ],
  siren: [
    {
      pattern: /\bSIREN\s*:?\s*((?:\d{3}\s*){2}\d{3})\b/i,
      confidence: 0.95,
      normalize: (raw: string) => normalizeSiren(raw),
      validate: isValidSiren,
    },
    {
      pattern: /\bSIREN\s*:?\s*(\d{9})\b/i,
      confidence: 0.94,
      normalize: (raw: string) => normalizeSiren(raw),
      validate: isValidSiren,
    },
    {
      pattern: /\b(\d{3}\s+\d{3}\s+\d{3})(?!\s*\d)/,
      confidence: 0.82,
      normalize: (raw: string) => normalizeSiren(raw),
      validate: isValidSiren,
    },
    {
      pattern: /\b(\d{9})\b/,
      confidence: 0.65,
      normalize: (raw: string) => normalizeSiren(raw),
      validate: isValidSiren,
      looseOptional: true,
    },
  ],
  codeAPE: [
    {
      pattern: /\b(?:code\s*ape|ape|naf)\s*:?\s*([0-9]{4}\s*[A-Za-z])\b/i,
      confidence: 0.9,
      normalize: (raw: string) => raw.replace(/\s/g, "").toUpperCase(),
      validate: isValidCodeApe,
    },
    {
      pattern: /\b([0-9]{4}\s*[A-Za-z])\b/,
      confidence: 0.62,
      normalize: (raw: string) => raw.replace(/\s/g, "").toUpperCase(),
      validate: isValidCodeApe,
      looseOptional: true,
    },
  ],
  email: [
    {
      pattern: /\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i,
      confidence: 0.92,
      normalize: (raw: string) => raw.toLowerCase(),
    },
  ],
  telephone: [
    {
      pattern: /\b(?:t[ée]l(?:[ée]phone)?|phone|mobile)\s*:?\s*((?:\+33|0)[\d\s.\-]{8,18})\b/i,
      confidence: 0.88,
      normalize: (raw: string) => normalizeFrenchPhone(raw),
      validate: (v: string) => v.length >= 10,
    },
    {
      pattern: /\b((?:\+33|0)[\d\s.\-]{9,17})\b/,
      confidence: 0.68,
      normalize: (raw: string) => normalizeFrenchPhone(raw),
      validate: (v: string) => v.length === 10 && v.startsWith("0"),
    },
  ],
} as const satisfies Record<string, PatternSpec[]>;
