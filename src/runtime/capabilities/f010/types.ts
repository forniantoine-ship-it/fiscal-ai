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

/**
 * Ancre d'ouverture comptable pour continuer un plan existant
 * sans reconstruire le passé (Lot 2A).
 */
export type DepreciationOpeningAnchor = {
  /** Exercice fiscal pour lequel le cumul d'ouverture s'applique. */
  exerciceFiscal: number;
  /** Cumul comptable attesté en ouverture (≠ stock fiscal 318). */
  cumulComptableOuverture: number;
};

/**
 * Paramètres minimaux d'un plan linéaire exploitables pour la dotation
 * théorique d'un exercice (Lot 2A).
 */
export type DepreciationPlanParameters = {
  /** Date de début d'amortissement (ISO YYYY-MM-DD). */
  dateDebut: string;
  dureeAnnees: number;
  /**
   * Convention de prorata de première année.
   * Lot 2A AUTO : préférer `annuel_plein` (1re annuité entière).
   * `jours` / `mois` restent REVIEW pour la V1 (divergence fuseau connue).
   */
  prorataConvention: "annuel_plein" | "mois" | "jours";
};

/** Une ligne du plan d'amortissement pour un exercice donné (TRF-0012). */
export interface PlanLigne {
  label: string;
  montant: number;
  dureeAnnees: number;
  dotationExercice: number;
  amortissementsCumules: number;
  vnc: number;
  /** Identité durable — obligatoire pour une ligne ancrée (Lot 2A). */
  id?: string;
  propertyId?: string;
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
