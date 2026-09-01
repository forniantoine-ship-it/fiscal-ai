/**
 * Deterministic charge document classifier (regex + keyword scoring only).
 * Analyzes OCR text and returns exactly one ChargeDocumentType.
 */

export type ChargeDocumentType =
  | "insurance_habitation"
  | "charges_copropriete"
  | "fonds_travaux"
  | "avance_tresorerie"
  | "taxe_fonciere"
  | "facture_artisan"
  | "facture_energie"
  | "inconnu";

export const CHARGE_DOCUMENT_TYPES: readonly ChargeDocumentType[] = [
  "insurance_habitation",
  "charges_copropriete",
  "fonds_travaux",
  "avance_tresorerie",
  "taxe_fonciere",
  "facture_artisan",
  "facture_energie",
  "inconnu",
] as const;

/** Minimum winning score required (absolute points, not 0–100 ratio). */
export const CHARGE_CLASSIFIER_MIN_CONFIDENCE = 42;

/** Minimum gap between winner and runner-up to avoid ambiguous ties. */
export const CHARGE_CLASSIFIER_MIN_MARGIN = 8;

/** Insurance routing wins before property-tax scoring when at or above this threshold. */
export const INSURANCE_PRIORITY_THRESHOLD = 2;

/** Filename boost when name suggests habitation / PNO insurance. */
export const INSURANCE_FILENAME_BOOST = 5;

/** Lightweight insurance signals — generic fiscal words (taxe, TTC, contribution) are excluded. */
export const INSURANCE_KEYWORDS = [
  "assurance",
  "assureur",
  "habitation",
  "multirisque",
  "pno",
  "prime",
  "cotisation",
  "echeance",
  "contrat",
  "garantie",
  "sinistre",
  "responsabilite civile",
] as const;

/** Highly discriminant property-tax signals only — avoids false positives on insurance PDFs. */
export const PROPERTY_TAX_KEYWORDS = [
  "taxe fonciere",
  "impots.gouv",
  "avis de taxe fonciere",
  "proprietes baties",
  "valeur locative",
  "revenu cadastral",
] as const;

export interface ChargeRoutingScores {
  insuranceScore: number;
  propertyTaxScore: number;
  matchedInsuranceKeywords: string[];
  matchedPropertyTaxKeywords: string[];
  filenameInsuranceBoost: number;
}

export type ChargeClassificationTraceAction = "keyword" | "pattern" | "penalty" | "summary";

export interface ChargeClassificationTrace {
  type: ChargeDocumentType;
  action: ChargeClassificationTraceAction;
  detail: string;
  delta: number;
  runningScore: number;
}

export interface ChargeDocumentScoreBreakdown {
  type: ChargeDocumentType;
  score: number;
  traces: ChargeClassificationTrace[];
}

export interface ChargeDocumentClassificationResult {
  type: ChargeDocumentType;
  confidence: number;
  scores: Record<ChargeDocumentType, number>;
  breakdowns: ChargeDocumentScoreBreakdown[];
  traces: ChargeClassificationTrace[];
  normalizedTextLength: number;
  rejectedReason?: string;
}

type ClassifierRule = {
  keywords: { term: string; weight: number }[];
  patterns: { source: string; regex: RegExp; weight: number }[];
  penalties: { term: string; penalty: number }[];
};

