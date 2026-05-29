/**
 * OCR-tolerant label matching and contextual value windows for INPI core fields.
 */

import type { InpiExtractableField } from "./extract-inpi";
import type { LabelValueTrace } from "./inpi-extraction.debug";
import type { FindLabelValueOptions, FindLabelValueResult, LabelSpec } from "./inpi-extraction.helpers";
import { LOOSE_CONFIDENCE_PENALTY, LOOSE_EXTRA_LABELS } from "./inpi-extraction.debug";
import { logContextualExtractorEntered } from "../pipelines/activite-runtime-trace";
import {
  collapseForLabelMatch,
  normalizeForLabelMatch,
} from "./inpi-ocr-normalize";

const CONTEXT_WINDOW_LINES = 3;
const MAX_PARAGRAPH_CHARS = 90;
const LABEL_ONLY_MAX_EXTRA = 4;

export type ValueCandidate = {
  value: string;
  snippet: string;
  score: number;
  lineOffset: number;
  multiline: boolean;
  rejectionReason?: string;
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Allow optional spaces between every character: "prenom" → p\s*r\s*e\s*n\s*o\s*m */
export function buildOcrTolerantLabelPattern(label: string, loose = false): string {
  const normalized = normalizeForLabelMatch(label);
  const words = normalized.split(/\s+/).filter(Boolean);
  const collapsed = words.join("");

  const collapsedPattern = [...collapsed].map(escapeRegex).join("\\s*");

  if (words.length === 1) {
    return loose ? collapsedPattern : `(?<![a-z0-9])${collapsedPattern}(?![a-z0-9])`;
  }

  const wordPatterns = words.map((word) => {
    const chars = [...word].map(escapeRegex);
    const spaced = chars.join("\\s*");
    return loose ? spaced : `(?<![a-z0-9])${spaced}(?![a-z0-9])`;
  });

  return wordPatterns.join("\\s+");
}

function cleanValue(raw: string, maxLength: number): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/^[\s:;|.,–—-]+/, "")
    .replace(/[\s:;|.,–—-]+$/, "")
    .trim()
    .slice(0, maxLength);
}

function lineRejected(line: string, rejectFragments?: string[]): boolean {
  if (!rejectFragments?.length) return false;
  const normalized = normalizeForLabelMatch(line);
  return rejectFragments.some((frag) => normalized.includes(normalizeForLabelMatch(frag)));
}

function looksLikeLabelLine(line: string): boolean {
  const collapsed = collapseForLabelMatch(line);
  return (
    /:\s*$/.test(line) ||
    /^(nom|prenom|siren|siret|adresse|activit|code|email|tel|nature|denomination)/.test(
      collapsed,
    )
  );
}

function isParagraphLike(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length > MAX_PARAGRAPH_CHARS) return true;
  const words = trimmed.split(/\s+/);
  if (words.length > 12) return true;
  return false;
}

function lineMatchesLongerSpecLabel(line: string, label: string, allLabels: string[]): boolean {
  const collapsedLine = collapseForLabelMatch(line);
  const collapsedLabel = collapseForLabelMatch(label);

  for (const other of allLabels) {
    if (other === label) continue;
    const collapsedOther = collapseForLabelMatch(other);
    if (collapsedOther.length <= collapsedLabel.length) continue;
    if (collapsedLine === collapsedOther || collapsedLine.startsWith(collapsedOther)) {
      return true;
    }
  }

  return false;
}

/** Label at line start — tolerates OCR spacing, casing, missing accents. */
export function lineMatchesLabelAtStart(
  line: string,
  label: string,
  allLabels: string[] = [label],
): boolean {
  if (lineMatchesLongerSpecLabel(line, label, allLabels)) return false;

  const collapsedLine = collapseForLabelMatch(line);
  const collapsedLabel = collapseForLabelMatch(label);

  if (!collapsedLine.startsWith(collapsedLabel)) {
    const pattern = new RegExp(`^\\s*${buildOcrTolerantLabelPattern(label)}\\s*`, "i");
    if (!pattern.test(collapseForLabelMatch(line))) return false;
  }

  const idx = collapsedLine.indexOf(collapsedLabel);
  if (idx !== 0) return false;

  const remainder = collapsedLine.slice(collapsedLabel.length);
  return remainder.length <= LABEL_ONLY_MAX_EXTRA + 20;
}

