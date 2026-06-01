import { CREDIT_AMORTIZATION_FIELD_KEYS } from "@/lib/documents/gpt/schemas/credit-amortization.schema";

/** Safety net only — primary cap is applied in extract-credit-amortization-with-gpt. */
const MAX_TEXT_LENGTH = 8_000;

export const CREDIT_AMORTIZATION_SYSTEM_PROMPT = `Expert LMNP — tableau d'amortissement de prêt immobilier (France).
Extrais en JSON strict : intérêts annuels (yearlyInterestTotal), assurance annuelle (yearlyInsuranceTotal), capital restant dû (remainingPrincipal), mensualité, durée (loanDurationMonths), montant emprunté (loanAmount), échéances (installments).
Règles :
- Année fiscale cible = année de revenus fournie (N-1) : ne sommer que les échéances de cette année civile.
- Chaque échéance : date ISO, totalPayment, principal, interest, insurance (null si absent), fees.
- Ne pas mélanger capital / intérêts / assurance. Pas d'invention. Ambigu → null.`;

export function buildCreditAmortizationUserPrompt(params: {
  rawText: string;
  fileName: string;
  declarationYear: number;
  revenueYear: number;
}): string {
  const body =
    params.rawText.length > MAX_TEXT_LENGTH
      ? `${params.rawText.slice(0, MAX_TEXT_LENGTH)}\n[…]`
      : params.rawText;

  return `Fichier: ${params.fileName} | Déclaration: ${params.declarationYear} | Revenus (cible): ${params.revenueYear}
Extraire totaux ${params.revenueYear} + lignes d'échéances de ${params.revenueYear} + CRD fin ${params.revenueYear}.

OCR (tableau filtré):
---
${body || "(vide)"}
---`;
}

export const CREDIT_AMORTIZATION_JSON_SCHEMA = {
  name: "credit_amortization_extraction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      detectedFiscalYear: {
        type: ["number", "null"],
        description: "Année civile des revenus détectée (ex. 2025 pour déclaration 2026)",
      },
      yearlyInterestTotal: {
        type: ["number", "null"],
        description: "Total intérêts déductibles sur l'année fiscale cible — sans €",
      },
      yearlyInsuranceTotal: {
        type: ["number", "null"],
        description: "Total assurance sur l'année fiscale cible — null si absent",
      },
      remainingPrincipal: {
        type: ["number", "null"],
        description: "Capital restant dû en fin d'année fiscale cible",
      },
      monthlyPayment: {
        type: ["number", "null"],
        description: "Mensualité si explicitement indiquée",
      },
      firstPaymentDate: {
        type: ["string", "null"],
        description: "Date première échéance — ISO YYYY-MM-DD",
      },
      loanDurationMonths: {
        type: ["number", "null"],
        description: "Durée du prêt en mois",
      },
      loanAmount: {
        type: ["number", "null"],
        description: "Capital emprunté initial si explicitement indiqué",
      },
      installments: {
        type: ["array", "null"],
        items: {
          type: "object",
          properties: {
            date: { type: ["string", "null"] },
            totalPayment: { type: ["number", "null"] },
            principal: { type: ["number", "null"] },
            interest: { type: ["number", "null"] },
            insurance: { type: ["number", "null"] },
            fees: { type: ["number", "null"] },
            comment: { type: ["string", "null"] },
          },
          required: ["date", "totalPayment", "principal", "interest", "insurance", "fees", "comment"],
          additionalProperties: false,
        },
      },
    },
    required: [...CREDIT_AMORTIZATION_FIELD_KEYS],
    additionalProperties: false,
  },
} as const;
