import type { ComposantAmortissement, PlanAmortissement } from "../capabilities/f014/types";

/** EXP-F014-01 */
export const EXP_F014_TERRAIN_BATI =
  "Un bâtiment perd de la valeur avec le temps — il s'use, vieillit, nécessite des travaux. " +
  "Fiscalement, vous pouvez déduire cette usure progressive sur plusieurs années. " +
  "Le terrain, lui, ne s'use pas — sa valeur reste stable. " +
  "C'est pourquoi seul le bâtiment entre dans le calcul.";

/** EXP-F014-04 */
export const EXP_F014_PLAN_PLURIANNUEL =
  "Ce tableau montre comment vos amortissements s'accumulent chaque année. " +
  "La « Valeur nette comptable » est la valeur fiscale restante de votre bien. " +
  "Elle diminue chaque année jusqu'à atteindre zéro — à ce moment, les amortissements s'arrêtent automatiquement.";

/** EXP-F014-05 */
export function expF014ImpactFiscal(totalDotations: number): string {
  const montant = Math.round(totalDotations).toLocaleString("fr-FR");
  return (
    `Ces ${montant} € d'amortissements viennent réduire votre résultat imposable. ` +
    "Plus le total est élevé, plus votre charge fiscale est faible — voire nulle ou déficitaire."
  );
}

/** EXP-F014-02 */
export function expF014DureeComposant(composant: ComposantAmortissement): string {
  return (
    `La durée de ${composant.duree_ans} ans pour ${composant.nom_courant} est définie par l'administration fiscale ` +
    "selon la nature de l'élément. Elle représente la durée de vie normale estimée de cet élément dans un bien immobilier."
  );
}

/** EXP-F014-03 */
export function expF014Prorata(moisExploitation: number, exercice: number): string {
  return (
    `Votre bien a été mis en location en cours d'année ${exercice}. ` +
    `Vous ne pouvez déduire que les amortissements correspondant aux mois effectivement loués — ` +
    `soit ${moisExploitation} mois sur 12. ` +
    "La première année est donc partielle ; les suivantes seront complètes."
  );
}

export type ExplainAmortissementsInput = {
  plan: PlanAmortissement;
  profil: import("../capabilities/f014/types").AmortissementProfil;
};

export type ExplainAmortissementsOutput = {
  headline: string;
  subtitle: string;
  explanation: string;
};

function fmtEur(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}

export function explainAmortissements(
  input: ExplainAmortissementsInput,
): ExplainAmortissementsOutput {
  const { plan, profil } = input;
  const total = fmtEur(plan.total_dotations_exercice);

  let headline = `Vos amortissements pour ${plan.exercice}`;
  let subtitle =
    "Ces montants réduisent votre résultat imposable — c'est l'avantage principal du régime réel.";

  if (profil === "PROF-002" && plan.annee_validation_initiale) {
    headline = `Amortissements ${plan.exercice}`;
    subtitle = `Votre plan est inchangé depuis ${plan.annee_validation_initiale}.`;
  } else if (profil === "PROF-003") {
    subtitle =
      "Votre plan existant est complété par de nouveaux éléments issus de vos travaux de l'exercice.";
  }

  const prorataNote =
    plan.premiere_annee && plan.mois_exploitation
      ? ` Calcul au prorata de votre première année de location (${plan.mois_exploitation} mois).`
      : "";

  const explanation =
    `Total des dotations pour ${plan.exercice} : ${total}.${prorataNote}\n\n` +
    expF014ImpactFiscal(plan.total_dotations_exercice);

  return { headline, subtitle, explanation };
}

/** EXP-F014-06 — distinction amortissement calculé / déduit / reporté (AX-015, AX-017). */
export function expF014UsageFiscal(usage: { amortDeduct: number; amortReporte: number }): string {
  if (usage.amortReporte <= 0) {
    return "L'intégralité de ce montant a été déduite de votre résultat imposable de l'exercice.";
  }
  if (usage.amortDeduct <= 0) {
    return (
      `Votre résultat avant amortissement ne permettait pas d'en déduire cette année : ` +
      `la totalité, ${fmtEur(usage.amortReporte)}, est reportée sans limite de durée sur vos bénéfices futurs.`
    );
  }
  return (
    `Cette année, ${fmtEur(usage.amortDeduct)} ont été effectivement déduits de votre résultat imposable. ` +
    `Le solde, ${fmtEur(usage.amortReporte)}, est reporté sans limite de durée : l'amortissement ne peut jamais créer de déficit.`
  );
}

export function explainComposantDetail(composant: ComposantAmortissement): string {
  const lines = [
    `${composant.nom_courant}`,
    `Base : ${fmtEur(composant.base_amortissable)}`,
    `Durée : ${composant.duree_ans} ans`,
    `Dotation cette année : ${fmtEur(composant.dotation_exercice)}`,
  ];
  if (composant.est_proratisee) {
    lines.push(
      `Dotation annuelle complète (à partir de l'année suivante) : ${fmtEur(composant.dotation_annuelle_pleine)}`,
    );
  }
  return lines.join("\n");
}
