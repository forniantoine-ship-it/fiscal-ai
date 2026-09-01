import type { CompositionStrategy } from "@/lab/advisor-scene/composition/CompositionStrategy";
import { lifecycleBias, withOffsets } from "@/lab/advisor-scene/composition/composeUtils";

/**
 * Profondeur — les sujets au repos reculent réellement dans l'espace
 * (translateZ) plutôt que de s'étaler latéralement. Géométrie pure (ADR-009 v2.0).
 */
export const DepthComposition: CompositionStrategy = (subjects, activeId) => {
  const result: ReturnType<CompositionStrategy> = {};

  for (const { subject, offset } of withOffsets(subjects, activeId)) {
    const bias = lifecycleBias(subject);
    const abs = Math.abs(offset) * bias;

    result[subject.id] =
      offset === 0
        ? { x: 0, y: 0, scale: 1, rotate: 0, z: 100, depth: 0 }
        : {
            x: offset * 38 * bias,
            y: abs * 10,
            scale: Math.max(1 - abs * 0.05, 0.7),
            rotate: 0,
            z: Math.max(100 - abs * 10, 10),
            depth: -abs * 90,
          };
  }

  return result;
};
