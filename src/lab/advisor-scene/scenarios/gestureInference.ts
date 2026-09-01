import type { Gesture, SceneState, SubjectId } from "@/lab/advisor-scene/types";
import { visibleSubjects } from "@/lab/advisor-scene/types";

/**
 * Déduit, pour chaque sujet dont l'état a changé entre deux SceneState, quel
 * geste s'applique. Volontairement simple — ces règles sont destinées à
 * évoluer au contact du prototype, pas à être figées ici.
 */
export function inferGestures(previous: SceneState, next: SceneState): Record<SubjectId, Gesture> {
  const gestures: Record<SubjectId, Gesture> = {};

  const previousVisible = visibleSubjects(previous.subjects);
  const previousActiveIndex = previousVisible.findIndex((s) => s.id === previous.activeId);
  const previousById = new Map(previous.subjects.map((s) => [s.id, s]));

  for (const subject of next.subjects) {
    const before = previousById.get(subject.id);
    const wasActive = previous.activeId === subject.id;
    const isActive = next.activeId === subject.id;

    if (isActive && !wasActive) {
      const previousIndex = previousVisible.findIndex((s) => s.id === subject.id);
      const isAdjacent =
        previousIndex === -1 || previousActiveIndex === -1
          ? true
          : Math.abs(previousIndex - previousActiveIndex) <= 1;
      gestures[subject.id] = isAdjacent ? "presenter" : "rappeler";
      continue;
    }

    if (wasActive && !isActive) {
      gestures[subject.id] = "retirer";
      continue;
    }

    if (before && before.lifecycle !== subject.lifecycle) {
      gestures[subject.id] = subject.lifecycle === "reported" ? "rapprocher" : "ranger";
    }
  }

  return gestures;
}
