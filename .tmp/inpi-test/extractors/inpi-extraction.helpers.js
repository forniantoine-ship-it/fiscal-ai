"use strict";
/**
 * Reusable deterministic helpers for INPI / Kbis OCR extraction.
 * Accent normalization, fuzzy labels, multiline values, pattern extraction.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.INPI_PATTERN_SPECS = exports.INPI_LABEL_SPECS = void 0;
exports.normalizeOcrText = normalizeOcrText;
exports.stripAccents = stripAccents;
exports.normalizeForLabelMatch = normalizeForLabelMatch;
exports.fuzzyLabelIncludes = fuzzyLabelIncludes;
exports.findLabelValue = findLabelValue;
exports.extractWithPatterns = extractWithPatterns;
exports.digitsOnly = digitsOnly;
exports.isLowConfidence = isLowConfidence;
exports.normalizeFrenchPhone = normalizeFrenchPhone;
exports.normalizeSiren = normalizeSiren;
exports.normalizeSiret = normalizeSiret;
exports.isValidSiren = isValidSiren;
exports.isValidSiret = isValidSiret;
exports.isValidCodeApe = isValidCodeApe;
const confidence_score_1 = require("../types/confidence-score");
const inpi_extraction_debug_1 = require("./inpi-extraction.debug");
const NBSP = /[\u00A0\u2007\u202F\u2028\u2029]/g;
const MULTI_NL = /\n{3,}/g;
/** OCR cleanup: preserve newlines for multiline labels, collapse noise elsewhere. */
function normalizeOcrText(raw) {
    return raw
        .replace(/\r\n/g, "\n")
        .replace(NBSP, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/ *\n */g, "\n")
        .replace(MULTI_NL, "\n\n")
        .trim();
}
/** Strip accents for fuzzy label comparison (é → e, è → e). */
function stripAccents(text) {
    return text.normalize("NFD").replace(/\p{M}/gu, "");
}
function normalizeForLabelMatch(text) {
    return stripAccents(text).toLowerCase().replace(/\s+/g, " ").trim();
}
function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function buildFlexibleLabelPattern(label, loose = false) {
    const normalized = normalizeForLabelMatch(label);
    const parts = normalized.split(/\s+/).filter(Boolean).map(escapeRegex);
    const joined = parts.join("\\s+");
    if (loose)
        return joined;
    return `(?<![a-z0-9])${joined}(?![a-z0-9])`;
}
function cleanExtractedValue(raw, maxLength = 120) {
    return raw
        .replace(/\s+/g, " ")
        .replace(/^[\s:;|–—-]+/, "")
        .replace(/[\s:;|–—-]+$/, "")
        .trim()
        .slice(0, maxLength);
}
function lineRejected(line, rejectFragments) {
    if (!(rejectFragments === null || rejectFragments === void 0 ? void 0 : rejectFragments.length))
        return false;
    const normalized = normalizeForLabelMatch(line);
    return rejectFragments.some((frag) => normalized.includes(normalizeForLabelMatch(frag)));
}
function scoreLabelConfidence(label, matched, multiline, loose = false) {
    const exact = normalizeForLabelMatch(matched).includes(normalizeForLabelMatch(label));
    let score = exact ? 0.92 : 0.84;
    if (multiline)
        score -= 0.03;
    if (label.includes(" "))
        score += 0.02;
    if (loose)
        score -= inpi_extraction_debug_1.LOOSE_CONFIDENCE_PENALTY;
    return Math.max(0.45, Math.min(0.97, score));
}
function collectNearbyText(text, label) {
    const normalizedLabel = normalizeForLabelMatch(label);
    return text
        .split("\n")
        .filter((line) => normalizeForLabelMatch(line).includes(normalizedLabel))
        .slice(0, 5)
        .map((line) => line.trim());
}
function resolveLabels(spec, options) {
    var _a;
    const base = [...spec.labels];
    if ((options === null || options === void 0 ? void 0 : options.mode) === "loose" && options.fieldName) {
        const extras = (_a = inpi_extraction_debug_1.LOOSE_EXTRA_LABELS[options.fieldName]) !== null && _a !== void 0 ? _a : [];
        return [...base, ...extras.filter((l) => !base.includes(l))];
    }
    return base;
}
function looksLikeLabelLine(line) {
    return /:\s*$/.test(line) || /^(nom|prenom|prénom|siren|siret|adresse|activit|code|email|tel)/i.test(line);
}
/** Fuzzy check: accent-insensitive substring match on normalized text. */
function fuzzyLabelIncludes(haystack, label) {
    const h = normalizeForLabelMatch(haystack);
    const l = normalizeForLabelMatch(label);
    return h.includes(l);
}
/**
 * Finds a labelled value using exact then fuzzy label matching.
 * Supports same-line (`Nom : DUPONT`) and multiline (`Nom de naissance\nDUPONT`).
 */
