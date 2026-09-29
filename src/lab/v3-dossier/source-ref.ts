/**
 * Source attachée à une ligne de restitution. `detail` (page, échéance…) est optionnel : le chemin réel n'en a jamais,
 * aucune ancre n'étant persistée — il n'est jamais inventé.
 */
export type SourceRef = {
  document: string;
  detail?: string;
};
