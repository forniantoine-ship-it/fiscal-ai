import type { Anomaly } from "../../contracts/Anomaly";
import type { EcartNature, EcartNiveau } from "./types";
import { round2 } from "./types";

/**
 * TRF-REV-02 — Réconciliation déclaré vs théorique (F-013).
 */
export type ReconcileRevenusInput = {
  revenuTheorique: number;
  revenuDeclare: number;
};

export type ReconcileRevenusOutput = {
  ecart: number;
  ecartPourcentage: number;
  niveau: EcartNiveau;
  nature: EcartNature;
  anomalies: Anomaly[];
};

const SEUIL_COHERENT = 0.05;
const SEUIL_MODERE = 0.2;

export function reconcileRevenus(input: ReconcileRevenusInput): ReconcileRevenusOutput {
  const anomalies: Anomaly[] = [];
  const ecart = round2(input.revenuDeclare - input.revenuTheorique);

  if (input.revenuTheorique <= 0 && input.revenuDeclare === 0) {
    return {
      ecart: 0,
      ecartPourcentage: 0,
      niveau: "coherent",
      nature: "coherent",
      anomalies,
    };
  }

  if (input.revenuDeclare === 0 && input.revenuTheorique > 0) {
    anomalies.push({
      severity: "error",
      message: "Revenu déclaré nul alors qu'un revenu théorique est attendu — confirmation explicite requise.",
      field: "revenu_declare",
    });
    return {
      ecart,
      ecartPourcentage: 1,
      niveau: "important",
      nature: "nul_suspect",
      anomalies,
    };
  }

  const ecartPourcentage =
    input.revenuTheorique > 0
      ? Math.abs(ecart) / input.revenuTheorique
      : input.revenuDeclare > 0
        ? 1
        : 0;

  let niveau: EcartNiveau = "coherent";
  if (ecartPourcentage >= SEUIL_MODERE) niveau = "important";
  else if (ecartPourcentage >= SEUIL_COHERENT) niveau = "modere";

  let nature: EcartNature = "coherent";
  if (niveau !== "coherent") {
    nature = ecart < 0 ? "sous_declare" : "sur_declare";
  }

  return { ecart, ecartPourcentage, niveau, nature, anomalies };
}
