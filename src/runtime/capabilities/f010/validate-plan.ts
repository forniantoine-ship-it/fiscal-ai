import type { Anomaly } from "../../contracts/Anomaly";
import type { AmortissementPlan } from "./types";
import { round2 } from "./types";

/**
 * TRF-0014 — Vérification de cohérence du plan d'amortissement.
 * Fonde AX-007 (VNC ≥ 0). Constate si le plan est valide, ne produit pas de données.
 * Tolérance d'arrondi : 1 €.
 */
export type ValidatePlanInput = {
  plan: AmortissementPlan;
  baseAmortissableBati: number;
  montantMobilierTotal: number;
};

export type ValidatePlanOutput = {
  planValide: boolean;
  anomalies: Anomaly[];
};

const TOLERANCE = 1;

export function validatePlan(input: ValidatePlanInput): ValidatePlanOutput {
  const anomalies: Anomaly[] = [];
    const attendu = round2(input.baseAmortissableBati + input.montantMobilierTotal);

    if (Math.abs(round2(input.plan.totalBrut) - attendu) > TOLERANCE) {
      anomalies.push({
        severity: "fatal",
        message: "Total brut ≠ base amortissable bâti + mobilier.",
      });
    }

    for (const ligne of input.plan.lignes) {
      if (ligne.vnc < 0) {
        anomalies.push({ severity: "fatal", message: "VNC négative.", field: ligne.label });
      }
      if (round2(ligne.amortissementsCumules) > round2(ligne.montant) + TOLERANCE) {
        anomalies.push({
          severity: "fatal",
          message: "Amortissements cumulés supérieurs à la valeur brute.",
          field: ligne.label,
        });
      }
      if (ligne.dotationExercice < 0) {
        anomalies.push({ severity: "error", message: "Dotation d'exercice négative.", field: ligne.label });
      }
    }

  const planValide = anomalies.every((a) => a.severity !== "fatal");
  return { planValide, anomalies };
}
