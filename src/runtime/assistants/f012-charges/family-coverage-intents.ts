/**
 * Cycle 5A — write-path collected pour none / unknown.
 * Pas d'UnknownItem : FamilyCoverage + ces intents suffisent.
 */

import type { ChargeFamilyId, FamilyUnknownReason } from "../../capabilities/f012/charge";
import type { F012CollectedData } from "./types";

export type FamilyUnknownIntent = NonNullable<F012CollectedData["unknownFamilies"]>[number];

export function markFamilyUnknown(
  collected: F012CollectedData,
  familyId: ChargeFamilyId,
  reason: FamilyUnknownReason,
): F012CollectedData {
  const unknownFamilies = [
    ...(collected.unknownFamilies ?? []).filter((intent) => intent.familyId !== familyId),
    { familyId, reason },
  ];
  const noneFamilies = (collected.noneFamilies ?? []).filter((id) => id !== familyId);
  const reviewedEmptyFamilies = (collected.reviewedEmptyFamilies ?? []).filter((id) => id !== familyId);
  return {
    ...collected,
    unknownFamilies,
    ...(noneFamilies.length > 0 ? { noneFamilies } : { noneFamilies: undefined }),
    reviewedEmptyFamilies: reviewedEmptyFamilies.length > 0 ? reviewedEmptyFamilies : undefined,
  };
}

/** Refuse de convertir un unknown déjà posé en none. */
export function markFamilyNone(collected: F012CollectedData, familyId: ChargeFamilyId): F012CollectedData {
  if ((collected.unknownFamilies ?? []).some((intent) => intent.familyId === familyId)) {
    return collected;
  }
  const noneFamilies = [...new Set([...(collected.noneFamilies ?? []), familyId])];
  const reviewedEmptyFamilies = (collected.reviewedEmptyFamilies ?? []).filter((id) => id !== familyId);
  return {
    ...collected,
    noneFamilies,
    reviewedEmptyFamilies: reviewedEmptyFamilies.length > 0 ? reviewedEmptyFamilies : undefined,
  };
}

/**
 * Cycle 8A — review terminée, rien retenu. Jamais `none`, jamais une Charge à 0.
 * Efface unknown/none sur cette famille : la review a eu lieu.
 */
export function markFamilyReviewedEmpty(
  collected: F012CollectedData,
  familyId: ChargeFamilyId,
): F012CollectedData {
  const cleared = clearFamilyCoverageIntent(collected, familyId);
  const reviewedEmptyFamilies = [...new Set([...(cleared.reviewedEmptyFamilies ?? []), familyId])];
  return { ...cleared, reviewedEmptyFamilies };
}

export function clearFamilyCoverageIntent(
  collected: F012CollectedData,
  familyId: ChargeFamilyId,
): F012CollectedData {
  const unknownFamilies = (collected.unknownFamilies ?? []).filter((intent) => intent.familyId !== familyId);
  const noneFamilies = (collected.noneFamilies ?? []).filter((id) => id !== familyId);
  const reviewedEmptyFamilies = (collected.reviewedEmptyFamilies ?? []).filter((id) => id !== familyId);
  return {
    ...collected,
    unknownFamilies: unknownFamilies.length > 0 ? unknownFamilies : undefined,
    noneFamilies: noneFamilies.length > 0 ? noneFamilies : undefined,
    reviewedEmptyFamilies: reviewedEmptyFamilies.length > 0 ? reviewedEmptyFamilies : undefined,
  };
}

export function clearFamilyCoverageIntents(
  collected: F012CollectedData,
  familyIds: ChargeFamilyId[],
): F012CollectedData {
  return familyIds.reduce((next, familyId) => clearFamilyCoverageIntent(next, familyId), collected);
}

export function unknownReasonForFamily(
  collected: F012CollectedData,
  familyId: ChargeFamilyId,
): FamilyUnknownReason | undefined {
  return collected.unknownFamilies?.find((intent) => intent.familyId === familyId)?.reason;
}
