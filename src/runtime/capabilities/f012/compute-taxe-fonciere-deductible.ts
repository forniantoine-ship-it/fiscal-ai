import { isolatePreExploitationCharge } from "./isolate-pre-exploitation-charge";
import { round2 } from "./types";

/**
 * TRF-0018 — Taxe foncière déductible.
 * Applique le prorata pré-exploitation si date_mise_en_service dans l'exercice.
 */
export type ComputeTaxeFonciereDeductibleInput = {
  montant: number;
  exerciceFiscal: number;
  dateMiseEnService: string;
  teomRecuperee?: number;
};

export type ComputeTaxeFonciereDeductibleOutput = {
  taxeFonciereDeductible: number;
  montantPreExploitation: number;
};

export function computeTaxeFonciereDeductible(
  input: ComputeTaxeFonciereDeductibleInput,
): ComputeTaxeFonciereDeductibleOutput {
  const teom = round2(input.teomRecuperee ?? 0);
  const montantHorsTeom = round2(Math.max(0, input.montant - teom));
  const isolated = isolatePreExploitationCharge({
    montant: montantHorsTeom,
    exerciceFiscal: input.exerciceFiscal,
    dateMiseEnService: input.dateMiseEnService,
  });

  return {
    taxeFonciereDeductible: isolated.montantDeductible,
    montantPreExploitation: isolated.montantPreExploitation,
  };
}
