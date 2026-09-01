import type { F012State } from "@/runtime";

/**
 * Étapes F012 où un F5 immédiat (< debounce 350 ms) ferait perdre un état
 * coûteux à reconstruire. Miroir de `F011_CRITICAL_PERSIST_STEPS` —
 * `flushWorkspace` est demandé après persistance.
 *
 * - `aggregate_review` : toutes les catégories renseignées, résultat en
 *   attente de confirmation finale — perdre cet état force à tout reposer.
 * - `complete` : confirmation finale + signal legacy (`chargesConfirmedAt`).
 *
 * Les étapes `category_collect` (et ses sous-étapes travaux) ne sont pas
 * critiques : une seule catégorie/dépense à ressaisir, coût de reconstruction
 * faible — même logique que F011 (`loan_collect`/`loan_type` hors périmètre).
 */
export const F012_CRITICAL_PERSIST_STEPS: ReadonlySet<F012State["step"]> = new Set([
  "aggregate_review",
  "complete",
]);

export function shouldFlushF012PersistedStep(step: F012State["step"]): boolean {
  return F012_CRITICAL_PERSIST_STEPS.has(step);
}
