import type { EcheanceMensuelle } from "./types";
import { round2 } from "./types";

/**
 * Génération d'un échéancier amortissable depuis 4 inputs (F-011, chemin reconstruction).
 * Formule : mensualité constante, intérêts = CRD × taux mensuel.
 * Non référencée par un TRF dédié dans le KS (PV-3) — mathématique standard de prêt.
 */
export type GenerateLoanScheduleInput = {
  capitalInitial: number;
  tauxNominal: number;
  dureeMois: number;
  datePremiereMensualite: string;
};

export type GenerateLoanScheduleOutput = {
  echeances: EcheanceMensuelle[];
};

export function generateLoanSchedule(
  input: GenerateLoanScheduleInput,
): GenerateLoanScheduleOutput {
  const { capitalInitial, dureeMois, datePremiereMensualite } = input;
  const monthlyRate = input.tauxNominal / 12;

  if (capitalInitial <= 0 || dureeMois <= 0 || monthlyRate < 0) {
    return { echeances: [] };
  }

  const factor = Math.pow(1 + monthlyRate, dureeMois);
  const mensualite =
    monthlyRate === 0
      ? round2(capitalInitial / dureeMois)
      : round2((capitalInitial * monthlyRate * factor) / (factor - 1));

  const start = new Date(datePremiereMensualite);
  const echeances: EcheanceMensuelle[] = [];
  let crd = capitalInitial;

  for (let i = 0; i < dureeMois; i += 1) {
    const paymentDate = new Date(start);
    paymentDate.setMonth(paymentDate.getMonth() + i);

    const interets = round2(crd * monthlyRate);
    let capital = round2(mensualite - interets);
    if (i === dureeMois - 1) {
      capital = round2(crd);
    }
    crd = round2(crd - capital);

    echeances.push({
      date: paymentDate.toISOString().slice(0, 10),
      mensualite: round2(interets + capital),
      interets,
      capital,
      assurance: 0,
      capitalRestantDu: Math.max(0, crd),
    });
  }

  return { echeances };
}
