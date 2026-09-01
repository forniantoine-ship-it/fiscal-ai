/**
 * Trois intensités du même langage — pas trois architectures différentes.
 * Composition Strategy, Lighting System et Motion Engine restent identiques ;
 * seule leur amplitude change (Scene Engine applique l'échelle à l'assemblage,
 * sans toucher au contrat d'aucune des couches — Sprint 2, raffinement seul).
 */
export type SceneVariant = {
  id: "a" | "b" | "c";
  label: string;
  description: string;
  /** Multiplie Geometry.depth — l'intensité du recul dans l'espace. */
  depthScale: number;
  /** Multiplie Lighting.warmth — la chaleur des sujets éloignés. */
  warmthScale: number;
  /** Multiplie Lighting.elevation — le relief du sujet présenté. */
  elevationScale: number;
  /** Multiplie le délai de respiration entre le geste principal et le reste. */
  delayScale: number;
};

export const sceneVariants: SceneVariant[] = [
  {
    id: "a",
    label: "Version A — Discrète",
    description: "Profondeur et respiration minimales, presque imperceptibles.",
    depthScale: 0.5,
    warmthScale: 0.55,
    elevationScale: 0.7,
    delayScale: 0.45,
  },
  {
    id: "b",
    label: "Version B — Sprint 2",
    description: "Le réglage actuel : profondeur réelle, chaleur visible, respiration marquée.",
    depthScale: 1,
    warmthScale: 1,
    elevationScale: 1,
    delayScale: 1,
  },
  {
    id: "c",
    label: "Version C — Prononcée",
    description: "Profondeur et respiration accentuées, à la limite du perceptible sans devenir spectaculaire.",
    depthScale: 1.6,
    warmthScale: 1.5,
    elevationScale: 1.3,
    delayScale: 1.7,
  },
];
