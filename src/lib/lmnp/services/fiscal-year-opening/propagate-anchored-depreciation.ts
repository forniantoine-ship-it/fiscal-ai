/**
 * Lot 2B — propagation d'une ouverture ancrée dans la chaîne comptable
 * existante (plan → F014 → RFS → patrimoine → snapshot).
 *
 * Branche sur ancre valide, jamais sur `external_takeover`.
 * Aucune I/O / persistence.
 */

import { composePlanAmortissement } from "@/runtime/capabilities/f014/compose-plan-amortissement";
import type { PlanAmortissement } from "@/runtime/capabilities/f014/types";
import { assembleRegistreImmobilisationsPatrimoniales } from "@/runtime/capabilities/bilan/assemble-immobilisations-patrimoniales";
import type { RegistrePatrimonialImmobilisations } from "@/runtime/capabilities/bilan/types";
import type { ImmobilisationsRfs } from "@/runtime/capabilities/rfs/types";
import type { AmortissementPlan } from "@/runtime/capabilities/f010/types";
import { round2 } from "@/runtime/capabilities/f010/types";
import type { ImmobilisationsComptablesSnapshot } from "@/lib/lmnp/types/dossier";
import {
  enrichImmobilisationsRfs,
  snapshotImmobilisationsComptables,
} from "@/lib/lmnp/services/dossier/immobilisations-comptables";
import type { OpeningIssue } from "./types";
import type { FiscalYearOpening } from "./types";
import {
  applyResolvedOpeningDepreciation,
  resolveOpeningDepreciation,
  type ResolveOpeningDepreciationReady,
  type ResolvedOpeningTerrain,
} from "./resolve-opening-depreciation";

export type PropagateAnchoredDepreciationReady = {
  status: "ready";
  resolved: ResolveOpeningDepreciationReady;
  plan: AmortissementPlan;
  f014: PlanAmortissement;
  immobilisations: ImmobilisationsRfs;
  patrimoine: RegistrePatrimonialImmobilisations;
  snapshot: ImmobilisationsComptablesSnapshot;
  /** Cumul amortissable (hors terrain) — vérité unique. */
  cumulAmortissable: number;
  vncAmortissable: number;
  vncTotale: number;
  brutTotal: number;
  dotationExercice: number;
};

export type PropagateAnchoredDepreciationResult =
  | PropagateAnchoredDepreciationReady
  | { status: "blocked"; issues: OpeningIssue[] };

export type PropagateAnchoredDepreciationInput = {
  opening: FiscalYearOpening;
  expectedDossierId?: string;
  expectedExerciceFiscal?: number;
  currentYearAcquisitionIds?: string[];
  /** Date de mise en service transportée (F-009) — pour RFS/snapshot. */
  dateMiseEnService?: string;
};

function terrainBrut(terrain: ResolvedOpeningTerrain[]): number {
  return round2(terrain.reduce((acc, t) => acc + t.coutBrut, 0));
}

/**
 * Chaîne unique : resolve → continuePlanLine → F014 → RFS → patrimoine → snapshot.
 */
export function propagateAnchoredDepreciation(
  input: PropagateAnchoredDepreciationInput,
): PropagateAnchoredDepreciationResult {
  const resolved = resolveOpeningDepreciation({
    opening: input.opening,
    expectedDossierId: input.expectedDossierId,
    expectedExerciceFiscal: input.expectedExerciceFiscal,
    currentYearAcquisitionIds: input.currentYearAcquisitionIds,
  });
  if (resolved.status === "blocked") {
    return resolved;
  }

  const applied = applyResolvedOpeningDepreciation({ resolved });
  if (!applied.ok) {
    return { status: "blocked", issues: applied.issues };
  }

  const dateMiseEnService =
    input.dateMiseEnService ??
    resolved.entries[0]?.startDate ??
    `${resolved.exerciceFiscal}-01-01`;

  const f014 = composePlanAmortissement({
    exerciceFiscal: resolved.exerciceFiscal,
    dateMiseEnService,
    planLogement: applied.plan,
    // Ancré : ratio 1 (annuité pleine) — pas de recalcul prorata journalier.
    prorataRatio: 1,
  }).plan;

  const valeurTerrain = terrainBrut(resolved.terrain);
  const immobilisations = enrichImmobilisationsRfs({
    immobilisations: {
      ...applied.plan,
      valeurTerrain,
      dateMiseEnService,
    },
    exerciceFiscal: resolved.exerciceFiscal,
    propertyId: resolved.entries[0]?.propertyId ?? resolved.terrain[0]?.propertyId,
  });

  const patrimoine = assembleRegistreImmobilisationsPatrimoniales({
    immobilisations,
    amortCalcule: applied.plan.totalAnnuelExercice,
  });

  const snapshot = snapshotImmobilisationsComptables({
    immobilisations,
    exerciceFiscal: resolved.exerciceFiscal,
    propertyId: resolved.entries[0]?.propertyId ?? resolved.terrain[0]?.propertyId,
  });

  if (!snapshot) {
    return {
      status: "blocked",
      issues: [
        {
          code: "SNAPSHOT_UNAVAILABLE",
          message: "Snapshot immobilisations non fiable.",
          severity: "error",
        },
      ],
    };
  }

  const cumulAmortissable = round2(
    applied.plan.lignes.reduce((acc, l) => acc + l.amortissementsCumules, 0),
  );
  const vncAmortissable = round2(applied.plan.lignes.reduce((acc, l) => acc + l.vnc, 0));
  const brutAmortissable = applied.plan.totalBrut;
  const brutTotal = round2(brutAmortissable + valeurTerrain);
  const vncTotale = round2(vncAmortissable + valeurTerrain);

  return {
    status: "ready",
    resolved,
    plan: applied.plan,
    f014,
    immobilisations,
    patrimoine,
    snapshot,
    cumulAmortissable,
    vncAmortissable,
    vncTotale,
    brutTotal,
    dotationExercice: applied.plan.totalAnnuelExercice,
  };
}
