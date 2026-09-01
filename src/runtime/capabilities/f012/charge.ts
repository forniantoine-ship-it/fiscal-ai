/**
 * Cycle 5 — Charge Registry (vérité métier persistée).
 * LigneCharge[] et les totaux restent des résultats dérivés de computeChargesExercice.
 */

import type { FieldSource } from "../../contracts/FieldSource";
import type { TravauxQualificationChoix } from "./qualify-travail";
import type { ChargeCategorie, CoproLigneType, NatureIntervention } from "./types";

export const CHARGE_FAMILY_IDS = [
  "impots",
  "syndic",
  "assurances",
  "gestion",
  "travaux",
  "autres",
] as const;

export type ChargeFamilyId = (typeof CHARGE_FAMILY_IDS)[number];

/** Canal d'entrée — distinct de FieldSource (provenance KS). Aujourd'hui : presque tout `manual`. */
export type ChargeIntakeSource = "manual" | "document" | "dossier";

/** Une Charge enregistrée n'est jamais un total, jamais un résultat fiscal. */
export type ChargeStatus = "recorded";

export type ChargeExclusionReason = "f011_overlap";

export type ChargeTravauxPayload = {
  choix?: TravauxQualificationChoix;
  natureIntervention?: NatureIntervention;
  montantReparation?: number;
};

export type Charge = {
  id: string;
  familyId: ChargeFamilyId;
  category: ChargeCategorie;
  description?: string;
  amount: number;
  exercise: number;
  paidAt?: string;
  source: ChargeIntakeSource;
  provenance: FieldSource;
  status: ChargeStatus;
  qualification?: NatureIntervention | "mixte";
  qualificationReason?: string;
  preExploitation?: number;
  travaux?: ChargeTravauxPayload;
  coproType?: CoproLigneType;
  grosTravauxDeductible?: boolean;
  financingOverlap?: "assurance_emprunteur";
  exclusionReason?: ChargeExclusionReason;
  documentIds?: string[];
  conflict?: string;
  reviewNeeded?: boolean;
};

/**
 * `reviewed_empty` (Cycle 8A) : la famille a été vérifiée, aucune proposition
 * retenue. Distinct de `pending` (jamais vérifiée) et de `none` (« rien payé »).
 * Jamais une Charge à 0. Jamais affiché tel quel au client.
 */
export type FamilyCoverageStatus =
  | "pending"
  | "captured"
  | "none"
  | "unknown"
  | "not_applicable"
  | "reviewed_empty";

/**
 * Pourquoi la famille est `unknown` — absent sur le skip historique
 * (on sait seulement que l'info n'est pas là, pas pourquoi).
 * CFE / avis manquant : même raison `document_missing` sur la famille `impots`.
 */
export type FamilyUnknownReason = "unsure" | "document_missing" | "later";

export type FamilyCoverage = {
  familyId: ChargeFamilyId;
  exercise: number;
  status: FamilyCoverageStatus;
  chargeIds: string[];
  documentIds: string[];
  unknownReason?: FamilyUnknownReason;
  unknownHelpShownAt?: string;
};

export type ChargeRegistry = {
  exercise: number;
  charges: Charge[];
  familyCoverage: FamilyCoverage[];
};

export function emptyChargeRegistry(exercise: number): ChargeRegistry {
  return {
    exercise,
    charges: [],
    familyCoverage: CHARGE_FAMILY_IDS.map((familyId) => ({
      familyId,
      exercise,
      status: "pending",
      chargeIds: [],
      documentIds: [],
    })),
  };
}

export function familyIdForCategory(category: ChargeCategorie): ChargeFamilyId {
  switch (category) {
    case "taxe_fonciere":
      return "impots";
    case "copropriete":
      return "syndic";
    case "assurance_pno":
    case "assurance_gli":
      return "assurances";
    case "honoraires_gestion":
    case "honoraires_comptable":
      return "gestion";
    case "travaux":
      return "travaux";
    case "frais_bancaires":
    case "divers":
      return "autres";
  }
}

export function scalarChargeId(slot: string, exercise: number): string {
  return `${slot}:${exercise}`;
}

export function coproChargeId(exercise: number, type: CoproLigneType, index: number): string {
  return `copro:${exercise}:${type}:${index}`;
}

export function createRecordedCharge(
  partial: Omit<Charge, "status" | "source" | "provenance"> & {
    source?: ChargeIntakeSource;
    provenance?: FieldSource;
  },
): Charge {
  const charge: Charge = {
    id: partial.id,
    familyId: partial.familyId,
    category: partial.category,
    amount: partial.amount,
    exercise: partial.exercise,
    source: partial.source ?? "manual",
    provenance: partial.provenance ?? "manual",
    status: "recorded",
  };
  if (partial.description !== undefined) charge.description = partial.description;
  if (partial.paidAt !== undefined) charge.paidAt = partial.paidAt;
  if (partial.qualification !== undefined) charge.qualification = partial.qualification;
  if (partial.qualificationReason !== undefined) charge.qualificationReason = partial.qualificationReason;
  if (partial.preExploitation !== undefined) charge.preExploitation = partial.preExploitation;
  if (partial.travaux !== undefined) charge.travaux = partial.travaux;
  if (partial.coproType !== undefined) charge.coproType = partial.coproType;
  if (partial.grosTravauxDeductible !== undefined) charge.grosTravauxDeductible = partial.grosTravauxDeductible;
  if (partial.financingOverlap !== undefined) charge.financingOverlap = partial.financingOverlap;
  if (partial.exclusionReason !== undefined) charge.exclusionReason = partial.exclusionReason;
  if (partial.documentIds !== undefined) charge.documentIds = partial.documentIds;
  if (partial.conflict !== undefined) charge.conflict = partial.conflict;
  if (partial.reviewNeeded !== undefined) charge.reviewNeeded = partial.reviewNeeded;
  return charge;
}