const SCORING_RULES: Record<Exclude<ChargeDocumentType, "inconnu">, ClassifierRule> = {
  insurance_habitation: {
    keywords: [
      { term: "assurance habitation", weight: 22 },
      { term: "assurance logement", weight: 20 },
      { term: "multirisque habitation", weight: 22 },
      { term: "pno", weight: 18 },
      { term: "prime annuelle", weight: 14 },
      { term: "prime", weight: 10 },
      { term: "cotisation", weight: 12 },
      { term: "garantie locative", weight: 16 },
      { term: "garantie", weight: 8 },
      { term: "responsabilite civile", weight: 12 },
      { term: "contrat habitation", weight: 16 },
      { term: "contrat", weight: 8 },
      { term: "assureur", weight: 14 },
      { term: "assurance", weight: 10 },
      { term: "habitation", weight: 10 },
      { term: "multirisque", weight: 12 },
      { term: "echeance", weight: 8 },
      { term: "sinistre", weight: 6 },
    ],
    patterns: [
      { source: "assurance_habitation", regex: /assurance\s+(habitation|logement|pno|multirisque)/i, weight: 28 },
      { source: "prime_assurance", regex: /prime\s+(annuelle|semestrielle).{0,40}assurance/i, weight: 20 },
      { source: "police_assurance", regex: /police\s+d.?assurance/i, weight: 18 },
    ],
    penalties: [
      { term: "syndic", penalty: 18 },
      { term: "copropriete", penalty: 20 },
      { term: "taxe fonciere", penalty: 25 },
      { term: "kwh", penalty: 15 },
    ],
  },
  charges_copropriete: {
    keywords: [
      { term: "charges de copropriete", weight: 24 },
      { term: "copropriete", weight: 18 },
      { term: "syndic", weight: 20 },
      { term: "syndicat", weight: 18 },
      { term: "assemblee generale", weight: 16 },
      { term: "appel de fonds", weight: 22 },
      { term: "budget previsionnel", weight: 18 },
      { term: "charges courantes", weight: 16 },
      { term: "repartition charges", weight: 18 },
    ],
    patterns: [
      { source: "appel_fonds", regex: /appel\s+(de\s+)?fonds/i, weight: 28 },
      { source: "charges_copro", regex: /charges?\s+(de\s+)?coprop/i, weight: 26 },
      { source: "provisions_charges", regex: /provisions?\s+sur\s+charges/i, weight: 20 },
      { source: "lot_copro", regex: /lot\s+n[°o]?\s*\d+.{0,60}coprop/i, weight: 16 },
    ],
    penalties: [
      { term: "taxe fonciere", penalty: 22 },
      { term: "edf", penalty: 14 },
      { term: "assurance habitation", penalty: 16 },
    ],
  },
  fonds_travaux: {
    keywords: [
      { term: "fonds travaux", weight: 26 },
      { term: "fonds de travaux", weight: 28 },
      { term: "provision travaux", weight: 20 },
      { term: "reserve travaux", weight: 18 },
      { term: "alur", weight: 14 },
      { term: "travaux vot", weight: 16 },
    ],
    patterns: [
      { source: "fonds_travaux", regex: /fonds\s+(de\s+)?travaux/i, weight: 32 },
      { source: "ft_divis", regex: /\bft\s+divis/i, weight: 24 },
      { source: "contribution_travaux", regex: /contribution\s+(au\s+)?fonds/i, weight: 22 },
    ],
    penalties: [
      { term: "taxe fonciere", penalty: 20 },
      { term: "electricite", penalty: 12 },
    ],
  },
  avance_tresorerie: {
    keywords: [
      { term: "avance de tresorerie", weight: 28 },
      { term: "avance tresorerie", weight: 26 },
      { term: "avance syndic", weight: 20 },
      { term: "remboursement avance", weight: 18 },
    ],
    patterns: [
      { source: "avance_tresorerie", regex: /avance\s+(de\s+)?tresorerie/i, weight: 34 },
      { source: "at_copro", regex: /\bat\b.{0,30}(copro|syndic)/i, weight: 18 },
      { source: "avance_fonds", regex: /avance\s+.{0,25}fonds/i, weight: 16 },
    ],
    penalties: [
      { term: "taxe fonciere", penalty: 22 },
      { term: "fonds travaux", penalty: 12 },
    ],
  },
  taxe_fonciere: {
    keywords: [
      { term: "taxe fonciere", weight: 30 },
      { term: "avis de taxe fonciere", weight: 32 },
      { term: "proprietes baties", weight: 26 },
      { term: "valeur locative", weight: 24 },
      { term: "revenu cadastral", weight: 24 },
      { term: "dgfip", weight: 22 },
      { term: "direction generale des finances publiques", weight: 24 },
      { term: "fiche de role", weight: 18 },
    ],
    patterns: [
      { source: "taxe_fonciere", regex: /taxe\s+fonci[eè]re/i, weight: 36 },
      { source: "dgfip_ref", regex: /dgfip|finances\s+publiques/i, weight: 24 },
      { source: "impots_gouv", regex: /impots\.gouv/i, weight: 28 },
      { source: "avis_taxe_fonciere", regex: /avis\s+(de\s+)?taxe\s+fonci[eè]re/i, weight: 30 },
    ],
    penalties: [
      { term: "assurance habitation", penalty: 20 },
      { term: "assurance", penalty: 12 },
      { term: "habitation", penalty: 10 },
      { term: "syndic", penalty: 14 },
      { term: "facture n", penalty: 10 },
      { term: "kwh", penalty: 18 },
    ],
  },
  facture_artisan: {
    keywords: [
      { term: "facture", weight: 10 },
      { term: "devis", weight: 14 },
      { term: "travaux", weight: 16 },
      { term: "artisan", weight: 18 },
      { term: "plombier", weight: 16 },
      { term: "electricien", weight: 14 },
      { term: "peintre", weight: 14 },
      { term: "renovation", weight: 14 },
      { term: "entretien", weight: 12 },
      { term: "chantier", weight: 14 },
      { term: "siret", weight: 12 },
      { term: "tva intracommunautaire", weight: 10 },
    ],
    patterns: [
      { source: "facture_num", regex: /facture\s+n[°o]?\s*[\w-]+/i, weight: 22 },
      { source: "devis_num", regex: /devis\s+n[°o]?\s*[\w-]+/i, weight: 20 },
      { source: "travaux_facture", regex: /(travaux|renovation|entretien).{0,80}(facture|montant)/i, weight: 18 },
      { source: "artisan_label", regex: /(plombier|menuisier|macon|couvreur|chauffagiste)/i, weight: 16 },
    ],
    penalties: [
      { term: "syndic", penalty: 20 },
      { term: "copropriete", penalty: 18 },
      { term: "taxe fonciere", penalty: 22 },
      { term: "edf", penalty: 16 },
      { term: "kwh", penalty: 18 },
      { term: "assurance habitation", penalty: 14 },
    ],
  },
  facture_energie: {
    keywords: [
      { term: "edf", weight: 22 },
      { term: "engie", weight: 20 },
      { term: "totalenergies", weight: 18 },
      { term: "gdf", weight: 18 },
      { term: "electricite", weight: 20 },
      { term: "gaz", weight: 14 },
      { term: "kwh", weight: 22 },
      { term: "releve compteur", weight: 18 },
      { term: "abonnement energie", weight: 18 },
      { term: "enedis", weight: 16 },
      { term: "grdf", weight: 16 },
    ],
    patterns: [
      { source: "kwh_unit", regex: /\b\d+[\s,.]?\d*\s*kwh\b/i, weight: 28 },
      { source: "edf_facture", regex: /\bedf\b.{0,40}(facture|releve|consommation)/i, weight: 26 },
      { source: "energie_conso", regex: /consommation\s+(d')?(electricite|gaz|energie)/i, weight: 24 },
      { source: "pdl_pce", regex: /\b(pdl|pce)\s*[:.]?\s*\d+/i, weight: 18 },
    ],
    penalties: [
      { term: "syndic", penalty: 18 },
      { term: "copropriete", penalty: 16 },
      { term: "taxe fonciere", penalty: 22 },
      { term: "assurance habitation", penalty: 14 },
    ],
  },
};

const CLASSIFIABLE_TYPES = Object.keys(SCORING_RULES) as Exclude<ChargeDocumentType, "inconnu">[];

function emptyScores(): Record<ChargeDocumentType, number> {
  return {
    insurance_habitation: 0,
    charges_copropriete: 0,
    fonds_travaux: 0,
    avance_tresorerie: 0,
    taxe_fonciere: 0,
    facture_artisan: 0,
    facture_energie: 0,
    inconnu: 0,
  };
}

/**
 * Normalizes OCR text for stable keyword / regex matching.
 */
export function normalizeChargeDocumentText(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[''`´]/g, "'")
    .replace(/[""«»]/g, " ")
    .replace(/€/g, " eur ")
    .replace(/[_-]+/g, " ")
    .replace(/[\u00a0\t\r]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function keywordMatches(corpus: string, term: string): boolean {
  const normalizedTerm = normalizeChargeDocumentText(term);
  if (!normalizedTerm) return false;
  return corpus.includes(normalizedTerm);
}

function normalizeFileName(fileName: string): string {
  return normalizeChargeDocumentText(fileName);
}

function filenameInsuranceBoost(fileName?: string): number {
  if (!fileName?.trim()) return 0;
  const normalized = normalizeFileName(fileName);
  if (
    normalized.includes("assurance") ||
    normalized.includes("pno") ||
    normalized.includes("habitation")
  ) {
    return INSURANCE_FILENAME_BOOST;
  }
  return 0;
}

/**
 * Lightweight insurance vs property-tax routing scores used before full multi-type scoring.
 */
export function scoreChargeRoutingSignals(
  normalizedText: string,
  fileName?: string,
): ChargeRoutingScores {
  const matchedInsuranceKeywords: string[] = [];
  const matchedPropertyTaxKeywords: string[] = [];

  for (const keyword of INSURANCE_KEYWORDS) {
    if (keywordMatches(normalizedText, keyword)) {
      matchedInsuranceKeywords.push(keyword);
    }
  }

  for (const keyword of PROPERTY_TAX_KEYWORDS) {
    if (keyword === "impots.gouv") {
      if (/impots\.gouv/i.test(normalizedText)) {
        matchedPropertyTaxKeywords.push(keyword);
      }
      continue;
    }
    if (keywordMatches(normalizedText, keyword)) {
      matchedPropertyTaxKeywords.push(keyword);
    }
  }

  const filenameBoost = filenameInsuranceBoost(fileName);
  const insuranceScore = matchedInsuranceKeywords.length + filenameBoost;
  const propertyTaxScore = matchedPropertyTaxKeywords.length;

  return {
    insuranceScore,
    propertyTaxScore,
    matchedInsuranceKeywords,
    matchedPropertyTaxKeywords,
    filenameInsuranceBoost: filenameBoost,
  };
}

function chargeTypeToDebugDocumentType(type: ChargeDocumentType): string {
  if (type === "insurance_habitation") return "insurance_invoice";
  if (type === "taxe_fonciere") return "property_tax";
  return type;
}

function chargeTypeToDebugChargeType(type: ChargeDocumentType): string {
  if (type === "insurance_habitation") return "assurance_pno";
  if (type === "taxe_fonciere") return "taxe_fonciere";
  return type;
}

function logClassifierDebug(
  fileName: string | undefined,
  routing: ChargeRoutingScores,
  finalType: ChargeDocumentType,
  ocrCorpusLength: number,
): void {
  console.log("[classifier-debug]", {
    fileName: fileName ?? null,
    insuranceScore: routing.insuranceScore,
    propertyTaxScore: routing.propertyTaxScore,
    matchedInsuranceKeywords: routing.matchedInsuranceKeywords,
    matchedPropertyTaxKeywords: routing.matchedPropertyTaxKeywords,
    filenameInsuranceBoost: routing.filenameInsuranceBoost,
    finalDocumentType: chargeTypeToDebugDocumentType(finalType),
    finalChargeType: chargeTypeToDebugChargeType(finalType),
    ocrCorpusLength,
  });
}

function buildInsurancePriorityResult(
  routing: ChargeRoutingScores,
  normalizedTextLength: number,
  fileName?: string,
  logTraces = true,
): ChargeDocumentClassificationResult {
  const scores = emptyScores();
  scores.insurance_habitation = Math.max(
    routing.insuranceScore * 10,
    CHARGE_CLASSIFIER_MIN_CONFIDENCE,
  );

  const traces: ChargeClassificationTrace[] = [
    {
      type: "insurance_habitation",
      action: "summary",
      detail: `insurance_priority:${routing.insuranceScore}>=${INSURANCE_PRIORITY_THRESHOLD}`,
      delta: 0,
      runningScore: scores.insurance_habitation,
    },
  ];

  const result: ChargeDocumentClassificationResult = {
    type: "insurance_habitation",
    confidence: Math.min(100, scores.insurance_habitation),
    scores,
    breakdowns: [],
    traces,
    normalizedTextLength,
  };

  if (logTraces) {
    logClassifierDebug(fileName, routing, result.type, normalizedTextLength);
    logClassificationResult(result, fileName);
  }

  return result;
}

/**
 * Scores a single document type against normalized corpus text.
 */
export function scoreChargeDocumentType(
  type: Exclude<ChargeDocumentType, "inconnu">,
  normalizedText: string,
): ChargeDocumentScoreBreakdown {
  const rules = SCORING_RULES[type];
  const traces: ChargeClassificationTrace[] = [];
  let score = 0;

  for (const { term, weight } of rules.keywords) {
    if (keywordMatches(normalizedText, term)) {
      score += weight;
      traces.push({
        type,
        action: "keyword",
        detail: `keyword:"${term}"`,
        delta: weight,
        runningScore: score,
      });
    }
  }

  for (const { source, regex, weight } of rules.patterns) {
    if (regex.test(normalizedText)) {
      score += weight;
      traces.push({
        type,
        action: "pattern",
        detail: `pattern:${source}`,
        delta: weight,
        runningScore: score,
      });
    }
  }

  for (const { term, penalty } of rules.penalties) {
    if (keywordMatches(normalizedText, term)) {
      score = Math.max(0, score - penalty);
      traces.push({
        type,
        action: "penalty",
        detail: `penalty:"${term}"`,
        delta: -penalty,
        runningScore: score,
      });
    }
  }

  traces.push({
    type,
    action: "summary",
    detail: "final_type_score",
    delta: 0,
    runningScore: score,
  });

  return { type, score, traces };
}

function rankScores(
  scores: Record<ChargeDocumentType, number>,
): { winner: ChargeDocumentType; runnerUp: ChargeDocumentType; margin: number } {
  const ranked = CLASSIFIABLE_TYPES.map((type) => ({ type, score: scores[type] }))
    .sort((a, b) => b.score - a.score);

  const winner = ranked[0]?.type ?? "inconnu";
  const runnerUp = ranked[1]?.type ?? "inconnu";
  const margin = (ranked[0]?.score ?? 0) - (ranked[1]?.score ?? 0);

  return { winner, runnerUp, margin };
}

export interface ClassifyChargeDocumentInput {
  rawText: string;
  fileName?: string;
  minConfidence?: number;
  minMargin?: number;
  /** When false, skips console traces (useful in tests). */
  logTraces?: boolean;
}

/**
 * Classifies charge document OCR text into exactly one final type.
 */
export function classifyChargeDocument(
  input: ClassifyChargeDocumentInput | string,
): ChargeDocumentClassificationResult {
  const params: ClassifyChargeDocumentInput =
    typeof input === "string" ? { rawText: input } : input;

  const minConfidence = params.minConfidence ?? CHARGE_CLASSIFIER_MIN_CONFIDENCE;
  const minMargin = params.minMargin ?? CHARGE_CLASSIFIER_MIN_MARGIN;
  const logTraces = params.logTraces ?? true;

  const parts = [params.rawText, params.fileName].filter((value): value is string => Boolean(value?.trim()));
  const normalizedText = normalizeChargeDocumentText(parts.join("\n"));
  const routing = scoreChargeRoutingSignals(normalizedText, params.fileName);

  const scores = emptyScores();
  const breakdowns: ChargeDocumentScoreBreakdown[] = [];
  const traces: ChargeClassificationTrace[] = [];

  if (!normalizedText.length) {
    const result: ChargeDocumentClassificationResult = {
      type: "inconnu",
      confidence: 0,
      scores,
      breakdowns,
      traces: [
        {
          type: "inconnu",
          action: "summary",
          detail: "empty_corpus",
          delta: 0,
          runningScore: 0,
        },
      ],
      normalizedTextLength: 0,
      rejectedReason: "empty_text",
    };
    if (logTraces) {
      logClassifierDebug(params.fileName, routing, result.type, 0);
      logClassificationResult(result, params.fileName);
    }
    return result;
  }

  if (routing.insuranceScore >= INSURANCE_PRIORITY_THRESHOLD) {
    return buildInsurancePriorityResult(
      routing,
      normalizedText.length,
      params.fileName,
      logTraces,
    );
  }

  for (const type of CLASSIFIABLE_TYPES) {
    const breakdown = scoreChargeDocumentType(type, normalizedText);
    breakdowns.push(breakdown);
    scores[type] = breakdown.score;
    traces.push(...breakdown.traces);
  }

  const { winner, runnerUp, margin } = rankScores(scores);
  let finalType: ChargeDocumentType = winner;
  let rejectedReason: string | undefined;
  const winnerScore = scores[winner];

  if (winnerScore < minConfidence) {
    finalType = "inconnu";
    rejectedReason = `below_min_confidence:${winnerScore}<${minConfidence}`;
  } else if (margin < minMargin) {
    finalType = "inconnu";
    rejectedReason = `ambiguous_margin:${margin}<${minMargin}:${winner}_vs_${runnerUp}`;
  }

  const confidence =
    finalType === "inconnu"
      ? Math.min(winnerScore, 100)
      : Math.min(100, Math.round(winnerScore));

  traces.push({
    type: finalType,
    action: "summary",
    detail: rejectedReason ?? `winner:${winner}:margin:${margin}`,
    delta: 0,
    runningScore: winnerScore,
  });

  const result: ChargeDocumentClassificationResult = {
    type: finalType,
    confidence,
    scores,
    breakdowns,
    traces,
    normalizedTextLength: normalizedText.length,
    rejectedReason,
  };

  if (logTraces) {
    logClassifierDebug(params.fileName, routing, result.type, normalizedText.length);
    logClassificationResult(result, params.fileName);
  }

  return result;
}

function logClassificationResult(
  result: ChargeDocumentClassificationResult,
  fileName?: string,
): void {
  const ranked = CLASSIFIABLE_TYPES.map((type) => ({
    type,
    score: result.scores[type],
  })).sort((a, b) => b.score - a.score);

  console.log("[charge-classifier] classification", {
    fileName: fileName ?? null,
    finalType: result.type,
    confidence: result.confidence,
    rejectedReason: result.rejectedReason ?? null,
    normalizedTextLength: result.normalizedTextLength,
  });

  console.log("[charge-classifier] score_ranking", ranked);

  console.log(
    "[charge-classifier] decision_traces",
    result.traces.filter((trace) => trace.action !== "summary" || trace.type === result.type),
  );
}
