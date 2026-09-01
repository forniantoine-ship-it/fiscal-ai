import type { Anomaly } from "../../contracts/Anomaly";

/**
 * JUG-003 — Estimation du mobilier sans factures.
 * Vérifie que le montant déclaré est dans une fourchette crédible (5 % à 15 % du prix).
 * < 5 % ou > 15 % : avertissement. > 30 % : blocage (incohérent).
 */
export type EstimateMobilierInput = {
  montantMobilier: number;
  prixAcquisition: number;
};

export type EstimateMobilierOutput = {
  ratio: number;
  credible: boolean;
  anomalies: Anomaly[];
};

export function estimateMobilier(input: EstimateMobilierInput): EstimateMobilierOutput {
  const anomalies: Anomaly[] = [];
  const ratio = input.prixAcquisition > 0 ? input.montantMobilier / input.prixAcquisition : 0;

  if (ratio > 0.3) {
    anomalies.push({
      severity: "fatal",
      message: "Le montant du mobilier est incohérent (supérieur à 30 % du prix).",
      field: "montantMobilier",
    });
  } else if (ratio > 0.15) {
    anomalies.push({
      severity: "warning",
      message: "Montant de mobilier inhabituellement élevé (au-delà de 15 % du prix).",
      field: "montantMobilier",
    });
  } else if (ratio < 0.05) {
    anomalies.push({
      severity: "warning",
      message: "Montant de mobilier inhabituellement bas (moins de 5 % du prix).",
      field: "montantMobilier",
    });
  }

  return { ratio, credible: anomalies.every((a) => a.severity !== "fatal"), anomalies };
}
