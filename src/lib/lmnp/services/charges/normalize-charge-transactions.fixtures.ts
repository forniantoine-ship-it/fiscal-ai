import type { RawChargeTransaction } from "./normalize-charge-transactions";

export const NORMALIZER_RAW_FIXTURES: {
  id: string;
  raw: RawChargeTransaction[];
  expectedCount: number;
}[] = [
  {
    id: "copro-mixed",
    raw: [
      {
        category: "charges_copro",
        label: "CHARGES COMMUNES GENERALES",
        amount: "245,60",
        sourceDocument: "elorn-t1.pdf",
        lineIndex: 4,
      },
      {
        category: "fonds_travaux",
        label: "FONDS TRAVAUX (ALUR)",
        amount: 89.2,
        sourceDocument: "elorn-t1.pdf",
        lineIndex: 7,
      },
      {
        category: "avance_tresorerie",
        label: "AVANCE DE TRESORERIE",
        amount: "150,00",
        sourceDocument: "elorn-t1.pdf",
      },
    ],
    expectedCount: 3,
  },
  {
    id: "insurance-alias",
    raw: [
      {
        category: "insurance_habitation",
        label: "AXA",
        fournisseur: "AXA",
        montantTTC: "428,50",
        periodeDebut: "01/01/2025",
        periodeFin: "31/12/2025",
        deductible: true,
        sourceDocument: "axa-2025.pdf",
        extractionConfidence: 85,
      },
    ],
    expectedCount: 1,
  },
];

export const NORMALIZER_REJECT_FIXTURES: RawChargeTransaction[] = [
  { category: "unknown_type", amount: 100, sourceDocument: "x.pdf" },
  { category: "charges_copro", amount: "ABC", sourceDocument: "x.pdf" },
  { category: "taxe_fonciere", amount: 200, date: "not-a-date", sourceDocument: "x.pdf" },
];
