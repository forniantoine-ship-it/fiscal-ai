/**
 * Laboratoire Advisor Scene — types fondamentaux.
 *
 * Aucune dépendance vers src/components/lmnp ou src/lib/lmnp.
 * Ce laboratoire ne connaît que des sujets fictifs.
 */

export type SubjectId = string;

/** Cycle de vie d'un sujet, indépendant de sa position à l'écran. */
export type SubjectLifecycle = "undiscovered" | "resting" | "reported" | "done";

export type Subject = {
  id: SubjectId;
  label: string;
  lifecycle: SubjectLifecycle;
};

/** État complet de la scène à un instant donné. */
export type SceneState = {
  subjects: Subject[];
  activeId: SubjectId | null;
};

/**
 * Géométrie pure d'un sujet — jamais d'opacité, jamais de flou (ADR-009 v2.0).
 * Calculée exclusivement par une Composition Strategy.
 */
export type Geometry = {
  x: number;
  y: number;
  scale: number;
  rotate: number;
  /** Ordre d'empilement (CSS z-index). */
  z: number;
  /** Profondeur réelle en pixels (translateZ) — 0 = au premier plan, négatif = recule dans l'espace. */
  depth: number;
};

/**
 * Atmosphère d'un sujet — jamais de position (ADR-009 v2.0).
 * Calculée exclusivement par le Lighting System, à partir de la géométrie.
 * Valeurs statiques uniquement : l'animation entre deux valeurs appartient
 * au Motion Engine, jamais au Lighting System lui-même.
 */
export type Lighting = {
  opacity: number;
  /** 0 = désaturé, 1 = pleine saturation. */
  saturation: number;
  /** 1 = luminosité normale ; <1 assombrit, >1 éclaircit. */
  brightness: number;
  /** 1 = contraste normal ; <1 aplatit. */
  contrast: number;
  /**
   * Élévation douce (ombre neutre, jamais colorée) — le sujet présenté est
   * plus proche, jamais plus lumineux. 0 à 1.
   */
  elevation: number;
  /** Chaleur (sepia doux) qui pousse les sujets éloignés vers la lumière ambiante plutôt que vers le gris. 0 à 1. */
  warmth: number;
  /** Employé seulement quand il apporte réellement quelque chose (rare). */
  blur?: number;
};

/** Les cinq gestes autorisés (ADR-007) — jamais tourner, glisser, ou constituer un carrousel. */
export type Gesture = "presenter" | "rapprocher" | "retirer" | "ranger" | "rappeler";

/** Sujets visibles pour une composition : jamais les sujets non découverts. */
export function visibleSubjects(subjects: Subject[]): Subject[] {
  return subjects.filter((s) => s.lifecycle !== "undiscovered");
}
