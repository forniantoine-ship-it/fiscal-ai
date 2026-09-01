/**
 * OCR fixtures for copropriété / syndic parser tests (Elorn Immobilier style).
 */

import type { CoproParsedTransaction } from "./parse-copropriete-document";

export type CoproOcrFixture = {
  id: string;
  description: string;
  sourceDocument: string;
  rawText: string;
  expected: CoproParsedTransaction[];
};

export const COPRO_OCR_FIXTURES: CoproOcrFixture[] = [
  {
    id: "elorn-appel-fonds-trimestriel",
    description: "Elorn-style appel de fonds with mixed line items and total to ignore",
    sourceDocument: "elorn-appel-2025-t1.pdf",
    rawText: `
      ELORN IMMOBILIER
      Syndic professionnel — Appel de fonds N° 2025-T1
      Copropriété LES JARDINS DE LORIENT
      Lot n° 12 — Tantièmes 45/1000

      CHARGES COMMUNES GENERALES          245,60 €
      CHARGES BATIMENT                    128,40
      CHARGES ESCALIER                     42,00
      FONDS TRAVAUX (ALUR)                 89,20
      AVANCE DE TRESORERIE                150,00

      TOTAL APPEL DE FONDS                655,20
      SOUS-TOTAL CHARGES                  416,00
    `,
    expected: [
      {
        category: "charges_copro",
        label: "CHARGES COMMUNES GENERALES",
        amount: 245.6,
        deductible: true,
        amortizable: false,
        sourceDocument: "elorn-appel-2025-t1.pdf",
      },
      {
        category: "charges_copro",
        label: "CHARGES BATIMENT",
        amount: 128.4,
        deductible: true,
        amortizable: false,
        sourceDocument: "elorn-appel-2025-t1.pdf",
      },
      {
        category: "charges_copro",
        label: "CHARGES ESCALIER",
        amount: 42,
        deductible: true,
        amortizable: false,
        sourceDocument: "elorn-appel-2025-t1.pdf",
      },
      {
        category: "fonds_travaux",
        label: "FONDS TRAVAUX (ALUR)",
        amount: 89.2,
        deductible: false,
        amortizable: false,
        sourceDocument: "elorn-appel-2025-t1.pdf",
      },
      {
        category: "avance_tresorerie",
        label: "AVANCE DE TRESORERIE",
        amount: 150,
        deductible: false,
        amortizable: false,
        sourceDocument: "elorn-appel-2025-t1.pdf",
      },
    ],
  },
  {
    id: "syndic-split-lines",
    description: "Label and amount on separate lines",
    sourceDocument: "syndic-repartition-2024.pdf",
    rawText: `
      SYNDIC ABC
      Répartition annuelle

      CHARGES GENERALES LOT 8
      312,75 €

      FONDS DE TRAVAUX
      67,50

      AVANCE TRESORERIE SYNDIC
      200,00
    `,
    expected: [
      {
        category: "charges_copro",
        label: "CHARGES GENERALES LOT 8",
        amount: 312.75,
        deductible: true,
        amortizable: false,
        sourceDocument: "syndic-repartition-2024.pdf",
      },
      {
        category: "fonds_travaux",
        label: "FONDS DE TRAVAUX",
        amount: 67.5,
        deductible: false,
        amortizable: false,
        sourceDocument: "syndic-repartition-2024.pdf",
      },
      {
        category: "avance_tresorerie",
        label: "AVANCE TRESORERIE SYNDIC",
        amount: 200,
        deductible: false,
        amortizable: false,
        sourceDocument: "syndic-repartition-2024.pdf",
      },
    ],
  },
];

export const COPRO_OCR_SKIP_FIXTURES: {
  id: string;
  rawText: string;
  sourceDocument: string;
}[] = [
  {
    id: "totals-only",
    sourceDocument: "empty-totals.pdf",
    rawText: `
      TOTAL APPEL DE FONDS 1 200,00
      SOUS-TOTAL CHARGES 900,00
      MONTANT TOTAL 1 200,00
    `,
  },
];
