import { z } from "zod";

import {
  normalizeDate,
  normalizeNumber,
  normalizeString,
} from "@/lib/documents/gpt/schemas/logement-acte.schema";

const nullableString = z.string().nullable().optional();
const nullableNumber = z.number().nullable().optional();

export const CreditLoanOfferExtractionSchema = z.object({
  bankName: nullableString,
  loanType: nullableString,
  interestRate: nullableNumber,
  deferredLoanType: nullableString,
  applicationFees: nullableNumber,
  guaranteeFees: nullableNumber,
  insuranceMonthlyAmount: nullableNumber,
  loanAmount: nullableNumber,
  loanDurationMonths: nullableNumber,
  firstPaymentDate: nullableString,
  monthlyPayment: nullableNumber,
});

export type CreditLoanOfferExtractionRaw = z.infer<typeof CreditLoanOfferExtractionSchema>;

export type CreditLoanOfferExtraction = {
  bankName?: string;
  loanType?: string;
  interestRate?: number;
  deferredLoanType?: "total" | "partial" | "franchise" | "none";
  applicationFees?: number;
  guaranteeFees?: number;
  insuranceMonthlyAmount?: number;
  loanAmount?: number;
  loanDurationMonths?: number;
  firstPaymentDate?: string;
  monthlyPayment?: number;
};

export const CREDIT_LOAN_OFFER_FIELD_KEYS = [
  "bankName",
  "loanType",
  "interestRate",
  "deferredLoanType",
  "applicationFees",
  "guaranteeFees",
  "insuranceMonthlyAmount",
  "loanAmount",
  "loanDurationMonths",
  "firstPaymentDate",
  "monthlyPayment",
] as const;

function assignIfDefined<T extends CreditLoanOfferExtraction, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

function normalizeDeferredType(value: unknown): CreditLoanOfferExtraction["deferredLoanType"] | undefined {
  const raw = normalizeString(value)?.toLowerCase();
  if (!raw || raw === "none" || raw === "aucun") return "none";
  if (raw.includes("total")) return "total";
  if (raw.includes("partiel")) return "partial";
  if (raw.includes("franchise")) return "franchise";
  return undefined;
}

export function normalizeCreditLoanOfferExtraction(raw: unknown): CreditLoanOfferExtraction {
  const parsed = CreditLoanOfferExtractionSchema.safeParse(raw);
  const source: Record<string, unknown> =
    parsed.success && parsed.data && typeof parsed.data === "object"
      ? (parsed.data as Record<string, unknown>)
      : raw && typeof raw === "object"
        ? (raw as Record<string, unknown>)
        : {};

  const normalized: CreditLoanOfferExtraction = {};

  assignIfDefined(normalized, "bankName", normalizeString(source.bankName));
  assignIfDefined(normalized, "loanType", normalizeString(source.loanType));
  assignIfDefined(normalized, "interestRate", normalizeNumber(source.interestRate));
  assignIfDefined(normalized, "deferredLoanType", normalizeDeferredType(source.deferredLoanType));
  assignIfDefined(normalized, "applicationFees", normalizeNumber(source.applicationFees));
  assignIfDefined(normalized, "guaranteeFees", normalizeNumber(source.guaranteeFees));
  assignIfDefined(
    normalized,
    "insuranceMonthlyAmount",
    normalizeNumber(source.insuranceMonthlyAmount),
  );
  assignIfDefined(normalized, "loanAmount", normalizeNumber(source.loanAmount));
  assignIfDefined(normalized, "loanDurationMonths", normalizeNumber(source.loanDurationMonths));
  assignIfDefined(normalized, "firstPaymentDate", normalizeDate(source.firstPaymentDate));
  assignIfDefined(normalized, "monthlyPayment", normalizeNumber(source.monthlyPayment));

  return normalized;
}
