import type { TypeBien } from "./types";

/**
 * Barème de ventilation terrain/bâti — SAV-003 v2 + JUG-002.
 * Suggestions et fourchettes de validation par type de bien et localisation.
 * Non réglementaire : issu de la pratique professionnelle.
 */
export type LocalisationAppartement =
  | "paris"
  | "grande_metropole"
  | "ville_moyenne"
  | "zone_rurale";

export type LocalisationMaison =
  | "zone_urbaine_dense"
  | "zone_urbaine_standard"
  | "zone_periurbaine"
  | "zone_rurale";

export type Localisation = LocalisationAppartement | LocalisationMaison;

export interface BaremeEntry {
  suggestion: number;
  min: number;
  max: number;
}

const BAREME_APPARTEMENT: Record<LocalisationAppartement, BaremeEntry> = {
  paris: { suggestion: 0.35, min: 0.25, max: 0.45 },
  grande_metropole: { suggestion: 0.25, min: 0.15, max: 0.35 },
  ville_moyenne: { suggestion: 0.18, min: 0.1, max: 0.25 },
  zone_rurale: { suggestion: 0.12, min: 0.05, max: 0.2 },
};

const BAREME_MAISON: Record<LocalisationMaison, BaremeEntry> = {
  zone_urbaine_dense: { suggestion: 0.4, min: 0.3, max: 0.5 },
  zone_urbaine_standard: { suggestion: 0.3, min: 0.2, max: 0.4 },
  zone_periurbaine: { suggestion: 0.25, min: 0.15, max: 0.35 },
  zone_rurale: { suggestion: 0.2, min: 0.1, max: 0.3 },
};

const DEFAULT_APPARTEMENT: BaremeEntry = BAREME_APPARTEMENT.ville_moyenne;
const DEFAULT_MAISON: BaremeEntry = BAREME_MAISON.zone_urbaine_standard;

/** Retourne la suggestion et la fourchette pour un type de bien + localisation. */
export function lookupBareme(typeBien: TypeBien, localisation: Localisation): BaremeEntry {
  if (typeBien === "maison") {
    return BAREME_MAISON[localisation as LocalisationMaison] ?? DEFAULT_MAISON;
  }
  return BAREME_APPARTEMENT[localisation as LocalisationAppartement] ?? DEFAULT_APPARTEMENT;
}
