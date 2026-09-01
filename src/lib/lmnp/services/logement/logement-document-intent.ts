/**
 * Business purpose of a logement document — distinct from document type.
 * Drives which canonical schema GPT must fill.
 */

export const LOGEMENT_DOCUMENT_INTENTS = [
  "acquisition",
  "financing",
  "rental",
  "fiscal",
  "charges",
  "copro",
  "performance",
  "legal",
  "ownership",
] as const;

export type LogementDocumentIntent = (typeof LOGEMENT_DOCUMENT_INTENTS)[number];

export type LogementIntentResolution = {
  intent: LogementDocumentIntent;
  confidence: "high" | "medium" | "low";
  signals: string[];
};

type IntentSignal = {
  intent: LogementDocumentIntent;
  patterns: RegExp[];
  weight: number;
};

const INTENT_SIGNALS: IntentSignal[] = [
  {
    intent: "acquisition",
    patterns: [
      /\bacte\s+authentique\b/i,
      /\battestation\s+(?:de\s+)?vente\b/i,
      /\bcompromis\b/i,
      /\bpromesse\s+de\s+vente\b/i,
      /\bprix\s+de\s+vente\b/i,
      /\bacqu[eé]reur\b/i,
      /\bvendeur\b/i,
      /\bnotaire\b/i,
      /\bd[eé]signation\s+du\s+bien\b/i,
      /\bladite\s+vente\b/i,
      /\bacte\s+notari[eé]\b/i,
    ],
    weight: 3,
  },
  {
    intent: "financing",
    patterns: [
      /\btableau\s+d['']amortissement\b/i,
      /\boffre\s+de\s+pr[eê]t\b/i,
      /\b[eé]ch[eé]ancier\b/i,
      /\bcr[eé]dit\s+immobilier\b/i,
      /\bhypoth[eè]que\b/i,
      /\bcapital\s+restant\s+du\b/i,
    ],
    weight: 3,
  },
  {
    intent: "rental",
    patterns: [
      /\bbail\b/i,
      /\blocataire\b/i,
      /\blocation\s+meubl[eé]e\b/i,
      /\bloyer\s+mensuel\b/i,
      /\bcontrat\s+de\s+location\b/i,
    ],
    weight: 3,
  },
  {
    intent: "fiscal",
    patterns: [
      /\btaxe\s+fonci[eè]re\b/i,
      /\bavis\s+d['']imposition\b/i,
      /\bdgfip\b/i,
      /\bimp[oô]t\s+foncier\b/i,
    ],
    weight: 3,
  },
  {
    intent: "charges",
    patterns: [
      /\bassurance\s+pno\b/i,
      /\bpropri[eé]taire\s+non\s+occupant\b/i,
      /\bassurance\s+habitation\b/i,
      /\bprime\s+d['']assurance\b/i,
    ],
    weight: 2,
  },
  {
    intent: "copro",
    patterns: [
      /\bappel\s+de\s+fonds\b/i,
      /\bsyndic\b/i,
      /\bcopropri[eé]t[eé]\b/i,
      /\bcharges\s+de\s+copropri[eé]t[eé]\b/i,
    ],
    weight: 2,
  },
  {
    intent: "performance",
    patterns: [
      /\bdpe\b/i,
      /\bdiagnostic\s+de\s+performance\b/i,
      /\bclasse\s+[a-g]\b/i,
      /\bkwh\/m/i,
    ],
    weight: 2,
  },
  {
    intent: "legal",
    patterns: [
      /\br[eè]glement\s+de\s+copropri[eé]t[eé]\b/i,
      /\bpermis\s+de\s+construire\b/i,
      /\bcertificat\s+d['']urbanisme\b/i,
    ],
    weight: 1,
  },
  {
    intent: "ownership",
    patterns: [
      /\btitre\s+de\s+propri[eé]t[eé]\b/i,
      /\bcadastre\b/i,
      /\brelev[eé]\s+de\s+propri[eé]t[eé]\b/i,
    ],
    weight: 1,
  },
];

