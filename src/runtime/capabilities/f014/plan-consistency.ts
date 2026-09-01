import { round2 } from "./types";

/**
 * Détecte un écart entre le total validé (persisté dans `amortissementAssistant`)
 * et le total recalculé à partir de l'état courant du logement/travaux — signe
 * que le logement (F-010) ou les travaux (F-012) ont changé depuis la dernière
 * validation F-014, sans que le plan ait été revalidé.
 */
export function hasAmortissementDrifted(validatedTotal: number, currentTotal: number): boolean {
  return round2(validatedTotal) !== round2(currentTotal);
}

export type FiscalResultJournalEntry = { trf: string; label: string; value: number | string };

/**
 * Vérifie que le `FiscalResult` (F-006) déjà calculé pour cet exercice a bien
 * consommé le total d'amortissement actuellement affiché en F-014 (TRF-0012).
 * Si le journal indique un autre montant, le résultat fiscal stocké est
 * obsolète (logement/travaux modifiés depuis) et ne doit pas être présenté
 * comme la répartition déduit/reporté de cette année.
 */
export function fiscalResultMatchesAmortissementTotal(
  journal: FiscalResultJournalEntry[],
  currentTotalDotations: number,
): boolean {
  const entry = journal.find((line) => line.trf === "TRF-0012");
  return typeof entry?.value === "number" && round2(entry.value) === round2(currentTotalDotations);
}
