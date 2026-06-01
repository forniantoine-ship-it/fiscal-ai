import { z } from "zod";

import {
  normalizeDate,
  normalizeNumber,
  normalizeString,
} from "@/lib/documents/gpt/schemas/logement-acte.schema";
import type { LoanInstallment } from "@/lib/lmnp/types";

const nullableString = z.string().nullable().optional();
const nullableNumber = z.number().nullable().optional();

const InstallmentRowSchema = z.object({
  date: nullableString,
  totalPayment: nullableNumber,
  principal: nullableNumber,
  interest: nullableNumber,
  insurance: nullableNumber,
  fees: nullableNumber,
  comment: nullableString,
});

export const CreditAmortizationExtractionSchema = z.object({
  detectedFiscalYear: nullableNumber,
  yearlyInterestTotal: nullableNumber,
  yearlyInsuranceTotal: nullableNumber,
  remainingPrincipal: nullableNumber,
  monthlyPayment: nullableNumber,
  firstPaymentDate: nullableString,
  loanDurationMonths: nullableNumber,
  loanAmount: nullableNumber,
  installments: z.array(InstallmentRowSchema).nullable().optional(),
});

export type CreditAmortizationExtractionRaw = z.infer<typeof CreditAmortizationExtractionSchema>;

export type CreditAmortizationInstallment = LoanInstallment;

export type CreditAmortizationExtraction = {
  detectedFiscalYear?: number;
  yearlyInterestTotal?: number;
  yearlyInsuranceTotal?: number;
  remainingPrincipal?: number;
  monthlyPayment?: number;
  firstPaymentDate?: string;
  loanDurationMonths?: number;
  loanAmount?: number;
  installments?: CreditAmortizationInstallment[];
};

export const CREDIT_AMORTIZATION_FIELD_KEYS = [
  "detectedFiscalYear",
  "yearlyInterestTotal",
  "yearlyInsuranceTotal",
  "remainingPrincipal",
  "monthlyPayment",
  "firstPaymentDate",
  "loanDurationMonths",
  "loanAmount",
  "installments",
] as const;

function assignIfDefined<T extends CreditAmortizationExtraction, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

function normalizeInstallmentRow(raw: z.infer<typeof InstallmentRowSchema>): CreditAmortizationInstallment | undefined {
  const date = normalizeDate(raw.date);
  const totalPayment = normalizeNumber(raw.totalPayment);
  const principal = normalizeNumber(raw.principal);
  const interest = normalizeNumber(raw.interest);
  const insurance = normalizeNumber(raw.insurance);
  const fees = normalizeNumber(raw.fees);

  if (!date) return undefined;

  return {
    date,
    totalPayment: totalPayment ?? 0,
    principal: principal ?? 0,
    interest: interest ?? 0,
    insurance: insurance ?? 0,
    fees: fees ?? 0,
    comment: normalizeString(raw.comment),
  };
}

export function normalizeCreditAmortizationExtraction(raw: unknown): CreditAmortizationExtraction {
  const parsed = CreditAmortizationExtractionSchema.safeParse(raw);
  const source: Record<string, unknown> =
    parsed.success && parsed.data && typeof parsed.data === "object"
      ? (parsed.data as Record<string, unknown>)
      : raw && typeof raw === "object"
        ? (raw as Record<string, unknown>)
        : {};

  const normalized: CreditAmortizationExtraction = {};

  assignIfDefined(normalized, "detectedFiscalYear", normalizeNumber(source.detectedFiscalYear));
  assignIfDefined(normalized, "yearlyInterestTotal", normalizeNumber(source.yearlyInterestTotal));
  assignIfDefined(
    normalized,
    "yearlyInsuranceTotal",
    normalizeNumber(source.yearlyInsuranceTotal),
  );
  assignIfDefined(normalized, "remainingPrincipal", normalizeNumber(source.remainingPrincipal));
  assignIfDefined(normalized, "monthlyPayment", normalizeNumber(source.monthlyPayment));
  assignIfDefined(normalized, "firstPaymentDate", normalizeDate(source.firstPaymentDate));
  assignIfDefined(normalized, "loanDurationMonths", normalizeNumber(source.loanDurationMonths));
  assignIfDefined(normalized, "loanAmount", normalizeNumber(source.loanAmount));

  if (Array.isArray(source.installments)) {
    const rows = source.installments
      .map((row) => normalizeInstallmentRow(row as z.infer<typeof InstallmentRowSchema>))
      .filter((row): row is CreditAmortizationInstallment => Boolean(row));
    if (rows.length > 0) {
      normalized.installments = rows;
    }
  }

  return normalized;
}
