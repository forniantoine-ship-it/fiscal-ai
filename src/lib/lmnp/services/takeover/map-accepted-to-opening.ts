/**
 * Lot 4B — mapping PUR de candidates DÉJÀ ACCEPTÉES → structures Opening.
 *
 * Le caller a décidé l'acceptation (réconciliation 4E). Ce module :
 * - refuse inferred sauf opt-in explicite par chemin ;
 * - n'invente aucune valeur absente ;
 * - ne mint aucun assetId (map explicite obligatoire) ;
 * - ne valide pas FiscalYearOpening ;
 * - ne mappe jamais 318 → stock ARD.
 */

import {
  available,
  unavailable,
  type OpeningFact,
} from "@/lib/lmnp/services/fiscal-year-opening/opening-fact";
import type {
  FiscalCarryforwardStocks,
  OpeningAsset,
  OpeningAssetPlan,
  OpeningDeficitRow,
  OpeningProrataConvention,
} from "@/lib/lmnp/services/fiscal-year-opening/types";
import type { ImmobilisationComptableActif } from "@/lib/lmnp/types/dossier";
import { canOmitHistoricalProrata } from "./anchored-historical-prorata";
import type {
  CandidateAssetClassification,
  CandidateHistoricalAsset,
} from "./asset-candidates";
import {
  assertNotCase318AmortStockSource,
  type CandidateFiscalStocks,
} from "./fiscal-stocks-candidates";
import {
  isCandidatePresent,
  type CandidateValue,
  type CandidateValuePresent,
} from "./candidate-value";

export type MapAcceptedIssue = {
  code: string;
  message: string;
  path: string;
};

export type MapAcceptedStocksInput = {
  stocks: CandidateFiscalStocks;
  /**
   * Chemins autorisés à accepter une nature `inferred`
   * (ex. "stocks.amortissementsReportes"). Vide = aucun inferred.
   */
  acceptInferredPaths?: readonly string[];
};

export type MapAcceptedStocksResult =
  | { status: "mapped"; stocks: FiscalCarryforwardStocks }
  | { status: "blocked"; issues: MapAcceptedIssue[] };

export type MapAcceptedAssetsInput = {
  assets: readonly CandidateHistoricalAsset[];
  /**
   * assetId Fiscal AI stable — fourni explicitement par la réconciliation.
   * Clé = candidateKey. Absence → blocked (pas de mint ici).
   */
  stableAssetIdByCandidateKey: ReadonlyMap<string, string> | Readonly<Record<string, string>>;
  acceptInferredPaths?: readonly string[];
};

export type MapAcceptedAssetsResult =
  | { status: "mapped"; assets: OpeningAsset[] }
  | { status: "blocked"; issues: MapAcceptedIssue[] };

function resolveIdMap(
  map: MapAcceptedAssetsInput["stableAssetIdByCandidateKey"],
): ReadonlyMap<string, string> {
  if (map instanceof Map) return map;
  return new Map(Object.entries(map));
}

function issue(code: string, message: string, path: string): MapAcceptedIssue {
  return { code, message, path };
}

function assertAcceptablePresent<T>(
  value: CandidateValuePresent<T>,
  path: string,
  acceptInferredPaths: readonly string[],
  issues: MapAcceptedIssue[],
): boolean {
  if (value.nature === "inferred" && !acceptInferredPaths.includes(path)) {
    issues.push(
      issue(
        "INFERRED_NOT_ACCEPTED",
        `Nature inferred refusée pour « ${path} » sans opt-in explicite.`,
        path,
      ),
    );
    return false;
  }
  return true;
}

/**
 * Absent → unavailable (jamais 0 / []).
 * Present + nature refusée → undefined + issue.
 */
function toOpeningFact<T>(
  value: CandidateValue<T>,
  path: string,
  acceptInferredPaths: readonly string[],
  issues: MapAcceptedIssue[],
): OpeningFact<T> | undefined {
  if (!isCandidatePresent(value)) {
    return unavailable(value.reason ?? value.status);
  }
  if (!assertAcceptablePresent(value, path, acceptInferredPaths, issues)) {
    return undefined;
  }
  return available(value.value);
}