function findLabelValue(rawText, spec, options) {
    var _a, _b, _c, _d;
    const text = normalizeOcrText(rawText);
    const maxLen = (_a = options === null || options === void 0 ? void 0 : options.maxValueLength) !== null && _a !== void 0 ? _a : 120;
    const loose = (options === null || options === void 0 ? void 0 : options.mode) === "loose";
    const trace = options === null || options === void 0 ? void 0 : options.trace;
    const valueGuard = (_b = options === null || options === void 0 ? void 0 : options.valuePattern) !== null && _b !== void 0 ? _b : (loose ? /[\s\S]/ : /[0-9A-Za-zÀ-ÖØ-öø-ÿ@.''+\-/]/);
    const labels = resolveLabels(spec, options);
    trace === null || trace === void 0 ? void 0 : trace.searchedLabels.push(...labels);
    for (const label of labels) {
        const nearby = collectNearbyText(text, label);
        if (nearby.length)
            trace === null || trace === void 0 ? void 0 : trace.nearbyText.push(...nearby);
        const labelPattern = buildFlexibleLabelPattern(label, loose);
        const sameLineRe = new RegExp(`(?:^|\\n)\\s*${labelPattern}\\s*[:\\-–—]?\\s*([^\\n;|]{1,${maxLen}})`, "i");
        const sameLine = text.match(sameLineRe);
        if (sameLine === null || sameLine === void 0 ? void 0 : sameLine[1]) {
            const line = sameLine[0];
            if (lineRejected(line, spec.rejectLineContaining)) {
                trace === null || trace === void 0 ? void 0 : trace.rejected.push({
                    label,
                    reason: "line_rejected_by_filter",
                    snippet: line.trim(),
                });
            }
            else {
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
                trace === null || trace === void 0 ? void 0 : trace.boundaryFailures.push({
                    label,
                    reason: "same_line_value_failed_guard",
                    snippet: line.trim(),
                });
            }
        }
        const multilineRe = new RegExp(`(?:^|\\n)\\s*${labelPattern}\\s*[:\\-–—]?\\s*\\n\\s*([^\\n;|]{1,${maxLen}})`, "i");
        const multiline = text.match(multilineRe);
        trace === null || trace === void 0 ? void 0 : trace.multilineDetection.push({
            label,
            attempted: true,
            matched: Boolean(multiline === null || multiline === void 0 ? void 0 : multiline[1]),
            snippet: (_c = multiline === null || multiline === void 0 ? void 0 : multiline[0]) === null || _c === void 0 ? void 0 : _c.trim(),
        });
        if (multiline === null || multiline === void 0 ? void 0 : multiline[1]) {
            const line = multiline[0];
            if (lineRejected(line, spec.rejectLineContaining)) {
                trace === null || trace === void 0 ? void 0 : trace.rejected.push({
                    label,
                    reason: "multiline_rejected_by_filter",
                    snippet: line.trim(),
                });
            }
            else {
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
                trace === null || trace === void 0 ? void 0 : trace.boundaryFailures.push({
                    label,
                    reason: "multiline_value_failed_guard",
                    snippet: line.trim(),
                });
            }
        }
        else {
            trace === null || trace === void 0 ? void 0 : trace.boundaryFailures.push({
                label,
                reason: "multiline_no_match",
            });
        }
    }
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (lineRejected(line, spec.rejectLineContaining))
            continue;
        for (const label of labels) {
            if (!fuzzyLabelIncludes(line, label))
                continue;
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
                trace === null || trace === void 0 ? void 0 : trace.rejected.push({
                    label,
                    reason: "fuzzy_colon_value_failed_guard",
                    snippet: line.trim(),
                });
                continue;
            }
            const next = (_d = lines[i + 1]) === null || _d === void 0 ? void 0 : _d.trim();
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
            trace === null || trace === void 0 ? void 0 : trace.rejected.push({
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
function extractWithPatterns(rawText, specs, options) {
    var _a;
    const text = normalizeOcrText(rawText);
    const loose = (options === null || options === void 0 ? void 0 : options.mode) === "loose";
    const trace = options === null || options === void 0 ? void 0 : options.trace;
    for (const spec of specs) {
        trace === null || trace === void 0 ? void 0 : trace.patternsTried.push(spec.pattern.source.slice(0, 80));
        const match = text.match(spec.pattern);
        if (!(match === null || match === void 0 ? void 0 : match[1]) && !(match === null || match === void 0 ? void 0 : match[0])) {
            trace === null || trace === void 0 ? void 0 : trace.matches.push({
                pattern: spec.pattern.source.slice(0, 60),
                accepted: false,
                rejectionReason: "no_match",
            });
            continue;
        }
        const raw = (_a = match[1]) !== null && _a !== void 0 ? _a : match[0];
        const value = spec.normalize ? spec.normalize(raw, match) : cleanExtractedValue(raw);
        if (!value) {
            trace === null || trace === void 0 ? void 0 : trace.matches.push({
                pattern: spec.pattern.source.slice(0, 60),
                snippet: match[0].trim(),
                accepted: false,
                rejectionReason: "normalize_empty",
            });
            continue;
        }
        const skipValidate = loose && spec.looseOptional;
        if (spec.validate && !skipValidate && !spec.validate(value)) {
            trace === null || trace === void 0 ? void 0 : trace.matches.push({
                pattern: spec.pattern.source.slice(0, 60),
                snippet: match[0].trim(),
                value,
                accepted: false,
                rejectionReason: "validation_failed",
            });
            continue;
        }
        trace === null || trace === void 0 ? void 0 : trace.matches.push({
            pattern: spec.pattern.source.slice(0, 60),
            snippet: match[0].trim(),
            value,
            accepted: true,
        });
        return {
            value,
            snippet: match[0].trim(),
            confidence: loose ? Math.max(0.45, spec.confidence - inpi_extraction_debug_1.LOOSE_CONFIDENCE_PENALTY) : spec.confidence,
            pattern: spec.pattern.source.slice(0, 60),
            loose,
        };
    }
    return null;
}
function digitsOnly(value) {
    return value.replace(/\D/g, "");
}
function isLowConfidence(confidence) {
    return confidence < confidence_score_1.CONFIDENCE_THRESHOLDS.review;
}
function normalizeFrenchPhone(raw) {
    const digits = digitsOnly(raw);
    if (digits.startsWith("33") && digits.length >= 11) {
        return `0${digits.slice(2, 11)}`;
    }
    return digits.slice(0, 10);
}
function normalizeSiren(raw) {
    return digitsOnly(raw).slice(0, 9);
}
function normalizeSiret(raw) {
    return digitsOnly(raw).slice(0, 14);
}
function isValidSiren(value) {
    return /^\d{9}$/.test(value);
}
function isValidSiret(value) {
    return /^\d{14}$/.test(value);
}
function isValidCodeApe(value) {
    return /^\d{4}[A-Z]$/.test(value);
}
exports.INPI_LABEL_SPECS = {
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
};
exports.INPI_PATTERN_SPECS = {
    siret: [
        {
            pattern: /\bSIRET\s*:?\s*((?:\d{3}\s*){3}\d{5})\b/i,
            confidence: 0.95,
            normalize: (raw) => normalizeSiret(raw),
            validate: isValidSiret,
        },
        {
            pattern: /\b(\d{3}\s+\d{3}\s+\d{3}\s+\d{5})\b/,
            confidence: 0.9,
            normalize: (raw) => normalizeSiret(raw),
            validate: isValidSiret,
        },
        {
            pattern: /\bSIRET\s*:?\s*(\d{14})\b/i,
            confidence: 0.94,
            normalize: (raw) => normalizeSiret(raw),
            validate: isValidSiret,
        },
        {
            pattern: /\b(\d{14})\b/,
            confidence: 0.68,
            normalize: (raw) => normalizeSiret(raw),
            validate: isValidSiret,
            looseOptional: true,
        },
    ],
    siren: [
        {
            pattern: /\bSIREN\s*:?\s*((?:\d{3}\s*){2}\d{3})\b/i,
            confidence: 0.95,
            normalize: (raw) => normalizeSiren(raw),
            validate: isValidSiren,
        },
        {
            pattern: /\bSIREN\s*:?\s*(\d{9})\b/i,
            confidence: 0.94,
            normalize: (raw) => normalizeSiren(raw),
            validate: isValidSiren,
        },
        {
            pattern: /\b(\d{3}\s+\d{3}\s+\d{3})(?!\s*\d)/,
            confidence: 0.82,
            normalize: (raw) => normalizeSiren(raw),
            validate: isValidSiren,
        },
        {
            pattern: /\b(\d{9})\b/,
            confidence: 0.65,
            normalize: (raw) => normalizeSiren(raw),
            validate: isValidSiren,
            looseOptional: true,
        },
    ],
    codeAPE: [
        {
            pattern: /\b(?:code\s*ape|ape|naf)\s*:?\s*([0-9]{4}\s*[A-Za-z])\b/i,
            confidence: 0.9,
            normalize: (raw) => raw.replace(/\s/g, "").toUpperCase(),
            validate: isValidCodeApe,
        },
        {
            pattern: /\b([0-9]{4}\s*[A-Za-z])\b/,
            confidence: 0.62,
            normalize: (raw) => raw.replace(/\s/g, "").toUpperCase(),
            validate: isValidCodeApe,
            looseOptional: true,
        },
    ],
    email: [
        {
            pattern: /\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i,
            confidence: 0.92,
            normalize: (raw) => raw.toLowerCase(),
        },
    ],
    telephone: [
        {
            pattern: /\b(?:t[ée]l(?:[ée]phone)?|phone|mobile)\s*:?\s*((?:\+33|0)[\d\s.\-]{8,18})\b/i,
            confidence: 0.88,
            normalize: (raw) => normalizeFrenchPhone(raw),
            validate: (v) => v.length >= 10,
        },
        {
            pattern: /\b((?:\+33|0)[\d\s.\-]{9,17})\b/,
            confidence: 0.68,
            normalize: (raw) => normalizeFrenchPhone(raw),
            validate: (v) => v.length === 10 && v.startsWith("0"),
        },
    ],
};
