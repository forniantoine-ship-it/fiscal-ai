import type { F011State } from "@/runtime";

/**
 * Étapes F011 où un F5 immédiat (< debounce 350 ms) ferait perdre un état
 * coûteux à reconstruire (plusieurs questions déjà répondues). Miroir de
 * `F010_CRITICAL_PERSIST_STEPS` — `flushWorkspace` est demandé après persistance.
 *
 * - `loan_review` : tous les compléments du prêt (assurance/garantie/frais/IRA)
 *   déjà répondus, aperçu calculé — perdre cet état force à tout reposer.
 * - `aggregate_review` : tous les prêts configurés, en attente de confirmation finale.
 * - `complete` : confirmation finale + signaux legacy (`creditConfirmedAt`/`creditDeclaredNoneAt`).
 * - `loan_analyzing` (Cycle 5) : `analyzingDocumentId` doit être persisté AVANT
 *   l'appel OCR/GPT, pas après — sinon un F5 pendant l'analyse perd la trace
 *   du document et ne peut plus la reprendre.
 * - `loan_review_extraction` (Cycle 5) : extraction déjà obtenue, coûteuse à
 *   refaire (nouvel appel OCR/GPT) si perdue avant confirmation.
 */
export const F011_CRITICAL_PERSIST_STEPS: ReadonlySet<F011State["step"]> = new Set([
  "loan_analyzing",
  "loan_review_extraction",
  "loan_review",
  "aggregate_review",
  "complete",
]);

export function shouldFlushF011PersistedStep(step: F011State["step"]): boolean {
  return F011_CRITICAL_PERSIST_STEPS.has(step);
}
