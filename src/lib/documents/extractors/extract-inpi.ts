import {
  CONFIDENCE_THRESHOLDS,
  createConfidenceScore,
  type ConfidenceScore,
} from "../types/confidence-score";
import type { ExtractedField, ExtractionMethod, FieldProvenance } from "../types/extraction-result";
import type { ExtractionResult } from "../types/extraction-result";
import { EXTRACTION_SCHEMA_VERSION, type DocumentExtractor, type ExtractorContext } from "./extractor.types";
import {
  buildFocusFieldMap,
  logExtractInpiOcrInput,
  logExtractionFieldsPayload,
  logSemanticFallbackEntered,
  RUNTIME_OCR_PREVIEW_LENGTH,
  snapshotExtractionFields,
} from "../pipelines/activite-runtime-trace";
import {
  createFieldDebugReport,
  createLabelTrace,
  createPatternTrace,
  logExtractionSummary,
  logFieldDebug,
  logFieldExtractionFailure,
  logFindLabelValueTrace,
  logLooseRecovery,
  logNormalizedOcrPreview,
  logOcrPreview,
  type ExtractionSummary,
  type FieldDebugReport,
} from "./inpi-extraction.debug";
import {
  extractActiviteSemanticFallback,
  extractIsolatedIdentifier,
} from "./inpi-identifier-extraction";
import {
  extractWithPatterns,
  findLabelValue,
  INPI_LABEL_SPECS,
  INPI_PATTERN_SPECS,
  isLowConfidence,
  isValidSiren,
  normalizeOcrText,
  type FindLabelValueResult,
  type PatternExtractionResult,
  type PatternSpec,
} from "./inpi-extraction.helpers";

/** Fields reliably extractable from an INPI / Kbis document */
export type InpiExtractedData = {
  nom?: string;
  prenom?: string;
  siren?: string;
  siret?: string;
  codeAPE?: string;
  activite?: string;
  adresseEtablissement?: string;
  email?: string;
  telephone?: string;
};

export type InpiExtractableField = keyof InpiExtractedData;

export const INPI_EXTRACTOR_ID = "extractor.inpi";

