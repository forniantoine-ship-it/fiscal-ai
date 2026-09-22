/**
 * Hash de contenu déterministe pour `OpeningValidation`.
 * Lot 1 — contrôles purs uniquement ; aucune validation serveur.
 */

import type { FiscalYearOpening } from "./types";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

/** Contenu soumis au hash — exclut `validation` (sinon circularité). */
export function openingContentForHash(opening: FiscalYearOpening): unknown {
  const { validation: _validation, ...rest } = opening;
  return rest;
}

/** FNV-1a 32-bit — déterministe, sans dépendance crypto réseau. */
export function computeOpeningContentHash(opening: FiscalYearOpening): string {
  const payload = stableStringify(openingContentForHash(opening));
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * Une modification du contenu après validation doit invalider conceptuellement
 * la validation (hash / révision). Lot 1 : détection pure, pas de state machine.
 */
export function isOpeningValidationIntact(opening: FiscalYearOpening): boolean {
  if (opening.validation.status !== "validated") return true;
  if (opening.validation.openingRevision !== opening.revision) return false;
  return opening.validation.contentHash === computeOpeningContentHash(opening);
}
