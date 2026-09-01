/**
 * LMNP Business Engine — Layer 0: Document Page Segmentation
 *
 * Classifies individual pages within a PDF before extraction.
 * Only "invoice-like" pages should feed accounting extraction.
 *
 * This layer stops the engine from treating entire PDFs as accounting truth.
 * A notary deed may contain: 10 pages irrelevant + 2 pages of accounting facts.
 * A renovation quote may contain: 3 pages CGV + 1 page invoice summary.
 *
 * Classification is keyword-based (no ML) for V1 — fast and explainable.
 */

import type { PageClassification, PageType } from "./business-engine.types";

// ---------------------------------------------------------------------------
// Keyword sets per page type
// ---------------------------------------------------------------------------

const INVOICE_SIGNALS = [
  "facture", "invoice", "bon de commande", "acompte", "solde", "reste à payer",
  "total ttc", "total ht", "montant ttc", "montant ht", "tva", "sous-total",
  "règlement", "échéance de paiement", "date de facture", "n° facture",
  "numéro de facture", "référence facture", "fournisseur", "client", "siret",
  "iban", "virement", "chèque", "mode de règlement",
];

const DEVIS_SIGNALS = [
  "devis", "offre commerciale", "proposition commerciale", "offre de prix",
  "sous réserve", "validité de l'offre", "bon pour accord", "à retourner signé",
  "offre valable", "devis n°", "référence devis",
];

const DPE_SIGNALS = [
  "diagnostic de performance énergétique", "dpe", "classe énergétique",
  "consommation énergétique", "émissions de gaz", "étiquette énergie",
  "kwh/m²", "kg co2", "bilan thermique", "certificat énergétique",
  "réglementation thermique", "rt 2012",
];

const PLAN_SIGNALS = [
  "plan de masse", "plan du rez-de-chaussée", "plan d'étage", "coupe",
  "élévation", "plan architecte", "plans", "permis de construire",
  "déclaration préalable", "surface utile", "surface habitable", "m² habitable",
  "nord", "légende", "échelle", "plan technique",
];

const CGV_SIGNALS = [
  "conditions générales de vente", "cgv", "conditions générales",
  "clause", "litige", "compétence juridictionnelle", "droit applicable",
  "force majeure", "responsabilité", "garantie légale", "rétractation",
  "propriété intellectuelle", "résiliation",
];

const MARKETING_SIGNALS = [
  "nos engagements", "pourquoi nous choisir", "notre savoir-faire",
  "certification qualibat", "récompenses", "témoignages clients",
  "nos réalisations", "galerie photos", "catalogue", "gamme de produits",
  "showroom", "nos partenaires", "a propos de nous",
];

const ADMINISTRATIVE_SIGNALS = [
  "attestation", "certificat de conformité", "procès-verbal",
  "rapport d'expertise", "attestation d'assurance", "décennale",
  "autorisation de travaux", "arrêté municipal", "extrait kbis",
];

const ANNEXE_SIGNALS = [
  "annexe", "pièce jointe", "document joint", "conditions particulières",
  "cahier des charges", "descriptif technique", "spécifications",
  "tableau récapitulatif des prestations", "planning d'intervention",
];

// ---------------------------------------------------------------------------
// Signal scorer
// ---------------------------------------------------------------------------

interface SignalScore {
  pageType: PageType;
  score: number;
  matchedSignals: string[];
}

function scoreAgainst(text: string, signals: string[]): { score: number; matched: string[] } {
  const lower = text.toLowerCase();
  const matched: string[] = [];
  for (const signal of signals) {
    if (lower.includes(signal)) {
      matched.push(signal);
    }
  }
  return { score: matched.length, matched };
}

/**
 * Detects additional invoice structural patterns:
 * - Lines with amount patterns (e.g. "1 234,56 €" or "1234.56")
 * - SIRET pattern
 * - TVA rate pattern
 */
function detectInvoiceStructures(text: string): string[] {
  const found: string[] = [];
  const lower = text.toLowerCase();

  // Currency amounts
  if (/\d[\d\s]*[.,]\d{2}\s*€/.test(text)) found.push("montant en euros");
  // SIRET
  if (/siret\s*:?\s*\d{14}/.test(lower)) found.push("numéro SIRET");
  // TVA rate
  if (/tva\s*:?\s*\d{1,2}[,.]\d?\s*%/.test(lower)) found.push("taux TVA");
  // Invoice date pattern
  if (/\b(0?[1-9]|[12]\d|3[01])[/.\-](0?[1-9]|1[0-2])[/.\-](20\d{2})\b/.test(text)) {
    found.push("date au format JJ/MM/AAAA");
  }
  // IBAN
  if (/\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}\b/.test(text)) {
    found.push("IBAN bancaire");
  }

  return found;
}

// ---------------------------------------------------------------------------
// Main classifier
// ---------------------------------------------------------------------------

/**
 * Classifies a single page's text content into a PageType.
 * Returns a PageClassification with confidence and matched signals.
 */
