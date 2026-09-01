import type { Anomaly } from "../../contracts/Anomaly";
import { selectGrille } from "./grilles";
import type { ComposantAmorti, ComposantGrille, TypeBien } from "./types";
import { round2 } from "./types";

/**
 * TRF-0009 — Décomposition du bâti en composants.
 * Fonde AX-004 (linéaire), AX-005 (méthode par composants obligatoire).
 * Grille sélectionnée par JUG-004 (depuis type_bien), durées SAV-005 / JUG-005.
 */
export type DecomposeBatiInput = {
  baseAmortissableBati: number;
  typeBien: TypeBien;
  /** Grille personnalisée optionnelle (sinon sélection automatique JUG-004). */
  grilleOverride?: ComposantGrille[];
};

export type DecomposeBatiOutput = {
  composants: ComposantAmorti[];
  anomalies: Anomaly[];
};

export function decomposeBati(input: DecomposeBatiInput): DecomposeBatiOutput {
  const anomalies: Anomaly[] = [];
    const grille = input.grilleOverride ?? selectGrille(input.typeBien);

    const sommePourcentages = grille.reduce((acc, c) => acc + c.pourcentage, 0);
    if (Math.round(sommePourcentages) !== 100) {
      anomalies.push({
        severity: "fatal",
        message: "La somme des pourcentages de la grille doit être égale à 100 %.",
      });
    }

    const composants: ComposantAmorti[] = grille.map((c) => {
      const montant = round2((input.baseAmortissableBati * c.pourcentage) / 100);
      return {
        label: c.label,
        montant,
        dureeAnnees: c.dureeAnnees,
        dotationAnnuelle: round2(montant / c.dureeAnnees),
      };
    });

    // Absorber le résidu d'arrondi sur le premier composant (le gros œuvre)
    // afin que somme(montants) == base exactement (garde TRF-0009).
    if (composants.length > 0) {
      const sommeMontants = round2(composants.reduce((acc, c) => acc + c.montant, 0));
      const residu = round2(input.baseAmortissableBati - sommeMontants);
      if (residu !== 0) {
        const first = composants[0];
        first.montant = round2(first.montant + residu);
        first.dotationAnnuelle = round2(first.montant / first.dureeAnnees);
      }
    }

    for (const c of composants) {
      if (c.montant <= 0) {
        anomalies.push({ severity: "error", message: "Montant de composant non positif.", field: c.label });
      }
      if (c.dureeAnnees <= 0) {
        anomalies.push({ severity: "error", message: "Durée de composant non positive.", field: c.label });
      }
    }

    const sommeFinale = round2(composants.reduce((acc, c) => acc + c.montant, 0));
    if (Math.abs(sommeFinale - round2(input.baseAmortissableBati)) > 0.01) {
      anomalies.push({
        severity: "fatal",
        message: "La somme des composants doit être égale à la base amortissable du bâti.",
      });
    }

  return { composants, anomalies };
}