function classificationToCategorie(
  classification: CandidateAssetClassification | undefined,
  nonAmortizable: boolean | undefined,
): ImmobilisationComptableActif["categorie"] | undefined {
  if (nonAmortizable === true || classification === "terrain") return "terrain";
  if (classification === "travaux") return "travaux";
  if (
    classification === "batiment" ||
    classification === "mobilier" ||
    classification === "autre"
  ) {
    return "composant";
  }
  return undefined;
}

export function mapAcceptedCandidateStocksToOpening(
  input: MapAcceptedStocksInput,
): MapAcceptedStocksResult {
  const acceptInferredPaths = input.acceptInferredPaths ?? [];
  const issues: MapAcceptedIssue[] = [];

  if (input.stocks.amortissementsReportesSource !== undefined) {
    try {
      assertNotCase318AmortStockSource(input.stocks.amortissementsReportesSource);
    } catch (err) {
      issues.push(
        issue(
          "FORBIDDEN_ARD_SOURCE",
          err instanceof Error ? err.message : "Source ARD interdite.",
          "stocks.amortissementsReportesSource",
        ),
      );
    }
  }

  const deficits = toOpeningFact(
    input.stocks.deficits,
    "stocks.deficits",
    acceptInferredPaths,
    issues,
  );
  const amortissementsReportes = toOpeningFact(
    input.stocks.amortissementsReportes,
    "stocks.amortissementsReportes",
    acceptInferredPaths,
    issues,
  );

  if (issues.length > 0 || deficits === undefined || amortissementsReportes === undefined) {
    return { status: "blocked", issues };
  }

  return {
    status: "mapped",
    stocks: {
      deficits: deficits as OpeningFact<OpeningDeficitRow[]>,
      amortissementsReportes,
    },
  };
}

