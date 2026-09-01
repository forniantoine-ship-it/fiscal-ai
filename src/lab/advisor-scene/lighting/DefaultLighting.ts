import type { LightingStrategy } from "@/lab/advisor-scene/lighting/LightingStrategy";
import { visibleSubjects } from "@/lab/advisor-scene/types";

/**
 * Le sujet présenté n'est jamais plus lumineux — il est simplement là, au
 * premier plan (opacité et contraste pleins, aucun boost de luminosité :
 * une élévation douce et neutre suffit à dire "présenté", jamais "sélectionné").
 *
 * Les sujets éloignés ne s'éteignent jamais en gris : la saturation baisse
 * modérément (jamais jusqu'à zéro) pendant que la chaleur (sepia doux) et la
 * luminosité montent légèrement — ils se fondent dans la lumière ambiante,
 * pas dans l'absence de couleur. Le flou reste rare, réservé aux sujets les
 * plus lointains.
 */
export const DefaultLighting: LightingStrategy = (subjects, activeId, geometry) => {
  const result: ReturnType<LightingStrategy> = {};

  for (const subject of visibleSubjects(subjects)) {
    const g = geometry[subject.id];
    if (!g) continue;

    const isActive = subject.id === activeId;
    // depth est négatif et croît en valeur absolue avec l'éloignement.
    const distance = isActive ? 0 : Math.min(Math.abs(g.depth) / 60, 6);

    result[subject.id] = isActive
      ? { opacity: 1, saturation: 1, brightness: 1, contrast: 1, elevation: 1, warmth: 0 }
      : {
          opacity: Math.max(1 - distance * 0.13, 0.42),
          saturation: Math.max(1 - distance * 0.11, 0.55),
          brightness: Math.min(1 + distance * 0.02, 1.12),
          contrast: Math.max(1 - distance * 0.06, 0.82),
          elevation: Math.max(0.4 - distance * 0.08, 0.05),
          warmth: Math.min(distance * 0.09, 0.45),
          blur: distance >= 4.5 ? Math.min((distance - 4) * 1, 2.5) : undefined,
        };
  }

  return result;
};
