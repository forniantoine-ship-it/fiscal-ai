import type { ComposantAmorti } from "../capabilities/f010/types";
import { round2 } from "../capabilities/f010/types";

/**
 * Explanation Engine (ENG-008) — Traduit le plan d'amortissement en langage simple.
 * L'utilisateur ne voit jamais les termes "composants" ou "VNC" (F-010).
 * Couche présentation — hors registre Runtime (ADR-003).
 */
export type ExplainPlanInput = {
  composants: ComposantAmorti[];
};

export type ExplainPlanOutput = {
  dotationAnnuelle: number;
  dureeMoyenneAnnees: number;
  explanation: string;
};

export function explainPlan(input: ExplainPlanInput): ExplainPlanOutput {
  const dotationAnnuelle = round2(
    input.composants.reduce((acc, c) => acc + c.dotationAnnuelle, 0),
  );
  const totalBrut = round2(input.composants.reduce((acc, c) => acc + c.montant, 0));
  const dureeMoyenneAnnees =
    dotationAnnuelle > 0 ? Math.round(totalBrut / dotationAnnuelle) : 0;

  const montantFr = Math.round(dotationAnnuelle).toLocaleString("fr-FR");
  const explanation =
    `Votre bien se déduit d'environ ${montantFr} € par an, ` +
    `sur une durée moyenne de ${dureeMoyenneAnnees} ans. ` +
    `Ce montant vient en réduction de vos revenus locatifs chaque année.`;

  return { dotationAnnuelle, dureeMoyenneAnnees, explanation };
}
