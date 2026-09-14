/**
 * Types de domaine partagés par les capabilities F-012 (Assistant Charges).
 * Alignés sur F-012 et TRF-0015 à TRF-0021, TRF-0025, TRF-0026, TRF-0028.
 */

import type { FieldSource } from "../../contracts/FieldSource";

export type ChargeDeductibilite = "deductible" | "non_deductible" | "amortissement";

export type ChargeCategorie =
  | "taxe_fonciere"
  | "assurance_pno"
  | "assurance_gli"
  | "copropriete"
  | "honoraires_gestion"
  | "travaux"
  | "honoraires_comptable"
  | "frais_bancaires"
  | "divers";

export type CoproLigneType =
  | "provisions"
  | "regularisation"
  | "fonds_travaux"
  | "appel_gros_travaux";

export interface LigneCharge {
  id: string;
  description: string;
  montant: number;
  categorie: ChargeCategorie;
  deductibilite: ChargeDeductibilite;
  montantDeductible: number;
  montantPreExploitation: number;
  montantAmortissable: number;
  source: FieldSource;
  regleAppliquee?: string;
}

export interface ComposantNouveau {
  /**
   * P0-B/D — identité stable, jamais régénérée : dérivée de l'id de la
   * Charge d'origine (F-012), jamais d'un index de tableau ni d'un id
   * aléatoire recalculé à chaque compute. Condition nécessaire à la reprise
   * N → N+1 (le composant doit rester le même objet identifiable).
   */
  id: string;
  label: string;
  montant: number;
  dureeAnnees: number;
  dotationAnnuelle: number;
  nature: "amélioration" | "construction" | "renouvellement";
  dateDebut: string;
  /** P0-B — origine du composant, conservée pour traçabilité et pour la reprise N+1. */
  origin: "f012_travaux" | "f012_copro";
}

export interface ChargesExerciceResult {
  exerciceFiscal: number;
  lignes: LigneCharge[];
  parCategorie: Partial<Record<ChargeCategorie, number>>;
  totalDeductible: number;
  totalNonDeductible: number;
  totalAmortissable: number;
  totalPreExploitation: number;
  composantsNouveaux: ComposantNouveau[];
}

export type NatureIntervention = "entretien" | "amélioration" | "construction" | "renouvellement";

export type TravauxQualificationChoix =
  | "reparation_identique"
  | "amelioration"
  | "mixte"
  | "incertain";

export interface ProfilCharges {
  copropriete: boolean;
  agence: boolean;
  travaux: boolean;
  vacance: boolean;
  comptable: boolean;
}

export type F012CategoryId =
  | "taxe_fonciere"
  | "assurance_pno"
  | "assurance_gli"
  | "copropriete"
  | "honoraires_gestion"
  | "travaux"
  | "honoraires_comptable"
  | "frais_bancaires"
  | "divers";

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
