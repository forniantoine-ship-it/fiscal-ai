/**
 * Classification registre — suggestions libellé + collapse d'équivalence fiscale.
 *
 * Proposition ≠ vérité fiscale.
 *
 * Priorité :
 * 1. collapse d'équivalence fiscale (batiment/mobilier/autre → même Opening
 *    `composant`) lorsqu'un compte documentaire le justifie SANS changer
 *    amortissable ↔ non-amortissable ;
 * 2. libellé exact = token CLASSIFICATION_EXACT ;
 * 3. mots-clés déjà utilisés ailleurs dans le repo ;
 * 4. sinon null (UNKNOWN) — jamais « la plus probable ».
 *
 * Ce module ne prétend PAS connaître une classification comptable précise
 * depuis le PCG. Il évite seulement de demander au client une distinction
 * sans effet fiscal dans le modèle Opening actuel.
 *
 * Hors scope volontaire :
 * - LLM ;
 * - table PCG → catégorie précise (211=terrain, 213=bâtiment, etc.) ;
 * - bascule silencieuse amortissable ↔ non-amortissable via un compte.
 */

import type {
  CandidateAssetClassification,
  CandidateHistoricalAsset,
} from "./asset-candidates";
import {
  isCandidatePresent,
  presentCandidate,
} from "./candidate-value";

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

/**
 * Préfixes PCG pour lesquels la seule distinction candidate serait
 * batiment | mobilier | autre — tous mappent vers Opening `composant`
 * avec la même sémantique de plan amortissable (map-accepted-to-opening).
 *
 * Jamais 211* (terrain / amortissabilité ambiguë).
 * Jamais d'auto `travaux` (Opening category distincte).
 */
const COMPOSANT_EQUIVALENT_ACCOUNT_PREFIXES = [
  "213",
  "214",
  "215",
  "2182",
  "2183",
  "2184",
] as const;

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
  proof: "exact_label" | "keyword_label" | "fiscal_equivalence_collapse";
  matched: string;
};

/**
 * Extrait un numéro de compte PCG depuis un libellé de section documentaire.
 * Fail-closed : pas de scraping sur un libellé d'immobilisation quelconque
 * (évite les faux positifs type « EE-286-XG »).
 */
export function parsePcgAccountCode(raw: string | undefined | null): string | null {
  if (!raw || !raw.trim()) return null;
  const normalized = raw.replace(/\u00a0/g, " ").trim();
  const compte = /compte\s*[:=]?\s*(\d{3,8})\b/i.exec(normalized);
  if (compte?.[1]) return compte[1];
  const onlyDigits = /^\s*(\d{6,8})\s*(?:[-–—].*)?$/u.exec(normalized);
  if (onlyDigits?.[1]) return onlyDigits[1];
  return null;
}

export function normalizePcgAccountDigits(
  accountCode: string | undefined | null,
): string | null {
  if (!accountCode) return null;
  const digits = accountCode.replace(/\D/g, "");
  return digits.length >= 3 ? digits : null;
}

export function hasStrongTerrainSignal(label: string | undefined | null): boolean {
  if (!label || !label.trim()) return false;
  return /\bterrains?\b/i.test(label) || /\bterrain\b/i.test(normalizeLabel(label));
}

export function hasStrongTravauxSignal(label: string | undefined | null): boolean {
  if (!label || !label.trim()) return false;
  return /\b(travaux|r[eé]novations?|r[eé]fections?)\b/i.test(label);
}

/** Signal bâti / mixte — empêche toute auto-classification sur 211*. */
export function hasStrongBuildingOrMixedSignal(
  label: string | undefined | null,
): boolean {
  if (!label || !label.trim()) return false;
  return /\b(maison|bati|bâti|batiments?|bâtiments?|immeubles?|constructions?|appartements?|logements?)\b/i.test(
    label,
  );
}

