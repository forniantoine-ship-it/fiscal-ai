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
  /** P2 — TRF-0023, déjà calculée par isolatePreExploitationInterests(), désormais transportée. */
  assurancePreExploitation: number;
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
  /**
   * P2 — somme de prets[].assurancePreExploitation, symétrique à
   * totalInteretsPreExploitation. Optionnel, contrairement à ce champ
   * jumeau : plusieurs sites (panel F-011, état "aucun financement")
   * construisent cet objet champ par champ, hors périmètre P2, sans passer
   * par computeFinancementExercice() — requis casserait leur compilation
   * pour un champ qu'ils n'ont pas à connaître. computeFinancementExercice()
   * la renseigne systématiquement ; aggregate-inputs.ts (F-006) applique un
   * repli `?? 0` symétrique à celui déjà en place pour totalNonDeductible.
   */
  totalAssurancePreExploitation?: number;
  totalCapitalRembourse: number;
  totalChargesFinancementExercice: number;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
