import type { LiasseRepresentation } from "../capabilities/f007/types";

export type ExplainLiasseInput = {
  liasse: LiasseRepresentation;
};

export type ExplainLiasseOutput = {
  headline: string;
  subtitle: string;
  explanation: string;
  summaryLines: string[];
};

function fmtEur(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}

function caseValue(liasse: LiasseRepresentation, caseId: string): number | undefined {
  const form = liasse.formulairesGeneres[0];
  const found = form?.cases.find((c) => c.caseId === caseId);
  return typeof found?.value === "number" ? found.value : undefined;
}

/**
 * Couche présentation F-007 — hors registre Runtime (ADR-003).
 */
export function explainLiasse(input: ExplainLiasseInput): ExplainLiasseOutput {
  const { liasse } = input;
  const form = liasse.formulairesGeneres[0];
  const caseCount = form?.cases.length ?? 0;
  const ab = caseValue(liasse, "AB");
  const benefice = caseValue(liasse, "C_L1_COL1");
  const deficit = caseValue(liasse, "C_L1_COL2");

  const headline = `Formulaire 2031-SD — exercice ${liasse.exercice}`;
  const subtitle =
    liasse.formulairesManquants.length > 0
      ? `${caseCount} cases renseignées. ${liasse.formulairesManquants.length} formulaire(s) restant(s) à générer.`
      : `${caseCount} cases renseignées — liasse complète.`;

  const summaryLines = [
    `Formulaires générés : ${liasse.formulairesGeneres.map((f) => f.formId).join(", ")}`,
    `Formulaires attendus (SAV-029) : ${liasse.formulairesAttendus.join(", ")}`,
  ];

  if (ab !== undefined) {
    summaryLines.push(`Case AB (loyers) : ${fmtEur(ab)}`);
  }
  if (benefice !== undefined) {
    summaryLines.push(`Bénéfice fiscal : ${fmtEur(benefice)}`);
  }
  if (deficit !== undefined) {
    summaryLines.push(`Déficit : ${fmtEur(deficit)}`);
  }

  const explanation =
    "Chaque valeur provient directement du résultat fiscal validé (F-006) ou de l'identité déclarante. " +
    "Aucun recalcul fiscal n'est effectué par le moteur de liasse.";

  return { headline, subtitle, explanation, summaryLines };
}
