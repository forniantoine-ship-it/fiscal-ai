import type { ComposantNouveau } from "@/runtime";

/**
 * Chantier 2 — F012 → F014 freshness. Compare les composants amortissables
 * produits par F-012 avant/après une (re)confirmation : jamais une
 * comparaison sur l'objet `chargesAssistant` entier (une charge pure éditée
 * sans toucher un composant ne doit jamais invalider F-014, cf. mission §4),
 * uniquement sur les champs qui déterminent réellement le plan F-014
 * (`montant`, `dureeAnnees`, `dateDebut` — `dotationAnnuelle` en est déjà une
 * fonction déterministe des deux premiers, `label`/`nature`/`origin` ne
 * changent jamais la dotation elle-même).
 */
function fingerprint(composants: ComposantNouveau[] | undefined): string {
  return JSON.stringify(
    [...(composants ?? [])]
      .map((c) => ({ id: c.id, montant: c.montant, dureeAnnees: c.dureeAnnees, dateDebut: c.dateDebut }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
}

/**
 * `true` si les composants amortissables ont réellement changé (ajout,
 * suppression, ou modification de base/durée/date) entre deux confirmations
 * F-012 — jamais `true` pour une simple réouverture sans changement, jamais
 * `true` pour l'édition d'une charge pure sans impact sur un composant.
 */
export function composantsNouveauxChanged(
  previous: ComposantNouveau[] | undefined,
  next: ComposantNouveau[] | undefined,
): boolean {
  return fingerprint(previous) !== fingerprint(next);
}
