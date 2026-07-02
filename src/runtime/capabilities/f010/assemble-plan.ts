import type { Anomaly } from "../../contracts/Anomaly";
import type { AmortissementPlan, ComposantAmorti, PlanLigne } from "./types";
import { round2 } from "./types";

/**
 * TRF-0012 — Assemblage du plan d'amortissement.
 * Fonde AX-004 (linéaire). Assemble toutes les lignes en un plan unique et
 * calcule le total pour l'exercice demandé. Ne vérifie pas la cohérence (TRF-0014).
 */
export type AssemblePlanInput = {
  composantsBati: ComposantAmorti[];
  composantsMobilier: ComposantAmorti[];
  dotationsAnnee1: { label: string; dotationProratisee: number }[];
  /** Année de la mise en service (première année amortie). */
  premiereAnnee: number;
  /** Exercice pour lequel on veut la dotation. */
  exerciceFiscal: number;
};

export type AssemblePlanOutput = {
  plan: AmortissementPlan;
  anomalies: Anomaly[];
};

export function assemblePlan(input: AssemblePlanInput): AssemblePlanOutput {
  const anomalies: Anomaly[] = [];
    const prorataByLabel = new Map(
      input.dotationsAnnee1.map((d) => [d.label, d.dotationProratisee]),
    );

    const composants = [...input.composantsBati, ...input.composantsMobilier];
    const yearsElapsed = input.exerciceFiscal - input.premiereAnnee;

    const lignes: PlanLigne[] = composants.map((c) => {
      const d1 = prorataByLabel.get(c.label) ?? 0;
      const da = c.dotationAnnuelle;
      const n = c.dureeAnnees;

      // Dotation de l'exercice demandé.
      let dotationExercice: number;
      if (yearsElapsed < 0) {
        dotationExercice = 0;
      } else if (yearsElapsed === 0) {
        dotationExercice = d1;
      } else if (yearsElapsed <= n - 1) {
        dotationExercice = da;
      } else if (yearsElapsed === n) {
        // Dernière année : complément du prorata initial.
        dotationExercice = round2(c.montant - (d1 + da * (n - 1)));
      } else {
        dotationExercice = 0;
      }
      dotationExercice = Math.max(0, round2(dotationExercice));

      // Cumul depuis la première année jusqu'à l'exercice demandé.
      let cumule: number;
      if (yearsElapsed < 0) {
        cumule = 0;
      } else if (yearsElapsed === 0) {
        cumule = d1;
      } else {
        cumule = round2(d1 + da * Math.min(yearsElapsed, n - 1));
        if (yearsElapsed >= n) {
          cumule = c.montant;
        }
      }
      cumule = Math.min(round2(cumule), c.montant);
      const vnc = Math.max(0, round2(c.montant - cumule));

      return {
        label: c.label,
        montant: c.montant,
        dureeAnnees: c.dureeAnnees,
        dotationExercice,
        amortissementsCumules: cumule,
        vnc,
      };
    });

    const totalAnnuelExercice = round2(lignes.reduce((acc, l) => acc + l.dotationExercice, 0));
    const totalBrut = round2(lignes.reduce((acc, l) => acc + l.montant, 0));

  return {
    plan: { lignes, totalAnnuelExercice, totalBrut },
    anomalies,
  };
}
