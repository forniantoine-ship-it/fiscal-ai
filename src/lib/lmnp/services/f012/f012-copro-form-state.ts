import type { CoproLigneInput } from "@/runtime";

/**
 * Cycle UX-A — construction des lignes syndic depuis le formulaire.
 * Un appel de fonds pour de gros travaux est enregistré, jamais pré-qualifié
 * comme déductible (`grosTravauxDeductible` reste absent).
 */
export function buildCoproLignesFromAmounts(input: {
  courant: number;
  regularisation: number;
  epargneTravaux: number;
  grosTravaux: number;
}): CoproLigneInput[] {
  const lignes: CoproLigneInput[] = [];
  if (input.courant !== 0) {
    lignes.push({ type: "provisions", montant: input.courant });
  }
  if (input.regularisation !== 0) {
    lignes.push({ type: "regularisation", montant: input.regularisation });
  }
  if (input.epargneTravaux !== 0) {
    lignes.push({ type: "fonds_travaux", montant: input.epargneTravaux });
  }
  if (input.grosTravaux !== 0) {
    lignes.push({ type: "appel_gros_travaux", montant: input.grosTravaux });
  }
  return lignes;
}
