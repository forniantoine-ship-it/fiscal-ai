import { round2 } from "./types";

/**
 * SAV-002 — Ordres de grandeur des frais de notaire.
 * Bien ancien : ~7-8 % du prix. Bien neuf (VEFA) : ~2-3 %.
 * Suggestion proposée quand les frais ne sont pas connus (confirmation obligatoire).
 */
export type SuggestFraisInput = {
  prixAcquisition: number;
  natureBien: "ancien" | "neuf";
};

export type SuggestFraisOutput = {
  tauxSuggere: number;
  montantSuggere: number;
  fourchette: { min: number; max: number };
};

const TAUX: Record<"ancien" | "neuf", { suggestion: number; min: number; max: number }> = {
  ancien: { suggestion: 0.075, min: 0.07, max: 0.08 },
  neuf: { suggestion: 0.025, min: 0.02, max: 0.03 },
};

export function suggestFrais(input: SuggestFraisInput): SuggestFraisOutput {
  const taux = TAUX[input.natureBien];
  return {
    tauxSuggere: taux.suggestion,
    montantSuggere: round2(input.prixAcquisition * taux.suggestion),
    fourchette: {
      min: round2(input.prixAcquisition * taux.min),
      max: round2(input.prixAcquisition * taux.max),
    },
  };
}
