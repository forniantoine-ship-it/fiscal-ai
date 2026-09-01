import type { LogementDocumentIntent } from "@/lib/lmnp/services/logement/logement-document-intent";

const INTENT_OCR_FOCUS: Record<LogementDocumentIntent, string> = {
  acquisition: `
Priorise la lecture de :
- prix de vente / prix principal / somme de … euros
- acquéreur(s), vendeur(s), notaire
- adresse et désignation du bien
- date d'acte / signature
- surface habitable, lots
- frais de notaire`,
  financing: `Priorise : capital emprunté, taux, mensualité, durée, banque.`,
  rental: `Priorise : loyer, locataire, bail, meublé, dates.`,
  fiscal: `Priorise : adresse du bien, montant taxe, année.`,
  charges: `Priorise : prime assurance, assureur, montants annuels.`,
  copro: `Priorise : appels de fonds, lots, montants.`,
  performance: `Priorise : classe énergétique, surface, date diagnostic.`,
  legal: `Priorise : titre, dates, parties.`,
  ownership: `Priorise : propriétaires, références cadastrales.`,
};

export function buildLogementVisionOcrSystemPrompt(intent: LogementDocumentIntent): string {
  return `Tu es un moteur OCR visuel spécialisé documents immobiliers français (notariat, attestations, actes).

## Mission — PHASE 1 OCR uniquement
Lis attentivement chaque image et extrais le texte visible et les paires libellé→valeur.
NE produis PAS encore de schéma canonique — seulement une transcription structurée.

## Document : ${intent}
${INTENT_OCR_FOCUS[intent]}

## Règles
1. Transcris fidèlement le texte visible — même partiellement lisible.
2. Pour chaque libellé repéré (acquéreur, vendeur, prix de vente, etc.), fournis la valeur associée si elle est visible à proximité.
3. Ne laisse PAS value vide si un nom, montant ou adresse est lisible à côté du libellé.
4. Pour les montants : extrais le nombre en euros (approximation acceptable si lisibilité moyenne).
5. Indique confidence high / medium / low selon la lisibilité.
6. rawTextBlocks = paragraphes ou zones de texte continus lus sur la page.

JSON strict uniquement. Pas de markdown.`;
}

export function buildLogementVisionOcrUserPrompt(
  intent: LogementDocumentIntent,
  pageCount: number,
): string {
  return `Lis les ${pageCount} image(s) de ce document (${intent}).
Extrais d'abord tout le texte lisible, les paires clé-valeur et les montants candidats.
Cherche explicitement : prix de vente, acquéreur, vendeur, notaire, adresse du bien, dates, surfaces.
Ne renvoie pas de paires clé-valeur sans value si la valeur est visible sur le document.`;
}
