import type { FiscalResult } from "../f006/types";
import { map2031IdentiteCases } from "./map-2031-identite";
import { map2031RecapitulationCases } from "./map-2031-recapitulation";
import { map2031RegimeCases } from "./map-2031-regime";
import type { Form2031SD, IdentiteDeclarante, MapForm2031Output } from "./types";

/**
 * Composition explicite TRF-0033 / 2031-SD (ADR-003).
 * Assemble les sections sans recalculer la fiscalité.
 */
export function assembleForm2031SD(
  fiscalResult: FiscalResult,
  identite: IdentiteDeclarante,
): MapForm2031Output {
  const cases = [
    ...map2031IdentiteCases(identite),
    ...map2031RegimeCases(),
    ...map2031RecapitulationCases(fiscalResult),
  ];

  const form: Form2031SD = {
    formId: "2031-SD",
    millésime: fiscalResult.exercice,
    cases,
  };

  return { form, anomalies: [] };
}