const FILENAME_SIGNALS: IntentSignal[] = [
  {
    intent: "acquisition",
    patterns: [
      /acte/i,
      /notaire/i,
      /acquisition/i,
      /vente/i,
      /compromis/i,
      /attestation/i,
    ],
    weight: 2,
  },
  {
    intent: "financing",
    patterns: [/amortissement/i, /pret/i, /pr[eê]t/i, /credit/i, /cr[eé]dit/i, /offre/i],
    weight: 2,
  },
  {
    intent: "rental",
    patterns: [/bail/i, /location/i, /loyer/i],
    weight: 2,
  },
  {
    intent: "fiscal",
    patterns: [/taxe[\s_-]?fonci/i, /fonciere/i, /fonci[eè]re/i],
    weight: 2,
  },
  {
    intent: "charges",
    patterns: [/assurance/i, /pno/i],
    weight: 1,
  },
  {
    intent: "copro",
    patterns: [/copro/i, /syndic/i, /appel[\s_-]?fonds/i],
    weight: 1,
  },
  {
    intent: "performance",
    patterns: [/dpe/i, /diagnostic/i],
    weight: 1,
  },
];

function scoreIntents(
  text: string,
  signals: IntentSignal[],
): Map<LogementDocumentIntent, { score: number; matched: string[] }> {
  const scores = new Map<LogementDocumentIntent, { score: number; matched: string[] }>();

  for (const signal of signals) {
    for (const pattern of signal.patterns) {
      if (pattern.test(text)) {
        const current = scores.get(signal.intent) ?? { score: 0, matched: [] };
        current.score += signal.weight;
        current.matched.push(pattern.source);
        scores.set(signal.intent, current);
      }
    }
  }

  return scores;
}

function mergeScores(
  a: Map<LogementDocumentIntent, { score: number; matched: string[] }>,
  b: Map<LogementDocumentIntent, { score: number; matched: string[] }>,
): Map<LogementDocumentIntent, { score: number; matched: string[] }> {
  const merged = new Map(a);
  for (const [intent, entry] of b) {
    const current = merged.get(intent) ?? { score: 0, matched: [] };
    merged.set(intent, {
      score: current.score + entry.score,
      matched: [...current.matched, ...entry.matched],
    });
  }
  return merged;
}

function pickBestIntent(
  scores: Map<LogementDocumentIntent, { score: number; matched: string[] }>,
): LogementIntentResolution {
  let best: LogementDocumentIntent = "acquisition";
  let bestScore = 0;
  let bestSignals: string[] = [];

  for (const [intent, entry] of scores) {
    if (entry.score > bestScore) {
      bestScore = entry.score;
      best = intent;
      bestSignals = entry.matched;
    }
  }

  const confidence: LogementIntentResolution["confidence"] =
    bestScore >= 6 ? "high" : bestScore >= 3 ? "medium" : "low";

  return { intent: best, confidence, signals: bestSignals };
}

/**
 * Resolve the business intent of a logement document from filename and OCR text.
 * Defaults to acquisition — the primary logement tunnel use case.
 */
export function resolveLogementDocumentIntent(params: {
  fileName: string;
  rawText?: string;
}): LogementIntentResolution {
  const fileScores = scoreIntents(params.fileName, FILENAME_SIGNALS);
  const textScores = params.rawText
    ? scoreIntents(params.rawText.slice(0, 12_000), INTENT_SIGNALS)
    : new Map();
  const merged = mergeScores(fileScores, textScores);
  const resolution = pickBestIntent(merged);

  console.log("[logement-intent-resolution]", {
    fileName: params.fileName,
    ...resolution,
  });

  return resolution;
}

export function isLogementDocumentIntent(value: unknown): value is LogementDocumentIntent {
  return (
    typeof value === "string" &&
    (LOGEMENT_DOCUMENT_INTENTS as readonly string[]).includes(value)
  );
}
