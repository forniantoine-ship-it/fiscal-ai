import type { Geometry, Lighting, Subject, SubjectId } from "@/lab/advisor-scene/types";

/**
 * Le Lighting System décide de l'atmosphère à partir de la géométrie déjà
 * calculée par la Composition Strategy — jamais l'inverse (ADR-009 v2.0).
 * Valeurs statiques uniquement : l'animation entre deux états reste au
 * Motion Engine.
 */
export type LightingStrategy = (
  subjects: Subject[],
  activeId: SubjectId | null,
  geometry: Record<SubjectId, Geometry>,
) => Record<SubjectId, Lighting>;
