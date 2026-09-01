import type { Gesture, Subject, SubjectId, SubjectLifecycle } from "@/lab/advisor-scene/types";

/** Un instant de la situation : l'état résultant, jamais un delta impératif. */
export type Beat = {
  /** Cycle de vie attendu pour chaque sujet mentionné (les autres sont inchangés). */
  lifecycle: Partial<Record<SubjectId, SubjectLifecycle>>;
  /** Le sujet que le Conseiller présente à l'issue de ce beat. */
  activeId: SubjectId | null;
  /** Texte d'annotation pour l'observateur — jamais affiché dans la scène elle-même. */
  caption: string;
  /**
   * Force un geste plutôt que de le laisser déduire du diff d'état — utile
   * pour démontrer délibérément un geste précis (ex. rappeler) indépendamment
   * de ce que la déduction automatique aurait choisi.
   */
  forcedGesture?: Partial<Record<SubjectId, Gesture>>;
};

export type Scenario = {
  id: string;
  title: string;
  description: string;
  /** Le roster de départ, propre à ce scénario — jamais partagé implicitement. */
  baseSubjects: Subject[];
  beats: Beat[];
};