export function extractInlineValueAfterLabel(line: string, label: string, maxLen: number): string | null {
  const collapsedLine = collapseForLabelMatch(line);
  const collapsedLabel = collapseForLabelMatch(label);
  if (!collapsedLine.startsWith(collapsedLabel)) return null;

  // Label-only line — value lives on following line(s)
  if (collapsedLine === collapsedLabel) return null;

  // Without a separator, a partial prefix match is likely a longer compound label
  if (!/[:–—-]/.test(line)) return null;

  let consumed = 0;
  let labelIdx = 0;
  while (consumed < line.length && labelIdx < collapsedLabel.length) {
    const ch = line[consumed];
    if (/\s/.test(ch)) {
      consumed++;
      continue;
    }
    if (collapseForLabelMatch(ch) === collapsedLabel[labelIdx]) {
      labelIdx++;
    }
    consumed++;
  }

  const valuePart = line.slice(consumed).replace(/^[\s:;|.,–—-]+/, "").trim();
  if (!valuePart) return null;

  const value = cleanValue(valuePart, maxLen);
  if (!value || isParagraphLike(value)) return null;
  return value;
}

function scoreNameCandidate(line: string): number {
  let score = 0.5;
  if (/^[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ' -]{1,40}$/.test(line.trim())) score += 0.25;
  if (line.trim().length <= 30) score += 0.1;
  if (!/\d/.test(line)) score += 0.1;
  if (looksLikeLabelLine(line)) score -= 0.5;
  if (isParagraphLike(line)) score -= 0.6;
  return Math.max(0, Math.min(1, score));
}

function scoreActiviteCandidate(line: string): number {
  let score = 0.45;
  if (line.trim().length >= 8 && line.trim().length <= 100) score += 0.2;
  if (!looksLikeLabelLine(line)) score += 0.15;
  if (isParagraphLike(line)) score -= 0.5;
  if (/\b(LMNP|LMP|location|meubl|loueur|BIC)\b/i.test(line)) score += 0.15;
  return Math.max(0, Math.min(1, score));
}

function scoreCandidateForField(line: string, fieldName?: InpiExtractableField): number {
  if (fieldName === "activite") return scoreActiviteCandidate(line);
  if (fieldName === "nom" || fieldName === "prenom") return scoreNameCandidate(line);
  return scoreNameCandidate(line);
}

function scoreContextCandidates(
  lines: string[],
  labelLineIndex: number,
  label: string,
  options: FindLabelValueOptions,
): ValueCandidate[] {
  const maxLen = options.maxValueLength ?? 120;
  const valueGuard =
    options.valuePattern ??
    (options.mode === "loose" ? /[\s\S]/ : /[0-9A-Za-zÀ-ÖØ-öø-ÿ'.,()\-/]/);

  const candidates: ValueCandidate[] = [];

  for (let offset = 1; offset <= CONTEXT_WINDOW_LINES; offset++) {
    const idx = labelLineIndex + offset;
    const line = lines[idx]?.trim();
    if (!line) continue;

    if (looksLikeLabelLine(line) && !options.mode) {
      candidates.push({
        value: "",
        snippet: line,
        score: 0,
        lineOffset: offset,
        multiline: true,
        rejectionReason: "next_line_is_label",
      });
      continue;
    }

    if (isParagraphLike(line)) {
      candidates.push({
        value: "",
        snippet: line,
        score: 0,
        lineOffset: offset,
        multiline: true,
        rejectionReason: "paragraph_like",
      });
      continue;
    }

    const value = cleanValue(line, maxLen);
    if (!value || !valueGuard.test(value)) {
      candidates.push({
        value: value ?? "",
        snippet: line,
        score: 0,
        lineOffset: offset,
        multiline: true,
        rejectionReason: "value_guard_failed",
      });
      continue;
    }

    const score = scoreCandidateForField(value, options.fieldName);
    candidates.push({
      value,
      snippet: `${lines[labelLineIndex]}\n${line}`,
      score,
      lineOffset: offset,
      multiline: true,
    });
  }

  return candidates.sort((a, b) => b.score - a.score);
}

function resolveLabels(spec: LabelSpec, options?: FindLabelValueOptions): string[] {
  const base = [...spec.labels];
  if (options?.mode === "loose" && options.fieldName) {
    const extras = LOOSE_EXTRA_LABELS[options.fieldName] ?? [];
    return [...base, ...extras.filter((l) => !base.includes(l))];
  }
  return base;
}

function scoreLabelConfidence(
  label: string,
  multiline: boolean,
  candidateScore: number,
  loose = false,
): number {
  let score = 0.78 + candidateScore * 0.15;
  if (multiline) score -= 0.03;
  if (label.includes(" ")) score += 0.02;
  if (loose) score -= LOOSE_CONFIDENCE_PENALTY;
  return Math.max(0.45, Math.min(0.97, score));
}

function collectNearbyLines(lines: string[], index: number, radius = 2): string[] {
  const start = Math.max(0, index - radius);
  const end = Math.min(lines.length, index + radius + 1);
  return lines.slice(start, end).map((l) => l.trim());
}

/**
 * Contextual label finder — inspects next 1–3 lines, scores candidates,
 * rejects paragraph false positives.
 */
export function findLabelValueContextual(
  text: string,
  spec: LabelSpec,
  options?: FindLabelValueOptions,
): FindLabelValueResult | null {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  logContextualExtractorEntered({
    fieldName: options?.fieldName,
    textLength: text.length,
    lineCount: lines.length,
  });

  const maxLen = options?.maxValueLength ?? 120;
  const loose = options?.mode === "loose";
  const trace = options?.trace;
  const valueGuard =
    options?.valuePattern ??
    (loose ? /[\s\S]/ : /[0-9A-Za-zÀ-ÖØ-öø-ÿ'.,()\-/]/);

  const labels = resolveLabels(spec, options);
  trace?.searchedLabels.push(...labels);

  let best: { result: FindLabelValueResult; score: number } | null = null;

  for (const label of labels) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (lineRejected(line, spec.rejectLineContaining)) {
        trace?.rejected.push({ label, reason: "line_rejected_by_filter", snippet: line });
        continue;
      }

      if (!lineMatchesLabelAtStart(line, label, labels)) continue;

      trace?.nearbyText.push(...collectNearbyLines(lines, i));

      const inline = extractInlineValueAfterLabel(line, label, maxLen);
      if (inline && valueGuard.test(inline)) {
        const score = scoreCandidateForField(inline, options?.fieldName) + 0.2;
        const result: FindLabelValueResult = {
          value: inline,
          snippet: line,
          labelMatched: label,
          confidence: scoreLabelConfidence(label, false, score, loose),
          multiline: false,
          loose,
        };
        if (!best || score > best.score) best = { result, score };
        continue;
      }

      trace?.multilineDetection.push({
        label,
        attempted: true,
        matched: false,
        snippet: line,
      });

      const candidates = scoreContextCandidates(lines, i, label, options ?? {});
      for (const candidate of candidates) {
        if (candidate.rejectionReason) {
          trace?.rejected.push({
            label,
            reason: candidate.rejectionReason,
            snippet: candidate.snippet,
          });
          continue;
        }
        if (candidate.score < 0.4) {
          trace?.boundaryFailures.push({
            label,
            reason: "candidate_score_too_low",
            snippet: candidate.snippet,
          });
          continue;
        }

        trace?.multilineDetection.push({
          label,
          attempted: true,
          matched: true,
          snippet: candidate.snippet,
        });

        const result: FindLabelValueResult = {
          value: candidate.value,
          snippet: candidate.snippet,
          labelMatched: label,
          confidence: scoreLabelConfidence(label, true, candidate.score, loose),
          multiline: true,
          loose,
        };
        const totalScore = candidate.score + (label.includes(" ") ? 0.05 : 0);
        if (!best || totalScore > best.score) best = { result, score: totalScore };
      }
    }
  }

  return best?.result ?? null;
}
