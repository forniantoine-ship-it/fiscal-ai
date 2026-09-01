import type { Anomaly } from "../../contracts/Anomaly";
import type { ComposantAmorti } from "./types";
import { round2 } from "./types";

/**
 * TRF-0010 — Amortissement du mobilier.
 * Fonde AX-003 (mobilier actif distinct), AX-004 (linéaire). Paramétré par JUG-006.
 * Durées dans la fourchette SAV-006 (3 à 15 ans).
 */
export const MOBILIER_DUREE_DEFAUT = 7;

export type AmortizeMobilierInput = {
  montantMobilierTotal: number;
  mode: "lot" | "detaille";
  /** Mode lot : durée moyenne retenue (JUG-006). */
  dureeMoyenne?: number;
  /** Mode détaillé : lignes valorisées (JUG-006). */
  lignes?: { label: string; montant: number; dureeAnnees: number }[];
};

export type AmortizeMobilierOutput = {
  composants: ComposantAmorti[];
  anomalies: Anomaly[];
};

function checkDuree(duree: number, anomalies: Anomaly[], field?: string): void {
  if (duree < 3 || duree > 15) {
    anomalies.push({
      severity: "warning",
      message: "La durée du mobilier doit être comprise entre 3 et 15 ans.",
      field,
    });
  }
}

export function amortizeMobilier(input: AmortizeMobilierInput): AmortizeMobilierOutput {
  const anomalies: Anomaly[] = [];

    if (round2(input.montantMobilierTotal) <= 0) {
      return { composants: [], anomalies };
    }

    if (input.mode === "lot") {
      const duree = input.dureeMoyenne ?? MOBILIER_DUREE_DEFAUT;
      checkDuree(duree, anomalies, "Mobilier (lot)");
      const montant = round2(input.montantMobilierTotal);
      return {
        composants: [
          {
            label: "Mobilier (lot)",
            montant,
            dureeAnnees: duree,
            dotationAnnuelle: round2(montant / duree),
          },
        ],
        anomalies,
      };
    }

    const lignes = input.lignes ?? [];
    const composants: ComposantAmorti[] = lignes.map((l) => {
      checkDuree(l.dureeAnnees, anomalies, l.label);
      return {
        label: l.label,
        montant: round2(l.montant),
        dureeAnnees: l.dureeAnnees,
        dotationAnnuelle: round2(l.montant / l.dureeAnnees),
      };
    });

    const somme = round2(composants.reduce((acc, c) => acc + c.montant, 0));
    if (Math.abs(somme - round2(input.montantMobilierTotal)) > 0.01) {
      anomalies.push({
        severity: "fatal",
        message: "La somme des lignes de mobilier doit être égale au montant total.",
      });
    }

  return { composants, anomalies };
}
