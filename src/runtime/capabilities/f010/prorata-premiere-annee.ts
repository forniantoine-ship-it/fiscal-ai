import type { Anomaly } from "../../contracts/Anomaly";
import type { ComposantAmorti } from "./types";
import { round2 } from "./types";

/**
 * TRF-0011 — Prorata première année.
 * Fonde AX-006 (l'amortissement commence à la mise en service).
 * La date de début d'amortissement est la date_mise_en_service produite par F-009.
 */
export type ProrataPremiereAnneeInput = {
  composantsBati: ComposantAmorti[];
  composantsMobilier: ComposantAmorti[];
  /** = date_mise_en_service (F-009). */
  dateDebutAmortissement: string;
  methodeProrata: "jours" | "mois";
  exerciceFiscal: number;
};

export type ProrataPremiereAnneeOutput = {
  ratio: number;
  dotationsAnnee1: { label: string; dotationProratisee: number }[];
  anomalies: Anomaly[];
};

function daysInYear(year: number): number {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

export function prorataPremiereAnnee(
  input: ProrataPremiereAnneeInput,
): ProrataPremiereAnneeOutput {
  const anomalies: Anomaly[] = [];
    const debut = new Date(input.dateDebutAmortissement);

    if (Number.isNaN(debut.getTime())) {
      anomalies.push({ severity: "fatal", message: "La date de mise en service n'est pas reconnue." });
      return { ratio: 0, dotationsAnnee1: [], anomalies };
    }

    const yearStart = new Date(input.exerciceFiscal, 0, 1);
    const yearEnd = new Date(input.exerciceFiscal, 11, 31);

    let ratio: number;
    if (debut <= yearStart) {
      ratio = 1;
    } else if (debut > yearEnd) {
      ratio = 0;
    } else if (input.methodeProrata === "mois") {
      const nombreMois = 12 - debut.getMonth();
      ratio = nombreMois / 12;
    } else {
      const msPerDay = 24 * 60 * 60 * 1000;
      const nombreJours = Math.floor((yearEnd.getTime() - debut.getTime()) / msPerDay) + 1;
      ratio = nombreJours / daysInYear(input.exerciceFiscal);
    }
    ratio = Math.round(ratio * 10000) / 10000;

    const dotationsAnnee1 = [...input.composantsBati, ...input.composantsMobilier].map((c) => ({
      label: c.label,
      dotationProratisee: round2(c.dotationAnnuelle * ratio),
    }));

  return { ratio, dotationsAnnee1, anomalies };
}
