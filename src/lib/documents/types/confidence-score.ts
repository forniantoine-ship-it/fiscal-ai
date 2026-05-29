/**
 * Normalized confidence model shared across classification, extraction, and validation.
 */

export type ConfidenceBand = "high" | "medium" | "low" | "unknown";

export type ConfidenceScore = {
  /** 0–1 inclusive */
  value: number;
  band: ConfidenceBand;
  /** Human-readable factors (keywords, not chain-of-thought) */
  factors: string[];
};

export const CONFIDENCE_THRESHOLDS = {
  review: 0.65,
  autoAccept: 0.85,
} as const;

export function confidenceBand(value: number): ConfidenceBand {
  if (!Number.isFinite(value)) return "unknown";
  if (value >= CONFIDENCE_THRESHOLDS.autoAccept) return "high";
  if (value >= CONFIDENCE_THRESHOLDS.review) return "medium";
  return "low";
}

export function createConfidenceScore(
  value: number,
  factors: string[] = [],
): ConfidenceScore {
  const clamped = Math.min(1, Math.max(0, value));
  return {
    value: clamped,
    band: confidenceBand(clamped),
    factors: factors.filter((f) => f.trim().length > 0).slice(0, 8),
  };
}
