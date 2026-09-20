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
  } else {
    if (input.revenusAssistant.exerciceFiscal !== input.exerciceFiscal) {
      anomalies.push({
        severity: "error",
        message: "Exercice fiscal des recettes incohérent avec le dossier.",
        field: "revenusAssistant.exerciceFiscal",
      });
    }

    // NEXT-1 (REV-P0-03) — boundary réel avant génération fiscale : une
    // anomalie F-013 `error`/`fatal` non résolue (ex. indemnité GLI signalée
    // sans montant, revenu nul non justifié) doit empêcher `produceFiscalResult`
    // de produire un résultat, y compris par appel programmatique direct sans
    // passer par l'UI/le gate de complétude du dossier. Un `warning` ne
    // bloque jamais (cohérent avec `validateRevenus`/`reconcileRevenus`, TRF-REV-02).
    for (const revenusAnomaly of input.revenusAssistant.anomalies ?? []) {
      if (revenusAnomaly.severity !== "fatal" && revenusAnomaly.severity !== "error") continue;
      anomalies.push({
        severity: revenusAnomaly.severity,
        message: revenusAnomaly.message,
        field: "revenusAssistant.anomalies",
      });
    }
  }

  // NEXT-2 (F011-CREDIT-SILENT-LOAN-EXCLUSION) — boundary réel avant
  // génération fiscale : un prêt réel exclu faute de date de première
  // mensualité (`mapCreditFinancingToFinancementCharges`) ne doit jamais
  // rester silencieux — y compris pour un dossier historique confirmé avant
  // le correctif UI, atteint par appel programmatique direct sans passer par
  // le gate de complétude du dossier. L'absence de financement (achat
  // comptant) reste légitime et non signalée ici.
  if (input.financementCharges?.excludedLoanIds?.length) {
    anomalies.push({
      severity: "error",
      message:
        "Un ou plusieurs prêts sont exclus du calcul des intérêts faute de date de première échéance connue.",
      field: "financementCharges.excludedLoanIds",
    });
  }

  if (!input.chargesAssistant) {
    anomalies.push({
      severity: "fatal",
      message: "Charges non calculées (F-012 Charges).",
      field: "chargesAssistant",
    });
  } else if (input.chargesAssistant.recouvrementAssuranceF011) {
    // Recouvrement F-011 / F-012 : F-012 a neutralisé une assurance emprunteur à hauteur de ce que F-011 établissait
    // à ce moment-là. Si F-011 a changé depuis (prêt modifié, ajouté, retiré), ce recouvrement est PÉRIMÉ : la charge
    // serait comptée deux fois (F-011 a augmenté) ou perdue (F-011 a diminué). Jamais deviné : F-012 doit être reconfirmé.
    const courante = Math.round(((input.financementCharges?.totalAssurance ?? 0) + (input.financementCharges?.totalAssurancePreExploitation ?? 0)) * 100);
    const reference = Math.round(input.chargesAssistant.recouvrementAssuranceF011.reference * 100);
    if (courante !== reference) {
      anomalies.push({
        severity: "error",
        message:
          "L'assurance de votre prêt a changé depuis la confirmation de vos charges : confirmez à nouveau vos charges pour éviter un doublon ou un oubli.",
        field: "chargesAssistant.recouvrementAssuranceF011",
      });
    }
  }

  if (input.chargesAssistant?.recouvrementFraisDossierF011) {
    const fromTotal = input.financementCharges?.totalFraisDossierDeductibles;
    const fromPrets = (input.financementCharges?.prets ?? []).reduce(
      (acc, p) => acc + (p.fraisDossierDeductibles ?? 0),
      0,
    );
    const courante = Math.round((fromTotal !== undefined ? fromTotal : fromPrets) * 100);
    const reference = Math.round(input.chargesAssistant.recouvrementFraisDossierF011.reference * 100);
    if (courante !== reference) {
      anomalies.push({
        severity: "error",
        message:
          "Les frais de dossier de votre prêt ont changé depuis la confirmation de vos charges : confirmez à nouveau vos charges pour éviter un doublon ou un oubli.",
        field: "chargesAssistant.recouvrementFraisDossierF011",
      });
    }
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
