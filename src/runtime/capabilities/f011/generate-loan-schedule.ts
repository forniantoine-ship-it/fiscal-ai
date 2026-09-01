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

/**
 * Cycle 20 (audit de clôture) — `new Date("YYYY-MM-DD")` + `.toISOString()`
 * formaient un aller-retour UTC/local incohérent, décalant chaque échéance
 * (potentiellement de plusieurs jours après `setMonth` répétés) selon le
 * fuseau du serveur. Parse et formatage entièrement locaux — jamais de
 * passage par UTC.
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

  const start = parseLocalDate(datePremiereMensualite);
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
      date: formatLocalDate(paymentDate),
      mensualite: round2(interets + capital),
      interets,
      capital,
      assurance: 0,
      capitalRestantDu: Math.max(0, crd),
    });
  }

  return { echeances };
}
