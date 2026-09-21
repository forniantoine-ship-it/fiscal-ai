/**
 * Lot 4 — year-safety des outputs annuels assistants.
 *
 * Règle :
 * - `exerciceFiscal` présent et ≠ exercice actif → stale (refus).
 * - `exerciceFiscal` présent et = exercice actif → OK.
 * - `exerciceFiscal` absent → legacy : on ne peut pas prouver un mismatch ;
 *   accepté pour ne pas casser les dossiers antérieurs au stamp (N+1 purge
 *   les outputs N via createNextDeclarationDraft, donc le risque est borné).
 */

export type AnnualOutputYearField = {
  exerciceFiscal?: number;
};

/** Soft : legacy sans millésime reste utilisable ; mismatch explicite refusé. */
export function isAnnualOutputForActiveYear(
  output: AnnualOutputYearField | null | undefined,
  activeYear: number,
): boolean {
  if (!output) return false;
  if (typeof output.exerciceFiscal !== "number") return true;
  return output.exerciceFiscal === activeYear;
}

/** Strict : exige une preuve positive d'appartenance à l'exercice actif. */
export function isAnnualOutputProvenForActiveYear(
  output: AnnualOutputYearField | null | undefined,
  activeYear: number,
): boolean {
  if (!output) return false;
  if (typeof output.exerciceFiscal !== "number") return false;
  return output.exerciceFiscal === activeYear;
}

export function annualOutputYearMismatchReason(
  field: string,
  output: AnnualOutputYearField | null | undefined,
  activeYear: number,
): string | undefined {
  if (!output) return undefined;
  if (typeof output.exerciceFiscal !== "number") return undefined;
  if (output.exerciceFiscal !== activeYear) {
    return `${field} appartient à ${output.exerciceFiscal}, pas à l'exercice actif ${activeYear}.`;
  }
  return undefined;
}
