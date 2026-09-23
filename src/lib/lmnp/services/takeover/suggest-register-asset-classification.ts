/**
 * Suggestions déterministes de classification depuis le registre.
 *
 * Proposition ≠ vérité fiscale : nature `inferred` côté caller uniquement
 * après confirmation client / explicitAnswer.
 *
 * Priorité :
 * 1. libellé exact = token de CLASSIFICATION_EXACT (même table que Lot 4C.1) ;
 * 2. mots-clés déjà utilisés ailleurs dans le repo (work-group / fiscal-knowledge) ;
 * 3. sinon null (UNKNOWN) — jamais « la plus probable ».
 *
 * Hors scope volontaire :
 * - numéro de compte PCG (non porté sur CandidateHistoricalAsset) ;
 * - LLM ;
 * - table comptable inventée.
 */

import type { CandidateAssetClassification } from "./asset-candidates";

const EXACT: Record<string, CandidateAssetClassification> = {
  terrain: "terrain",
  batiment: "batiment",
  bâtiment: "batiment",
  mobilier: "mobilier",
  travaux: "travaux",
};

/** Motifs déjà présents dans work-group-engine / fiscal-knowledge-rules — pas inventés ici. */
const KEYWORD_RULES: ReadonlyArray<{
  classification: CandidateAssetClassification;
  pattern: RegExp;
}> = [
  { classification: "terrain", pattern: /\bterrains?\b/i },
  {
    classification: "batiment",
    pattern: /\b(batiments?|bâtiments?|immeubles?|constructions?)\b/i,
  },
  {
    classification: "mobilier",
    // Pas de « table » / « bureau » seuls — trop ambigus sur un registre
    // (ex. « Table mobile de sciage » ≠ mobilier LMNP).
    pattern:
      /\b(mobilier|meubles?|canap[eé]s?|lits?|armoires?|commodes?|chaises?|biblioth[eè]ques?)\b/i,
  },
  {
    classification: "travaux",
    pattern: /\b(travaux|r[eé]novations?|r[eé]fections?)\b/i,
  },
];

/**
 * Libellés trop vagues — jamais une suggestion (fail closed).
 * Aligné sur la mission : Travaux/Installation/Matériel/Divers/Agencement
 * restent UNKNOWN sauf match exact du token « travaux ».
 */
const AMBIGUOUS_ONLY = /^(installations?|materiels?|matériels?|divers|agencements?|equipements?|équipements?)$/i;

function normalizeLabel(raw: string): string {
  return raw
    .replace(/\u00a0/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type ClassificationSuggestion = {
  classification: CandidateAssetClassification;
  /** Preuve courte, traçable — jamais un score opaque. */
  proof: "exact_label" | "keyword_label";
  matched: string;
};

/**
 * null = UNKNOWN — le caller doit conserver CLASSIFICATION_REQUIRED.
 */
export function suggestRegisterAssetClassification(
  label: string | undefined | null,
): ClassificationSuggestion | null {
  if (!label || !label.trim()) return null;
  const normalized = normalizeLabel(label);
  if (!normalized) return null;
  if (AMBIGUOUS_ONLY.test(normalized)) return null;

  const exact = EXACT[normalized];
  if (exact) {
    return { classification: exact, proof: "exact_label", matched: normalized };
  }

  const hits: ClassificationSuggestion[] = [];
  for (const rule of KEYWORD_RULES) {
    const m = label.match(rule.pattern) ?? normalized.match(rule.pattern);
    if (m?.[0]) {
      hits.push({
        classification: rule.classification,
        proof: "keyword_label",
        matched: m[0],
      });
    }
  }

  if (hits.length === 0) return null;
  const distinct = new Set(hits.map((h) => h.classification));
  // Contradiction entre mots-clés → UNKNOWN (pas de choix silencieux).
  if (distinct.size > 1) return null;
  return hits[0]!;
}
