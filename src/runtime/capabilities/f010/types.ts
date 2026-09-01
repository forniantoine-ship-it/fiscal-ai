/**
 * Types de domaine partagés par les capabilities F-010 (Assistant Logement).
 * Alignés sur les Transformations du Knowledge System (TRF-0001 à TRF-0014).
 */

export type TypeBien = "appartement" | "maison" | "autre";

/** Une ligne de la grille de décomposition du bâti (SAV-007 / JUG-004). */
export interface ComposantGrille {
  label: string;
  pourcentage: number;
  dureeAnnees: number;
}

/** Un composant amortissable une fois valorisé (TRF-0009 / TRF-0010). */
export interface ComposantAmorti {
  label: string;
  montant: number;
  dureeAnnees: number;
  dotationAnnuelle: number;
}

/** Une ligne du plan d'amortissement pour un exercice donné (TRF-0012). */
export interface PlanLigne {
  label: string;
  montant: number;
  dureeAnnees: number;
  dotationExercice: number;
  amortissementsCumules: number;
  vnc: number;
}

/** Plan d'amortissement assemblé (TRF-0012). */
export interface AmortissementPlan {
  lignes: PlanLigne[];
  totalAnnuelExercice: number;
  totalBrut: number;
}

/** Arrondi monétaire au centime. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
