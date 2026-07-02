import { round2 } from "./types";
import type { ComposantNouveau } from "./types";

/**
 * TRF-0028 — Création d'un composant travaux.
 * Paramètre JUG-013 ; requiert SAV-024.
 */
export type CreateComposantTravauxInput = {
  label: string;
  montant: number;
  nature: "amélioration" | "construction" | "renouvellement";
  dureeAmortissement?: number;
  dateDebut: string;
};

export type CreateComposantTravauxOutput = {
  composant: ComposantNouveau;
};

const DUREE_DEFAUT: Record<CreateComposantTravauxInput["nature"], number> = {
  amélioration: 18,
  construction: 28,
  renouvellement: 15,
};

export function createComposantTravaux(
  input: CreateComposantTravauxInput,
): CreateComposantTravauxOutput {
  const dureeAnnees = input.dureeAmortissement ?? DUREE_DEFAUT[input.nature];
  const dotationAnnuelle = round2(input.montant / dureeAnnees);

  return {
    composant: {
      label: input.label,
      montant: round2(input.montant),
      dureeAnnees,
      dotationAnnuelle,
      nature: input.nature,
      dateDebut: input.dateDebut,
    },
  };
}
