import type { CoproLigneType } from "./types";
import { round2 } from "./types";

/**
 * TRF-0017 — Charges de copropriété déductibles.
 * Le fonds de travaux ALUR est exclu (F-012 — contrainte métier validée).
 */
export type CoproLigneInput = {
  type: CoproLigneType;
  montant: number;
  description?: string;
  /** Pour appel gros travaux : true si qualifié charge (entretien), false si immobilisation. */
  grosTravauxDeductible?: boolean;
};

export type ComputeCoproDeductibleInput = {
  lignes: CoproLigneInput[];
};

export type ComputeCoproDeductibleOutput = {
  coproprieteDeductible: number;
  fondsTravauxNonDeductible: number;
  grosTravauxImmobilisation: number;
  detail: {
    provisions: number;
    regularisation: number;
    grosTravauxCharge: number;
  };
};

export function computeCoproDeductible(
  input: ComputeCoproDeductibleInput,
): ComputeCoproDeductibleOutput {
  let provisions = 0;
  let regularisation = 0;
  let fondsTravauxNonDeductible = 0;
  let grosTravauxCharge = 0;
  let grosTravauxImmobilisation = 0;

  for (const ligne of input.lignes) {
    switch (ligne.type) {
      case "provisions":
        provisions += ligne.montant;
        break;
      case "regularisation":
        regularisation += ligne.montant;
        break;
      case "fonds_travaux":
        fondsTravauxNonDeductible += ligne.montant;
        break;
      case "appel_gros_travaux":
        if (ligne.grosTravauxDeductible === true) {
          grosTravauxCharge += ligne.montant;
        } else if (ligne.grosTravauxDeductible === false) {
          grosTravauxImmobilisation += ligne.montant;
        }
        break;
      default:
        break;
    }
  }

  const coproprieteDeductible = round2(
    provisions + regularisation + grosTravauxCharge,
  );

  return {
    coproprieteDeductible,
    fondsTravauxNonDeductible: round2(fondsTravauxNonDeductible),
    grosTravauxImmobilisation: round2(grosTravauxImmobilisation),
    detail: {
      provisions: round2(provisions),
      regularisation: round2(regularisation),
      grosTravauxCharge: round2(grosTravauxCharge),
    },
  };
}
