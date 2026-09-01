import type { Geometry, Subject, SubjectId } from "@/lab/advisor-scene/types";

/**
 * Une composition est une fonction pure : sujets + sujet actif → géométrie cible.
 * Géométrie uniquement (ADR-009 v2.0) — jamais d'opacité ni de flou, qui
 * appartiennent au Lighting System. Ne sait rien de l'animation, ni de
 * pourquoi le sujet actif a changé.
 */
export type CompositionStrategy = (
  subjects: Subject[],
  activeId: SubjectId | null,
) => Record<SubjectId, Geometry>;