function mapOneAsset(
  asset: CandidateHistoricalAsset,
  stableId: string,
  acceptInferredPaths: readonly string[],
): { asset?: OpeningAsset; issues: MapAcceptedIssue[] } {
  const issues: MapAcceptedIssue[] = [];
  const base = `assets.${asset.candidateKey}`;

  const labelFact = toOpeningFact(asset.label, `${base}.label`, acceptInferredPaths, issues);
  if (!labelFact || labelFact.status !== "available") {
    if (!issues.some((i) => i.path === `${base}.label`)) {
      issues.push(
        issue("ASSET_LABEL_REQUIRED", "Label présent requis pour un actif accepté.", `${base}.label`),
      );
    }
    return { issues };
  }

  const coutBrut = toOpeningFact(asset.coutBrut, `${base}.coutBrut`, acceptInferredPaths, issues);
  const cumulOuverture = toOpeningFact(
    asset.cumulOuverture,
    `${base}.cumulOuverture`,
    acceptInferredPaths,
    issues,
  );
  if (coutBrut === undefined || cumulOuverture === undefined) {
    return { issues };
  }

  if (isCandidatePresent(asset.classification)) {
    assertAcceptablePresent(
      asset.classification,
      `${base}.classification`,
      acceptInferredPaths,
      issues,
    );
  }
  if (isCandidatePresent(asset.nonAmortizable)) {
    assertAcceptablePresent(
      asset.nonAmortizable,
      `${base}.nonAmortizable`,
      acceptInferredPaths,
      issues,
    );
  }
  if (issues.length > 0) return { issues };

  const classificationPresent = isCandidatePresent(asset.classification)
    ? asset.classification.value
    : undefined;
  const nonAmortPresent = isCandidatePresent(asset.nonAmortizable)
    ? asset.nonAmortizable.value
    : undefined;

  const categorie = classificationToCategorie(classificationPresent, nonAmortPresent);
  if (!categorie) {
    issues.push(
      issue(
        "ASSET_CATEGORIE_UNRESOLVED",
        "Classification / nonAmortizable absents — catégorie Opening non inventée.",
        `${base}.classification`,
      ),
    );
    return { issues };
  }

  let plan: OpeningFact<OpeningAssetPlan>;
  if (categorie === "terrain" || nonAmortPresent === true) {
    plan = available({ kind: "non_amortizable" });
  } else {
    const startDate = toOpeningFact(
      asset.startDate,
      `${base}.startDate`,
      acceptInferredPaths,
      issues,
    );
    const durationYears = toOpeningFact(
      asset.durationYears,
      `${base}.durationYears`,
      acceptInferredPaths,
      issues,
    );
    if (startDate === undefined || durationYears === undefined) {
      return { issues };
    }

    const prorataPresent = isCandidatePresent(asset.prorataConvention);
    let prorataFact: OpeningFact<OpeningProrataConvention> | undefined;
    if (prorataPresent) {
      const mappedProrata = toOpeningFact(
        asset.prorataConvention,
        `${base}.prorataConvention`,
        acceptInferredPaths,
        issues,
      );
      if (mappedProrata === undefined) return { issues };
      prorataFact = mappedProrata;
    }

    if (
      startDate.status === "available" &&
      durationYears.status === "available" &&
      prorataFact?.status === "available"
    ) {
      plan = available({
        kind: "amortizable",
        startDate: startDate.value,
        durationYears: durationYears.value,
        prorataConvention: prorataFact.value,
      });
    } else if (
      startDate.status === "available" &&
      durationYears.status === "available" &&
      !prorataPresent &&
      canOmitHistoricalProrata(asset)
    ) {
      plan = available({
        kind: "amortizable",
        startDate: startDate.value,
        durationYears: durationYears.value,
      });
    } else {
      plan = unavailable("plan amortissable incomplet — paramètres absents non inventés");
    }
  }

  if (isCandidatePresent(asset.method)) {
    if (!assertAcceptablePresent(asset.method, `${base}.method`, acceptInferredPaths, issues)) {
      return { issues };
    }
    if (asset.method.value !== "lineaire" && categorie !== "terrain") {
      issues.push(
        issue(
          "METHOD_UNSUPPORTED",
          `Méthode « ${asset.method.value} » non mappable vers Opening V1 (linéaire seul).`,
          `${base}.method`,
        ),
      );
      return { issues };
    }
  }

  let propertyId: string | undefined;
  if (isCandidatePresent(asset.propertyId)) {
    if (
      !assertAcceptablePresent(asset.propertyId, `${base}.propertyId`, acceptInferredPaths, issues)
    ) {
      return { issues };
    }
    propertyId = asset.propertyId.value;
  }

  return {
    asset: {
      id: stableId,
      propertyId,
      label: labelFact.value,
      categorie,
      coutBrut,
      cumulOuverture,
      plan,
    },
    issues,
  };
}

export function mapAcceptedCandidateAssetsToOpening(
  input: MapAcceptedAssetsInput,
): MapAcceptedAssetsResult {
  const acceptInferredPaths = input.acceptInferredPaths ?? [];
  const idMap = resolveIdMap(input.stableAssetIdByCandidateKey);
  const issues: MapAcceptedIssue[] = [];
  const mapped: OpeningAsset[] = [];

  for (const asset of input.assets) {
    const stableId = idMap.get(asset.candidateKey);
    if (!stableId || stableId.trim() === "") {
      issues.push(
        issue(
          "STABLE_ASSET_ID_REQUIRED",
          `Aucun assetId stable fourni pour candidateKey « ${asset.candidateKey} » — pas de mint dans Lot 4B.`,
          `assets.${asset.candidateKey}`,
        ),
      );
      continue;
    }
    if (/^f010-\d+$/.test(stableId)) {
      issues.push(
        issue(
          "STABLE_ASSET_ID_INDEX_BASED",
          `assetId index-based interdit : « ${stableId} ».`,
          `assets.${asset.candidateKey}`,
        ),
      );
      continue;
    }
    const result = mapOneAsset(asset, stableId, acceptInferredPaths);
    issues.push(...result.issues);
    if (result.asset && result.issues.length === 0) {
      mapped.push(result.asset);
    }
  }

  if (issues.length > 0) {
    return { status: "blocked", issues };
  }
  return { status: "mapped", assets: mapped };
}
