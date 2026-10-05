/**
 * F013 v2 → bilan : VUE EFFECTIVE des `BilanInputs` (INT-4) — décision ADR-012 §1 rendue productive, avec garde.
 *
 * `rentReconciliationV2` est l'unique propriétaire éditable des soldes de CLÔTURE (créance → `LOYER_DU_PAR_LOCATAIRE`,
 * case 068 ; avance → `LOYER_ENCAISSE_D_AVANCE`, case 174). Ce module ne recrée AUCUNE formule : il réutilise
 * `projectRentalInventoryToBilan` et `mergeRentInventoryIntoBilan` (valeur de l'inventaire = remplacement, jamais addition),
 * puis neutralise les sources concurrentes restantes et détecte les contradictions que le remplacement ne peut pas
 * trancher.
 *
 * Priorité / remplacement (par nature définitivement fournie par l'inventaire — VALIDATED pour CHAQUE bien) :
 *  - postes de ventilation de même nature : REMPLACÉS (listés dans `superseded`, jamais détruits en stockage) ;
 *  - confirmation « aucun poste » de même nature : REMPLACÉE ;
 *  - `lignesSimples.produitsConstatesAvance` (même case 174) : NEUTRALISÉE quand l'inventaire fournit l'avance ;
 *  - `tiers.dettes = NUL_CONFIRME` / `tiers.creances = NUL_CONFIRME` face à une avance / créance > 0 : CONTRADICTION
 *    non déterministe (le bucket couvre aussi d'autres dettes/créances) → conflit EXPLICITE, jamais résolu en silence ;
 *    le conflit de ventilation existant (`BUCKET_TIERS_ET_VENTILATION`) reste actif en aval : aucune contradiction finale.
 *
 * Garde de non-activation globale : sans état F013 v2 de l'exercice (tout dossier F013 v1 / legacy), le bilan est rendu
 * STRICTEMENT inchangé (même objet). UNKNOWN reste INCONNU, PROPOSED ne devient jamais un poste.
 */
import type { BilanInputs } from "@/runtime/capabilities/bilan/types";
import {
  mergeRentInventoryIntoBilan,
  projectRentalInventoryToBilan,
  type BilanRentProjection,
  type MergeRentInventoryResult,
} from "./f013-v2-rental-inventory";
import type { RentReconciliationV2State } from "./f013-v2-state";

export type RentBilanStatus =
  /** Aucun état F013 v2 de cet exercice : dossier legacy, bilan inchangé. */
  | "NOT_APPLICABLE"
  /** Au moins une nature (créance / avance) n'est pas DÉFINITIVE pour tous les biens : le bilan exact n'est pas prêt. */
  | "INVENTORY_INCOMPLETE"
  /** Créance ET avance définitives pour tous les biens, aucune contradiction. */
  | "READY"
  /** Une source legacy contredit l'inventaire de façon non résoluble. */
  | "CONFLICT";

export type RentBilanConflict = {
  code: "TIERS_DETTES_NUL_CONFIRME_VS_F013_ADVANCE" | "TIERS_CREANCES_NUL_CONFIRME_VS_F013_RECEIVABLE";
  message: string;
};

export type EffectiveBilanSuperseded =
  | MergeRentInventoryResult["superseded"][number]
  | { nature: "LOYER_ENCAISSE_D_AVANCE"; kind: "ligne_simple"; montant?: number };

export type EffectiveRentBilan = {
  bilan: BilanInputs;
  status: RentBilanStatus;
  superseded: readonly EffectiveBilanSuperseded[];
  conflicts: readonly RentBilanConflict[];
  projection?: BilanRentProjection;
};

export function resolveEffectiveBilanWithRentInventory(input: {
  bilan: BilanInputs;
  fiscalYear: number;
  propertyIds: readonly string[];
  states: readonly RentReconciliationV2State[];
}): EffectiveRentBilan {
  const relevant = input.states.filter((s) => s.facts.fiscalYear === input.fiscalYear && input.propertyIds.includes(s.facts.propertyId));
  if (relevant.length === 0) return { bilan: input.bilan, status: "NOT_APPLICABLE", superseded: [], conflicts: [] };

  const projection = projectRentalInventoryToBilan({ fiscalYear: input.fiscalYear, propertyIds: input.propertyIds, states: relevant });
  const merged = mergeRentInventoryIntoBilan(input.bilan, projection);
  const superseded: EffectiveBilanSuperseded[] = [...merged.superseded];
  let bilan = merged.bilan;

  // Ligne simple concurrente de la case 174 : l'inventaire (propriétaire unique) la remplace.
  if (projection.providedNatures.includes("LOYER_ENCAISSE_D_AVANCE") && bilan.lignesSimples?.produitsConstatesAvance !== undefined) {
    const legacy = bilan.lignesSimples.produitsConstatesAvance;
    superseded.push({ nature: "LOYER_ENCAISSE_D_AVANCE", kind: "ligne_simple", ...(legacy.status === "DECLARE" ? { montant: legacy.montant } : {}) });
    const { produitsConstatesAvance: _removed, ...rest } = bilan.lignesSimples;
    void _removed;
    bilan = { ...bilan, lignesSimples: rest };
  }

  const conflicts: RentBilanConflict[] = [];
  const advances = projection.postes.some((p) => p.nature === "LOYER_ENCAISSE_D_AVANCE");
  const receivables = projection.postes.some((p) => p.nature === "LOYER_DU_PAR_LOCATAIRE");
  if (advances && bilan.tiers?.dettes?.status === "NUL_CONFIRME") {
    conflicts.push({
      code: "TIERS_DETTES_NUL_CONFIRME_VS_F013_ADVANCE",
      message: "« Aucune dette » est confirmé dans le bilan alors que l'inventaire locatif porte une avance de loyer à la clôture : contradiction non résolue (jamais conservées toutes les deux).",
    });
  }
  if (receivables && bilan.tiers?.creances?.status === "NUL_CONFIRME") {
    conflicts.push({
      code: "TIERS_CREANCES_NUL_CONFIRME_VS_F013_RECEIVABLE",
      message: "« Aucune créance » est confirmé dans le bilan alors que l'inventaire locatif porte une créance de loyer à la clôture : contradiction non résolue.",
    });
  }

  const complete = projection.providedNatures.length === 2;
  const status: RentBilanStatus = conflicts.length > 0 ? "CONFLICT" : complete ? "READY" : "INVENTORY_INCOMPLETE";
  return { bilan, status, superseded, conflicts, projection };
}

/** États F013 v2 exposés par un draft mono (plat) — un seul bien : l'identité vient de l'état lui-même. */
export function rentStatesOfMonoDraft(draft: { rentReconciliationV2?: RentReconciliationV2State } | undefined): {
  propertyIds: string[];
  states: RentReconciliationV2State[];
} {
  const state = draft?.rentReconciliationV2;
  return state === undefined ? { propertyIds: [], states: [] } : { propertyIds: [state.facts.propertyId], states: [state] };
}
