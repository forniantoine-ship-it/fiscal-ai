/**
 * Lot 4B — candidates stocks fiscaux (déficits + ARD historique).
 *
 * G10 / Lot 1 : amortissementsReportes = STOCK historique uniquement.
 * La case 2033-B 318 (mouvement annuel) n'est PAS une source admissible.
 */

import type { OpeningDeficitRow } from "@/lib/lmnp/services/fiscal-year-opening/types";
import type { CandidateValue } from "./candidate-value";

export type CandidateDeficitRow = OpeningDeficitRow;

/**
 * Sources admissibles du stock ARD — explicitement hors case 318.
 * Aucune variante « cerfa_2033b_318 » / « case_318 » n'existe volontairement.
 */
export type AmortissementsReportesCandidateSource =
  | "stock_historique_explicit"
  | "accountant_followup"
  | "aide_document"
  | "manual_entry"
  | "other_explicit_stock";

export type CandidateFiscalStocks = {
  deficits: CandidateValue<CandidateDeficitRow[]>;
  amortissementsReportes: CandidateValue<number>;
  /**
   * Qualifie la source du stock ARD lorsque présent.
   * Absent si amortissementsReportes n'est pas present.
   */
  amortissementsReportesSource?: AmortissementsReportesCandidateSource;
};

/** Garde-fou compile-time + runtime : 318 n'est pas une source ARD. */
export function assertNotCase318AmortStockSource(
  source: AmortissementsReportesCandidateSource | string,
): asserts source is AmortissementsReportesCandidateSource {
  const forbidden = /318|mouvement.?annuel|amortNonDeduit/i;
  if (forbidden.test(source)) {
    throw new Error(
      `Source ARD interdite (« ${source} ») — case 318 / mouvement annuel ≠ stock historique.`,
    );
  }
  const allowed: readonly AmortissementsReportesCandidateSource[] = [
    "stock_historique_explicit",
    "accountant_followup",
    "aide_document",
    "manual_entry",
    "other_explicit_stock",
  ];
  if (!(allowed as readonly string[]).includes(source)) {
    throw new Error(`Source ARD inconnue : « ${source} ».`);
  }
}
