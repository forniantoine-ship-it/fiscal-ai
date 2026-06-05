"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractInpi = exports.INPI_EXCLUDED_WORKFLOW_FIELDS = exports.INPI_EXTRACTABLE_FIELDS = exports.INPI_EXTRACTOR_ID = void 0;
exports.parseInpiFromText = parseInpiFromText;
const confidence_score_1 = require("../types/confidence-score");
const extractor_types_1 = require("./extractor.types");
const inpi_extraction_debug_1 = require("./inpi-extraction.debug");
const inpi_extraction_helpers_1 = require("./inpi-extraction.helpers");
exports.INPI_EXTRACTOR_ID = "extractor.inpi";
exports.INPI_EXTRACTABLE_FIELDS = [
    "nom",
    "prenom",
    "siren",
    "siret",
    "codeAPE",
    "activite",
    "adresseEtablissement",
    "email",
    "telephone",
];
/** Workflow fields that must NOT be inferred from INPI — logged as excluded */
exports.INPI_EXCLUDED_WORKFLOW_FIELDS = [
    "regimeFiscal",
    "dateDebutActivite",
    "adresseLogement",
];
const FIELD_LABELS = {
    nom: "Nom",
    prenom: "Prénom",
    siren: "SIREN",
    siret: "SIRET",
    codeAPE: "Code APE",
    activite: "Activité",
    adresseEtablissement: "Adresse établissement",
    email: "Email",
    telephone: "Téléphone",
};
const EXCLUDED_REASONS = {
    regimeFiscal: "not reliably present in INPI document — LMNP regime requires user confirmation",
    dateDebutActivite: "not reliably present in INPI document — LMNP start date requires user input",
    adresseLogement: "property address is not present in INPI document — requires separate logement step",
};
function logFieldTrace(trace) {
    const { field, status } = trace, rest = __rest(trace, ["field", "status"]);
    console.log(`[field] ${status}`, Object.assign({ field }, rest));
}
function makeProvenance(field, confidence, extractionMethod, inferred) {
    return {
        field,
        sourceDocument: "inpi",
        confidence,
        extractionMethod,
        inferred,
    };
}
function emitFieldTrace(field, value, confidence, snippet, extractionMethod, inferred) {
    if ((0, inpi_extraction_helpers_1.isLowConfidence)(confidence)) {
        logFieldTrace({
            field,
            status: "low_confidence",
            value,
            confidence,
            snippet,
            extractionMethod,
            inferred,
            reason: `below threshold ${confidence_score_1.CONFIDENCE_THRESHOLDS.review}`,
        });
    }
    else {
        logFieldTrace({
            field,
            status: "extracted",
            value,
            confidence,
            snippet,
            extractionMethod,
            inferred,
        });
    }
}
function buildField(key, value, confidence, snippet, extractionMethod, inferred) {
    emitFieldTrace(key, value, confidence, snippet, extractionMethod, inferred);
    const score = (0, confidence_score_1.createConfidenceScore)(confidence, [
        extractionMethod,
        inferred ? "inferred" : "direct",
    ]);
    return {
        key,
        label: FIELD_LABELS[key],
        value,
        confidence: score,
        evidence: snippet,
        provenance: makeProvenance(key, score, extractionMethod, inferred),
    };
}
function fromLabel(field, result) {
    return buildField(field, result.value, result.confidence, result.snippet, "regex_label", false);
}
function fromPattern(field, result) {
    return buildField(field, result.value, result.confidence, result.snippet, "regex_pattern", false);
}
function finalizeFieldDebug(report, extracted, loose = false) {
    if (!extracted) {
        report.finalDecision = "not_found";
        return;
    }
    if (loose) {
        report.finalDecision = "recovered_by_loose_mode";
        return;
    }
    report.finalDecision = (0, inpi_extraction_helpers_1.isLowConfidence)(extracted.confidence.value)
        ? "low_confidence"
        : "extracted";
}
function tryLooseLabel(field, normalizedText, spec, options, report) {
    const looseTrace = (0, inpi_extraction_debug_1.createLabelTrace)();
    const result = (0, inpi_extraction_helpers_1.findLabelValue)(normalizedText, spec, Object.assign(Object.assign({}, options), { mode: "loose", fieldName: field, trace: looseTrace }));
    (0, inpi_extraction_debug_1.logFindLabelValueTrace)(`${field}:loose`, looseTrace);
    if (result) {
        report.matchedCandidates.push({
            source: "loose",
            labelOrPattern: result.labelMatched,
            snippet: result.snippet,
            value: result.value,
            confidence: result.confidence,
            multiline: result.multiline,
        });
        (0, inpi_extraction_debug_1.logLooseRecovery)(field, result.value, result.snippet, result.confidence);
    }
    else {
        report.rejectionReasons.push("loose_mode_label_search_failed");
    }
    return result;
}
function tryLoosePatterns(field, normalizedText, specs, report) {
    const looseTrace = (0, inpi_extraction_debug_1.createPatternTrace)();
    const result = (0, inpi_extraction_helpers_1.extractWithPatterns)(normalizedText, specs, {
        mode: "loose",
        trace: looseTrace,
    });
    for (const m of looseTrace.matches) {
        if (m.accepted) {
            report.matchedCandidates.push({
                source: "loose",
                labelOrPattern: m.pattern,
                snippet: m.snippet,
                value: m.value,
                confidence: result === null || result === void 0 ? void 0 : result.confidence,
            });
        }
        else {
            report.rejectedCandidates.push({
                source: "loose",
                labelOrPattern: m.pattern,
                snippet: m.snippet,
                value: m.value,
            });
            if (m.rejectionReason)
                report.rejectionReasons.push(`loose:${m.rejectionReason}`);
        }
    }
    if (result) {
        (0, inpi_extraction_debug_1.logLooseRecovery)(field, result.value, result.snippet, result.confidence);
    }
    else {
        report.rejectionReasons.push("loose_mode_pattern_search_failed");
    }
    return result;
}
function extractPatternField(field, normalizedText, data, fields, factors, looseRecoveries) {
    const report = (0, inpi_extraction_debug_1.createFieldDebugReport)(field);
    const patternSpecs = [...inpi_extraction_helpers_1.INPI_PATTERN_SPECS[field]];
    report.patternsTried = patternSpecs.map((s) => s.pattern.source.slice(0, 80));
    const trace = (0, inpi_extraction_debug_1.createPatternTrace)();
    let match = (0, inpi_extraction_helpers_1.extractWithPatterns)(normalizedText, patternSpecs, { trace, mode: "strict" });
    report.patternsTried = trace.patternsTried;
    for (const m of trace.matches) {
        const candidate = {
            source: "pattern",
            labelOrPattern: m.pattern,
            snippet: m.snippet,
            value: m.value,
            confidence: match === null || match === void 0 ? void 0 : match.confidence,
        };
        if (m.accepted)
            report.matchedCandidates.push(candidate);
        else {
            report.rejectedCandidates.push(candidate);
            if (m.rejectionReason)
                report.rejectionReasons.push(m.rejectionReason);
        }
    }
    let loose = false;
    if (!match) {
        match = tryLoosePatterns(field, normalizedText, patternSpecs, report);
        loose = Boolean(match === null || match === void 0 ? void 0 : match.loose);
        if (match === null || match === void 0 ? void 0 : match.loose)
            looseRecoveries.push(field);
    }
    if (match) {
        if (field === "telephone" && data.siren && match.value === data.siren) {
            report.rejectionReasons.push("telephone_matches_siren");
            finalizeFieldDebug(report, null);
            (0, inpi_extraction_debug_1.logFieldDebug)(report);
            return;
        }
        data[field] = match.value;
        const extracted = fromPattern(field, match);
        fields.push(extracted);
        factors.push(`${field}:${loose ? "loose_pattern" : "regex_pattern"}`);
        finalizeFieldDebug(report, extracted, loose);
    }
    else {
        finalizeFieldDebug(report, null);
        logFieldTrace({ field, status: "not_found", reason: "strict and loose pattern search failed" });
    }
    (0, inpi_extraction_debug_1.logFieldDebug)(report);
}
function extractLabelField(field, normalizedText, data, fields, factors, looseRecoveries, options) {
    const spec = inpi_extraction_helpers_1.INPI_LABEL_SPECS[field === "codeAPE" ? "codeAPE" : field];
    const report = (0, inpi_extraction_debug_1.createFieldDebugReport)(field);
    report.labelSpecsTried = [...spec.labels];
    const trace = (0, inpi_extraction_debug_1.createLabelTrace)();
    let match = (0, inpi_extraction_helpers_1.findLabelValue)(normalizedText, spec, Object.assign(Object.assign({}, options), { fieldName: field, trace, mode: "strict" }));
    (0, inpi_extraction_debug_1.logFindLabelValueTrace)(field, trace);
    if (match) {
        report.matchedCandidates.push({
            source: "label",
            labelOrPattern: match.labelMatched,
            snippet: match.snippet,
            value: match.value,
            confidence: match.confidence,
            multiline: match.multiline,
        });
    }
    else {
        for (const r of trace.rejected)
            report.rejectionReasons.push(`${r.label}:${r.reason}`);
        for (const b of trace.boundaryFailures)
            report.rejectionReasons.push(`${b.label}:${b.reason}`);
    }
    let loose = false;
    if (!match) {
        match = tryLooseLabel(field, normalizedText, spec, options, report);
        loose = Boolean(match === null || match === void 0 ? void 0 : match.loose);
        if (match === null || match === void 0 ? void 0 : match.loose)
            looseRecoveries.push(field);
    }
    if (match) {
        let value = match.value;
        if (field === "codeAPE") {
            value = value.replace(/\s/g, "").toUpperCase();
            if (!/^\d{4}[A-Z]$/.test(value)) {
                report.rejectionReasons.push("codeAPE_invalid_format_after_normalization");
                finalizeFieldDebug(report, null);
                (0, inpi_extraction_debug_1.logFieldDebug)(report);
                logFieldTrace({ field, status: "not_found", reason: "invalid APE format" });
                return;
            }
        }
        data[field] = value;
        const extracted = fromLabel(field, Object.assign(Object.assign({}, match), { value }));
        fields.push(extracted);
        factors.push(`${field}:${loose ? "loose_label" : "label"}:${match.labelMatched}`);
        finalizeFieldDebug(report, extracted, loose);
    }
    else {
        finalizeFieldDebug(report, null);
        logFieldTrace({ field, status: "not_found", reason: "strict and loose label search failed" });
    }
    (0, inpi_extraction_debug_1.logFieldDebug)(report);
}
function logExcludedFields() {
    for (const field of exports.INPI_EXCLUDED_WORKFLOW_FIELDS) {
        console.log("[field] not_found", {
            field,
            reason: EXCLUDED_REASONS[field],
            excluded: true,
        });
        console.log("[field-debug]", {
            field,
            labelSpecsTried: [],
            patternsTried: [],
            matchedCandidates: [],
            rejectedCandidates: [],
            rejectionReasons: [EXCLUDED_REASONS[field]],
            finalDecision: "excluded",
        });
    }
}
function buildExtractionSummary(data, looseRecoveries) {
    const extractedFields = exports.INPI_EXTRACTABLE_FIELDS.filter((f) => Boolean(data[f]));
    const missingFields = exports.INPI_EXTRACTABLE_FIELDS.filter((f) => !data[f]);
    const coveragePercentage = Math.round((extractedFields.length / exports.INPI_EXTRACTABLE_FIELDS.length) * 100);
    return {
        extractedFields,
        missingFields,
        coveragePercentage,
        looseRecoveries,
    };
}
/**
 * Deterministic INPI parser — exported for fixture tests.
 */
