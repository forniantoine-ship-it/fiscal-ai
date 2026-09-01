import type { ChargesFinancementExercice } from "../capabilities/f011/types";

/**
 * Couche présentation — synthèse F-011 (Explanation Engine).
 */
export type ExplainFinancementInput = {
  charges: ChargesFinancementExercice;
};

export type ExplainFinancementOutput = {
  explanation: string;
};

function fmtEur(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}

export function explainFinancement(input: ExplainFinancementInput): ExplainFinancementOutput {
  const { charges } = input;
  const lines = [
    `Sur l'exercice ${charges.exerciceFiscal}, vos charges de financement déductibles s'élèvent à ${fmtEur(charges.totalChargesFinancementExercice)}, ` +
      `dont ${fmtEur(charges.totalInteretsEmprunt)} d'intérêts d'emprunt et ${fmtEur(charges.totalAssurance)} d'assurance.`,
    `Les ${fmtEur(charges.totalCapitalRembourse)} de remboursement de capital ne sont pas déductibles — c'est normal et attendu.`,
  ];

  if (charges.totalInteretsPreExploitation > 0) {
    lines.push(
      `${fmtEur(charges.totalInteretsPreExploitation)} d'intérêts payés avant votre première mise en location ne sont pas déductibles cette année. ` +
        "Vous pouvez les intégrer à vos frais d'acquisition.",
    );
  }

  return { explanation: lines.join("\n\n") };
}
