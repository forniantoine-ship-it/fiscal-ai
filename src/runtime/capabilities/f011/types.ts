/**
 * Types de domaine partagés par les capabilities F-011 (Assistant Financement).
 * Alignés sur F-011 et TRF-0016 / TRF-0022 / TRF-0023.
 */

export type TypePret = "amortissable" | "in_fine";

/** Une ligne d'échéancier mensuel (généré ou extrait). */
export interface EcheanceMensuelle {
  date: string;
  mensualite: number;
  interets: number;
  capital: number;
  assurance: number;
  capitalRestantDu: number;
}

export interface PeriodePreExploitation {
  debut: string;
  fin: string;
  dureeJours: number;
  existe: boolean;
}

/** Résultat par prêt pour un exercice fiscal. */
export interface PretFinancementExercice {
  pretId: string;
  typePret: TypePret;
  interetsEmpruntExercice: number;
  interetsPreExploitation: number;
  assuranceEmpruntExercice: number;
  capitalRembourseExercice: number;
  capitalRestantDu31_12: number;
  fraisDossierDeductibles: number;
  garantieDeductible: number;
  iraDeductible: number;
}

/** Agrégat F-011 pour l'exercice. */
export interface ChargesFinancementExercice {
  exerciceFiscal: number;
  prets: PretFinancementExercice[];
  totalInteretsEmprunt: number;
  totalInteretsPreExploitation: number;
  totalAssurance: number;
  totalCapitalRembourse: number;
  totalChargesFinancementExercice: number;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
