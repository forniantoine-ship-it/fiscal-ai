import type { Anomaly } from "../../contracts/Anomaly";
import type { VacancePeriode } from "./types";

/**
 * Validation Engine F-013 — cohérence des recettes (F-013).
 */
export type ValidateRevenusInput = {
  exerciceFiscal: number;
  dateMiseEnService: string;
  totalRecettes: number;
  loyerMensuel?: number;
  moisLocationEffectifs?: number;
  vacances?: VacancePeriode[];
  revenuTheorique?: number;
};

export type ValidateRevenusOutput = {
  recettesCoherentes: boolean;
  vacanceLongue: boolean;
  anomalies: Anomaly[];
};

const SEUIL_VACANCE_LONGUE_MOIS = 6;

function monthsBetween(start: string, end: string): number {
  const debut = new Date(start);
  const fin = new Date(end);
  if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime())) return 0;
  return Math.max(
    0,
    (fin.getFullYear() - debut.getFullYear()) * 12 + (fin.getMonth() - debut.getMonth()) + 1,
  );
}

export function validateRevenus(input: ValidateRevenusInput): ValidateRevenusOutput {
  const anomalies: Anomaly[] = [];
  let vacanceLongue = false;

  const miseEnService = new Date(input.dateMiseEnService);
  if (!Number.isNaN(miseEnService.getTime()) && input.totalRecettes > 0) {
    const yearStart = new Date(input.exerciceFiscal, 0, 1);
    if (miseEnService.getFullYear() === input.exerciceFiscal && miseEnService > yearStart) {
      anomalies.push({
        severity: "warning",
        message:
          "Des recettes sont déclarées alors que la mise en service est en cours d'année — vérifiez le périmètre (SAV-017).",
        field: "date_mise_en_service",
      });
    }
  }

  if (
    input.totalRecettes === 0 &&
    (!input.vacances?.length || input.vacances.length === 0) &&
    (input.revenuTheorique ?? 0) > 0
  ) {
    anomalies.push({
      severity: "warning",
      message: "Aucune recette déclarée sans vacance signalée — situation inhabituelle.",
    });
  }

  if (input.loyerMensuel && input.moisLocationEffectifs && input.moisLocationEffectifs > 0) {
    const loyerImplicite = input.totalRecettes / input.moisLocationEffectifs;
    const delta = Math.abs(loyerImplicite - input.loyerMensuel) / input.loyerMensuel;
    if (delta > 0.15) {
      anomalies.push({
        severity: "warning",
        message: "Le montant déclaré semble inhabituel par rapport au loyer du bail.",
        field: "revenu_declare",
      });
    }
  }

  for (const vacance of input.vacances ?? []) {
    const duree = monthsBetween(vacance.dateDebut, vacance.dateFin);
    if (duree >= SEUIL_VACANCE_LONGUE_MOIS) {
      vacanceLongue = true;
      anomalies.push({
        severity: "warning",
        message: `Vacance de ${duree} mois — justification recommandée (SAV-020, SAV-021).`,
        field: "vacance",
      });
    }
  }

  const blocking = anomalies.filter((a) => a.severity === "fatal" || a.severity === "error");
  return {
    recettesCoherentes: blocking.length === 0,
    vacanceLongue,
    anomalies,
  };
}