export function classifyPageText(text: string, pageIndex: number): PageClassification {
  const structuralInvoiceSignals = detectInvoiceStructures(text);

  const candidates: SignalScore[] = [
    {
      pageType: "invoice",
      ...(() => {
        const { score, matched } = scoreAgainst(text, INVOICE_SIGNALS);
        return {
          score: score + structuralInvoiceSignals.length * 2, // Structural signals weight double
          matchedSignals: [...matched, ...structuralInvoiceSignals],
        };
      })(),
    },
    {
      pageType: "devis",
      ...(() => {
        const { score, matched } = scoreAgainst(text, DEVIS_SIGNALS);
        return { score, matchedSignals: matched };
      })(),
    },
    {
      pageType: "dpe",
      ...(() => {
        const { score, matched } = scoreAgainst(text, DPE_SIGNALS);
        return { score, matchedSignals: matched };
      })(),
    },
    {
      pageType: "plan",
      ...(() => {
        const { score, matched } = scoreAgainst(text, PLAN_SIGNALS);
        return { score, matchedSignals: matched };
      })(),
    },
    {
      pageType: "cgv",
      ...(() => {
        const { score, matched } = scoreAgainst(text, CGV_SIGNALS);
        return { score, matchedSignals: matched };
      })(),
    },
    {
      pageType: "marketing",
      ...(() => {
        const { score, matched } = scoreAgainst(text, MARKETING_SIGNALS);
        return { score, matchedSignals: matched };
      })(),
    },
    {
      pageType: "administrative",
      ...(() => {
        const { score, matched } = scoreAgainst(text, ADMINISTRATIVE_SIGNALS);
        return { score, matchedSignals: matched };
      })(),
    },
    {
      pageType: "annexe",
      ...(() => {
        const { score, matched } = scoreAgainst(text, ANNEXE_SIGNALS);
        return { score, matchedSignals: matched };
      })(),
    },
  ];

  // Sort descending by score
  candidates.sort((a, b) => b.score - a.score);

  const winner = candidates[0];
  const totalSignals = candidates.reduce((sum, c) => sum + c.score, 0);

  // If no signals at all — unknown
  if (winner.score === 0) {
    return {
      pageIndex,
      pageType: "unknown",
      confidence: 0,
      signals: [],
      isAccountingRelevant: false,
    };
  }

  // Confidence = winner score share of total signal mass
  const runnerUp = candidates[1]?.score ?? 0;
  const margin = winner.score - runnerUp;
  const confidence = Math.min(
    0.99,
    Math.max(0.1, (margin + 1) / (winner.score + 2)),
  );

  return {
    pageIndex,
    pageType: winner.pageType,
    confidence: Math.round(confidence * 100) / 100,
    signals: winner.matchedSignals,
    isAccountingRelevant: winner.pageType === "invoice" || winner.pageType === "devis",
  };
}

/**
 * Classifies all pages of a document given an array of page texts.
 * Returns classifications in page order.
 */
export function classifyDocumentPages(pageTexts: string[]): PageClassification[] {
  return pageTexts.map((text, index) => classifyPageText(text, index));
}

/**
 * Filters page classifications to only accounting-relevant pages.
 * These are the pages that should be fed into the extraction pipeline.
 */
export function filterAccountingPages(
  classifications: PageClassification[],
): PageClassification[] {
  return classifications.filter((p) => p.isAccountingRelevant);
}

/**
 * Returns the indices of pages that should be excluded from extraction.
 * Used to tell the OCR engine which pages to skip.
 */
export function getExcludedPageIndices(classifications: PageClassification[]): number[] {
  return classifications
    .filter((p) => !p.isAccountingRelevant)
    .map((p) => p.pageIndex);
}

/**
 * Returns a human-readable summary of the page classification results.
 * Shown in the document preview UI so users understand what was retained.
 */
export function buildPageClassificationSummary(
  classifications: PageClassification[],
): string {
  const total = classifications.length;
  const relevant = classifications.filter((p) => p.isAccountingRelevant).length;
  const excluded = total - relevant;

  if (total === 0) return "Aucune page analysée.";
  if (excluded === 0) return `${total} page${total > 1 ? "s" : ""} analysée${total > 1 ? "s" : ""} — toutes pertinentes.`;

  const excludedTypes = classifications
    .filter((p) => !p.isAccountingRelevant)
    .map((p) => getPageTypeLabelFr(p.pageType))
    .filter((v, i, arr) => arr.indexOf(v) === i);

  return (
    `${total} pages analysées — ${relevant} retenue${relevant > 1 ? "s" : ""} pour l'extraction, ` +
    `${excluded} ignorée${excluded > 1 ? "s" : ""} (${excludedTypes.join(", ")}).`
  );
}

// ---------------------------------------------------------------------------
// Page type labels
// ---------------------------------------------------------------------------

const PAGE_TYPE_LABELS_FR: Record<PageType, string> = {
  invoice: "Facture",
  devis: "Devis",
  annexe: "Annexe",
  plan: "Plan",
  dpe: "DPE",
  marketing: "Page commerciale",
  cgv: "CGV",
  administrative: "Document administratif",
  unknown: "Page inconnue",
};

export function getPageTypeLabelFr(type: PageType): string {
  return PAGE_TYPE_LABELS_FR[type] ?? type;
}