export const INPI_EXTRACTABLE_FIELDS: InpiExtractableField[] = [
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
export const INPI_EXCLUDED_WORKFLOW_FIELDS = [
  "regimeFiscal",
  "dateDebutActivite",
  "adresseLogement",
  "logementAddress",
  "logementCity",
  "logementPostalCode",
  "propertyAddress",
  "propertyCity",
  "propertyPostalCode",
] as const;

const FIELD_LABELS: Record<InpiExtractableField, string> = {
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

const EXCLUDED_REASONS: Record<(typeof INPI_EXCLUDED_WORKFLOW_FIELDS)[number], string> = {
  regimeFiscal: "not reliably present in INPI document — LMNP regime requires user confirmation",
  dateDebutActivite: "not reliably present in INPI document — LMNP start date requires user input",
  adresseLogement: "owned by LOGEMENT tunnel — acte notarié / compromis / taxe foncière",
  logementAddress: "owned by LOGEMENT tunnel — not extractable from INPI",
  logementCity: "owned by LOGEMENT tunnel — not extractable from INPI",
  logementPostalCode: "owned by LOGEMENT tunnel — not extractable from INPI",
  propertyAddress: "owned by LOGEMENT tunnel — not extractable from INPI",
  propertyCity: "owned by LOGEMENT tunnel — not extractable from INPI",
  propertyPostalCode: "owned by LOGEMENT tunnel — not extractable from INPI",
};

type FieldTrace = {
  field: InpiExtractableField;
  status: "extracted" | "not_found" | "low_confidence";
  value?: string;
  confidence?: number;
  snippet?: string;
  extractionMethod?: ExtractionMethod;
  inferred?: boolean;
  reason?: string;
};

function logFieldTrace(trace: FieldTrace): void {
  const { field, status, ...rest } = trace;
  console.log(`[field] ${status}`, { field, ...rest });
}

function makeProvenance(
  field: string,
  confidence: ConfidenceScore,
  extractionMethod: ExtractionMethod,
  inferred: boolean,
): FieldProvenance {
  return {
    field,
    sourceDocument: "inpi",
    confidence,
    extractionMethod,
    inferred,
  };
}

function emitFieldTrace(
  field: InpiExtractableField,
  value: string,
  confidence: number,
  snippet: string,
  extractionMethod: ExtractionMethod,
  inferred: boolean,
): void {
  if (isLowConfidence(confidence)) {
    logFieldTrace({
      field,
      status: "low_confidence",
      value,
      confidence,
      snippet,
      extractionMethod,
      inferred,
      reason: `below threshold ${CONFIDENCE_THRESHOLDS.review}`,
    });
  } else {
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

function buildField(
  key: InpiExtractableField,
  value: string,
  confidence: number,
  snippet: string,
  extractionMethod: ExtractionMethod,
  inferred: boolean,
): ExtractedField {
  emitFieldTrace(key, value, confidence, snippet, extractionMethod, inferred);

  const score = createConfidenceScore(confidence, [
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

function fromLabel(
  field: InpiExtractableField,
  result: FindLabelValueResult,
): ExtractedField {
  return buildField(field, result.value, result.confidence, result.snippet, "regex_label", false);
}

function fromPattern(
  field: InpiExtractableField,
  result: PatternExtractionResult,
): ExtractedField {
  return buildField(field, result.value, result.confidence, result.snippet, "regex_pattern", false);
}

function finalizeFieldDebug(
  report: FieldDebugReport,
  extracted: ExtractedField | null,
  loose = false,
): void {
  if (!extracted) {
    report.finalDecision = "not_found";
    return;
  }

  if (loose) {
    report.finalDecision = "recovered_by_loose_mode";
    return;
  }

  report.finalDecision = isLowConfidence(extracted.confidence.value)
    ? "low_confidence"
    : "extracted";
}

function tryLooseLabel(
  field: InpiExtractableField,
  normalizedText: string,
  spec: (typeof INPI_LABEL_SPECS)[keyof typeof INPI_LABEL_SPECS],
  options: Parameters<typeof findLabelValue>[2],
  report: FieldDebugReport,
): FindLabelValueResult | null {
  const looseTrace = createLabelTrace();
  const result = findLabelValue(normalizedText, spec, {
    ...options,
    mode: "loose",
    fieldName: field,
    trace: looseTrace,
  });

  logFindLabelValueTrace(`${field}:loose`, looseTrace);

  if (result) {
    report.matchedCandidates.push({
      source: "loose",
      labelOrPattern: result.labelMatched,
      snippet: result.snippet,
      value: result.value,
      confidence: result.confidence,
      multiline: result.multiline,
    });
    logLooseRecovery(field, result.value, result.snippet, result.confidence);
  } else {
    report.rejectionReasons.push("loose_mode_label_search_failed");
  }

  return result;
}

function tryLoosePatterns(
  field: InpiExtractableField,
  normalizedText: string,
  specs: PatternSpec[],
  report: FieldDebugReport,
): PatternExtractionResult | null {
  const looseTrace = createPatternTrace();
  const result = extractWithPatterns(normalizedText, specs, {
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
        confidence: result?.confidence,
      });
    } else {
      report.rejectedCandidates.push({
        source: "loose",
        labelOrPattern: m.pattern,
        snippet: m.snippet,
        value: m.value,
      });
      if (m.rejectionReason) report.rejectionReasons.push(`loose:${m.rejectionReason}`);
    }
  }

  if (result) {
    logLooseRecovery(field, result.value, result.snippet, result.confidence);
  } else {
    report.rejectionReasons.push("loose_mode_pattern_search_failed");
  }

  return result;
}

function tryIsolatedIdentifierFallback(
  field: "siren" | "siret",
  normalizedText: string,
  report: FieldDebugReport,
): PatternExtractionResult | null {
  const length = field === "siren" ? 9 : 14;
  const trace = createPatternTrace();
  report.patternsTried.push(`semantic:isolated_${length}`);
  logSemanticFallbackEntered({
    field: field,
    reason: "pattern and loose search failed",
  });
  const isolated = extractIsolatedIdentifier(normalizedText, length, trace);

  for (const m of trace.matches) {
    if (!m.accepted && m.rejectionReason) {
      report.rejectionReasons.push(`isolated_${length}:${m.rejectionReason}`);
    }
  }

  if (!isolated) return null;

  report.matchedCandidates.push({
    source: "pattern",
    labelOrPattern: `isolated_${length}`,
    snippet: isolated.snippet,
    value: isolated.value,
    confidence: isolated.confidence,
  });

  return {
    value: isolated.value,
    snippet: isolated.snippet,
    confidence: isolated.confidence,
    pattern: `isolated_${length}`,
  };
}

function extractPatternField(
  field: "siret" | "siren" | "email" | "telephone" | "codeAPE",
  normalizedText: string,
  data: InpiExtractedData,
  fields: ExtractedField[],
  factors: string[],
  looseRecoveries: InpiExtractableField[],
): void {
  const report = createFieldDebugReport(field);
  const patternSpecs = [...INPI_PATTERN_SPECS[field]];
  report.patternsTried = patternSpecs.map((s) => s.pattern.source.slice(0, 80));

  const trace = createPatternTrace();
  let match = extractWithPatterns(normalizedText, patternSpecs, { trace, mode: "strict" });
  report.patternsTried = trace.patternsTried;

  for (const m of trace.matches) {
    const candidate = {
      source: "pattern" as const,
      labelOrPattern: m.pattern,
      snippet: m.snippet,
      value: m.value,
      confidence: match?.confidence,
    };
    if (m.accepted) report.matchedCandidates.push(candidate);
    else {
      report.rejectedCandidates.push(candidate);
      if (m.rejectionReason) report.rejectionReasons.push(m.rejectionReason);
    }
  }

  let loose = false;
  if (!match) {
    match = tryLoosePatterns(field, normalizedText, patternSpecs, report);
    loose = Boolean(match?.loose);
    if (match?.loose) looseRecoveries.push(field);
  }

  if (!match && (field === "siren" || field === "siret")) {
    match = tryIsolatedIdentifierFallback(field, normalizedText, report);
  }

  if (match) {
    if (field === "telephone" && data.siren && match.value === data.siren) {
      report.rejectionReasons.push("telephone_matches_siren");
      finalizeFieldDebug(report, null);
      logFieldDebug(report);
      return;
    }

    data[field] = match.value as InpiExtractedData[typeof field];
    const extracted = fromPattern(field, match);
    fields.push(extracted);
    factors.push(`${field}:${loose ? "loose_pattern" : "regex_pattern"}`);
    finalizeFieldDebug(report, extracted, loose);
  } else {
    finalizeFieldDebug(report, null);
    logFieldTrace({ field, status: "not_found", reason: "strict and loose pattern search failed" });
  }

  if (report.finalDecision === "not_found") {
    logFocusFieldFailure(report, normalizedText, [field]);
  }

  logFieldDebug(report);
}

function extractLabelField(
  field: "nom" | "prenom" | "activite" | "adresseEtablissement" | "codeAPE",
  normalizedText: string,
  data: InpiExtractedData,
  fields: ExtractedField[],
  factors: string[],
  looseRecoveries: InpiExtractableField[],
  options?: Parameters<typeof findLabelValue>[2],
): void {
  const spec = INPI_LABEL_SPECS[field === "codeAPE" ? "codeAPE" : field];
  const report = createFieldDebugReport(field);
  report.labelSpecsTried = [...spec.labels];

  const trace = createLabelTrace();
  let match = findLabelValue(normalizedText, spec, {
    ...options,
    fieldName: field,
    trace,
    mode: "strict",
  });
  logFindLabelValueTrace(field, trace);

  if (match) {
    report.matchedCandidates.push({
      source: "label",
      labelOrPattern: match.labelMatched,
      snippet: match.snippet,
      value: match.value,
      confidence: match.confidence,
      multiline: match.multiline,
    });
  } else {
    for (const r of trace.rejected) report.rejectionReasons.push(`${r.label}:${r.reason}`);
    for (const b of trace.boundaryFailures) report.rejectionReasons.push(`${b.label}:${b.reason}`);
  }

  let loose = false;
  if (!match) {
    match = tryLooseLabel(field, normalizedText, spec, options, report);
    loose = Boolean(match?.loose);
    if (match?.loose) looseRecoveries.push(field);
  }

  if (!match && field === "activite") {
    logSemanticFallbackEntered({
      field: "activite",
      reason: "label and loose search failed",
    });
    const semantic = extractActiviteSemanticFallback(normalizedText);
    if (semantic) {
      match = {
        value: semantic.value,
        snippet: semantic.snippet,
        labelMatched: "activité principale (semantic)",
        confidence: semantic.confidence,
        multiline: semantic.snippet.includes("\n"),
      };
      report.matchedCandidates.push({
        source: "label",
        labelOrPattern: "semantic:activite_principale",
        snippet: semantic.snippet,
        value: semantic.value,
        confidence: semantic.confidence,
        multiline: match.multiline,
      });
    } else {
      report.rejectionReasons.push("semantic_activite_fallback_failed");
    }
  }

  if (match) {
    let value = match.value;
    if (field === "codeAPE") {
      value = value.replace(/\s/g, "").toUpperCase();
      if (!/^\d{4}[A-Z]$/.test(value)) {
        report.rejectionReasons.push("codeAPE_invalid_format_after_normalization");
        finalizeFieldDebug(report, null);
        logFieldDebug(report);
        logFieldTrace({ field, status: "not_found", reason: "invalid APE format" });
        return;
      }
    }

    data[field] = value;
    const extracted = fromLabel(field, { ...match, value });
    fields.push(extracted);
    factors.push(`${field}:${loose ? "loose_label" : "label"}:${match.labelMatched}`);
    finalizeFieldDebug(report, extracted, loose);
  } else {
    finalizeFieldDebug(report, null);
    logFieldTrace({ field, status: "not_found", reason: "strict and loose label search failed" });
  }

  if (report.finalDecision === "not_found") {
    logFocusFieldFailure(
      report,
      normalizedText,
      spec.labels,
      trace.searchedLabels.length ? [...new Set(trace.searchedLabels)] : spec.labels,
    );
  }

  logFieldDebug(report);
}

function collectNearbyOcrLines(text: string, keywords: string[], radius = 2): string[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const hits = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    const normalized = lines[i].toLowerCase();
    if (keywords.some((k) => normalized.includes(k.toLowerCase()))) {
      for (let j = Math.max(0, i - radius); j <= Math.min(lines.length - 1, i + radius); j++) {
        hits.add(j);
      }
    }
  }

  return [...hits].sort((a, b) => a - b).map((i) => lines[i]);
}

function logFocusFieldFailure(
  report: FieldDebugReport,
  normalizedText: string,
  keywords: string[],
  labelCandidates?: string[],
): void {
  logFieldExtractionFailure(report, {
    nearbyOcrLines: collectNearbyOcrLines(normalizedText, keywords),
    labelCandidates,
  });
}

function logExcludedFields(): void {
  for (const field of INPI_EXCLUDED_WORKFLOW_FIELDS) {
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

function buildExtractionSummary(
  data: InpiExtractedData,
  looseRecoveries: InpiExtractableField[],
): ExtractionSummary {
  const extractedFields = INPI_EXTRACTABLE_FIELDS.filter((f) => Boolean(data[f]));
  const missingFields = INPI_EXTRACTABLE_FIELDS.filter((f) => !data[f]);
  const coveragePercentage = Math.round(
    (extractedFields.length / INPI_EXTRACTABLE_FIELDS.length) * 100,
  );

  return {
    extractedFields,
    missingFields,
    coveragePercentage,
    looseRecoveries,
  };
}

export type ParseInpiResult = {
  data: InpiExtractedData;
  fields: ExtractedField[];
  factors: string[];
  normalizedText: string;
  debugSummary: ExtractionSummary;
};

/**
 * Deterministic INPI parser — exported for fixture tests.
 */
export function parseInpiFromText(rawText: string, options?: { debug?: boolean }): ParseInpiResult {
  const debug = options?.debug ?? true;

  if (debug) {
    logOcrPreview(rawText);
  }

  const normalizedText = normalizeOcrText(rawText);

  if (debug) {
    logNormalizedOcrPreview(normalizedText);
  }

  const data: InpiExtractedData = {};
  const fields: ExtractedField[] = [];
  const factors: string[] = [];
  const looseRecoveries: InpiExtractableField[] = [];

  extractPatternField("siret", normalizedText, data, fields, factors, looseRecoveries);

  {
    const report = createFieldDebugReport("siren");
    report.patternsTried = INPI_PATTERN_SPECS.siren.map((s) => s.pattern.source.slice(0, 80));
    const trace = createPatternTrace();
    let sirenMatch = extractWithPatterns(normalizedText, [...INPI_PATTERN_SPECS.siren], {
      trace,
      mode: "strict",
    });
    report.patternsTried = trace.patternsTried;

    for (const m of trace.matches) {
      const candidate = {
        source: "pattern" as const,
        labelOrPattern: m.pattern,
        snippet: m.snippet,
        value: m.value,
      };
      if (m.accepted) report.matchedCandidates.push(candidate);
      else {
        report.rejectedCandidates.push(candidate);
        if (m.rejectionReason) report.rejectionReasons.push(m.rejectionReason);
      }
    }

    let loose = false;
    if (!sirenMatch) {
      sirenMatch = tryLoosePatterns("siren", normalizedText, [...INPI_PATTERN_SPECS.siren], report);
      loose = Boolean(sirenMatch?.loose);
      if (sirenMatch?.loose) looseRecoveries.push("siren");
    }

    if (!sirenMatch) {
      sirenMatch = tryIsolatedIdentifierFallback("siren", normalizedText, report);
    }

    if (sirenMatch) {
      data.siren = sirenMatch.value;
      const extracted = fromPattern("siren", sirenMatch);
      fields.push(extracted);
      factors.push(`siren:${loose ? "loose_pattern" : "regex_pattern"}`);
      finalizeFieldDebug(report, extracted, loose);
    } else if (data.siret && isValidSiren(data.siret.slice(0, 9))) {
      data.siren = data.siret.slice(0, 9);
      const extracted = buildField(
        "siren",
        data.siren,
        0.76,
        `SIREN dérivé du SIRET ${data.siret}`,
        "derived",
        true,
      );
      fields.push(extracted);
      factors.push("siren:derived_from_siret");
      report.matchedCandidates.push({
        source: "derived",
        snippet: extracted.evidence,
        value: data.siren,
        confidence: 0.76,
      });
      finalizeFieldDebug(report, extracted, false);
    } else {
      finalizeFieldDebug(report, null);
      logFieldTrace({ field: "siren", status: "not_found", reason: "no SIREN or derivable SIRET" });
      logFocusFieldFailure(report, normalizedText, ["siren"]);
    }

    logFieldDebug(report);
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
      const report = createFieldDebugReport("codeAPE");
      report.patternsTried = INPI_PATTERN_SPECS.codeAPE.map((s) => s.pattern.source.slice(0, 80));
      const trace = createPatternTrace();
      let apePattern = extractWithPatterns(normalizedText, [...INPI_PATTERN_SPECS.codeAPE], {
        trace,
        mode: "strict",
      });

      let loose = false;
      if (!apePattern) {
        apePattern = tryLoosePatterns(
          "codeAPE",
          normalizedText,
          [...INPI_PATTERN_SPECS.codeAPE],
          report,
        );
        loose = Boolean(apePattern?.loose);
        if (apePattern?.loose) looseRecoveries.push("codeAPE");
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
      } else {
        finalizeFieldDebug(report, null);
      }
      logFieldDebug(report);
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
    logExtractionSummary(debugSummary);
  }

  return { data, fields, factors, normalizedText, debugSummary };
}

export const extractInpi: DocumentExtractor<InpiExtractedData> = {
  id: INPI_EXTRACTOR_ID,
  documentType: "inpi",
  version: "0.6.0",
  supportedSchemaVersion: EXTRACTION_SCHEMA_VERSION,
  async extract(context: ExtractorContext): Promise<ExtractionResult<InpiExtractedData>> {
    console.log("[extraction] inpi start", {
      documentId: context.documentId,
      fileName: context.fileName,
      textLength: context.rawText.length,
      strategy: "deterministic_document_backed",
      debug: true,
    });

    logExcludedFields();

    const { data, fields, factors, normalizedText, debugSummary } = parseInpiFromText(
      context.rawText,
      { debug: true },
    );

    logExtractInpiOcrInput({
      documentId: context.documentId,
      pipelineRawTextLength: context.rawText.length,
      pipelineRawTextPreview: context.rawText.slice(0, RUNTIME_OCR_PREVIEW_LENGTH),
      extractorNormalizedLength: normalizedText.length,
      extractorNormalizedPreview: normalizedText.slice(0, RUNTIME_OCR_PREVIEW_LENGTH),
      contextualReceivesNormalizedText: true,
    });

    const directFields = fields.filter((f) => !f.provenance?.inferred);
    const fieldConfidences = directFields.map((f) => f.confidence.value);
    const avgConfidence =
      fieldConfidences.length > 0
        ? fieldConfidences.reduce((a, b) => a + b, 0) / fieldConfidences.length
        : 0;

    const hasCoreIdentity = Boolean(data.siren && data.nom && data.prenom);
    const overall = hasCoreIdentity ? Math.max(avgConfidence, 0.55) : Math.min(avgConfidence, 0.5);

    const needsReview =
      overall < CONFIDENCE_THRESHOLDS.review ||
      !hasCoreIdentity ||
      fields.some((f) => f.provenance?.inferred) ||
      fields.some((f) => f.confidence.value < CONFIDENCE_THRESHOLDS.review);

    const result: ExtractionResult<InpiExtractedData> = {
      documentType: "inpi",
      extractorId: INPI_EXTRACTOR_ID,
      fields,
      data,
      confidence: createConfidenceScore(overall, factors),
      needsReview,
      explainability: [
        `file:${context.fileName}`,
        ...factors,
        `coverage:${debugSummary.coveragePercentage}%`,
        debugSummary.looseRecoveries.length
          ? `loose_recoveries:${debugSummary.looseRecoveries.join(",")}`
          : "loose_recoveries:none",
      ],
      schemaVersion: EXTRACTION_SCHEMA_VERSION,
    };

    logExtractionFieldsPayload({
      documentId: context.documentId,
      extractorId: INPI_EXTRACTOR_ID,
      extractorVersion: "0.6.0",
      fields: snapshotExtractionFields(fields),
      data: data as Record<string, unknown>,
      focusFields: buildFocusFieldMap(data as Record<string, unknown>),
    });

    console.log("[extraction] inpi complete", {
      documentId: context.documentId,
      fieldCount: fields.length,
      inferredCount: fields.filter((f) => f.provenance?.inferred).length,
      confidence: overall,
      needsReview,
      coveragePercentage: debugSummary.coveragePercentage,
      missingFields: debugSummary.missingFields,
      looseRecoveries: debugSummary.looseRecoveries,
    });

    return result;
  },
};
