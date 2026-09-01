import type { CompositionStrategy } from "@/lab/advisor-scene/composition/CompositionStrategy";
import { lifecycleBias, withOffsets } from "@/lab/advisor-scene/composition/composeUtils";

/**
 * Éventail — les sujets au repos s'étalent de part et d'autre du sujet actif,
 * comme des documents posés sur une table. Géométrie pure (ADR-009 v2.0) ;
 * la profondeur réelle (translateZ) porte l'essentiel de l'éloignement,
 * l'échelle ne fait plus qu'un ajustement léger par-dessus.
 */
export const FanComposition: CompositionStrategy = (subjects, activeId) => {
  const result: ReturnType<CompositionStrategy> = {};

  for (const { subject, offset } of withOffsets(subjects, activeId)) {
    const bias = lifecycleBias(subject);
    const abs = Math.abs(offset) * bias;

    result[subject.id] =
      offset === 0
        ? { x: 0, y: 0, scale: 1, rotate: 0, z: 100, depth: 0 }
        : {
            x: offset * 128 * bias,
            y: Math.min(abs * 14, 42),
            scale: Math.max(1 - abs * 0.06, 0.72),
            rotate: offset * 5,
            z: Math.max(100 - abs * 10, 10),
            depth: -abs * 64,
          };
  }

  return result;
};
