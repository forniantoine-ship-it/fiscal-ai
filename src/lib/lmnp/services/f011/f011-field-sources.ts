import type { F011LoanDraft } from "@/runtime";
import type { FieldSource } from "@/runtime";

/**
 * Correctif Cycle 11 (F-011) — invariant : `fieldSources` ne doit jamais
 * revendiquer une provenance pour un champ que `pendingLoan` ne porte plus.
 *
 * Bug corrigé : `go_back` restaure `pendingLoan` depuis l'historique mais
 * conserve le `fieldSources` courant tel quel (celui-ci n'a jamais fait
 * partie du snapshot d'historique — voir `F011HistorySnapshot`). Après un
 * retour en arrière suffisamment profond pour vider `pendingLoan` (au-delà
 * d'une extraction abandonnée), `fieldSources` continue de prétendre
 * `"extracted"` sur des champs redevenus inconnus. Une saisie manuelle
 * fraîche sur l'un de ces champs est alors classée à tort `"user_correction"`
 * par `classifyManualSource` (qui ne compare que la valeur, jamais si le
 * champ existe encore réellement dans `pendingLoan`).
 *
 * Cette fonction ne fait que rétablir l'invariant : jamais de provenance
 * sans valeur correspondante. Elle ne touche jamais un champ dont
 * `pendingLoan` porte encore une valeur réelle (extraite ou saisie) — jamais
 * de correction d'une provenance métier valide.
 */
export function reconcileFieldSourcesWithPendingLoan(
  fieldSources: Partial<Record<string, FieldSource>>,
  pendingLoan: Partial<F011LoanDraft> | undefined,
): Partial<Record<string, FieldSource>> {
  const reconciled = { ...fieldSources };
  for (const key of Object.keys(reconciled)) {
    if (pendingLoan?.[key as keyof F011LoanDraft] === undefined) {
      delete reconciled[key];
    }
  }
  return reconciled;
}
