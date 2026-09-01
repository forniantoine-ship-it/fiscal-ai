import { motions } from "@/design-system/theme/motions";
import type { Gesture } from "@/lab/advisor-scene/types";

/**
 * Un profil de geste décrit uniquement COMMENT on anime une transition —
 * jamais OÙ on va (la composition) ni POURQUOI (le scénario).
 *
 * Tous les gestes décélèrent vers leur point d'arrêt (motions.easing.out —
 * "Apple-like settle") : jamais d'accélération brutale, jamais de linéaire.
 * Le `delayMs` porte la respiration entre deux gestes — le sujet présenté
 * mène le mouvement, le reste de la scène ne se réajuste qu'après un bref
 * silence. Les valeurs de délai sont des bases : les versions A/B/C
 * (voir variants.ts) les mettent à l'échelle sans changer la nature du geste.
 */
export type ProfileTiming = { duration: string; delayMs: number };

export const EASING = motions.easing.out;

export const gestureTiming: Record<Gesture, ProfileTiming> = {
  presenter: { duration: motions.duration.extended, delayMs: 0 },
  rappeler: { duration: motions.duration.extended, delayMs: 60 },
  retirer: { duration: motions.duration.slow, delayMs: 90 },
  rapprocher: { duration: motions.duration.moderate, delayMs: 150 },
  ranger: { duration: motions.duration.slow, delayMs: 200 },
};

export const defaultTiming: ProfileTiming = { duration: motions.duration.slow, delayMs: 180 };

export function cssTransition({ duration, delayMs }: ProfileTiming, delayScale = 1): string {
  const delay = `${Math.round(delayMs * delayScale)}ms`;
  return [
    `transform ${duration} ${EASING} ${delay}`,
    `opacity ${duration} ${EASING} ${delay}`,
    `filter ${duration} ${EASING} ${delay}`,
    `box-shadow ${duration} ${EASING} ${delay}`,
  ].join(", ");
}
