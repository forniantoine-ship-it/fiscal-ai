import { DOCUMENT_FAMILIES } from "./document-types";

export function buildExtractionSystemPrompt(): string {
  const families = DOCUMENT_FAMILIES.join(", ");

  return `Tu es un assistant spécialisé dans la lecture de documents administratifs et financiers pour des loueurs en meublé (LMNP) en France.

Ta mission est UNIQUEMENT de comprendre le document et d'en extraire les informations structurées.

Tu dois :
- identifier la famille du document parmi : ${families}
- extraire les informations commerciales importantes (fournisseur, montants, dates, etc.)
- rédiger un résumé clair et factuel en français
- renvoyer null pour toute valeur incertaine ou absente
- attribuer un confidence_score entre 0 et 1 selon ta certitude globale

Tu ne dois PAS :
- proposer de traitement fiscal ou comptable
- générer des écritures comptables
- estimer des durées d'amortissement
- faire des hypothèses juridiques
- inventer des montants ou des dates

Réponds UNIQUEMENT en JSON strict conforme au schéma demandé.`;
}

export function buildExtractionUserPrompt(params: {
  fileName: string;
  rawText: string;
}): string {
  const truncated =
    params.rawText.length > 24_000
      ? `${params.rawText.slice(0, 24_000)}\n\n[… texte tronqué …]`
      : params.rawText;

  return `Analyse ce document LMNP.

Nom du fichier : ${params.fileName}

Texte extrait du PDF :
---
${truncated || "(aucun texte extractible — le document est peut-être scanné ou vide)"}
---

Identifie le type de document, extrais les informations utiles et résume le contenu.
Utilise null pour toute valeur absente ou incertaine.`;
}

/** OpenAI Structured Outputs schema for universal extraction. */
export const UNIVERSAL_EXTRACTION_JSON_SCHEMA = {
  name: "universal_document_extraction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      document_type: {
        type: "string",
        description: "Document family identifier.",
      },
      supplier: { type: ["string", "null"] },
      organization: { type: ["string", "null"] },
      invoice_date: {
        type: ["string", "null"],
        description: "ISO date YYYY-MM-DD when possible.",
      },
      amount_ttc: { type: ["number", "null"] },
      amount_ht: { type: ["number", "null"] },
      vat_amount: { type: ["number", "null"] },
      loan_amount: { type: ["number", "null"] },
      interest_rate: { type: ["number", "null"] },
      monthly_payment: { type: ["number", "null"] },
      property_price: { type: ["number", "null"] },
      notary_fees: { type: ["number", "null"] },
      category: { type: ["string", "null"] },
      summary: { type: ["string", "null"] },
      confidence_score: { type: "number" },
    },
    required: [
      "document_type",
      "supplier",
      "organization",
      "invoice_date",
      "amount_ttc",
      "amount_ht",
      "vat_amount",
      "loan_amount",
      "interest_rate",
      "monthly_payment",
      "property_price",
      "notary_fees",
      "category",
      "summary",
      "confidence_score",
    ],
    additionalProperties: false,
  },
} as const;
