/**
 * Lot 4F.2 — preuve structurelle minimale qu'une FiscalYearOpening peut
 * autoriser EXTERNAL_HISTORY et alimenter le moteur N.
 *
 * Connaît uniquement FiscalYearOpening (pas les types takeover 4C/4D/4E).
 * Fail-closed : toute précondition manquante → false.
 */

import type { FiscalYearOpening } from "./types";

/**
 * Opening utilisable pour EXTERNAL_HISTORY / déclaration N.
 *
 * Préconditions :
 * 1. validation.status === "validated"
 * 2. source.kind === "external_takeover"
 * 3. targetFiscalYear === exercice demandé
 */
export function isUsableExternalTakeoverOpening(
  opening: FiscalYearOpening | undefined,
  requestedFiscalYear: number,
): boolean {
  if (!opening) return false;
  if (!Number.isFinite(requestedFiscalYear)) return false;
  if (opening.validation.status !== "validated") return false;
  if (opening.source.kind !== "external_takeover") return false;
  if (opening.targetFiscalYear !== requestedFiscalYear) return false;
  return true;
}
