import type { Anomaly } from "../../contracts/Anomaly";
import { round2 } from "./types";

/**
 * Validations F-011 — cohérence capital / intérêts (AX-009).
 */
export type ValidateFinancementInput = {
  capitalInitial: number;
  tauxNominal: number;
  interetsDeductibles: number;
  prixRevient?: number;
};

export type ValidateFinancementOutput = {
  valide: boolean;
  anomalies: Anomaly[];
};

export function validateFinancement(input: ValidateFinancementInput): ValidateFinancementOutput {
  const anomalies: Anomaly[] = [];
  const plafondInterets = round2(input.capitalInitial * input.tauxNominal);

  if (input.interetsDeductibles > plafondInterets + 1) {
    anomalies.push({
      severity: "error",
      message: `Les intérêts déductibles (${input.interetsDeductibles} €) dépassent le plafond capital × taux (${plafondInterets} €).`,
    });
  }

  if (input.prixRevient !== undefined && input.capitalInitial > input.prixRevient + 1) {
    anomalies.push({
      severity: "warning",
      message: "Le capital emprunté dépasse le prix de revient du bien (F-010).",
    });
  }

  const valide = anomalies.every((a) => a.severity !== "fatal" && a.severity !== "error");
  return { valide, anomalies };
}
