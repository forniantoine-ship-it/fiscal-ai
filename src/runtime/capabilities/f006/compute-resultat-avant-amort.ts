import type { AggregatedFiscalData, ResultatAvantAmortissement } from "./types";
import { round2 } from "./types";

export type ComputeResultatAvantAmortInput = AggregatedFiscalData;

/**
 * TRF-0030 — Résultat avant amortissement.
 * résultat_avant_amort = recettes - charges_déductibles - charges_pré_exploitation - perte_exceptionnelle
 */
export function computeResultatAvantAmort(
  input: ComputeResultatAvantAmortInput,
): ResultatAvantAmortissement {
  const resultatAvantAmort = round2(
    input.totalRecettes -
      input.totalChargesDeductibles -
      input.chargesPreExploitation -
      input.perteExceptionnelle,
  );

  return { resultatAvantAmort };
}
