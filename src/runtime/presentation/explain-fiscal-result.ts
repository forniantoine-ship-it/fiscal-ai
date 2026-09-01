import type { FiscalResult } from "../capabilities/f006/types";

export type ExplainFiscalResultInput = {
  result: FiscalResult;
};

export type ExplainFiscalResultOutput = {
  headline: string;
  subtitle: string;
  explanation: string;
  summaryLines: string[];
};

function fmtEur(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}

/**
 * Couche présentation F-006 — hors registre Runtime (ADR-003).
 */
export function explainFiscalResult(input: ExplainFiscalResultInput): ExplainFiscalResultOutput {
  const { result } = input;
  const { resultatFiscal, resultatAvantAmort, amortDeduct, amortReporte, deficitNouveau } = result;

  let headline: string;
  let subtitle: string;

  if (deficitNouveau > 0) {
    headline = `Déficit de ${fmtEur(deficitNouveau)} avant amortissement`;
    subtitle = `${fmtEur(amortReporte)} d'amortissements reportés sur les exercices suivants.`;
  } else if (resultatFiscal === 0 && amortDeduct > 0) {
    headline = "Résultat fiscal nul";
    subtitle = `Vos amortissements (${fmtEur(amortDeduct)}) absorbent l'intégralité du bénéfice avant amortissement.`;
  } else if (resultatFiscal > 0) {
    headline = `Bénéfice imposable de ${fmtEur(resultatFiscal)}`;
    subtitle = `Après déduction de ${fmtEur(amortDeduct)} d'amortissements.`;
  } else {
    headline = "Résultat fiscal nul";
    subtitle = "Aucun bénéfice imposable sur cet exercice.";
  }

  const summaryLines = [
    `Recettes : ${fmtEur(result.recettes.total)}`,
    `Charges déductibles : ${fmtEur(result.charges.totalDeductible)}`,
    `Résultat avant amortissement : ${fmtEur(resultatAvantAmort)}`,
    `Amortissements déduits : ${fmtEur(amortDeduct)}`,
    `Résultat fiscal : ${fmtEur(resultatFiscal)}`,
  ];

  if (result.deficitsImputes > 0) {
    summaryLines.splice(4, 0, `Déficits antérieurs imputés : ${fmtEur(result.deficitsImputes)}`);
  }

  const explanation =
    deficitNouveau > 0
      ? "En LMNP, l'amortissement ne peut pas créer de déficit. L'intégralité des dotations est reportée."
      : resultatFiscal === 0 && amortDeduct > 0
        ? "L'amortissement est déductible uniquement dans la limite du résultat avant amortissement."
        : "Ce résultat consolide les sorties validées de vos assistants Activité, Logement, Financement, Charges, Revenus et Amortissements.";

  return { headline, subtitle, explanation, summaryLines };
}
