/**
 * Lot 2B — adaptateur pur Opening → entrées d'amortissement ancrées.
 *
 * Aucune I/O. Branche sur la présence d'une ancre valide (assetId + propertyId),
 * jamais sur `source.kind === "external_takeover"`.
 *
 * `pending` ≠ validé. `unavailable` ≠ 0.
 */

import { computePlanDotationForYear } from "@/runtime/capabilities/f010/compute-plan-dotation-for-year";
import { continuePlanLine } from "@/runtime/capabilities/f010/continue-plan-line";
import type { AmortissementPlan, PlanLigne } from "@/runtime/capabilities/f010/types";
import { round2 } from "@/runtime/capabilities/f010/types";
import { isAvailable } from "./opening-fact";
import {
  computeOpeningContentHash,
  isOpeningValidationIntact,
} from "./content-hash";
import { validateFiscalYearOpening } from "./validate-opening";
import type {
  FiscalYearOpening,
  OpeningAsset,
  OpeningIssue,
  OpeningProrataConvention,
} from "./types";

export type ResolvedOpeningDepreciationEntry = {
  assetId: string;
  propertyId: string;
  label: string;
  baseAmortissable: number;
  cumulOuverture: number;
  startDate: string;
  durationYears: number;
  /** Absente si la reprise ancrée n'a pas de convention historique connue. */
  prorataConvention?: OpeningProrataConvention;
};

export type ResolvedOpeningTerrain = {
  assetId: string;
  propertyId: string;
  label: string;
  coutBrut: number;
};

export type ResolveOpeningDepreciationReady = {
  status: "ready";
  dossierId: string;
  exerciceFiscal: number;
  entries: ResolvedOpeningDepreciationEntry[];
  terrain: ResolvedOpeningTerrain[];
};

export type ResolveOpeningDepreciationBlocked = {
  status: "blocked";
  issues: OpeningIssue[];
};

export type ResolveOpeningDepreciationResult =
  | ResolveOpeningDepreciationReady
  | ResolveOpeningDepreciationBlocked;

export type ResolveOpeningDepreciationInput = {
  opening: FiscalYearOpening;
  /** Cross-check optionnel — mismatch → blocked. */
  expectedDossierId?: string;
  expectedExerciceFiscal?: number;
  /**
   * AssetIds acquis pendant l'exercice N (chemin courant, sans ancre).
   * Collision avec un id historique → BLOCK.
   */
  currentYearAcquisitionIds?: string[];
};

function block(issues: OpeningIssue[]): ResolveOpeningDepreciationBlocked {
  return { status: "blocked", issues };
}

function push(
  issues: OpeningIssue[],
  code: string,
  message: string,
  fieldPath?: string,
): void {
  issues.push({ code, message, severity: "error", fieldPath });
}

function isIndexBasedAssetId(id: string): boolean {
  return /^f010-\d+$/.test(id);
}

