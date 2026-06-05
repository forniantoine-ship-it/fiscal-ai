"use strict";
/**
 * Deep extraction debugging for INPI deterministic parser.
 * Temporary instrumentation — does not alter strict extraction outcomes.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOOSE_CONFIDENCE_PENALTY = exports.LOOSE_EXTRA_LABELS = exports.OCR_PREVIEW_LENGTH = void 0;
exports.createFieldDebugReport = createFieldDebugReport;
exports.logOcrPreview = logOcrPreview;
exports.logNormalizedOcrPreview = logNormalizedOcrPreview;
exports.logFieldDebug = logFieldDebug;
exports.logExtractionSummary = logExtractionSummary;
exports.logLooseRecovery = logLooseRecovery;
exports.createLabelTrace = createLabelTrace;
exports.createPatternTrace = createPatternTrace;
exports.logFindLabelValueTrace = logFindLabelValueTrace;
exports.OCR_PREVIEW_LENGTH = 3000;
function createFieldDebugReport(field) {
    return {
        field,
        labelSpecsTried: [],
        patternsTried: [],
        matchedCandidates: [],
        rejectedCandidates: [],
        rejectionReasons: [],
        finalDecision: "not_found",
    };
}
function logOcrPreview(rawText) {
    console.log("[ocr-preview]", {
        length: rawText.length,
        preview: rawText.slice(0, exports.OCR_PREVIEW_LENGTH),
        truncated: rawText.length > exports.OCR_PREVIEW_LENGTH,
    });
}
function logNormalizedOcrPreview(normalizedText) {
    console.log("[normalized-ocr-preview]", {
        length: normalizedText.length,
        preview: normalizedText.slice(0, exports.OCR_PREVIEW_LENGTH),
        truncated: normalizedText.length > exports.OCR_PREVIEW_LENGTH,
    });
}
function logFieldDebug(report) {
    console.log("[field-debug]", report);
}
function logExtractionSummary(summary) {
    console.log("[extraction-summary]", summary);
}
function logLooseRecovery(field, value, snippet, confidence) {
    console.log("[field] recovered_by_loose_mode", {
        field,
        value,
        snippet,
        confidence,
    });
}
function createLabelTrace() {
    return {
        searchedLabels: [],
        nearbyText: [],
        multilineDetection: [],
        boundaryFailures: [],
        rejected: [],
    };
}
function createPatternTrace() {
    return {
        patternsTried: [],
        matches: [],
    };
}
function logFindLabelValueTrace(field, trace) {
    console.log("[findLabelValue]", {
        field,
        searchedLabels: trace.searchedLabels,
        nearbyText: trace.nearbyText.slice(0, 12),
        multilineDetection: trace.multilineDetection,
        boundaryFailures: trace.boundaryFailures,
        rejected: trace.rejected,
    });
}
/** Extra labels attempted only in loose mode */
exports.LOOSE_EXTRA_LABELS = {
    nom: ["nom patronymique"],
    prenom: ["prénom usuel", "prenom usuel"],
    activite: ["activité", "activite", "libellé activité", "libelle activite"],
    adresseEtablissement: ["adresse du siège", "siège social"],
    codeAPE: ["code naf", "naf"],
};
exports.LOOSE_CONFIDENCE_PENALTY = 0.12;
