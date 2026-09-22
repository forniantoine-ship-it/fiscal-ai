/**
 * Lot 4E.2 — assemblage des 2 contrôles liasse historiques V1.
 *
 * TaxPackageControlFacts → deux HistoricalControlReconciliationResult :
 * - total_gross            : 2033A/028 ↔ 2033C/496
 * - total_cumulative_depreciation : 2033A/030 ↔ 2033C/576
 *
 * Réutilise STRICTEMENT createHistoricalControlReconciliation (4E.1).
 * Aucune logique de résolution, tolérance, déduplication ou canonicalisation.
 * 426/476 ignorés pour ces contrôles — package source non muté.
 */

import {
  createHistoricalControlReconciliation,
  HISTORICAL_CONTROL_RECONCILIATION_V1_PAIRS,
  type HistoricalControlReconciliationKind,
  type HistoricalControlReconciliationResult,
  type HistoricalControlReconciliationSideSpec,
} from "./historical-control-reconciliation";
import type {
  TaxPackageControlFact,
  TaxPackageControlFactKind,
  TaxPackageControlFacts,
} from "./tax-package-control-facts";

/**
 * Sortie nommée — le caller identifie chaque contrôle sans dépendre de l'ordre.
 */
export type HistoricalTaxPackageControlsReconciliation = {
  readonly packageId: string;
  readonly totalGross: HistoricalControlReconciliationResult;
  readonly totalCumulativeDepreciation: HistoricalControlReconciliationResult;
};

function selectSideObservations(
  facts: readonly TaxPackageControlFact[],
  side: HistoricalControlReconciliationSideSpec,
  controlKind: TaxPackageControlFactKind,
): TaxPackageControlFact[] {
  // filter → nouveau tableau ; package.facts intact. Jamais find/first/last/confidence.
  return facts.filter(
    (fact) =>
      fact.formType === side.formType &&
      fact.sourceCase === side.sourceCase &&
      fact.kind === controlKind,
  );
}

function reconcilePair(
  kind: HistoricalControlReconciliationKind,
  facts: readonly TaxPackageControlFact[],
): HistoricalControlReconciliationResult {
  const pair = HISTORICAL_CONTROL_RECONCILIATION_V1_PAIRS[kind];
  const left = selectSideObservations(facts, pair.left, pair.controlKind);
  const right = selectSideObservations(facts, pair.right, pair.controlKind);

  const created = createHistoricalControlReconciliation({
    kind,
    left,
    right,
  });

  // Sélection alignée sur la matrice V1 → rejet structurel = invariant cassé.
  if (created.status !== "created") {
    const detail = created.issues.map((i) => `${i.code}: ${i.message}`).join("; ");
    throw new Error(
      `reconcileHistoricalTaxPackageControls: factory 4E.1 a rejeté ${kind} — ${detail}`,
    );
  }

  return created.result;
}

/**
 * Produit automatiquement les deux rapprochements V1 d'un package de control facts.
 * Lecture seule — ne modifie ni `facts` ni les CandidateValue.
 */
export function reconcileHistoricalTaxPackageControls(
  packageFacts: TaxPackageControlFacts,
): HistoricalTaxPackageControlsReconciliation {
  const { packageId, facts } = packageFacts;

  return {
    packageId,
    totalGross: reconcilePair("total_gross", facts),
    totalCumulativeDepreciation: reconcilePair(
      "total_cumulative_depreciation",
      facts,
    ),
  };
}
