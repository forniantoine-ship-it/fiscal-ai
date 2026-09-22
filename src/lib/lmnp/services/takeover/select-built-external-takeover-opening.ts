/**
 * Lot 4F.2 — extrait une Opening utilisable depuis un résultat 4F.1 déjà calculé.
 *
 * Ne reconstruit / reparse / revalide aucun document.
 * Fail-closed sur manual_review_required et blocked.
 */

import type { FiscalYearOpening } from "@/lib/lmnp/services/fiscal-year-opening/types";
import { isUsableExternalTakeoverOpening } from "@/lib/lmnp/services/fiscal-year-opening/is-usable-external-takeover-opening";
import type { BuildExternalTakeoverFiscalYearOpeningResult } from "./build-external-takeover-opening";

export type SelectBuiltExternalTakeoverOpeningResult =
  | { status: "ready"; opening: FiscalYearOpening }
  | {
      status: "blocked";
      code:
        | "MANUAL_REVIEW_REQUIRED"
        | "BUILD_BLOCKED"
        | "OPENING_NOT_USABLE"
        | "FISCAL_YEAR_MISMATCH";
      message: string;
    };

/**
 * Sélectionne l'Opening d'un build 4F.1 uniquement si `status === "built"`
 * et que les préconditions EXTERNAL_HISTORY sont satisfaites.
 */
export function selectBuiltExternalTakeoverOpening(input: {
  buildResult: BuildExternalTakeoverFiscalYearOpeningResult;
  requestedFiscalYear: number;
}): SelectBuiltExternalTakeoverOpeningResult {
  const { buildResult, requestedFiscalYear } = input;

  if (buildResult.status === "manual_review_required") {
    return {
      status: "blocked",
      code: "MANUAL_REVIEW_REQUIRED",
      message:
        "Reprise externe en revue manuelle — génération N interdite jusqu'à résolution humaine.",
    };
  }

  if (buildResult.status === "blocked") {
    return {
      status: "blocked",
      code: "BUILD_BLOCKED",
      message: "Reprise externe bloquée — génération N interdite.",
    };
  }

  // status === "built"
  if (!isUsableExternalTakeoverOpening(buildResult.opening, requestedFiscalYear)) {
    if (buildResult.opening.targetFiscalYear !== requestedFiscalYear) {
      return {
        status: "blocked",
        code: "FISCAL_YEAR_MISMATCH",
        message: `Opening targetFiscalYear (${buildResult.opening.targetFiscalYear}) ≠ exercice demandé (${requestedFiscalYear}).`,
      };
    }
    return {
      status: "blocked",
      code: "OPENING_NOT_USABLE",
      message: "Opening built mais non utilisable (validation / source).",
    };
  }

  return { status: "ready", opening: buildResult.opening };
}
