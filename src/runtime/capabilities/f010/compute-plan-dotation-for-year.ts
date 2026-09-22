import { round2 } from "./types";

/**
 * Dotation théorique d'UN exercice pour un composant linéaire F010
 * (extrait de assemblePlan — Lot 2A).
 *
 * Ne calcule PAS le cumul ; le cumul d'ouverture attesté relève de
 * `continuePlanLine` / ancre, jamais d'une reconstruction du passé.
 */
export type ComputePlanDotationForYearInput = {
  montant: number;
  dureeAnnees: number;
  dotationAnnuelle: number;
  /** Dotation de première année (déjà proratisée si applicable). */
  dotationAnnee1: number;
  premiereAnnee: number;
  exerciceFiscal: number;
};

/**
 * Retourne la dotation normale DN de l'exercice demandé (avant plafonnement
 * par VNC / ancre). Jamais négative ; arrondie au centime.
 */
export function computePlanDotationForYear(
  input: ComputePlanDotationForYearInput,
): number {
  const { montant, dureeAnnees: n, dotationAnnuelle: da, dotationAnnee1: d1 } = input;
  const yearsElapsed = input.exerciceFiscal - input.premiereAnnee;

  let dotationExercice: number;
  if (yearsElapsed < 0) {
    dotationExercice = 0;
  } else if (yearsElapsed === 0) {
    dotationExercice = d1;
  } else if (yearsElapsed <= n - 1) {
    dotationExercice = da;
  } else if (yearsElapsed === n) {
    // Dernière année : complément du prorata initial.
    dotationExercice = round2(montant - (d1 + da * (n - 1)));
  } else {
    dotationExercice = 0;
  }

  return Math.max(0, round2(dotationExercice));
}