export function isComposantEquivalentAccount(
  accountCode: string | undefined | null,
): boolean {
  const digits = normalizePcgAccountDigits(accountCode);
  if (!digits) return false;
  return COMPOSANT_EQUIVALENT_ACCOUNT_PREFIXES.some((prefix) =>
    digits.startsWith(prefix),
  );
}

/**
 * Collapse d'équivalence fiscale externe uniquement.
 *
 * Si le compte documentaire place l'actif dans une famille où les seules
 * distinctions candidates (batiment / mobilier / autre) ont le même effet
 * Opening (`composant` + plan amortissable identique), on peut poser
 * `autre` neutre sans question client.
 *
 * Fail closed si :
 * - compte 211* / inconnu / trop court ;
 * - signal terrain fort (amortissabilité ambiguë) ;
 * - signal travaux fort (catégorie Opening distincte) ;
 * - aucune preuve documentaire de compte.
 *
 * Ne définit JAMAIS terrain ni nonAmortizable.
 */
export function tryFiscallyEquivalentAmortizableCollapse(params: {
  accountCode?: string | null;
  label?: string | null;
}): ClassificationSuggestion | null {
  const digits = normalizePcgAccountDigits(params.accountCode);
  if (!digits) return null;
  if (digits.startsWith("211")) return null;
  if (!isComposantEquivalentAccount(digits)) return null;

  if (hasStrongTerrainSignal(params.label)) return null;
  if (hasStrongTravauxSignal(params.label)) return null;

  return {
    classification: "autre",
    proof: "fiscal_equivalence_collapse",
    matched: digits,
  };
}

/**
 * Alias d'entrée compte — ne retourne jamais terrain / batiment / mobilier
 * depuis un compte seul. Uniquement collapse neutre `autre` si éligible.
 */
export function suggestClassificationFromPcgAccount(
  accountCode: string | undefined | null,
  label?: string | null,
): ClassificationSuggestion | null {
  return tryFiscallyEquivalentAmortizableCollapse({ accountCode, label });
}

/**
 * null = UNKNOWN — le caller doit conserver CLASSIFICATION_REQUIRED.
 */
export function suggestRegisterAssetClassification(
  label: string | undefined | null,
  pcgAccountCode?: string | undefined | null,
): ClassificationSuggestion | null {
  const collapsed = tryFiscallyEquivalentAmortizableCollapse({
    accountCode: pcgAccountCode,
    label,
  });
  if (collapsed) return collapsed;

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

/**
 * Applique le collapse d'équivalence fiscale (autre neutre) sans question
 * client. Ne change jamais amortissable ↔ non-amortissable.
 * Les cas ambigus / contradictoires restent missing (fail closed).
 */
export function applyDeterministicDocumentaryClassifications(
  assets: readonly CandidateHistoricalAsset[],
): CandidateHistoricalAsset[] {
  return assets.map((asset) => {
    if (isCandidatePresent(asset.classification)) return asset;

    const accountCode =
      asset.pcgAccountCode && isCandidatePresent(asset.pcgAccountCode)
        ? asset.pcgAccountCode.value
        : undefined;
    const label = isCandidatePresent(asset.label) ? asset.label.value : undefined;

    const collapse = tryFiscallyEquivalentAmortizableCollapse({
      accountCode,
      label,
    });
    if (!collapse) return asset;

    const provenanceBase =
      asset.pcgAccountCode && isCandidatePresent(asset.pcgAccountCode)
        ? asset.pcgAccountCode.provenance
        : isCandidatePresent(asset.label)
          ? asset.label.provenance
          : undefined;

    if (!provenanceBase) return asset;

    const classification = presentCandidate(collapse.classification, "derived", {
      ...provenanceBase,
      fieldLabel: "fiscal_equivalence_collapse",
      sourceRef: collapse.matched,
    });

    // Jamais de nonAmortizable dérivé d'un compte PCG.
    return { ...asset, classification, nonAmortizable: asset.nonAmortizable };
  });
}

/** Alias sémantique — même fonction, nom produit plus exact. */
export const applyFiscallyEquivalentAmortizableCollapses =
  applyDeterministicDocumentaryClassifications;
