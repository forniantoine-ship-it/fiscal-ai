import type { Anomaly } from "../../contracts/Anomaly";
import type { FiscalEngineInputs, ValidateFiscalInputsOutput } from "./types";

/**
 * Vérifie que toutes les sorties assistants requises sont disponibles (F-006 préconditions).
 */
export function validateFiscalInputs(input: FiscalEngineInputs): ValidateFiscalInputsOutput {
  const anomalies: Anomaly[] = [];

  if (!input.activite.dateMiseEnService) {
    anomalies.push({
      severity: "fatal",
      message: "Date de mise en service manquante (F-009 Activité).",
      field: "dateMiseEnService",
    });
  }

  if (!input.revenusAssistant) {
    anomalies.push({
      severity: "fatal",
      message: "Recettes non calculées (F-013 Revenus).",
      field: "revenusAssistant",
    });
  } else if (input.revenusAssistant.exerciceFiscal !== input.exerciceFiscal) {
    anomalies.push({
      severity: "error",
      message: "Exercice fiscal des recettes incohérent avec le dossier.",
      field: "revenusAssistant.exerciceFiscal",
    });
  }

  if (!input.chargesAssistant) {
    anomalies.push({
      severity: "fatal",
      message: "Charges non calculées (F-012 Charges).",
      field: "chargesAssistant",
    });
  }

  if (!input.amortissementAssistant) {
    anomalies.push({
      severity: "fatal",
      message: "Amortissements non validés (F-014).",
      field: "amortissementAssistant",
    });
  } else if (input.amortissementAssistant.status !== "validated") {
    anomalies.push({
      severity: "fatal",
      message: "Le plan d'amortissement doit être validé avant le calcul fiscal.",
      field: "amortissementAssistant.status",
    });
  }

  if (!input.logementAmortissement) {
    anomalies.push({
      severity: "warning",
      message: "Plan logement absent — le calcul peut continuer si F-014 est validé.",
      field: "logementAmortissement",
    });
  }

  return {
    ready: anomalies.every((a) => a.severity !== "fatal" && a.severity !== "error"),
    anomalies,
  };
}
