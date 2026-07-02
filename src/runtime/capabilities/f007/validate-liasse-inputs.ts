import type { Anomaly } from "../../contracts/Anomaly";
import type { LiasseEngineInputs, ValidateLiasseInputsOutput } from "./types";

/**
 * Validation des entrées F-007 — aucun calcul fiscal.
 * Le FiscalResult doit être produit par F-006 ; l'identité par ENT-013.
 */
export function validateLiasseInputs(input: LiasseEngineInputs): ValidateLiasseInputsOutput {
  const anomalies: Anomaly[] = [];
  const { fiscalResult, identite } = input;

  if (fiscalResult.status !== "computed") {
    anomalies.push({
      severity: "fatal",
      message: "Le résultat fiscal n'est pas calculé. Terminez F-006 avant la génération de la liasse.",
      field: "fiscalResult.status",
    });
  }

  const blockingFiscal = fiscalResult.anomalies.filter(
    (a) => a.severity === "fatal" || a.severity === "error",
  );
  for (const a of blockingFiscal) {
    anomalies.push({
      severity: a.severity,
      message: `Calcul fiscal bloquant : ${a.message}`,
      field: `fiscalResult.${a.field ?? "anomalies"}`,
    });
  }

  if (!identite.siren && !identite.siret) {
    anomalies.push({
      severity: "error",
      message: "SIREN ou SIRET manquant pour le formulaire 2031-SD.",
      field: "identite.siret",
    });
  }

  if (!identite.denomination?.trim()) {
    anomalies.push({
      severity: "error",
      message: "Dénomination de l'exploitant manquante pour le formulaire 2031-SD.",
      field: "identite.denomination",
    });
  }

  const ready = !anomalies.some((a) => a.severity === "fatal" || a.severity === "error");
  return { ready, anomalies };
}