function resolveOneAmortizable(
  asset: OpeningAsset,
  exerciceFiscal: number,
  issues: OpeningIssue[],
  seenIds: Map<string, string>,
  currentYearAcquisitionIds: Set<string>,
): ResolvedOpeningDepreciationEntry | undefined {
  const base = `assets.${asset.id}`;

  if (!asset.id || asset.id.trim() === "") {
    push(issues, "ASSET_ID_MISSING", "assetId manquant pour une ancre.", base);
    return undefined;
  }
  if (isIndexBasedAssetId(asset.id)) {
    push(
      issues,
      "ASSET_ID_INDEX_BASED",
      `Identité index-based interdite sur le chemin ancré (« ${asset.id} »).`,
      base,
    );
    return undefined;
  }
  if (!asset.propertyId || asset.propertyId.trim() === "") {
    push(
      issues,
      "PROPERTY_ID_MISSING",
      "propertyId explicite requis pour une ancre amortissable.",
      `${base}.propertyId`,
    );
    return undefined;
  }
  if (seenIds.has(asset.id)) {
    push(
      issues,
      "DUPLICATE_ASSET_ID",
      `Plusieurs actifs partagent l'assetId « ${asset.id} ».`,
      base,
    );
    return undefined;
  }
  seenIds.set(asset.id, asset.propertyId);

  if (currentYearAcquisitionIds.has(asset.id)) {
    push(
      issues,
      "HISTORICAL_NEW_COLLISION",
      `Collision assetId historique / acquisition N : « ${asset.id} ».`,
      base,
    );
    return undefined;
  }

  if (!isAvailable(asset.coutBrut)) {
    push(
      issues,
      "BASE_UNAVAILABLE",
      "Base amortissable unavailable — jamais normalisée en 0.",
      `${base}.coutBrut`,
    );
    return undefined;
  }
  if (!isAvailable(asset.cumulOuverture)) {
    push(
      issues,
      "CUMUL_UNAVAILABLE",
      "Cumul d'ouverture unavailable — jamais normalisé en 0.",
      `${base}.cumulOuverture`,
    );
    return undefined;
  }
  if (!isAvailable(asset.plan)) {
    push(
      issues,
      "PLAN_UNAVAILABLE",
      "Paramètres de plan unavailable.",
      `${base}.plan`,
    );
    return undefined;
  }
  if (asset.plan.value.kind !== "amortizable") {
    push(
      issues,
      "PLAN_NOT_AMORTIZABLE",
      "Actif composant sans plan amortissable.",
      `${base}.plan`,
    );
    return undefined;
  }

  const plan = asset.plan.value;
  const B = asset.coutBrut.value;
  const C0 = asset.cumulOuverture.value;

  if (!Number.isFinite(B) || B < 0) {
    push(issues, "BASE_INVALID", "Base amortissable invalide.", `${base}.coutBrut`);
    return undefined;
  }
  if (!Number.isFinite(C0) || C0 < 0) {
    push(issues, "CUMUL_INVALID", "Cumul d'ouverture invalide.", `${base}.cumulOuverture`);
    return undefined;
  }
  if (C0 > B) {
    push(
      issues,
      "CUMUL_EXCEEDS_BASE",
      `Cumul d'ouverture (${C0}) > base (${B}).`,
      `${base}.cumulOuverture`,
    );
    return undefined;
  }
  if (!plan.startDate) {
    push(issues, "PLAN_START_MISSING", "Date de début manquante.", `${base}.plan.startDate`);
    return undefined;
  }
  if (!Number.isFinite(plan.durationYears) || plan.durationYears <= 0) {
    push(issues, "PLAN_DURATION_INVALID", "Durée de plan invalide.", `${base}.plan.durationYears`);
    return undefined;
  }
  if (
    plan.prorataConvention !== undefined &&
    plan.prorataConvention !== "annuel_plein" &&
    plan.prorataConvention !== "mensuel" &&
    plan.prorataConvention !== "jours_reels"
  ) {
    push(
      issues,
      "PRORATA_UNSUPPORTED",
      `Convention de prorata non supportée : ${String(plan.prorataConvention)}.`,
      `${base}.plan.prorataConvention`,
    );
    return undefined;
  }

  return {
    assetId: asset.id,
    propertyId: asset.propertyId,
    label: asset.label,
    baseAmortissable: B,
    cumulOuverture: C0,
    startDate: plan.startDate,
    durationYears: plan.durationYears,
    ...(plan.prorataConvention ? { prorataConvention: plan.prorataConvention } : {}),
  };
}

/**
 * Résout une `FiscalYearOpening` validée en entrées d'amortissement ancrées.
 * Matching strictement ID-based — aucun fallback label / index / properties[0].
 */
export function resolveOpeningDepreciation(
  input: ResolveOpeningDepreciationInput,
): ResolveOpeningDepreciationResult {
  const { opening } = input;
  const issues: OpeningIssue[] = [];

  if (opening.validation.status !== "validated") {
    push(
      issues,
      "OPENING_NOT_VALIDATED",
      `Validation status « ${opening.validation.status} » — pending ≠ validé.`,
      "validation",
    );
    return block(issues);
  }

  if (!isOpeningValidationIntact(opening)) {
    push(
      issues,
      "OPENING_VALIDATION_STALE",
      "Révision/hash de validation périmés.",
      "validation",
    );
    return block(issues);
  }

  const structural = validateFiscalYearOpening(opening).filter((i) => i.severity === "error");
  issues.push(...structural);

  if (input.expectedDossierId !== undefined && opening.dossierId !== input.expectedDossierId) {
    push(
      issues,
      "DOSSIER_MISMATCH",
      `dossierId opening (${opening.dossierId}) ≠ attendu (${input.expectedDossierId}).`,
      "dossierId",
    );
  }
  if (
    input.expectedExerciceFiscal !== undefined &&
    opening.targetFiscalYear !== input.expectedExerciceFiscal
  ) {
    push(
      issues,
      "EXERCICE_MISMATCH",
      `targetFiscalYear (${opening.targetFiscalYear}) ≠ attendu (${input.expectedExerciceFiscal}).`,
      "targetFiscalYear",
    );
  }

  if (!isAvailable(opening.assets)) {
    push(
      issues,
      "ASSETS_UNAVAILABLE",
      "Inventaire d'actifs unavailable — jamais [].",
      "assets",
    );
    return block(issues);
  }

  const currentYearIds = new Set(input.currentYearAcquisitionIds ?? []);
  const seenIds = new Map<string, string>();
  const entries: ResolvedOpeningDepreciationEntry[] = [];
  const terrain: ResolvedOpeningTerrain[] = [];

  for (const asset of opening.assets.value) {
    if (asset.categorie === "terrain") {
      if (!asset.id || !asset.propertyId) {
        push(
          issues,
          "TERRAIN_IDENTITY_INCOMPLETE",
          "Terrain sans assetId/propertyId explicites.",
          `assets.${asset.id || "?"}`,
        );
        continue;
      }
      if (!isAvailable(asset.coutBrut)) {
        push(
          issues,
          "TERRAIN_BASE_UNAVAILABLE",
          "Brut terrain unavailable.",
          `assets.${asset.id}.coutBrut`,
        );
        continue;
      }
      if (seenIds.has(asset.id)) {
        push(issues, "DUPLICATE_ASSET_ID", `Actif dupliqué : ${asset.id}.`, `assets.${asset.id}`);
        continue;
      }
      seenIds.set(asset.id, asset.propertyId);
      terrain.push({
        assetId: asset.id,
        propertyId: asset.propertyId,
        label: asset.label,
        coutBrut: asset.coutBrut.value,
      });
      continue;
    }

    // Travaux / composants amortissables d'ouverture historique.
    if (asset.categorie === "travaux" || asset.categorie === "composant") {
      // Acquisitions N ne doivent pas figurer dans l'inventaire d'ouverture ancré.
      if (asset.origin === "acquisition_exercice") {
        continue;
      }
      const resolved = resolveOneAmortizable(
        asset,
        opening.targetFiscalYear,
        issues,
        seenIds,
        currentYearIds,
      );
      if (resolved) entries.push(resolved);
    }
  }

  // propertyId incohérent entre actifs du même id déjà couvert ; vérifier
  // aussi qu'un même assetId n'a pas plusieurs propertyId via seenIds (déjà).
  if (issues.length > 0) {
    return block(issues);
  }

  // Hash encore aligné (défense en profondeur après contrôles).
  if (opening.validation.contentHash !== computeOpeningContentHash(opening)) {
    push(issues, "OPENING_VALIDATION_STALE", "contentHash incohérent.", "validation");
    return block(issues);
  }

  return {
    status: "ready",
    dossierId: opening.dossierId,
    exerciceFiscal: opening.targetFiscalYear,
    entries,
    terrain,
  };
}

