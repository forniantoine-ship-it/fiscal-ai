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

/**
 * F011-3 (audit KS AX-011/JUG-011) — les intérêts et l'assurance emprunteur
 * courus avant la première mise en location sont déductibles dès cet
 * exercice, au même titre que les autres charges de financement (JUG-011,
 * choix A : déduction immédiate — jamais une immobilisation au prix de
 * revient, option B écartée). Le moteur (F-006, `computeResultatAvantAmort`)
 * les déduit déjà via `chargesPreExploitation`, un total séparé de
 * `totalChargesFinancementExercice` (voir `compute-financement-exercice.ts`)
 * — d'où leur présentation à part ici, jamais une exclusion. Ce message ne
 * doit jamais dire "non déductible(s)" ni suggérer de les intégrer aux frais
 * d'acquisition (F-010) : Fiscal AI les a déjà déduits une fois via F-006 —
 * une seconde intégration serait un double comptage.
 */
export function explainFinancement(input: ExplainFinancementInput): ExplainFinancementOutput {
  const { charges } = input;
  const lines = [
    `Sur l'exercice ${charges.exerciceFiscal}, vos charges de financement déductibles s'élèvent à ${fmtEur(charges.totalChargesFinancementExercice)}, ` +
      `dont ${fmtEur(charges.totalInteretsEmprunt)} d'intérêts d'emprunt et ${fmtEur(charges.totalAssurance)} d'assurance.`,
    `Les ${fmtEur(charges.totalCapitalRembourse)} de remboursement de capital ne sont pas déductibles — c'est normal et attendu.`,
  ];

  const totalPreExploitation = charges.totalInteretsPreExploitation + (charges.totalAssurancePreExploitation ?? 0);
  if (totalPreExploitation > 0) {
    const detail = charges.totalAssurancePreExploitation
      ? ` (${fmtEur(charges.totalInteretsPreExploitation)} d'intérêts et ${fmtEur(charges.totalAssurancePreExploitation)} d'assurance)`
      : "";
    lines.push(
      `${fmtEur(totalPreExploitation)} de charges pré-exploitation${detail}, engagées avant votre première mise en location, ` +
        "sont déductibles dès cet exercice — elles ne sont pas comptées dans le total ci-dessus, qui ne couvre que les charges " +
        "de la période d'exploitation, mais elles réduisent bien votre résultat fiscal cette année. Ne les intégrez pas à vos " +
        "frais d'acquisition : Fiscal AI les a déjà déduites, une seconde fois créerait un double comptage.",
    );
  }

  return { explanation: lines.join("\n\n") };
}
