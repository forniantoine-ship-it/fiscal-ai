/**
 * Cycle 13B — honesty of completeness.
 * No fiscal rules: warnings stay warnings; unknown ≠ declined.
 */

import type { FamilyCoverage } from "../../capabilities/f012/charge";
import { incompleteCoverages } from "../../capabilities/f012/family-coverage";
import type { Anomaly } from "../../contracts/Anomaly";
import { FAMILY_CARD_TITLES } from "./family-ux";

export function unresolvedFamilyLabels(familyCoverage: FamilyCoverage[]): string[] {
  return incompleteCoverages(familyCoverage).map((row) => FAMILY_CARD_TITLES[row.familyId]);
}

export function unresolvedCoverageAnomalies(familyCoverage: FamilyCoverage[]): Anomaly[] {
  return incompleteCoverages(familyCoverage).map((row) => ({
    severity: "warning",
    field: row.familyId,
    message:
      `${FAMILY_CARD_TITLES[row.familyId]} n'est pas encore résolu. ` +
      `Cette partie n'est pas considérée comme enregistrée.`,
  }));
}

export function visibleWarningText(anomalies: Anomaly[]): string | undefined {
  const warnings = anomalies.filter((anomaly) => anomaly.severity === "warning");
  if (warnings.length === 0) return undefined;
  return `Points à clarifier :\n${warnings.map((anomaly) => `• ${anomaly.message}`).join("\n")}`;
}

export function chargesDeclaredRecordedMessage(unresolvedLabels: string[]): string {
  if (unresolvedLabels.length === 0) {
    return "Vos charges déclarées sont enregistrées. Vous pouvez passer à l'étape suivante.";
  }
  const names = unresolvedLabels.join(", ");
  const verb = unresolvedLabels.length === 1 ? "reste" : "restent";
  return (
    `Vos charges déclarées sont enregistrées. ` +
    `Ce n'est pas un dossier complet : ${names} ${verb} à clarifier. ` +
    `Vous pouvez y revenir plus tard, ou passer à l'étape suivante.`
  );
}

export function reviewConfirmContent(unresolvedLabels: string[]): string {
  if (unresolvedLabels.length === 0) {
    return "Ces montants vous conviennent-ils ?";
  }
  const names = unresolvedLabels.join(", ");
  const clause =
    unresolvedLabels.length === 1
      ? `${names} n'est pas encore résolu`
      : `${names} ne sont pas encore résolus`;
  return (
    `Ces montants vous conviennent-ils ?\n\n` +
    `Attention : ${clause}. Valider n'équivaut pas à un dossier complet.`
  );
}
