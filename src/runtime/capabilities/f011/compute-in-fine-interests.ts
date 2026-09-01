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

/**
 * Cycle 20 (audit de clôture) — `new Date("YYYY-MM-DD")` (minuit UTC) puis
 * `.toISOString()` (toujours en UTC) formaient un aller-retour incohérent :
 * sous un fuseau serveur à décalage POSITIF (ex. Europe/Paris), une date
 * locale de minuit se reconvertit en UTC de la VEILLE, décalant chaque
 * échéance d'un jour, potentiellement d'un mois entier au fil des `setMonth`
 * successifs. Parse et formatage entièrement en LOCAL — jamais de passage par
 * UTC — pour un aller-retour invariant au fuseau du serveur.
 */
function parseLocalDate(value: string): Date {
  const isoMatch = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  }
  return new Date(value);
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function computeInFineInterests(
  input: ComputeInFineInterestsInput,
): ComputeInFineInterestsOutput {
  const interetsAnnuels = round2(input.capitalInitial * input.tauxNominal);
  const monthlyInterest = round2(interetsAnnuels / 12);
  const monthlyInsurance = round2((input.assuranceAnnuelle ?? 0) / 12);
  const start = parseLocalDate(input.datePremiereMensualite);
  const echeances: EcheanceMensuelle[] = [];

  for (let i = 0; i < input.dureeMois; i += 1) {
    const paymentDate = new Date(start);
    paymentDate.setMonth(paymentDate.getMonth() + i);
    echeances.push({
      date: formatLocalDate(paymentDate),
      mensualite: round2(monthlyInterest + monthlyInsurance),
      interets: monthlyInterest,
      capital: 0,
      assurance: monthlyInsurance,
      capitalRestantDu: input.capitalInitial,
    });
  }

  return { echeances, interetsAnnuels };
}
