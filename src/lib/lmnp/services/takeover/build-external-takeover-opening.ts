/**
 * Lot 4F.1 — policy + builder External Takeover → FiscalYearOpening existant.
 *
 * Fail-closed :
 * - candidates acceptés + mappings 4B ;
 * - contrôles 4E (conflict → block ; not_comparable → revue) ;
 * - stocks fiscaux explicitement présents (present([])/present(0) OK ; missing ≠ 0).
 *
 * Ne branche pas runDeclarationGeneration.
 * Ne débloque pas EXTERNAL_HISTORY.
 * Ne recalcule jamais un cumul historique.
 * Ne crée jamais d'actif depuis les totaux 028/496/030/576.
 */

import {
  computeOpeningContentHash,
  validateFiscalYearOpening,
  available,
  unavailable,
  isAvailable,
  type FiscalYearOpening,
  type OpeningAsset,
  type OpeningIssue,
} from "@/lib/lmnp/services/fiscal-year-opening";
import { isCandidatePresent } from "./candidate-value";
import type { CandidateHistoricalAsset } from "./asset-candidates";
import type { CandidateFiscalStocks } from "./fiscal-stocks-candidates";
import {
  mapAcceptedCandidateAssetsToOpening,
  mapAcceptedCandidateStocksToOpening,
  type MapAcceptedAssetsInput,
} from "./map-accepted-to-opening";
import type { HistoricalTaxPackageControlsReconciliation } from "./reconcile-historical-tax-package-controls";
import type { HistoricalControlReconciliationResult } from "./historical-control-reconciliation";

export type ExternalTakeoverOpeningIssue = {
  code: string;
  message: string;
  severity: "error" | "warning";
  fieldPath?: string;
};

export type HistoricalControlsOpeningGate =
  | { status: "allow" }
  | {
      status: "manual_review_required";
      reasons: ExternalTakeoverOpeningIssue[];
    }
  | { status: "blocked"; reasons: ExternalTakeoverOpeningIssue[] };

export type BuildExternalTakeoverFiscalYearOpeningInput = {
  openingId: string;
  dossierId: string;
  takeoverId: string;
  targetFiscalYear: number;
  /** Exercice documentaire N-1 lorsque connu. */
  sourceFiscalYear: number;
  assets: readonly CandidateHistoricalAsset[];
  stableAssetIdByCandidateKey: MapAcceptedAssetsInput["stableAssetIdByCandidateKey"];
  stocks: CandidateFiscalStocks;
  /** Résultat 4E.2 — contrôles documentaires, jamais des valeurs d'actifs. */
  controls: HistoricalTaxPackageControlsReconciliation;
  /**
   * Horodatage / validateur pour une Opening `validated`.
   * Ignoré si le statut final n'est pas `built`.
   */
  validatedAt?: string;
  validator?: string;
};

export type BuildExternalTakeoverFiscalYearOpeningResult =
  | { status: "built"; opening: FiscalYearOpening }
  | {
      status: "manual_review_required";
      opening: FiscalYearOpening;
      issues: ExternalTakeoverOpeningIssue[];
    }
  | { status: "blocked"; issues: ExternalTakeoverOpeningIssue[] };

function issue(
  code: string,
  message: string,
  fieldPath?: string,
  severity: ExternalTakeoverOpeningIssue["severity"] = "error",
): ExternalTakeoverOpeningIssue {
  return { code, message, severity, fieldPath };
}

function fromOpeningIssues(issues: OpeningIssue[]): ExternalTakeoverOpeningIssue[] {
  return issues.map((i) =>
    issue(i.code, i.message, i.fieldPath, i.severity === "warning" ? "warning" : "error"),
  );
}

function controlIssue(
  control: HistoricalControlReconciliationResult,
  label: string,
): ExternalTakeoverOpeningIssue {
  if (control.status === "conflict") {
    return issue(
      control.kind === "total_gross"
        ? "CONTROL_TOTAL_GROSS_CONFLICT"
        : "CONTROL_CUMULATIVE_DEPRECIATION_CONFLICT",
      `Contrôle 4E « ${label} » en conflit — aucune valeur canonique, reprise bloquée.`,
      `controls.${control.kind}`,
    );
  }
  return issue(
    control.kind === "total_gross"
      ? "CONTROL_TOTAL_GROSS_NOT_COMPARABLE"
      : "CONTROL_CUMULATIVE_DEPRECIATION_NOT_COMPARABLE",
    `Contrôle 4E « ${label} » non comparable (${control.notComparableReason ?? "unknown"}) — revue requise.`,
    `controls.${control.kind}`,
    "warning",
  );
}

/**
 * Policy minimale 4E pour une ouverture externe.
 * Concordant ≠ valeur d'actif. Conflict bloque. not_comparable → revue.
 */
