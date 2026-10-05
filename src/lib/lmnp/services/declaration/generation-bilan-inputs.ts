/**
 * INT-4 — vue EFFECTIVE du bilan pour la génération (bilan UNIQUEMENT : aucun fait F006, aucune formule).
 *
 * Isole la lecture de l'inventaire locatif F013 v2 hors de l'orchestrateur de génération : l'orchestrateur reçoit un
 * `GenerationRentInventory` opaque et ne connaît ni le contrat F013 v2 ni sa projection. Sans état v2 de l'exercice (tout
 * dossier legacy / F013 v1), le bilan est rendu STRICTEMENT inchangé (même objet).
 */
import type { BilanInputs } from "@/runtime/capabilities/bilan/types";
import type { BienDraft } from "@/lib/lmnp/dossier/bien-draft";
import { resolveEffectiveBilanWithRentInventory, rentStatesOfMonoDraft } from "@/lib/lmnp/services/f013/v2/f013-v2-bilan-wiring";
import type { RentReconciliationV2State } from "@/lib/lmnp/services/f013/v2/f013-v2-state";

export type GenerationRentInventory = { readonly propertyIds: readonly string[]; readonly states: readonly RentReconciliationV2State[] };

export function effectiveBilanForGeneration(bilan: BilanInputs | undefined, fiscalYear: number, inventory: GenerationRentInventory | undefined): BilanInputs | undefined {
  if (bilan === undefined || inventory === undefined) return bilan;
  return resolveEffectiveBilanWithRentInventory({ bilan, fiscalYear, propertyIds: inventory.propertyIds, states: inventory.states }).bilan;
}

/** Dossier mono (brouillon plat) : l'état éventuel vient du brouillon lui-même. */
export function inventoryOfMonoDraft(draft: Parameters<typeof rentStatesOfMonoDraft>[0]): GenerationRentInventory {
  const { propertyIds, states } = rentStatesOfMonoDraft(draft);
  return { propertyIds, states };
}

/** Dossier multi : les états restent PAR BIEN jusqu'à la projection. */
export function inventoryOfBiens(propertyIds: readonly string[], biens: Readonly<Record<string, Pick<BienDraft, "rentReconciliationV2"> | undefined>>): GenerationRentInventory {
  return {
    propertyIds,
    states: propertyIds.flatMap((id) => {
      const state = biens[id]?.rentReconciliationV2;
      return state === undefined ? [] : [state];
    }),
  };
}
