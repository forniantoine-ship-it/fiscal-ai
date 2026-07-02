/**
 * Types de domaine partagés par les capabilities F-013 (Assistant Revenus).
 * Alignés sur F-013, SAV-028, SAV-009, SAV-017 et TRF-REV-01 / TRF-REV-02 (F-013).
 */

import type { FieldSource } from "../../contracts/FieldSource";

export type TypeLocation = "longue_duree" | "plateforme" | "mixte";

export type ContinuiteBail = "un_locataire" | "changement_locataire" | "vacance";

export type ModeCharges = "charges_comprises" | "hors_charges" | "inconnu";

export type RecetteSource = "loyers" | "indemnites" | "plateforme" | "ajustement_jan_dec";

export type StatutEncaissement = "encaisse" | "impaye" | "ajuste";

export interface PeriodeLocation {
  loyerMensuel: number;
  dateDebut: string;
  dateFin: string;
  provisionChargesMensuelle?: number;
}

export interface VacancePeriode {
  dateDebut: string;
  dateFin: string;
  enTravaux?: boolean;
  justification?: string;
}

export interface LigneRecette {
  id: string;
  source: RecetteSource;
  description: string;
  montant: number;
  periode?: string;
  statutEncaissement: StatutEncaissement;
  origineSav: string[];
  fieldSource: FieldSource;
}

export interface RevenuTheorique {
  montantAttendu: number;
  loyerMensuel: number;
  moisLocationEffectifs: number;
  moisVacance: number;
  baseCalcul: string;
}

export interface RecettesExerciceResult {
  exerciceFiscal: number;
  totalRecettes: number;
  loyersEncaisses: number;
  indemnitesAssurance: number;
  recettesPlateforme: number;
  ajustementsJanDec: number;
  moisLocationEffectifs: number;
  lignes: LigneRecette[];
  revenuTheorique?: RevenuTheorique;
  deltaExplique: number;
}

export type EcartNiveau = "coherent" | "modere" | "important";

export type EcartNature =
  | "coherent"
  | "sous_declare"
  | "sur_declare"
  | "nul_suspect";

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
