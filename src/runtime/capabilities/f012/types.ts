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
  label: string;
  montant: number;
  dureeAnnees: number;
  dotationAnnuelle: number;
  nature: "amélioration" | "construction" | "renouvellement";
  dateDebut: string;
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
