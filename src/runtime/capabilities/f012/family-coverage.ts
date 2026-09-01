/**
 * Cycle 5A — résolution de FamilyCoverage.
 * unknown / none / not_applicable ne créent jamais de Charge.
 */

import {
  CHARGE_FAMILY_IDS,
  type ChargeFamilyId,
  type FamilyCoverage,
  type FamilyCoverageStatus,
  type FamilyUnknownReason,
} from "./charge";

export const FAMILY_COVERAGE_LABELS: Record<ChargeFamilyId, string> = {
  impots: "la taxe foncière",
  syndic: "le syndic",
  assurances: "l'assurance du logement",
  gestion: "l'agence ou le comptable",
  travaux: "les travaux",
  autres: "d'autres dépenses",
};

export type ResolveFamilyCoverageInput = {
  chargeCount: number;
  applicable: boolean;
  inInventory: boolean;
  explicitUnknown?: FamilyUnknownReason;
  explicitNone: boolean;
  /** Cycle 8A — review documentaire terminée, aucune proposition retenue. */
  reviewedEmpty?: boolean;
  skipped: boolean;
};

export type ResolvedFamilyCoverage = {
  status: FamilyCoverageStatus;
  unknownReason?: FamilyUnknownReason;
};

/**
 * Priorité :
 * captured > not_applicable > unknown explicite > none explicite
 * > reviewed_empty > skip (unknown) > pending.
 * Jamais reviewed_empty → none. Jamais unknown → none. Jamais de Charge fantôme.
 */
export function resolveFamilyCoverage(input: ResolveFamilyCoverageInput): ResolvedFamilyCoverage {
  if (input.chargeCount > 0) return { status: "captured" };
  if (!input.applicable && !input.inInventory) return { status: "not_applicable" };
  if (input.explicitUnknown) {
    return { status: "unknown", unknownReason: input.explicitUnknown };
  }
  if (input.explicitNone) return { status: "none" };
  if (input.reviewedEmpty) return { status: "reviewed_empty" };
  if (input.skipped) return { status: "unknown" };
  return { status: "pending" };
}

export function incompleteCoverages(familyCoverage: FamilyCoverage[]): FamilyCoverage[] {
  return familyCoverage.filter((coverage) => coverage.status === "unknown");
}

export function hasIncompleteCoverage(familyCoverage: FamilyCoverage[]): boolean {
  return incompleteCoverages(familyCoverage).length > 0;
}

/** Grain des futures 6 cartes : une couverture par famille, jamais une Charge à 0. */
export function coverageByFamily(
  familyCoverage: FamilyCoverage[],
): Record<ChargeFamilyId, FamilyCoverage | undefined> {
  const byFamily = {} as Record<ChargeFamilyId, FamilyCoverage | undefined>;
  for (const familyId of CHARGE_FAMILY_IDS) {
    byFamily[familyId] = familyCoverage.find((coverage) => coverage.familyId === familyId);
  }
  return byFamily;
}