export function evaluateHistoricalControlsForExternalOpening(
  controls: HistoricalTaxPackageControlsReconciliation,
): HistoricalControlsOpeningGate {
  const blocked: ExternalTakeoverOpeningIssue[] = [];
  const review: ExternalTakeoverOpeningIssue[] = [];

  for (const [label, control] of [
    ["total_gross", controls.totalGross],
    ["total_cumulative_depreciation", controls.totalCumulativeDepreciation],
  ] as const) {
    if (control.status === "conflict") {
      blocked.push(controlIssue(control, label));
    } else if (control.status === "not_comparable") {
      review.push(controlIssue(control, label));
    }
  }

  if (blocked.length > 0) return { status: "blocked", reasons: blocked };
  if (review.length > 0) {
    return { status: "manual_review_required", reasons: review };
  }
  return { status: "allow" };
}

function assertExplicitStocks(
  stocks: CandidateFiscalStocks,
): ExternalTakeoverOpeningIssue[] {
  const issues: ExternalTakeoverOpeningIssue[] = [];
  if (!isCandidatePresent(stocks.deficits)) {
    issues.push(
      issue(
        "STOCKS_DEFICITS_UNKNOWN",
        `Déficits d'ouverture inconnus (« ${stocks.deficits.status} ») — UNKNOWN ≠ [].`,
        "stocks.deficits",
      ),
    );
  }
  if (!isCandidatePresent(stocks.amortissementsReportes)) {
    issues.push(
      issue(
        "STOCKS_ARD_UNKNOWN",
        `Amortissements reportés inconnus (« ${stocks.amortissementsReportes.status} ») — UNKNOWN ≠ 0.`,
        "stocks.amortissementsReportes",
      ),
    );
  }
  return issues;
}

/**
 * Préconditions ancrage — au-delà du mapping 4B (propertyId / plan available).
 * Aucun recalcul de cumul.
 */
function assertAnchoredAssetsReady(
  assets: readonly OpeningAsset[],
): ExternalTakeoverOpeningIssue[] {
  const issues: ExternalTakeoverOpeningIssue[] = [];

  if (assets.length === 0) {
    issues.push(
      issue(
        "NO_ASSET_DETAIL",
        "Aucun actif historique exploitable — les totaux 4E ne créent pas d'OpeningAsset.",
        "assets",
      ),
    );
    return issues;
  }

  for (const asset of assets) {
    const base = `assets.${asset.id}`;

    if (!asset.propertyId || asset.propertyId.trim() === "") {
      issues.push(
        issue(
          "ASSET_PROPERTY_ID_REQUIRED",
          `propertyId manquant pour l'actif « ${asset.id} » — aucun fallback mono-bien.`,
          `${base}.propertyId`,
        ),
      );
    }

    if (!isAvailable(asset.coutBrut)) {
      issues.push(
        issue(
          "ASSET_COUT_BRUT_UNAVAILABLE",
          `coutBrut unavailable pour « ${asset.id} » — jamais inventé.`,
          `${base}.coutBrut`,
        ),
      );
    }

    if (!isAvailable(asset.cumulOuverture)) {
      issues.push(
        issue(
          "ASSET_CUMUL_OUVERTURE_UNAVAILABLE",
          `cumulOuverture unavailable pour « ${asset.id} » — ancre historique absente.`,
          `${base}.cumulOuverture`,
        ),
      );
    }

    if (!isAvailable(asset.plan)) {
      issues.push(
        issue(
          "ASSET_PLAN_UNAVAILABLE",
          `Plan unavailable pour « ${asset.id} » — prorata/durée/date non inventés.`,
          `${base}.plan`,
        ),
      );
    } else if (
      asset.plan.value.kind === "amortizable" &&
      (asset.categorie === "composant" || asset.categorie === "travaux")
    ) {
      const plan = asset.plan.value;
      if (!plan.startDate) {
        issues.push(
          issue(
            "ASSET_PLAN_START_MISSING",
            `startDate manquante pour « ${asset.id} ».`,
            `${base}.plan.startDate`,
          ),
        );
      }
      if (!Number.isFinite(plan.durationYears) || plan.durationYears <= 0) {
        issues.push(
          issue(
            "ASSET_PLAN_DURATION_INVALID",
            `durationYears invalide pour « ${asset.id} ».`,
            `${base}.plan.durationYears`,
          ),
        );
      }
      if (
        plan.prorataConvention !== "annuel_plein" &&
        plan.prorataConvention !== "mensuel" &&
        plan.prorataConvention !== "jours_reels"
      ) {
        issues.push(
          issue(
            "ASSET_PRORATA_REQUIRED",
            `prorataConvention manquante/invalide pour « ${asset.id} ».`,
            `${base}.plan.prorataConvention`,
          ),
        );
      }
    }
  }

  return issues;
}

