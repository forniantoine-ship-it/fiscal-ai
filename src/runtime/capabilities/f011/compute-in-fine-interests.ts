import type { EcheanceMensuelle } from "./types";
import { round2 } from "./types";

/**
 * Prêt in fine — intérêts constants (capital × taux), pas de remboursement de capital (F-011).
 */
export type ComputeInFineInterestsInput = {
  capitalInitial: number;
  tauxNominal: number;
  exerciceFiscal: number;
  datePremiereMensualite: string;
  dureeMois: number;
  assuranceAnnuelle?: number;
};

export type ComputeInFineInterestsOutput = {
  echeances: EcheanceMensuelle[];
  interetsAnnuels: number;
};

export function computeInFineInterests(
  input: ComputeInFineInterestsInput,
): ComputeInFineInterestsOutput {
  const interetsAnnuels = round2(input.capitalInitial * input.tauxNominal);
  const monthlyInterest = round2(interetsAnnuels / 12);
  const monthlyInsurance = round2((input.assuranceAnnuelle ?? 0) / 12);
  const start = new Date(input.datePremiereMensualite);
  const echeances: EcheanceMensuelle[] = [];

  for (let i = 0; i < input.dureeMois; i += 1) {
    const paymentDate = new Date(start);
    paymentDate.setMonth(paymentDate.getMonth() + i);
    echeances.push({
      date: paymentDate.toISOString().slice(0, 10),
      mensualite: round2(monthlyInterest + monthlyInsurance),
      interets: monthlyInterest,
      capital: 0,
      assurance: monthlyInsurance,
      capitalRestantDu: input.capitalInitial,
    });
  }

  return { echeances, interetsAnnuels };
}
