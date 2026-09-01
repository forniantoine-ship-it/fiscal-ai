import type { ComposantGrille, TypeBien } from "./types";

/**
 * Grilles de décomposition du bâti — SAV-007 v2.
 * Pourcentages et durées issus de la pratique professionnelle (non réglementaires).
 * Sélection automatique par type de bien : JUG-004.
 * Les durées restent dans les fourchettes SAV-005 (JUG-005).
 */

/** Grille A — Appartement en copropriété (SAV-007). Somme = 100 %. */
export const GRILLE_APPARTEMENT: ComposantGrille[] = [
  { label: "Gros œuvre", pourcentage: 50, dureeAnnees: 50 },
  { label: "Toiture", pourcentage: 10, dureeAnnees: 25 },
  { label: "Installations électriques", pourcentage: 10, dureeAnnees: 25 },
  { label: "Plomberie / sanitaires", pourcentage: 10, dureeAnnees: 25 },
  { label: "Étanchéité", pourcentage: 5, dureeAnnees: 15 },
  { label: "Agencements intérieurs", pourcentage: 15, dureeAnnees: 15 },
];

/** Grille B — Maison individuelle (SAV-007). Somme = 100 %. */
export const GRILLE_MAISON: ComposantGrille[] = [
  { label: "Gros œuvre", pourcentage: 40, dureeAnnees: 50 },
  { label: "Toiture", pourcentage: 15, dureeAnnees: 25 },
  { label: "Façade / ravalement", pourcentage: 5, dureeAnnees: 30 },
  { label: "Menuiseries extérieures", pourcentage: 5, dureeAnnees: 25 },
  { label: "Installations électriques", pourcentage: 8, dureeAnnees: 25 },
  { label: "Plomberie / sanitaires", pourcentage: 8, dureeAnnees: 25 },
  { label: "Chauffage", pourcentage: 7, dureeAnnees: 20 },
  { label: "Agencements intérieurs", pourcentage: 12, dureeAnnees: 15 },
];

/**
 * Sélectionne la grille de référence selon le type de bien (JUG-004).
 * "autre" retombe sur la Grille A par défaut.
 */
export function selectGrille(typeBien: TypeBien): ComposantGrille[] {
  return typeBien === "maison" ? GRILLE_MAISON : GRILLE_APPARTEMENT;
}
