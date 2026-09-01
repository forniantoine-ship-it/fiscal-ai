/**
 * Cycle 13A — relances compagnon (GLI, comptable).
 * Couche interne uniquement : jamais un statut FamilyCoverage.
 * Une relance au plus une fois par slot.
 */

import type { ChargeFamilyId } from "../../capabilities/f012/charge";
import type { F012CollectedData } from "./types";

export type SlotNudgeId = "gli" | "comptable";
export type SlotNudgeStatus = "unasked" | "offered" | "declined" | "filled";

export function hasGliExpense(collected: F012CollectedData): boolean {
  if (collected.assuranceGli !== undefined) return true;
  return (collected.familyLines ?? []).some((line) => line.category === "assurance_gli");
}

export function hasComptableExpense(collected: F012CollectedData): boolean {
  if (collected.honorairesComptable !== undefined) return true;
  return (collected.familyLines ?? []).some((line) => line.category === "honoraires_comptable");
}

export function hasPnoExpense(collected: F012CollectedData): boolean {
  if (collected.assurancePno !== undefined) return true;
  return (collected.familyLines ?? []).some((line) => line.category === "assurance_pno");
}

export function hasGestionHonoraires(collected: F012CollectedData): boolean {
  if (collected.honorairesGestion !== undefined) return true;
  if (collected.fraisEtatDesLieux !== undefined) return true;
  return (collected.familyLines ?? []).some(
    (line) => line.category === "honoraires_gestion",
  );
}

export function hasBankExpense(collected: F012CollectedData): boolean {
  if (collected.fraisBancaires !== undefined) return true;
  return (collected.familyLines ?? []).some((line) => line.category === "frais_bancaires");
}

export function slotNudgeStatus(
  collected: F012CollectedData,
  slot: SlotNudgeId,
): SlotNudgeStatus {
  if (slot === "gli" && hasGliExpense(collected)) return "filled";
  if (slot === "comptable" && hasComptableExpense(collected)) return "filled";
  return collected.slotNudges?.[slot] ?? "unasked";
}

export function markSlotNudge(
  collected: F012CollectedData,
  slot: SlotNudgeId,
  status: SlotNudgeStatus,
): F012CollectedData {
  return {
    ...collected,
    slotNudges: { ...collected.slotNudges, [slot]: status },
  };
}

export function syncFilledSlotNudges(collected: F012CollectedData): F012CollectedData {
  let next = collected;
  if (hasGliExpense(next) && next.slotNudges?.gli !== "filled") {
    next = markSlotNudge(next, "gli", "filled");
  }
  if (hasComptableExpense(next) && next.slotNudges?.comptable !== "filled") {
    next = markSlotNudge(next, "comptable", "filled");
  }
  return next;
}

/** Relance unique, seulement si le slot est encore `unasked` et vide. */
export function maybeOfferSlotNudge(
  familyId: ChargeFamilyId,
  collected: F012CollectedData,
): SlotNudgeId | undefined {
  if (familyId === "assurances") {
    if (slotNudgeStatus(collected, "gli") !== "unasked") return undefined;
    if (hasGliExpense(collected) || !hasPnoExpense(collected)) return undefined;
    return "gli";
  }
  if (familyId === "gestion") {
    if (slotNudgeStatus(collected, "comptable") !== "unasked") return undefined;
    if (hasComptableExpense(collected) || !hasGestionHonoraires(collected)) return undefined;
    return "comptable";
  }
  return undefined;
}

export function slotNudgePrompt(slot: SlotNudgeId, year: number): string {
  if (slot === "gli") {
    return `Avez-vous aussi payé une assurance pour les loyers impayés en ${year} ?`;
  }
  return `Avez-vous aussi payé un comptable ou un logiciel pour ce logement en ${year} ?`;
}
