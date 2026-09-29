import { excludedLoanIdsFromFinancing, loanHasFirstPaymentDate, loanHasKnownSubscriptionYearIfFeesExist } from "@/lib/lmnp/services/f011/credit-financing-to-financement-charges";
import { resolveCreditFinancingLoanEcheances } from "@/lib/lmnp/services/f011/f011-documentary-installments";
import type { CreditFinancingData, LoanProfile } from "@/lib/lmnp/types/domain";

/**
 * Real reasons a confirmed loan can be excluded from (or flagged in) the F011 exercise calculation. Each code mirrors
 * exactly one predicate of `excludedLoanIdsFromFinancing` — the same helpers, never a second rule.
 */
export type V3LoanExclusionCode = "first_payment_date_missing" | "subscription_year_unknown" | "schedule_not_usable";

/** Lower-case phrases, reused inside a sentence ("Exclu du calcul (…)") and capitalised where shown alone. */
export const V3_LOAN_EXCLUSION_PHRASES: Record<V3LoanExclusionCode, string> = {
  first_payment_date_missing: "date de première mensualité inconnue",
  subscription_year_unknown: "année de souscription inconnue alors que des frais sont renseignés",
  schedule_not_usable: "échéancier importé inexploitable ou non attribuable à ce prêt",
};

/** Neutral wording when the persisted exclusion cannot be re-derived from the stored loan data. */
export const V3_LOAN_EXCLUSION_UNDETERMINED = "cause non déterminable à partir des données enregistrées";

export function loanExclusionCauses(
  financing: Pick<CreditFinancingData, "loans" | "installments">,
  loan: LoanProfile,
  exerciceFiscal: number,
): V3LoanExclusionCode[] {
  const causes: V3LoanExclusionCode[] = [];
  if (!loanHasFirstPaymentDate(loan)) causes.push("first_payment_date_missing");
  if (!loanHasKnownSubscriptionYearIfFeesExist(loan)) causes.push("subscription_year_unknown");
  if (resolveCreditFinancingLoanEcheances(financing, loan, exerciceFiscal).status === "non_exploitable") causes.push("schedule_not_usable");
  return causes;
}

/** Sanity link with the F011 list: a loan flagged here is exactly one `excludedLoanIdsFromFinancing` reports. */
export function isLoanFlaggedByF011(financing: CreditFinancingData, loan: LoanProfile, exerciceFiscal: number): boolean {
  return excludedLoanIdsFromFinancing(financing, exerciceFiscal).includes(loan.id);
}

/** Text of the existing flat "exerciseStatus" fact. The historical wording is kept for its single-cause case. */
export function exclusionFactValue(causes: V3LoanExclusionCode[]): string {
  if (causes.length === 0) return `Exclu du calcul (${V3_LOAN_EXCLUSION_UNDETERMINED})`;
  return `Exclu du calcul (${causes.map(code => V3_LOAN_EXCLUSION_PHRASES[code]).join(" ; ")})`;
}

// Contract fact → key of `LoanProfile.provenance` (F011 field names). Both dates come from the same F011 answer.
export const LOAN_FACT_PROVENANCE_KEY: Record<string, string> = {
  loanType: "typePret", borrowedAmount: "capitalInitial", capitalInitialOffre: "capitalInitialOffre",
  rate: "tauxNominal", durationMonths: "dureeMois", startDate: "datePremiereMensualite",
  firstPaymentDate: "datePremiereMensualite", insurance: "assuranceAnnuelle",
  loanApplicationFees: "fraisDossier", loanGuaranteeFees: "commissionCaution",
};
