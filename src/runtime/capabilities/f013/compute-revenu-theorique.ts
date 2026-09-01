import type { Anomaly } from "../../contracts/Anomaly";
import { computeMoisLocation } from "./compute-mois-location";
import type { PeriodeLocation, RevenuTheorique, VacancePeriode } from "./types";
import { round2 } from "./types";

/**
 * TRF-REV-01 — Calcul du revenu théorique (F-013).
 * SAV-009 prorata temporis, SAV-017 début à la mise en service.
 */
export type ComputeRevenuTheoriqueInput = {
  exerciceFiscal: number;
  dateMiseEnService: string;
  loyerMensuel?: number;
  provisionChargesMensuelle?: number;
  periodes?: PeriodeLocation[];
  vacances?: VacancePeriode[];
};

export type ComputeRevenuTheoriqueOutput = {
  revenuTheorique: RevenuTheorique;
  anomalies: Anomaly[];
};

export function computeRevenuTheorique(
  input: ComputeRevenuTheoriqueInput,
): ComputeRevenuTheoriqueOutput {
  const anomalies: Anomaly[] = [];

  if (input.periodes?.length) {
    let total = 0;
    let loyerMoyen = 0;
    for (const periode of input.periodes) {
      const debut = new Date(periode.dateDebut);
      const fin = new Date(periode.dateFin);
      if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime())) continue;
      const days = Math.max(0, Math.floor((fin.getTime() - debut.getTime()) / (24 * 60 * 60 * 1000)) + 1);
      const loyerEffectif =
        periode.loyerMensuel + (periode.provisionChargesMensuelle ?? 0);
      total += round2((loyerEffectif * days) / 30.5);
      loyerMoyen += loyerEffectif;
    }
    loyerMoyen = round2(loyerMoyen / input.periodes.length);

    const mois = computeMoisLocation({
      exerciceFiscal: input.exerciceFiscal,
      dateMiseEnService: input.dateMiseEnService,
      periodes: input.periodes,
      vacances: input.vacances,
    });
    anomalies.push(...mois.anomalies);

    const montantAttendu = round2(total - mois.moisVacance * loyerMoyen);
    return {
      revenuTheorique: {
        montantAttendu: Math.max(0, montantAttendu),
        loyerMensuel: loyerMoyen,
        moisLocationEffectifs: mois.moisLocationEffectifs,
        moisVacance: mois.moisVacance,
        baseCalcul: "Σ loyer_i × jours_i / 30.5 − vacances",
      },
      anomalies,
    };
  }

  if (!input.loyerMensuel || input.loyerMensuel <= 0) {
    anomalies.push({
      severity: "warning",
      message: "Le loyer mensuel est requis pour calculer le revenu théorique.",
      field: "loyer_mensuel",
    });
    return {
      revenuTheorique: {
        montantAttendu: 0,
        loyerMensuel: 0,
        moisLocationEffectifs: 0,
        moisVacance: 0,
        baseCalcul: "loyer_mensuel inconnu",
      },
      anomalies,
    };
  }

  const mois = computeMoisLocation({
    exerciceFiscal: input.exerciceFiscal,
    dateMiseEnService: input.dateMiseEnService,
    vacances: input.vacances,
  });
  anomalies.push(...mois.anomalies);

  const loyerEffectif = round2(
    input.loyerMensuel + (input.provisionChargesMensuelle ?? 0),
  );
  const montantAttendu = round2(
    loyerEffectif * mois.moisLocationEffectifs - mois.moisVacance * loyerEffectif,
  );

  return {
    revenuTheorique: {
      montantAttendu: Math.max(0, montantAttendu),
      loyerMensuel: loyerEffectif,
      moisLocationEffectifs: mois.moisLocationEffectifs,
      moisVacance: mois.moisVacance,
      baseCalcul: "loyer_mensuel × mois_location − vacances",
    },
    anomalies,
  };
}
