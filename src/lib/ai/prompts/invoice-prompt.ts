const MAX_TEXT_LENGTH = 24_000;

export function buildInvoiceExtractionSystemPrompt(): string {
  return `Tu es un assistant spécialisé dans la lecture de factures pour des loueurs en meublé (LMNP) en France.

Ta mission est UNIQUEMENT d'extraire des informations factuelles visibles sur la facture.

Tu dois extraire :
- supplierName : nom du fournisseur ou émetteur de la facture
- invoiceDate : date de la facture au format ISO YYYY-MM-DD si possible
- totalTtc : montant total TTC en nombre (sans symbole €)
- vatAmount : montant total de TVA en nombre (sans symbole €)
- currency : code devise (ex. EUR) si explicitement indiqué
- categoryHint : indication de catégorie de produits/services parmi furniture, works, electronics, kitchen, appliance, other
  - furniture : mobilier (canapé, lit, commode, bibliothèque, table, etc.)
  - works : travaux, rénovation, installation, plomberie, carrelage, main d'oeuvre artisan
  - electronics : télévision, ordinateur, hi-fi, etc.
  - kitchen : équipement cuisine (plan de travail, évier, hotte, etc.)
  - appliance : électroménager (lave-linge, lave-vaisselle, réfrigérateur, etc.)
  - other : uniquement si aucune catégorie ci-dessus ne correspond clairement

Tu dois :
- rester conservateur : utiliser null pour toute valeur absente, illisible ou incertaine
- ne jamais inventer de montants, dates ou noms de fournisseur
- ne jamais estimer ou calculer la TVA si elle n'est pas explicitement indiquée
- ne lire que ce qui est écrit dans le texte fourni

Tu ne dois PAS :
- classifier le type de document
- proposer de traitement fiscal ou comptable
- déterminer une durée d'amortissement
- décider charge vs immobilisation
- inférer des règles LMNP

Réponds UNIQUEMENT en JSON strict conforme au schéma demandé.`;
}

export function buildInvoiceExtractionUserPrompt(params: {
  fileName?: string;
  rawText: string;
}): string {
  const truncated =
    params.rawText.length > MAX_TEXT_LENGTH
      ? `${params.rawText.slice(0, MAX_TEXT_LENGTH)}\n\n[… texte tronqué …]`
      : params.rawText;

  const fileLine = params.fileName ? `Nom du fichier : ${params.fileName}\n\n` : "";

  return `Extrais les informations de cette facture.

${fileLine}Texte extrait :
---
${truncated || "(aucun texte)"}
---

Utilise null pour toute valeur absente ou incertaine.`;
}

/** OpenAI Structured Outputs schema for invoice extraction. */
export const INVOICE_EXTRACTION_JSON_SCHEMA = {
  name: "invoice_extraction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      supplierName: { type: ["string", "null"] },
      invoiceDate: {
        type: ["string", "null"],
        description: "ISO date YYYY-MM-DD when possible.",
      },
      totalTtc: { type: ["number", "null"] },
      vatAmount: { type: ["number", "null"] },
      currency: { type: ["string", "null"] },
      categoryHint: {
        anyOf: [
          {
            type: "string",
            enum: ["furniture", "works", "electronics", "kitchen", "appliance", "other"],
          },
          { type: "null" },
        ],
      },
    },
    required: [
      "supplierName",
      "invoiceDate",
      "totalTtc",
      "vatAmount",
      "currency",
      "categoryHint",
    ],
    additionalProperties: false,
  },
} as const;