/**
 * Applique la primitive Lot 2A (`continuePlanLine`) à chaque entrée résolue.
 * Produit un `AmortissementPlan` avec IDs stables — jamais `f010-${index}`.
 */
export function applyResolvedOpeningDepreciation(input: {
  resolved: Pick<ResolveOpeningDepreciationReady, "entries" | "exerciceFiscal">;
}):
  | { ok: true; plan: AmortissementPlan; lignes: PlanLigne[] }
  | { ok: false; issues: OpeningIssue[] } {
  const issues: OpeningIssue[] = [];
  const lignes: PlanLigne[] = [];

  for (const entry of input.resolved.entries) {
    const premiereAnnee = new Date(entry.startDate).getFullYear();
    if (!Number.isFinite(premiereAnnee)) {
      push(
        issues,
        "PLAN_START_INVALID",
        `Date de début invalide pour « ${entry.assetId} ».`,
        `assets.${entry.assetId}.plan.startDate`,
      );
      continue;
    }

    const da = round2(entry.baseAmortissable / entry.durationYears);
    const elapsed = input.resolved.exerciceFiscal - premiereAnnee;
    const priorFullAnnuities = round2(da * (entry.durationYears - 1));
    // TRF-0012 — année de complément. C0 attesté tient lieu de première
    // annuité : on ne la reconstruit pas. Un C0 inférieur à (n−1) annuités
    // pleines signalerait plusieurs années manquantes : pas de solde silencieux.
    const attestedSingleComplement =
      elapsed === entry.durationYears &&
      entry.cumulOuverture >= priorFullAnnuities &&
      entry.cumulOuverture < entry.baseAmortissable;

    const normalDotation = attestedSingleComplement
      ? round2(entry.baseAmortissable - entry.cumulOuverture)
      : computePlanDotationForYear({
          montant: entry.baseAmortissable,
          dureeAnnees: entry.durationYears,
          dotationAnnuelle: da,
          // Années courantes : d1 = da. La convention historique reste inconnue.
          dotationAnnee1: da,
          premiereAnnee,
          exerciceFiscal: input.resolved.exerciceFiscal,
        });

    const continued = continuePlanLine({
      label: entry.label,
      baseAmortissable: entry.baseAmortissable,
      dureeAnnees: entry.durationYears,
      normalDotation,
      openingAnchor: {
        exerciceFiscal: input.resolved.exerciceFiscal,
        cumulComptableOuverture: entry.cumulOuverture,
      },
      exerciceFiscal: input.resolved.exerciceFiscal,
      id: entry.assetId,
      propertyId: entry.propertyId,
    });

    if (!continued.ok) {
      for (const a of continued.anomalies) {
        push(
          issues,
          "CONTINUE_PLAN_BLOCKED",
          a.message,
          a.field ?? `assets.${entry.assetId}`,
        );
      }
      continue;
    }

    lignes.push({
      ...continued.ligne,
      dateDebut: entry.startDate,
      // Portée seulement si connue. Absence ≠ jours_reels.
      ...(entry.prorataConvention ? { prorataConvention: entry.prorataConvention } : {}),
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const totalAnnuelExercice = round2(lignes.reduce((acc, l) => acc + l.dotationExercice, 0));
  const totalBrut = round2(lignes.reduce((acc, l) => acc + l.montant, 0));

  return {
    ok: true,
    plan: { lignes, totalAnnuelExercice, totalBrut },
    lignes,
  };
}