function assembleOpening(params: {
  input: BuildExternalTakeoverFiscalYearOpeningInput;
  assets: OpeningAsset[];
  stocks: FiscalYearOpening["stocks"];
  validation: FiscalYearOpening["validation"];
}): FiscalYearOpening {
  const { input, assets, stocks, validation } = params;
  return {
    openingId: input.openingId,
    revision: 1,
    targetFiscalYear: input.targetFiscalYear,
    dossierId: input.dossierId,
    source: {
      kind: "external_takeover",
      takeoverId: input.takeoverId,
      sourceFiscalYear: input.sourceFiscalYear,
    },
    stocks,
    assets: available(assets),
    loans: unavailable("hors scope 4F.1 — prêts non construits depuis takeover assets/stocks"),
    patrimoine: {
      ouvertureCompteExploitant: unavailable("hors scope 4F.1"),
      ran: unavailable("hors scope 4F.1"),
      tresorerieOuverture: unavailable("hors scope 4F.1"),
    },
    properties: unavailable("hors scope 4F.1 — propertyId porté sur chaque actif"),
    identity: unavailable("hors scope 4F.1"),
    provenance: {
      source: {
        fieldPath: "source",
        sourceKind: "external",
        sourceRef: input.takeoverId,
        note: "external_takeover 4F.1 — preuves documentaires non réécrites",
      },
      "stocks.deficits": {
        fieldPath: "stocks.deficits",
        sourceKind: "external",
        note: "CandidateFiscalStocks explicitement présents (present y compris [] / 0)",
      },
      "stocks.amortissementsReportes": {
        fieldPath: "stocks.amortissementsReportes",
        sourceKind: "external",
        note: "Stock ARD historique — jamais case 318",
      },
    },
    validation,
  };
}

/**
 * Construit un FiscalYearOpening existant depuis une reprise externe.
 * Aucune donnée manquante inventée. Aucun recalcul historique.
 */
export function buildExternalTakeoverFiscalYearOpening(
  input: BuildExternalTakeoverFiscalYearOpeningInput,
): BuildExternalTakeoverFiscalYearOpeningResult {
  const issues: ExternalTakeoverOpeningIssue[] = [];

  const controlsGate = evaluateHistoricalControlsForExternalOpening(input.controls);
  if (controlsGate.status === "blocked") {
    return { status: "blocked", issues: controlsGate.reasons };
  }

  issues.push(...assertExplicitStocks(input.stocks));

  if (input.assets.length === 0) {
    issues.push(
      issue(
        "NO_ASSET_DETAIL",
        "Aucun CandidateHistoricalAsset — interdiction de synthétiser depuis les totaux 4E.",
        "assets",
      ),
    );
  }

  const mappedStocks = mapAcceptedCandidateStocksToOpening({ stocks: input.stocks });
  if (mappedStocks.status === "blocked") {
    for (const item of mappedStocks.issues) {
      issues.push(issue(item.code, item.message, item.path));
    }
  }

  const mappedAssets = mapAcceptedCandidateAssetsToOpening({
    assets: input.assets,
    stableAssetIdByCandidateKey: input.stableAssetIdByCandidateKey,
  });
  if (mappedAssets.status === "blocked") {
    for (const item of mappedAssets.issues) {
      issues.push(issue(item.code, item.message, item.path));
    }
  }

  if (issues.some((i) => i.severity === "error")) {
    return { status: "blocked", issues };
  }

  if (mappedStocks.status !== "mapped" || mappedAssets.status !== "mapped") {
    return {
      status: "blocked",
      issues: [
        ...issues,
        issue("MAPPING_INCOMPLETE", "Mapping 4B incomplet après contrôles stocks/assets."),
      ],
    };
  }

  // Stocks mapped : available uniquement si Candidate present — double check fail-closed.
  if (
    !isAvailable(mappedStocks.stocks.deficits) ||
    !isAvailable(mappedStocks.stocks.amortissementsReportes)
  ) {
    return {
      status: "blocked",
      issues: [
        issue(
          "STOCKS_UNAVAILABLE_AFTER_MAP",
          "Stocks mapped unavailable — UNKNOWN ne devient jamais 0/[].",
          "stocks",
        ),
      ],
    };
  }

  const anchorIssues = assertAnchoredAssetsReady(mappedAssets.assets);
  if (anchorIssues.length > 0) {
    return { status: "blocked", issues: [...issues, ...anchorIssues] };
  }

  const pendingOpening = assembleOpening({
    input,
    assets: mappedAssets.assets,
    stocks: mappedStocks.stocks,
    validation: { status: "pending" },
  });

  const structural = validateFiscalYearOpening(pendingOpening).filter(
    (i) => i.severity === "error",
  );
  if (structural.length > 0) {
    return { status: "blocked", issues: [...issues, ...fromOpeningIssues(structural)] };
  }

  if (controlsGate.status === "manual_review_required") {
    return {
      status: "manual_review_required",
      opening: pendingOpening,
      issues: [...controlsGate.reasons, ...issues],
    };
  }

  // 4E concordant + données ancrées → Opening validable (hash existant).
  const contentHash = computeOpeningContentHash(pendingOpening);
  const validatedOpening: FiscalYearOpening = {
    ...pendingOpening,
    validation: {
      status: "validated",
      openingRevision: pendingOpening.revision,
      contentHash,
      validatedAt: input.validatedAt ?? new Date(0).toISOString(),
      validator: input.validator ?? "lot4f1-external-takeover-builder",
    },
  };

  const validatedIssues = validateFiscalYearOpening(validatedOpening).filter(
    (i) => i.severity === "error",
  );
  if (validatedIssues.length > 0) {
    return { status: "blocked", issues: fromOpeningIssues(validatedIssues) };
  }

  return { status: "built", opening: validatedOpening };
}
