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

// ---------------------------------------------------------------------------
// INT-4.1 — OWNERSHIP des faits locatifs du bilan et plan de switch du bucket `tiers.*` (dormants)
// ---------------------------------------------------------------------------
//
// Pour les deux faits locatifs, l'autorité est F013 v2 (`rentReconciliationV2`) : le bilan ne peut plus les éditer de façon
// indépendante lorsque F013 v2 est autoritaire. Les AUTRES créances / dettes restent indépendantes et intactes : la
// neutralisation est limitée au sous-fait locatif concurrent, jamais au bucket entier (jamais `tiers.dettes = INCONNU`).

export const F013_RENTAL_OWNER = "F013_V2_AUTHORITATIVE" as const;
export const RENTAL_BILAN_NATURES = ["LOYER_DU_PAR_LOCATAIRE", "LOYER_ENCAISSE_D_AVANCE"] as const;
export type RentalBilanNature = (typeof RENTAL_BILAN_NATURES)[number];

/** Vrai pour les natures dont la source autoritaire est F013 v2 (les autres natures de bilan ne sont pas concernées). */
export function isRentalBilanNature(nature: string): nature is RentalBilanNature {
  return (RENTAL_BILAN_NATURES as readonly string[]).includes(nature);
}

export type RentalCompetingSource = {
  nature: RentalBilanNature;
  source: "ventilation_poste" | "ventilation_confirmation_vide" | "ligne_simple_174" | "tiers_bucket";
  ref?: string;
  montant?: number;
  /** REPLACED/NEUTRALIZED : la valeur de l'inventaire fait foi dès aujourd'hui ; CONFLICT_BLOCKING : bloquant tant que non résolu. */
  resolution: "REPLACED_BY_F013" | "NEUTRALIZED_BY_F013" | "CONFLICT_BLOCKING";
};

/** Plan appliqué AU SWITCH (INT-5) : jamais exécuté ici. Le bucket n'est jamais mis à INCONNU ; les autres dettes restent intactes. */
export type TiersBucketSwitchPlan = {
  bucket: "dettes" | "creances";
  nature: RentalBilanNature;
  action: "REPLACE_NUL_CONFIRME_BY_F013_RENTAL_COMPONENT";
  /** Le « zéro » confirmé pour les AUTRES postes du bucket reste valable ; seul le composant locatif vient de F013. */
  resultingBucket: { status: "DECLARE"; montant: number };
  otherItemsPreserved: true;
};

export type RentalBilanOwnership = {
  owner: typeof F013_RENTAL_OWNER | "NOT_APPLICABLE";
  /** Natures effectivement fournies de façon définitive par l'inventaire (donc possédées par F013). */
  ownedNatures: readonly RentalBilanNature[];
  competing: readonly RentalCompetingSource[];
  switchPlans: readonly TiersBucketSwitchPlan[];
};

export function describeRentalBilanOwnership(input: {
  bilan: BilanInputs;
  fiscalYear: number;
  propertyIds: readonly string[];
  states: readonly RentReconciliationV2State[];
}): RentalBilanOwnership {
  const relevant = input.states.filter((s) => s.facts.fiscalYear === input.fiscalYear && input.propertyIds.includes(s.facts.propertyId));
  if (relevant.length === 0) return { owner: "NOT_APPLICABLE", ownedNatures: [], competing: [], switchPlans: [] };
  const projection = projectRentalInventoryToBilan({ fiscalYear: input.fiscalYear, propertyIds: input.propertyIds, states: relevant });
  const owned = projection.providedNatures as readonly RentalBilanNature[];
  const competing: RentalCompetingSource[] = [];
  const switchPlans: TiersBucketSwitchPlan[] = [];

  for (const poste of input.bilan.ventilationTiers?.postes ?? []) {
    if (isRentalBilanNature(poste.nature) && owned.includes(poste.nature)) competing.push({ nature: poste.nature, source: "ventilation_poste", ref: poste.id, montant: poste.montant, resolution: "REPLACED_BY_F013" });
  }
  for (const nature of input.bilan.ventilationTiers?.naturesConfirmeesVides ?? []) {
    if (isRentalBilanNature(nature) && owned.includes(nature)) competing.push({ nature, source: "ventilation_confirmation_vide", resolution: "REPLACED_BY_F013" });
  }
  const legacy174 = input.bilan.lignesSimples?.produitsConstatesAvance;
  if (legacy174 !== undefined && owned.includes("LOYER_ENCAISSE_D_AVANCE")) {
    competing.push({ nature: "LOYER_ENCAISSE_D_AVANCE", source: "ligne_simple_174", ...(legacy174.status === "DECLARE" ? { montant: legacy174.montant } : {}), resolution: "NEUTRALIZED_BY_F013" });
  }
  const sumOf = (nature: RentalBilanNature) => projection.postes.filter((p) => p.nature === nature).reduce((n, p) => Math.round((n + p.montant) * 100) / 100, 0);
  const advances = sumOf("LOYER_ENCAISSE_D_AVANCE");
  const receivables = sumOf("LOYER_DU_PAR_LOCATAIRE");
  if (advances > 0 && input.bilan.tiers?.dettes?.status === "NUL_CONFIRME") {
    competing.push({ nature: "LOYER_ENCAISSE_D_AVANCE", source: "tiers_bucket", ref: "tiers.dettes", resolution: "CONFLICT_BLOCKING" });
    switchPlans.push({ bucket: "dettes", nature: "LOYER_ENCAISSE_D_AVANCE", action: "REPLACE_NUL_CONFIRME_BY_F013_RENTAL_COMPONENT", resultingBucket: { status: "DECLARE", montant: advances }, otherItemsPreserved: true });
  }
  if (receivables > 0 && input.bilan.tiers?.creances?.status === "NUL_CONFIRME") {
    competing.push({ nature: "LOYER_DU_PAR_LOCATAIRE", source: "tiers_bucket", ref: "tiers.creances", resolution: "CONFLICT_BLOCKING" });
    switchPlans.push({ bucket: "creances", nature: "LOYER_DU_PAR_LOCATAIRE", action: "REPLACE_NUL_CONFIRME_BY_F013_RENTAL_COMPONENT", resultingBucket: { status: "DECLARE", montant: receivables }, otherItemsPreserved: true });
  }
  return { owner: owned.length > 0 ? F013_RENTAL_OWNER : "NOT_APPLICABLE", ownedNatures: owned, competing, switchPlans };
}
