import type { CreditFieldKey } from "@/lib/lmnp/services/credit-profile";

export type CreditPrefillFieldKey =
  | CreditFieldKey
  | "annualInterest"
  | "annualInsurance"
  | "remainingCapital"
  | "installments";

export type CreditFieldSource = "amortization" | "loan_offer" | "manual";

/** Fiscal truth — never overwritten by loan-offer hydration. */
export const AMORTIZATION_OWNED_FIELDS = new Set<CreditPrefillFieldKey>([
  "monthlyPayment",
  "durationMonths",
  "annualInterest",
  "annualInsurance",
  "remainingCapital",
  "firstPaymentDate",
  "deferralType",
  "installments",
  "insurance",
]);

/** Loan-offer may fill only when amortization did not provide a value. */
export const LOAN_OFFER_METADATA_FIELDS = new Set<CreditPrefillFieldKey>([
  "bank",
  "loanType",
  "rate",
  "borrowedAmount",
  "loanApplicationFees",
  "loanGuaranteeFees",
]);

export function hasAmortizationFiscalTruth(installmentCount: number): boolean {
  return installmentCount > 0;
}
