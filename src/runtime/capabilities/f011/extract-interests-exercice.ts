import type { Anomaly } from "../../contracts/Anomaly";
import type { EcheanceMensuelle } from "./types";
import { round2 } from "./types";

/**
 * TRF-0016 — Extraction des intérêts et assurance du prêt pour la période exercice.
 * Fonde AX-009 (seuls intérêts et assurance sont retenus).
 */
export type ExtractInterestsExerciceInput = {
  echeances: EcheanceMensuelle[];
  exerciceFiscal: number;
};

export type ExtractInterestsExerciceOutput = {
  interetsExercice: number;
  assuranceExercice: number;
  capitalRembourseExercice: number;
  capitalRestantDu31_12: number;
  anomalies: Anomaly[];
};

function isInFiscalYear(dateIso: string, exerciceFiscal: number): boolean {
  return new Date(dateIso).getFullYear() === exerciceFiscal;
}

export function extractInterestsExercice(
  input: ExtractInterestsExerciceInput,
): ExtractInterestsExerciceOutput {
  const anomalies: Anomaly[] = [];
  const rows = input.echeances.filter((e) => isInFiscalYear(e.date, input.exerciceFiscal));

  let interetsExercice = 0;
  let assuranceExercice = 0;
  let capitalRembourseExercice = 0;

  for (const row of rows) {
    interetsExercice += row.interets;
    assuranceExercice += row.assurance;
    capitalRembourseExercice += row.capital;
  }

  const lastInYear = [...input.echeances]
    .filter((e) => new Date(e.date).getFullYear() <= input.exerciceFiscal)
    .at(-1);

  const capitalRestantDu31_12 = lastInYear?.capitalRestantDu ?? 0;

  if (rows.length === 0 && input.echeances.length > 0) {
    anomalies.push({
      severity: "warning",
      message: "Aucune échéance ne couvre l'exercice fiscal demandé.",
    });
  }

  return {
    interetsExercice: round2(interetsExercice),
    assuranceExercice: round2(assuranceExercice),
    capitalRembourseExercice: round2(capitalRembourseExercice),
    capitalRestantDu31_12: round2(capitalRestantDu31_12),
    anomalies,
  };
}
