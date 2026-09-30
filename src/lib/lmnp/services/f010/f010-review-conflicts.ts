/**
 * Helpers PURS de la review documentaire F010 (ordre des champs revus, valeur courante, champs visibles, conflits).
 * Extraits tels quels du panel React (`F010LogementAssistantPanel.tsx`, qui les réexporte) pour pouvoir être consommés
 * par un read model sans importer React. Aucun changement de comportement.
 */
import type {
  F010ExtractionReview,
  F010ExtractionReviewField,
  F010ReviewFieldKey,
  F010State,
} from "@/runtime/assistants/f010-logement/types";

export const F010_REVIEW_FIELD_ORDER: readonly F010ReviewFieldKey[] = [
  "prixAcquisition",
  "dateAcquisition",
  "typeBien",
  "surface",
  "adresse",
  "fraisNotaire",
];

export function f010ReviewFieldCurrentValue(state: F010State, field: F010ReviewFieldKey): string | undefined {
  const value = state[field];
  return value === undefined ? undefined : String(value);
}

/** Champs "unavailable" jamais affichés (pas de fausse carte vide) — resolveNextMissingF010Field s'en charge plus tard. */
export function computeF010ReviewVisibleEntries(
  review: F010ExtractionReview | undefined,
): (readonly [F010ReviewFieldKey, F010ExtractionReviewField])[] {
  if (!review) return [];
  return F010_REVIEW_FIELD_ORDER.map((field) => [field, review.fields[field]] as const).filter(
    ([, entry]) => entry.status !== "unavailable",
  );
}

/**
 * Un champ "pending" est en conflit quand une valeur était déjà confirmée
 * (session précédente ou saisie manuelle) et que la nouvelle proposition du
 * document diffère — jamais un écrasement silencieux (règle Cycle 3, réutilisée
 * telle quelle, jamais réinterprétée).
 */
export function isF010ReviewFieldConflict(
  state: F010State,
  field: F010ReviewFieldKey,
  entry: F010ExtractionReviewField,
): boolean {
  if (entry.status !== "pending") return false;
  if (state.confirmed?.[field] !== true) return false;
  const currentValue = f010ReviewFieldCurrentValue(state, field);
  return currentValue !== undefined && currentValue !== entry.proposedValue;
}

/** Champs en conflit sur l'écran de review (Cycle 4E6A-C2). */
export function collectF010ReviewConflictFields(
  state: F010State,
  visibleEntries: (readonly [F010ReviewFieldKey, F010ExtractionReviewField])[] = computeF010ReviewVisibleEntries(
    state.review,
  ),
): F010ReviewFieldKey[] {
  return visibleEntries
    .filter(([field, entry]) => isF010ReviewFieldConflict(state, field, entry))
    .map(([field]) => field);
}