function parseInpiFromText(rawText, options) {
    var _a;
    const debug = (_a = options === null || options === void 0 ? void 0 : options.debug) !== null && _a !== void 0 ? _a : true;
    if (debug) {
        (0, inpi_extraction_debug_1.logOcrPreview)(rawText);
    }
    const normalizedText = (0, inpi_extraction_helpers_1.normalizeOcrText)(rawText);
    if (debug) {
        (0, inpi_extraction_debug_1.logNormalizedOcrPreview)(normalizedText);
    }
    const data = {};
    const fields = [];
    const factors = [];
    const looseRecoveries = [];
    extractPatternField("siret", normalizedText, data, fields, factors, looseRecoveries);
    {
        const report = (0, inpi_extraction_debug_1.createFieldDebugReport)("siren");
        report.patternsTried = inpi_extraction_helpers_1.INPI_PATTERN_SPECS.siren.map((s) => s.pattern.source.slice(0, 80));
        const trace = (0, inpi_extraction_debug_1.createPatternTrace)();
        let sirenMatch = (0, inpi_extraction_helpers_1.extractWithPatterns)(normalizedText, [...inpi_extraction_helpers_1.INPI_PATTERN_SPECS.siren], {
            trace,
            mode: "strict",
        });
        report.patternsTried = trace.patternsTried;
        for (const m of trace.matches) {
            const candidate = {
                source: "pattern",
                labelOrPattern: m.pattern,
                snippet: m.snippet,
                value: m.value,
            };
            if (m.accepted)
                report.matchedCandidates.push(candidate);
            else {
                report.rejectedCandidates.push(candidate);
                if (m.rejectionReason)
                    report.rejectionReasons.push(m.rejectionReason);
            }
        }
        let loose = false;
        if (!sirenMatch) {
            sirenMatch = tryLoosePatterns("siren", normalizedText, [...inpi_extraction_helpers_1.INPI_PATTERN_SPECS.siren], report);
            loose = Boolean(sirenMatch === null || sirenMatch === void 0 ? void 0 : sirenMatch.loose);
            if (sirenMatch === null || sirenMatch === void 0 ? void 0 : sirenMatch.loose)
                looseRecoveries.push("siren");
        }
        if (sirenMatch) {
            data.siren = sirenMatch.value;
            const extracted = fromPattern("siren", sirenMatch);
            fields.push(extracted);
            factors.push(`siren:${loose ? "loose_pattern" : "regex_pattern"}`);
            finalizeFieldDebug(report, extracted, loose);
        }
        else if (data.siret && (0, inpi_extraction_helpers_1.isValidSiren)(data.siret.slice(0, 9))) {
            data.siren = data.siret.slice(0, 9);
            const extracted = buildField("siren", data.siren, 0.76, `SIREN dérivé du SIRET ${data.siret}`, "derived", true);
            fields.push(extracted);
            factors.push("siren:derived_from_siret");
            report.matchedCandidates.push({
                source: "derived",
                snippet: extracted.evidence,
                value: data.siren,
                confidence: 0.76,
            });
            finalizeFieldDebug(report, extracted, false);
        }
        else {
            finalizeFieldDebug(report, null);
            logFieldTrace({ field: "siren", status: "not_found", reason: "no SIREN or derivable SIRET" });
        }
        (0, inpi_extraction_debug_1.logFieldDebug)(report);
    }
    extractLabelField("nom", normalizedText, data, fields, factors, looseRecoveries, {
        maxValueLength: 80,
        valuePattern: /[A-Za-zÀ-ÖØ-öø-ÿ' -]/,
    });
    extractLabelField("prenom", normalizedText, data, fields, factors, looseRecoveries, {
        maxValueLength: 60,
        valuePattern: /[A-Za-zÀ-ÖØ-öø-ÿ' -]/,
    });
    {
        extractLabelField("codeAPE", normalizedText, data, fields, factors, looseRecoveries, {
            maxValueLength: 12,
            valuePattern: /[0-9A-Za-z.\s-]/,
        });
        if (!data.codeAPE) {
            const report = (0, inpi_extraction_debug_1.createFieldDebugReport)("codeAPE");
            report.patternsTried = inpi_extraction_helpers_1.INPI_PATTERN_SPECS.codeAPE.map((s) => s.pattern.source.slice(0, 80));
            const trace = (0, inpi_extraction_debug_1.createPatternTrace)();
            let apePattern = (0, inpi_extraction_helpers_1.extractWithPatterns)(normalizedText, [...inpi_extraction_helpers_1.INPI_PATTERN_SPECS.codeAPE], {
                trace,
                mode: "strict",
            });
            let loose = false;
            if (!apePattern) {
                apePattern = tryLoosePatterns("codeAPE", normalizedText, [...inpi_extraction_helpers_1.INPI_PATTERN_SPECS.codeAPE], report);
                loose = Boolean(apePattern === null || apePattern === void 0 ? void 0 : apePattern.loose);
                if (apePattern === null || apePattern === void 0 ? void 0 : apePattern.loose)
                    looseRecoveries.push("codeAPE");
            }
            if (apePattern) {
                data.codeAPE = apePattern.value;
                const extracted = fromPattern("codeAPE", apePattern);
                fields.push(extracted);
                factors.push(`codeAPE:${loose ? "loose_pattern" : "regex_pattern"}`);
                report.matchedCandidates.push({
                    source: loose ? "loose" : "pattern",
                    labelOrPattern: apePattern.pattern,
                    snippet: apePattern.snippet,
                    value: apePattern.value,
                    confidence: apePattern.confidence,
                });
                finalizeFieldDebug(report, extracted, loose);
            }
            else {
                finalizeFieldDebug(report, null);
            }
            (0, inpi_extraction_debug_1.logFieldDebug)(report);
        }
    }
    extractLabelField("activite", normalizedText, data, fields, factors, looseRecoveries, {
        maxValueLength: 100,
    });
    extractLabelField("adresseEtablissement", normalizedText, data, fields, factors, looseRecoveries, {
        maxValueLength: 140,
        valuePattern: /[0-9A-Za-zÀ-ÖØ-öø-ÿ'., -]/,
    });
    extractPatternField("email", normalizedText, data, fields, factors, looseRecoveries);
    extractPatternField("telephone", normalizedText, data, fields, factors, looseRecoveries);
    const debugSummary = buildExtractionSummary(data, looseRecoveries);
    if (debug) {
        (0, inpi_extraction_debug_1.logExtractionSummary)(debugSummary);
    }
    return { data, fields, factors, normalizedText, debugSummary };
}
exports.extractInpi = {
    id: exports.INPI_EXTRACTOR_ID,
    documentType: "inpi",
    version: "0.5.0",
    supportedSchemaVersion: extractor_types_1.EXTRACTION_SCHEMA_VERSION,
    async extract(context) {
        console.log("[extraction] inpi start", {
            documentId: context.documentId,
            fileName: context.fileName,
            textLength: context.rawText.length,
            strategy: "deterministic_document_backed",
            debug: true,
        });
        logExcludedFields();
        const { data, fields, factors, debugSummary } = parseInpiFromText(context.rawText, {
            debug: true,
        });
        const directFields = fields.filter((f) => { var _a; return !((_a = f.provenance) === null || _a === void 0 ? void 0 : _a.inferred); });
        const fieldConfidences = directFields.map((f) => f.confidence.value);
        const avgConfidence = fieldConfidences.length > 0
            ? fieldConfidences.reduce((a, b) => a + b, 0) / fieldConfidences.length
            : 0;
        const hasCoreIdentity = Boolean(data.siren && data.nom && data.prenom);
        const overall = hasCoreIdentity ? Math.max(avgConfidence, 0.55) : Math.min(avgConfidence, 0.5);
        const needsReview = overall < confidence_score_1.CONFIDENCE_THRESHOLDS.review ||
            !hasCoreIdentity ||
            fields.some((f) => { var _a; return (_a = f.provenance) === null || _a === void 0 ? void 0 : _a.inferred; }) ||
            fields.some((f) => f.confidence.value < confidence_score_1.CONFIDENCE_THRESHOLDS.review);
        const result = {
            documentType: "inpi",
            extractorId: exports.INPI_EXTRACTOR_ID,
            fields,
            data,
            confidence: (0, confidence_score_1.createConfidenceScore)(overall, factors),
            needsReview,
            explainability: [
                `file:${context.fileName}`,
                ...factors,
                `coverage:${debugSummary.coveragePercentage}%`,
                debugSummary.looseRecoveries.length
                    ? `loose_recoveries:${debugSummary.looseRecoveries.join(",")}`
                    : "loose_recoveries:none",
            ],
            schemaVersion: extractor_types_1.EXTRACTION_SCHEMA_VERSION,
        };
        console.log("[extraction] inpi complete", {
            documentId: context.documentId,
            fieldCount: fields.length,
            inferredCount: fields.filter((f) => { var _a; return (_a = f.provenance) === null || _a === void 0 ? void 0 : _a.inferred; }).length,
            confidence: overall,
            needsReview,
            coveragePercentage: debugSummary.coveragePercentage,
            missingFields: debugSummary.missingFields,
            looseRecoveries: debugSummary.looseRecoveries,
        });
        return result;
    },
};
