/** Canonical fiscal field keys — aligned with docs/DATA-MODEL-LMNP.md */
export type FieldKey =
  | "fiscal.regime"
  | "property.address"
  | "property.label"
  | "income.annualRent"
  | "income.refactoredCharges"
  | "expense.propertyTax"
  | "expense.insurance"
  | "expense.condo"
  | "expense.worksDeductible"
  | "expense.managementFees"
  | "expense.other"
  | "amort.buildingAnnual"
  | "amort.furnitureAnnual"
  | "loan.annualInterest";

export type LedgerDomain = "activity" | "income" | "expense" | "amortization" | "loan";

export const FIELD_REGISTRY: Record<
  FieldKey,
  {
    label: string;
    domain: LedgerDomain;
    tab: "activite" | "recettes" | "depenses" | "immobilisations" | "emprunts";
    requiredForReel: boolean;
    requiredForMicro: boolean;
  }
> = {
  "fiscal.regime": {
    label: "Régime fiscal",
    domain: "activity",
    tab: "activite",
    requiredForReel: true,
    requiredForMicro: true,
  },
  "property.address": {
    label: "Adresse du bien",
    domain: "activity",
    tab: "activite",
    requiredForReel: true,
    requiredForMicro: true,
  },
  "property.label": {
    label: "Nom du bien",
    domain: "activity",
    tab: "activite",
    requiredForReel: false,
    requiredForMicro: false,
  },
  "income.annualRent": {
    label: "Loyers perçus sur l'année",
    domain: "income",
    tab: "recettes",
    requiredForReel: true,
    requiredForMicro: true,
  },
  "income.refactoredCharges": {
    label: "Charges refacturées au locataire",
    domain: "income",
    tab: "recettes",
    requiredForReel: false,
    requiredForMicro: false,
  },
  "expense.propertyTax": {
    label: "Taxe foncière",
    domain: "expense",
    tab: "depenses",
    requiredForReel: true,
    requiredForMicro: false,
  },
  "expense.insurance": {
    label: "Assurance (PNO)",
    domain: "expense",
    tab: "depenses",
    requiredForReel: false,
    requiredForMicro: false,
  },
  "expense.condo": {
    label: "Charges de copropriété",
    domain: "expense",
    tab: "depenses",
    requiredForReel: false,
    requiredForMicro: false,
  },
  "expense.worksDeductible": {
    label: "Travaux et entretien",
    domain: "expense",
    tab: "depenses",
    requiredForReel: false,
    requiredForMicro: false,
  },
  "expense.managementFees": {
    label: "Frais de gestion",
    domain: "expense",
    tab: "depenses",
    requiredForReel: false,
    requiredForMicro: false,
  },
  "expense.other": {
    label: "Autres charges",
    domain: "expense",
    tab: "depenses",
    requiredForReel: false,
    requiredForMicro: false,
  },
  "amort.buildingAnnual": {
    label: "Amortissement du bien (bâti)",
    domain: "amortization",
    tab: "immobilisations",
    requiredForReel: true,
    requiredForMicro: false,
  },
  "amort.furnitureAnnual": {
    label: "Amortissement mobilier",
    domain: "amortization",
    tab: "immobilisations",
    requiredForReel: false,
    requiredForMicro: false,
  },
  "loan.annualInterest": {
    label: "Intérêts d'emprunt",
    domain: "loan",
    tab: "emprunts",
    requiredForReel: false,
    requiredForMicro: false,
  },
};

export function getRequiredFieldKeys(regime: "micro-bic" | "reel"): FieldKey[] {
  return (Object.entries(FIELD_REGISTRY) as [FieldKey, (typeof FIELD_REGISTRY)[FieldKey]][])
    .filter(([, meta]) => (regime === "reel" ? meta.requiredForReel : meta.requiredForMicro))
    .map(([key]) => key);
}
