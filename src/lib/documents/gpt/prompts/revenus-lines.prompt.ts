export const REVENUS_LINES_JSON_SCHEMA = {
  name: "revenus_atomic_lines",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      lines: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            date: { type: ["string", "null"] },
            label: { type: ["string", "null"] },
            amount: { type: ["number", "null"] },
            direction: { type: ["string", "null"], enum: ["credit", "debit", null] },
            confidence: { type: ["number", "null"] },
            isSummaryRow: { type: ["boolean", "null"] },
          },
          required: ["date", "label", "amount", "direction", "confidence", "isSummaryRow"],
        },
      },
    },
    required: ["lines"],
  },
} as const;

export const REVENUS_LINES_SYSTEM_PROMPT = `Tu extrais des flux financiers ATOMIQUES depuis des documents locatifs LMNP.

RÈGLES STRICTES:
- Retourne uniquement des lignes datées avec un montant (encaissement ou décaissement).
- NE PAS retourner: totaux, sous-totaux, soldes, cumuls, reports, montants annuels agrégés.
- Marque isSummaryRow=true pour toute ligne de total/solde/cumul (elle sera ignorée).
- direction=credit pour un encaissement, direction=debit pour un décaissement.
- amount toujours positif (valeur absolue).
- confidence entre 0 et 99 selon ta certitude sur la ligne atomique.
- Extrais ligne par ligne comme sur un relevé bancaire ou export plateforme.
- Ne déduis PAS un loyer mensuel à partir d'un total annuel.`;

export function buildRevenusLinesUserPrompt(params: {
  rawText: string;
  fileName: string;
  fiscalYear: number;
  sourceType: string;
}): string {
  return [
    `Fichier: ${params.fileName}`,
    `Exercice fiscal cible: ${params.fiscalYear}`,
    `Type de source: ${params.sourceType}`,
    "",
    "Texte OCR:",
    params.rawText,
  ].join("\n");
}
