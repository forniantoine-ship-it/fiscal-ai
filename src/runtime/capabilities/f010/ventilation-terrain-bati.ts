import type { Anomaly } from "../../contracts/Anomaly";
import { round2 } from "./types";

/**
 * TRF-0002 — Ventilation terrain-bâti.
 * Fonde AX-001 (le terrain ne s'amortit jamais). Paramétré par JUG-002.
 * Sépare le prix de revient (hors mobilier) en part terrain (non amortissable)
 * et part bâti (amortissable).
 */
export type VentilationTerrainBatiInput = {
  prixRevient: number;
  montantMobilierIsole: number;
  /** JUG-002 : ratio terrain (0-1). */
  ratioTerrain: number;
};

export type VentilationTerrainBatiOutput = {
  valeurTerrain: number;
  valeurBati: number;
  baseAmortissableBati: number;
  anomalies: Anomaly[];
};

export function ventilationTerrainBati(
  input: VentilationTerrainBatiInput,
): VentilationTerrainBatiOutput {
  const anomalies: Anomaly[] = [];

    const prixHorsMobilier = round2(input.prixRevient - input.montantMobilierIsole);
    const valeurTerrain = round2(prixHorsMobilier * input.ratioTerrain);
    const valeurBati = round2(prixHorsMobilier - valeurTerrain);
    const baseAmortissableBati = valeurBati;

    // Gardes TRF-0002
    if (valeurTerrain <= 0) {
      anomalies.push({ severity: "fatal", message: "La valeur du terrain doit être strictement positive." });
    }
    if (valeurBati <= 0) {
      anomalies.push({ severity: "fatal", message: "La valeur du bâti doit être strictement positive." });
    }
    if (input.ratioTerrain < 0.05 || input.ratioTerrain > 0.45) {
      anomalies.push({
        severity: "warning",
        message: "Le ratio terrain est hors de la fourchette usuelle (5 % à 45 %).",
        field: "ratioTerrain",
      });
    }
    const somme = round2(valeurTerrain + valeurBati + input.montantMobilierIsole);
    if (Math.abs(somme - round2(input.prixRevient)) > 0.01) {
      anomalies.push({
        severity: "fatal",
        message: "Terrain + bâti + mobilier doit être égal au prix de revient.",
      });
    }

  return { valeurTerrain, valeurBati, baseAmortissableBati, anomalies };
}
