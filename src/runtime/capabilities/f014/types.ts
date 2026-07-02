/**
 * Types de domaine F-014 — alignés sur le Contract Input/Output de F-014 (KS).
 */

export type LignePlan = {
  annee: number;
  dotation: number;
  cumul_amortissements: number;
  valeur_nette_comptable: number;
};

export type ComposantAmortissement = {
  id: string;
  nom_courant: string;
  nom_technique: string;
  base_amortissable: number;
  duree_ans: number;
  dotation_annuelle_pleine: number;
  dotation_exercice: number;
  est_proratisee: boolean;
  ks_artifacts: string[];
  plan_pluriannuel: LignePlan[];
};

export type AmortissementProfil = "PROF-001" | "PROF-002" | "PROF-003";

/** Plan d'amortissement consolidé — input F-014 (Calculation Engine output). */
export type PlanAmortissement = {
  exercice: number;
  premiere_annee: boolean;
  mois_exploitation: number | null;
  total_dotations_exercice: number;
  composants: ComposantAmortissement[];
  nouveaux_elements: ComposantAmortissement[];
  plan_valide_precedemment: boolean;
  annee_validation_initiale: number | null;
};

/** Output Contract — transmis à F-006. */
export type ValidationAmortissements = {
  status: "validated" | "contested";
  exercice: number;
  total_dotations: number;
  validated_at: string;
  plan_version: string;
};

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
