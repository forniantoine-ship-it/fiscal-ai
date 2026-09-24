/**
 * P0-2A — adaptateur pur : inventaire historique Opening appliqué → RFS.
 *
 * EXTERNAL_HISTORY uniquement. Réutilise `applied.plan.lignes` déjà calculé
 * (resolveOpeningDepreciation + applyResolvedOpeningDepreciation) — aucun
 * second moteur d'amortissement, aucune persistance nouvelle.
 *
 * Composition :
 *   historique Opening (lignes ancrées)
 * + acquisitions N (F-012, provenance acquisition_exercice)
 * = inventaire RFS N
 */

import type { AmortissementPlan } from "@/runtime/capabilities/f010/types";
import { round2 } from "@/runtime/capabilities/f010/types";
import type { ComposantNouveau } from "@/runtime/capabilities/f012/types";
import type { ImmobilisationsRfs } from "@/runtime/capabilities/rfs/types";
import {
  enrichImmobilisationsRfs,
  provenanceForDateDebut,
} from "./immobilisations-comptables";

export const EXTERNAL_HISTORY_INVENTORY_MISMATCH =
  "EXTERNAL_HISTORY_INVENTORY_MISMATCH";
export const EXTERNAL_HISTORY_INVENTORY_UNPROJECTABLE =
  "EXTERNAL_HISTORY_INVENTORY_UNPROJECTABLE";

/**
 * Acquisitions de l'exercice N uniquement — jamais les historiques F-012
 * qui seraient déjà dans l'Opening (évite le double comptage).
 */
export function selectCurrentYearAcquisitions(input: {
  composants: ComposantNouveau[] | undefined;
  exerciceFiscal: number;
  historicalAssetIds: ReadonlySet<string>;
}): ComposantNouveau[] {
  if (!input.composants?.length) return [];
  const byId = new Map<string, ComposantNouveau>();
  for (const c of input.composants) {
    if (input.historicalAssetIds.has(c.id)) continue;
    if (provenanceForDateDebut(c.dateDebut, input.exerciceFiscal) !== "acquisition_exercice") {
      continue;
    }
    byId.set(c.id, c);
  }
  return [...byId.values()];
}

export function historicalCumulOuvertureFromAppliedPlan(plan: AmortissementPlan): number {
  return round2(
    plan.lignes.reduce(
      (acc, ligne) => acc + round2(ligne.amortissementsCumules - ligne.dotationExercice),
      0,
    ),
  );
}

/**
 * Projette l'Opening appliqué + acquisitions N en bloc RFS immobilisations.
 * `valeurTerrain` = brut terrain Opening (0 si aucun terrain — jamais inventé
 * depuis le draft F-010).
 */
