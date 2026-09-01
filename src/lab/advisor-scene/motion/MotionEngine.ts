import type { CSSProperties } from "react";

import { cssTransition, defaultTiming, gestureTiming } from "@/lab/advisor-scene/motion/profiles";
import type { Geometry, Gesture, Lighting } from "@/lab/advisor-scene/types";

/**
 * Combine la géométrie (Composition Strategy) et l'atmosphère (Lighting
 * System) en un style animé selon le geste en cours. N'a aucune connaissance
 * de la raison du changement — uniquement du "comment".
 *
 * `delayScale` module l'intensité de la respiration (versions A/B/C) sans
 * changer la nature du geste — même décélération, même vocabulaire.
 */
export function computeMotionStyle(
  geometry: Geometry,
  lighting: Lighting,
  gesture: Gesture | null,
  delayScale = 1,
): CSSProperties {
  const timing = gesture ? gestureTiming[gesture] : defaultTiming;
  const transition = cssTransition(timing, delayScale);

  const filters = [
    `saturate(${lighting.saturation})`,
    `brightness(${lighting.brightness})`,
    `contrast(${lighting.contrast})`,
    lighting.warmth > 0 ? `sepia(${lighting.warmth})` : "",
    lighting.blur ? `blur(${lighting.blur}px)` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const elevationShadow =
    lighting.elevation > 0
      ? `0 ${18 * lighting.elevation}px ${34 * lighting.elevation}px rgba(28, 25, 23, ${0.16 * lighting.elevation})`
      : "none";

  return {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: `translate(-50%, -50%) translate3d(${geometry.x}px, ${geometry.y}px, ${geometry.depth}px) rotate(${geometry.rotate}deg) scale(${geometry.scale})`,
    opacity: lighting.opacity,
    filter: filters,
    boxShadow: elevationShadow,
    zIndex: Math.round(geometry.z),
    transition,
    willChange: "transform, opacity, filter, box-shadow",
  };
}
