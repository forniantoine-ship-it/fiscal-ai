import type { Anomaly } from "../../contracts/Anomaly";
import { round2 } from "./types";

/**
 * TRF-0001 — Calcul du prix de revient.
 * Fonde AX-002 (frais dans le prix de revient), AX-003 (mobilier actif distinct).
 * Paramétré par JUG-001 (traitement des frais).
 */
export type ComputePrixRevientInput = {
  prixAcquisition: number;
  mobilierInclus: boolean;
  montantMobilier?: number;
  fraisNotaire: number;
  fraisAgence?: number;
  fraisAgenceCharge?: "acquereur" | "vendeur";
  /** JUG-001 : intégration au prix de revient ou déduction en charges. */
  choixTraitementFrais: "integration" | "deduction";
};

export type ComputePrixRevientOutput = {
  prixRevient: number;
  montantMobilierIsole: number;
  fraisAcquisitionTotaux: number;
  fraisEnCharges: number;
  anomalies: Anomaly[];
};

export function computePrixRevient(input: ComputePrixRevientInput): ComputePrixRevientOutput {
  const anomalies: Anomaly[] = [];

    const montantMobilierIsole =
      input.mobilierInclus && input.montantMobilier ? round2(input.montantMobilier) : 0;
    const prixHorsMobilier = round2(input.prixAcquisition - montantMobilierIsole);

    const inclureAgence =
      input.fraisAgence !== undefined && input.fraisAgenceCharge === "acquereur";
    const fraisAcquisitionTotaux = round2(
      input.fraisNotaire + (inclureAgence ? (input.fraisAgence ?? 0) : 0),
    );

    let prixRevient: number;
    let fraisEnCharges: number;
    if (input.choixTraitementFrais === "integration") {
      prixRevient = round2(prixHorsMobilier + fraisAcquisitionTotaux);
      fraisEnCharges = 0;
    } else {
      prixRevient = prixHorsMobilier;
      fraisEnCharges = fraisAcquisitionTotaux;
    }

    // Gardes TRF-0001
    if (prixRevient <= 0) {
      anomalies.push({ severity: "fatal", message: "Le prix de revient doit être strictement positif." });
    }
    if (montantMobilierIsole < 0) {
      anomalies.push({ severity: "fatal", message: "Le montant du mobilier ne peut pas être négatif." });
    }
    if (input.prixAcquisition > 0 && montantMobilierIsole >= input.prixAcquisition * 0.3) {
      anomalies.push({
        severity: "error",
        message: "Le mobilier dépasse 30 % du prix d'acquisition, ce qui est incohérent.",
        field: "montantMobilier",
      });
    }
    if (input.prixAcquisition > 0 && fraisAcquisitionTotaux >= input.prixAcquisition * 0.15) {
      anomalies.push({
        severity: "warning",
        message: "Les frais d'acquisition dépassent 15 % du prix, à vérifier.",
        field: "fraisAcquisition",
      });
    }

  return {
    prixRevient,
    montantMobilierIsole,
    fraisAcquisitionTotaux,
    fraisEnCharges,
    anomalies,
  };
}
