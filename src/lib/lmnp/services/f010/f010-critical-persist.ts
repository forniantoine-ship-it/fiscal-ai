import type { F010State } from "@/runtime";

/**
 * Étapes F010 où un F5 immédiat (< debounce 350 ms) ferait perdre un état
 * difficile à reconstruire. `flushWorkspaceSave` est demandé après persistance.
 *
 * - `review_extraction` : revue documentaire post-analyse (abandon / F5 fréquent).
 * - `review_plan` : plan d'amortissement calculé (B1 repro).
 * - `blocked_missing_date` : toutes les réponses F010 viennent d'être
 *   saisies (même point de collecte complète que `review_plan`) — seule la
 *   précondition F-009 manque encore (réserve 1, audit Option B).
 * - `complete` : confirmation finale + signaux legacy.
 */
export const F010_CRITICAL_PERSIST_STEPS: ReadonlySet<F010State["step"]> = new Set([
  "review_extraction",
  "review_plan",
  "blocked_missing_date",
  "complete",
]);

export function shouldFlushF010PersistedStep(step: F010State["step"]): boolean {
  return F010_CRITICAL_PERSIST_STEPS.has(step);
}
