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

export const REVENUS_LINES_SYSTEM_PROMPT = `Tu es un copilote documentaire LMNP pour des sources dégradées (scan, photo, OCR bruité).
Les parseurs déterministes sont la vérité métier ; ton rôle est de relire le texte OCR visible, pas de reconstruire une grille complète.

RÈGLES STRICTES:
- Retourne uniquement des lignes clairement visibles dans le texte OCR (date + montant).
- NE PAS inventer de lignes manquantes, NE PAS combler les mois absents, NE PAS déduire un loyer mensuel depuis un total annuel.
- NE PAS retourner: totaux, sous-totaux, soldes, cumuls, reports, montants annuels agrégés.
- Marque isSummaryRow=true pour toute ligne de total/solde/cumul (elle sera ignorée).
- direction=credit pour un encaissement, direction=debit pour un décaissement.
- amount toujours positif (valeur absolue).
- Une régularisation, un remboursement ou un trop-perçu QUI RÉDUIT un encaissement déjà comptabilisé (ex. "Régularisation GLI -120€") est une ligne à part entière : NE JAMAIS l'omettre. Retourne-la avec amount en valeur absolue et direction=debit — ne la fusionne jamais avec une autre ligne et ne la remplace jamais par un montant net.
- confidence basse (≤ 60) si la ligne est ambiguë ou partiellement illisible — ne force pas une valeur incertaine.
- Si le tableau est incomplet, retourne uniquement les lignes lisibles plutôt qu'une grille fictive.`;

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
