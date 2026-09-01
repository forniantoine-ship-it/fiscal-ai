import { CREDIT_LOAN_OFFER_FIELD_KEYS } from "@/lib/documents/gpt/schemas/credit-loan-offer.schema";
import { buildCreditTunnelPromptSection } from "@/lib/documents/tunnel-field-ownership";

const MAX_TEXT_LENGTH = 28_000;

export const CREDIT_DOCUMENTARY_METADATA_SYSTEM_PROMPT = `Tu es un assistant fiscal LMNP spécialisé en financement immobilier en France.
Tu extrais UNIQUEMENT des métadonnées documentaires depuis un document de prêt (souvent un tableau d'amortissement multi-pages).

${buildCreditTunnelPromptSection()}

## Périmètre — MÉTADONNÉES DOCUMENTAIRES UNIQUEMENT

Extrais les informations hors tableau d'échéances :
- banque, type de prêt, taux nominal
- différé (total, partiel, franchise)
- frais de dossier, frais de garantie
- montant emprunté, durée, date première échéance si explicites dans l'en-tête

## Interdictions strictes

- NE PAS reconstruire le tableau d'amortissement
- NE PAS inventer d'échéances mensuelles
- NE PAS estimer les intérêts/assurance annuels fiscaux
- NE PAS extrapoler le capital restant dû
- Si une valeur n'est pas explicitement lisible → null

## Où chercher

Les métadonnées sont souvent sur les pages 1–2, avant le tableau :
- en-tête banque / client / montant du prêt
- taux, TAEG, phase de différé
- frais de dossier, frais de garantie, accessoires

## Champs

bankName, loanType, interestRate, deferredLoanType, applicationFees, guaranteeFees,
insuranceMonthlyAmount, loanAmount, loanDurationMonths, firstPaymentDate, monthlyPayment

Si ambigu → null. Réponds UNIQUEMENT en JSON strict conforme au schéma.`;

export const CREDIT_LOAN_OFFER_SYSTEM_PROMPT = `Tu es un assistant fiscal LMNP spécialisé en financement immobilier en France.
Tu analyses une OFFRE DE PRÊT (document complémentaire, non fiscal autoritaire).

${buildCreditTunnelPromptSection()}

## Périmètre — OFFRE DE PRÊT UNIQUEMENT

Ce document complète les métadonnées de financement :
- banque, type de prêt, taux
- différé (total, partiel, franchise)
- frais de dossier, frais de garantie
- détails assurance

## Règle de priorité (critique)

L'offre de prêt NE DOIT PAS estimer les intérêts annuels ni remplacer un tableau d'amortissement.
N'extrais PAS de totaux fiscaux annuels (intérêts/assurance agrégés sur l'année) depuis une offre de prêt.
Si seule une offre est fournie sans échéancier fiable → laisse yearly totals absents (null).

## Champs

bankName : nom du prêteur (pas l'adresse d'agence)
loanType : libellé du prêt (ex. prêt amortissable, prêt travaux)
interestRate : taux nominal en nombre (ex. 3.15 pour 3,15 %)
deferredLoanType : "total" | "partial" | "franchise" | "none" | null
applicationFees : frais de dossier — nombre sans €
guaranteeFees : frais de garantie / caution — nombre sans €
insuranceMonthlyAmount : montant mensuel d'assurance emprunteur si explicite — null si absent
loanAmount, loanDurationMonths, firstPaymentDate, monthlyPayment : seulement si explicitement lisibles

## Fiabilité

Si ambigu → null. N'invente jamais.
Réponds UNIQUEMENT en JSON strict conforme au schéma.`;

export function buildCreditDocumentaryMetadataUserPrompt(params: {
  rawText: string;
  fileName: string;
}): string {
  const truncated =
    params.rawText.length > MAX_TEXT_LENGTH
      ? `${params.rawText.slice(0, MAX_TEXT_LENGTH)}\n\n[… texte tronqué …]`
      : params.rawText;

  return `Extrais les métadonnées documentaires de financement depuis ce document (tableau d'amortissement ou offre).
Fichier : ${params.fileName}
Analyse TOUTES les pages du texte OCR, y compris les pages introductives avant le tableau.
Ne reconstruis PAS les échéances — métadonnées hors tableau uniquement.
Utilise null pour tout champ absent ou incertain.

Texte OCR (document complet) :
---
${truncated || "(aucun texte)"}
---`;
}

export function buildCreditLoanOfferUserPrompt(params: {
  rawText: string;
  fileName: string;
}): string {
  const truncated =
    params.rawText.length > MAX_TEXT_LENGTH
      ? `${params.rawText.slice(0, MAX_TEXT_LENGTH)}\n\n[… texte tronqué …]`
      : params.rawText;

  return `Extrais les métadonnées de financement depuis cette offre de prêt.
Fichier : ${params.fileName}
Ne pas estimer les intérêts annuels fiscaux — métadonnées uniquement.
Utilise null pour tout champ absent ou incertain.

Texte OCR :
---
${truncated || "(aucun texte)"}
---`;
}

export const CREDIT_LOAN_OFFER_JSON_SCHEMA = {
  name: "credit_loan_offer_extraction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      bankName: { type: ["string", "null"] },
      loanType: { type: ["string", "null"] },
      interestRate: { type: ["number", "null"] },
      deferredLoanType: { type: ["string", "null"] },
      applicationFees: { type: ["number", "null"] },
      guaranteeFees: { type: ["number", "null"] },
      insuranceMonthlyAmount: { type: ["number", "null"] },
      loanAmount: { type: ["number", "null"] },
      loanDurationMonths: { type: ["number", "null"] },
      firstPaymentDate: { type: ["string", "null"] },
      monthlyPayment: { type: ["number", "null"] },
    },
    required: [...CREDIT_LOAN_OFFER_FIELD_KEYS],
    additionalProperties: false,
  },
} as const;
