/**
 * Exceptions documentées à la règle géométrique absolue de la generation
 * gate (voir `checkOverlappingPositions`, `gate/generation-gate.ts`) : deux
 * `CerfaCase` distinctes ne doivent jamais être rendues exactement au même
 * (page, x, y) d'un même formulaire/millésime.
 *
 * Ce fichier est volontairement VIDE au moment de cette mission — après
 * correction de la case 372 (2033-B-SD) et de C_L1_COL1/C_L1_COL2
 * (2031-SD), qui étaient les deux seules superpositions connues dans le
 * registre, aucune superposition légitime ne reste à documenter.
 *
 * Il existe pour le jour où une superposition serait un jour réellement
 * voulue (ex. deux cases mutuellement exclusives du point de vue du mapper,
 * ET dont le Cerfa officiel lui-même ne réserve qu'un seul espace physique
 * — pas le cas de C_L1_COL1/COL2, qui ont chacune leur propre boîte sur le
 * formulaire officiel). AUCUNE RÈGLE FISCALE ici : une exception documente
 * un fait géométrique du Cerfa officiel (une seule case physique existe à
 * cet endroit), jamais une décision sur ce que le mapper doit y écrire.
 */
import type { CerfaFormId, Millesime } from "./types";

export type OverlapException = {
  form: CerfaFormId;
  millesime: Millesime;
  /** Les deux (ou plus) caseId dont la position partagée est documentée comme voulue. */
  caseIds: readonly string[];
  reason: string;
};

export const CERFA_OVERLAP_EXCEPTIONS_2026: readonly OverlapException[] = [];

export function isDocumentedOverlap(form: CerfaFormId, millesime: Millesime, caseIds: readonly string[]): boolean {
  const sorted = [...caseIds].sort();
  return CERFA_OVERLAP_EXCEPTIONS_2026.some(
    (entry) =>
      entry.form === form &&
      entry.millesime === millesime &&
      entry.caseIds.length === sorted.length &&
      [...entry.caseIds].sort().every((id, i) => id === sorted[i]),
  );
}
