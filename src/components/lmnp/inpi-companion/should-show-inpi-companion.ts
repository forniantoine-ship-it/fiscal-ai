import type { InpiStatus } from "@/lib/lmnp/types/dossier";

/**
 * Visibilité du Compagnon INPI (Activité + résumé Dashboard).
 * Lecture exclusive de `Dossier.inpiStatus` — jamais `siren`/`siret`.
 * `undefined` n'est pas `not_started` : situation non qualifiée ≠ démarche absente.
 */
const VISIBLE_INPI_STATUSES: ReadonlySet<InpiStatus> = new Set([
  "preparing",
  "in_progress",
  "modification_in_progress",
  "submitted",
  "regularization_required",
]);

export function shouldShowInpiCompanion(status: InpiStatus | undefined): boolean {
  if (status === undefined) return false;
  return VISIBLE_INPI_STATUSES.has(status);
}