export function composeExternalHistoryImmobilisationsRfs(input: {
  appliedPlan: AmortissementPlan;
  terrainBrut: number;
  exerciceFiscal: number;
  currentYearAcquisitions?: ComposantNouveau[];
  propertyId?: string;
  dateMiseEnService?: string;
}): ImmobilisationsRfs {
  const historicalIds = new Set(
    input.appliedPlan.lignes
      .map((l) => l.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );
  const acquisitions = selectCurrentYearAcquisitions({
    composants: input.currentYearAcquisitions,
    exerciceFiscal: input.exerciceFiscal,
    historicalAssetIds: historicalIds,
  });

  const terrainBrut = Number.isFinite(input.terrainBrut) ? round2(input.terrainBrut) : 0;
  const brutOuverture = round2(input.appliedPlan.totalBrut + terrainBrut);
  const cumulOuverture = historicalCumulOuvertureFromAppliedPlan(input.appliedPlan);

  return enrichImmobilisationsRfs({
    immobilisations: {
      ...input.appliedPlan,
      valeurTerrain: terrainBrut,
      dateMiseEnService: input.dateMiseEnService,
      composantsNouveaux: acquisitions,
    },
    exerciceFiscal: input.exerciceFiscal,
    composantsMerged: acquisitions,
    propertyId: input.propertyId,
    ouverture: {
      valeurBruteOuverture: brutOuverture,
      amortissementsCumulesOuverture: cumulOuverture,
    },
  });
}

/**
 * Garde anti-S3 — l'inventaire historique RFS doit matcher l'Opening appliqué
 * (brut, cumuls clôture, dotation, ids). Divergence → fail-closed, jamais
 * correction silencieuse. Périmètre = lignes historiques uniquement
 * (hors F-012 / terrain).
 */
export function assertHistoricalInventoryMatchesApplied(input: {
  immobilisations: ImmobilisationsRfs;
  appliedPlan: AmortissementPlan;
}): { ok: true } | { ok: false; reason: string; code: typeof EXTERNAL_HISTORY_INVENTORY_MISMATCH } {
  const expected = input.appliedPlan;
  const observedLignes = input.immobilisations.lignes;

  if (observedLignes.length !== expected.lignes.length) {
    return {
      ok: false,
      code: EXTERNAL_HISTORY_INVENTORY_MISMATCH,
      reason:
        `Nombre de lignes historiques RFS (${observedLignes.length}) ≠ Opening appliqué (${expected.lignes.length}).`,
    };
  }

  if (Math.abs(round2(input.immobilisations.totalBrut - expected.totalBrut)) > 0.01) {
    return {
      ok: false,
      code: EXTERNAL_HISTORY_INVENTORY_MISMATCH,
      reason:
        `Brut historique RFS (${input.immobilisations.totalBrut}) ≠ Opening (${expected.totalBrut}).`,
    };
  }

  if (
    Math.abs(round2(input.immobilisations.totalAnnuelExercice - expected.totalAnnuelExercice)) >
    0.01
  ) {
    return {
      ok: false,
      code: EXTERNAL_HISTORY_INVENTORY_MISMATCH,
      reason:
        `Dotation historique RFS (${input.immobilisations.totalAnnuelExercice}) ≠ Opening (${expected.totalAnnuelExercice}).`,
    };
  }

  const byId = new Map(
    observedLignes
      .filter((l) => typeof l.id === "string" && l.id.length > 0)
      .map((l) => [l.id!, l]),
  );

  for (const expectedLigne of expected.lignes) {
    const id = expectedLigne.id;
    if (!id) {
      return {
        ok: false,
        code: EXTERNAL_HISTORY_INVENTORY_MISMATCH,
        reason: `Ligne Opening sans id stable (« ${expectedLigne.label} ») — fail-closed.`,
      };
    }
    const observed = byId.get(id);
    if (!observed) {
      return {
        ok: false,
        code: EXTERNAL_HISTORY_INVENTORY_MISMATCH,
        reason: `Actif historique « ${id} » absent de la RFS.`,
      };
    }
    if (Math.abs(round2(observed.montant - expectedLigne.montant)) > 0.01) {
      return {
        ok: false,
        code: EXTERNAL_HISTORY_INVENTORY_MISMATCH,
        reason: `Brut « ${id} » RFS (${observed.montant}) ≠ Opening (${expectedLigne.montant}).`,
      };
    }
    if (
      Math.abs(round2(observed.amortissementsCumules - expectedLigne.amortissementsCumules)) > 0.01
    ) {
      return {
        ok: false,
        code: EXTERNAL_HISTORY_INVENTORY_MISMATCH,
        reason:
          `Cumul clôture « ${id} » RFS (${observed.amortissementsCumules}) ≠ Opening (${expectedLigne.amortissementsCumules}).`,
      };
    }
    if (Math.abs(round2(observed.dotationExercice - expectedLigne.dotationExercice)) > 0.01) {
      return {
        ok: false,
        code: EXTERNAL_HISTORY_INVENTORY_MISMATCH,
        reason:
          `Dotation « ${id} » RFS (${observed.dotationExercice}) ≠ Opening (${expectedLigne.dotationExercice}).`,
      };
    }
  }

  return { ok: true };
}
