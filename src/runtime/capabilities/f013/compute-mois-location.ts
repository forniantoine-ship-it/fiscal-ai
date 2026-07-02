import type { Anomaly } from "../../contracts/Anomaly";
import type { PeriodeLocation, VacancePeriode } from "./types";

/**
 * Calcule les mois de location effectifs sur un exercice (SAV-009 prorata, SAV-017).
 * F-013 — base du revenu théorique (TRF-REV-01).
 */
export type ComputeMoisLocationInput = {
  exerciceFiscal: number;
  dateMiseEnService: string;
  periodes?: PeriodeLocation[];
  vacances?: VacancePeriode[];
};

export type ComputeMoisLocationOutput = {
  moisLocationEffectifs: number;
  moisVacance: number;
  anomalies: Anomaly[];
};

function parseDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function clampToExercice(date: Date, year: number): Date {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  if (date < start) return start;
  if (date > end) return end;
  return date;
}

function monthsBetweenInclusive(start: Date, end: Date): number {
  if (end < start) return 0;
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
  return Math.max(0, months);
}

function vacanceMonthsInExercice(vacances: VacancePeriode[], year: number): number {
  let total = 0;
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);

  for (const vacance of vacances) {
    const debut = parseDate(vacance.dateDebut);
    const fin = parseDate(vacance.dateFin);
    if (!debut || !fin) continue;

    const clampedStart = debut < yearStart ? yearStart : debut;
    const clampedEnd = fin > yearEnd ? yearEnd : fin;
    if (clampedEnd < clampedStart) continue;

    total += monthsBetweenInclusive(clampedStart, clampedEnd);
  }

  return total;
}

export function computeMoisLocation(input: ComputeMoisLocationInput): ComputeMoisLocationOutput {
  const anomalies: Anomaly[] = [];
  const miseEnService = parseDate(input.dateMiseEnService);

  if (!miseEnService) {
    anomalies.push({ severity: "fatal", message: "La date de mise en service n'est pas reconnue." });
    return { moisLocationEffectifs: 0, moisVacance: 0, anomalies };
  }

  const yearStart = new Date(input.exerciceFiscal, 0, 1);
  const yearEnd = new Date(input.exerciceFiscal, 11, 31);

  if (miseEnService > yearEnd) {
    return { moisLocationEffectifs: 0, moisVacance: 0, anomalies };
  }

  const effectiveStart = miseEnService > yearStart ? miseEnService : yearStart;
  let moisLocationEffectifs = monthsBetweenInclusive(effectiveStart, yearEnd);

  if (input.periodes?.length) {
    let weightedDays = 0;
    for (const periode of input.periodes) {
      const debut = parseDate(periode.dateDebut);
      const fin = parseDate(periode.dateFin);
      if (!debut || !fin) continue;
      const clampedStart = clampToExercice(debut > effectiveStart ? debut : effectiveStart, input.exerciceFiscal);
      const clampedEnd = clampToExercice(fin, input.exerciceFiscal);
      if (clampedEnd < clampedStart) continue;
      const days =
        Math.floor((clampedEnd.getTime() - clampedStart.getTime()) / (24 * 60 * 60 * 1000)) + 1;
      weightedDays += days;
    }
    moisLocationEffectifs = Math.round((weightedDays / 30.5) * 100) / 100;
  }

  const moisVacance = vacanceMonthsInExercice(input.vacances ?? [], input.exerciceFiscal);
  moisLocationEffectifs = Math.max(0, Math.round(moisLocationEffectifs * 100) / 100);

  return { moisLocationEffectifs, moisVacance, anomalies };
}
