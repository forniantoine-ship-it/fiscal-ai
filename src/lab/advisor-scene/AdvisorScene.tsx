"use client";

import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import type { CompositionStrategy } from "@/lab/advisor-scene/composition/CompositionStrategy";
import type { LightingStrategy } from "@/lab/advisor-scene/lighting/LightingStrategy";
import { computeMotionStyle } from "@/lab/advisor-scene/motion/MotionEngine";
import { AdvisorSubjectFace } from "@/lab/advisor-scene/subjectFace/AdvisorSubjectFace";
import type { Gesture, SceneState, SubjectId } from "@/lab/advisor-scene/types";
import { visibleSubjects } from "@/lab/advisor-scene/types";
import type { SceneVariant } from "@/lab/advisor-scene/variants";

/**
 * Scene Engine — orchestrateur. Ne calcule ni géométrie ni atmosphère
 * lui-même : il appelle la Composition Strategy puis le Lighting System,
 * deux fonctions pures indépendantes, et assemble leurs résultats pour le
 * Motion Engine (ADR-009 v2.0). L'échelle de la variante (A/B/C, Sprint 2)
 * est appliquée ici, à l'assemblage — aucune des trois couches n'en a
 * connaissance, leur contrat reste inchangé.
 */
export function AdvisorScene({
  scene,
  composition,
  lighting,
  gestureBySubject,
  variant,
}: {
  scene: SceneState;
  composition: CompositionStrategy;
  lighting: LightingStrategy;
  gestureBySubject: Record<SubjectId, Gesture>;
  variant: SceneVariant;
}) {
  const geometry = composition(scene.subjects, scene.activeId);
  const atmosphere = lighting(scene.subjects, scene.activeId, geometry);
  const visible = visibleSubjects(scene.subjects);

  return (
    <div
      style={{
        position: "relative",
        height: "420px",
        borderRadius: radius.xl,
        border: `1px solid ${colors.border.subtle}`,
        backgroundColor: colors.background.creamWarm,
        overflow: "hidden",
        perspective: "1200px",
        perspectiveOrigin: "50% 42%",
      }}
    >
      {visible.map((subject) => {
        const g = geometry[subject.id];
        const l = atmosphere[subject.id];
        if (!g || !l) return null;

        const scaledGeometry = { ...g, depth: g.depth * variant.depthScale };
        const scaledLighting = {
          ...l,
          warmth: l.warmth * variant.warmthScale,
          elevation: l.elevation * variant.elevationScale,
        };

        return (
          <div
            key={subject.id}
            style={computeMotionStyle(
              scaledGeometry,
              scaledLighting,
              gestureBySubject[subject.id] ?? null,
              variant.delayScale,
            )}
          >
            <AdvisorSubjectFace subject={subject} isActive={subject.id === scene.activeId} />
          </div>
        );
      })}
    </div>
  );
}
