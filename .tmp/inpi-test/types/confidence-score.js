"use strict";
/**
 * Normalized confidence model shared across classification, extraction, and validation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONFIDENCE_THRESHOLDS = void 0;
exports.confidenceBand = confidenceBand;
exports.createConfidenceScore = createConfidenceScore;
exports.CONFIDENCE_THRESHOLDS = {
    review: 0.65,
    autoAccept: 0.85,
};
function confidenceBand(value) {
    if (!Number.isFinite(value))
        return "unknown";
    if (value >= exports.CONFIDENCE_THRESHOLDS.autoAccept)
        return "high";
    if (value >= exports.CONFIDENCE_THRESHOLDS.review)
        return "medium";
    return "low";
}
function createConfidenceScore(value, factors = []) {
    const clamped = Math.min(1, Math.max(0, value));
    return {
        value: clamped,
        band: confidenceBand(clamped),
        factors: factors.filter((f) => f.trim().length > 0).slice(0, 8),
    };
}
