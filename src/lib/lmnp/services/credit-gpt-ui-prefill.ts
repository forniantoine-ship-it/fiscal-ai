import type { CreditAmortizationExtraction } from "@/lib/documents/gpt/schemas/credit-amortization.schema";
import type { CreditLoanOfferExtraction } from "@/lib/documents/gpt/schemas/credit-loan-offer.schema";
import type { CanonicalFieldKey } from "@/lib/documents/tunnel-field-ownership";
import {
  averageMonthlyInsurance,
  computeFiscalYearInstallmentMetrics,
  detectDeferralTypeFromInstallments,
  findFirstAmortizingInstallment,
} from "@/lib/lmnp/services/credit-fiscal-from-installments";
import {
  AMORTIZATION_OWNED_FIELDS,
  LOAN_OFFER_METADATA_FIELDS,
  type CreditFieldSource,
  type CreditPrefillFieldKey,
} from "@/lib/lmnp/services/credit-field-ownership";
import {
  emptyCreditFormValues,
  emptyLoanFormValues,
  financingToFormValues,
  normalizeCreditFormValues,
  type CreditFieldKey,
  type CreditFormValues,
  type CreditLoanFormValues,
} from "@/lib/lmnp/services/credit-profile";
import type { DeclarationDraft } from "@/lib/lmnp/types";
import type { LoanDeferralType, LoanInstallment } from "@/lib/lmnp/types";

import { logCreditExtractionMerge } from "./credit-extraction-payload";
import {
  classifyLoanInstallmentPhase,
  logUiInstallmentVisibility,
} from "./credit-installment-visibility";

export type { CreditPrefillFieldKey } from "@/lib/lmnp/services/credit-field-ownership";

export type CreditUserValidatedFields = Partial<Record<CreditPrefillFieldKey, boolean>>;

export type CreditExtractionSession = {
  amortization?: CreditAmortizationExtraction;
  loanOffer?: CreditLoanOfferExtraction;
};

export type CreditGptPrefillInput = {
  session: CreditExtractionSession;
  revenueYear: number;
  userValidatedFields?: CreditUserValidatedFields;
  /** Manual overrides — only user-validated fields are applied on top of extraction. */
  manualOverrides?: CreditFormValues;
  /** Scope governed-field ingestion to the document that just finished extraction. */
  governedPayloadFor?: "amortization" | "loan_offer";
};

export type CreditGptPrefillResult = {
  nextValues: CreditFormValues;
  installments: LoanInstallment[];
  changedFields: CreditPrefillFieldKey[];
  skippedFields: CreditPrefillFieldKey[];
  governedPayload: Record<string, unknown>;
  governedFields: CanonicalFieldKey[];
  uncertainFields: CreditFieldKey[];
  fieldSources: Partial<Record<CreditPrefillFieldKey, CreditFieldSource>>;
};

function formatNumber(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "";
  return String(Math.round(value * 100) / 100);
}

function isLocked(
  fieldKey: CreditPrefillFieldKey,
  userValidatedFields: CreditUserValidatedFields,
): boolean {
  return userValidatedFields[fieldKey] === true;
}

function readManualLoanField(
  overrides: CreditFormValues | undefined,
  key: keyof CreditLoanFormValues,
): string | boolean | undefined {
  return overrides?.loans[0]?.[key];
}

function readManualSummaryField(
  overrides: CreditFormValues | undefined,
  key: keyof CreditFormValues["summary"],
): string | undefined {
  return overrides?.summary[key];
}

function hasNumericValue(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value);
}

function hasStringValue(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function averageInsuranceFromAmortizingRows(installments: LoanInstallment[]): number | undefined {
  const rows = installments.filter((row) => row.insurance > 0);
  if (!rows.length) return undefined;
  const total = rows.reduce((sum, row) => sum + row.insurance, 0);
  return Math.round(total / rows.length);
}

function inferAnnualInsuranceFromInstallments(
  installments: LoanInstallment[],
  revenueYear: number,
  fiscalAnnualInsurance: number,
  extractionAnnualInsurance?: number,
): number | undefined {
  if (fiscalAnnualInsurance > 0) return fiscalAnnualInsurance;
  if (extractionAnnualInsurance !== undefined && extractionAnnualInsurance > 0) {
    return extractionAnnualInsurance;
  }

  const yearPrefix = `${revenueYear}-`;
  const fiscalRows = installments.filter((row) => row.date.startsWith(yearPrefix));
  const insuranceSum = fiscalRows.reduce((sum, row) => sum + (row.insurance ?? 0), 0);
  if (insuranceSum > 0) return Math.round(insuranceSum * 100) / 100;

  return undefined;
}

type AmortDerived = {
  installments: LoanInstallment[];
  hasFiscalTruth: boolean;
  summary: {
    annualInterest?: number;
    annualInsurance?: number;
    remainingCapital?: number;
    remainingCapitalAsOf?: string;
  };
  loan: {
    borrowedAmount?: number;
    durationMonths?: number;
    monthlyPayment?: number;
    insurance?: number;
    deferralType?: LoanDeferralType;
    firstPaymentDate?: string;
    remainingCapital?: number;
  };
};

function deriveFromAmortization(
  amort: CreditAmortizationExtraction | undefined,
  revenueYear: number,
): AmortDerived {
  const installments = amort?.installments ?? [];
  const hasFiscalTruth = installments.length > 0;

  if (!amort && !hasFiscalTruth) {
    return { installments: [], hasFiscalTruth: false, summary: {}, loan: {} };
  }

  const fiscalMetrics = hasFiscalTruth
    ? computeFiscalYearInstallmentMetrics(installments, revenueYear, amort?.loanAmount)
    : null;

  const firstAmortizing = hasFiscalTruth
    ? findFirstAmortizingInstallment(installments)
    : undefined;

  const deferralFromRows = hasFiscalTruth
    ? detectDeferralTypeFromInstallments(installments)
    : undefined;

  const avgInsurance =
    (fiscalMetrics ? averageMonthlyInsurance(installments, revenueYear) : undefined) ??
    averageInsuranceFromAmortizingRows(installments);

  const resolvedAnnualInsurance = inferAnnualInsuranceFromInstallments(
    installments,
    revenueYear,
    fiscalMetrics?.annualInsurance ?? 0,
    amort?.yearlyInsuranceTotal,
  );

  const summary = {
    annualInterest:
      fiscalMetrics && fiscalMetrics.annualInterest > 0
        ? fiscalMetrics.annualInterest
        : amort?.yearlyInterestTotal,
    annualInsurance: resolvedAnnualInsurance,
    remainingCapital:
      fiscalMetrics?.remainingCapitalAtYearEnd ??
      (amort?.remainingPrincipal !== undefined &&
      (amort.detectedFiscalYear === undefined || amort.detectedFiscalYear === revenueYear)
        ? amort.remainingPrincipal
        : undefined),
    remainingCapitalAsOf:
      fiscalMetrics?.remainingCapitalAsOf ?? `${revenueYear}-12-31`,
  };

  const loan = {
    borrowedAmount: amort?.loanAmount,
    durationMonths: amort?.loanDurationMonths,
    monthlyPayment: firstAmortizing?.totalPayment ?? amort?.monthlyPayment,
    insurance: avgInsurance,
    deferralType: deferralFromRows,
    firstPaymentDate: firstAmortizing?.date ?? amort?.firstPaymentDate,
    remainingCapital: summary.remainingCapital,
  };

  return { installments, hasFiscalTruth, summary, loan };
}

type OfferMetadata = {
  bank?: string;
  loanType?: string;
  rate?: number;
  borrowedAmount?: number;
  durationMonths?: number;
  loanApplicationFees?: number;
  loanGuaranteeFees?: number;
};

function deriveOfferMetadata(offer: CreditLoanOfferExtraction | undefined): OfferMetadata {
  if (!offer) return {};
  return {
    bank: offer.bankName,
    loanType: offer.loanType,
    rate: offer.interestRate,
    borrowedAmount: offer.loanAmount,
    durationMonths: offer.loanDurationMonths,
    loanApplicationFees: offer.applicationFees,
    loanGuaranteeFees: offer.guaranteeFees,
  };
}

function resolveStringField(
  fieldKey: CreditPrefillFieldKey,
  amortValue: string | undefined,
  offerValue: string | undefined,
  manual: string | undefined,
  userValidatedFields: CreditUserValidatedFields,
  hasFiscalTruth: boolean,
): { value: string; source?: CreditFieldSource } {
  if (isLocked(fieldKey, userValidatedFields) && manual?.trim()) {
    return { value: manual.trim(), source: "manual" };
  }

  if (hasFiscalTruth && AMORTIZATION_OWNED_FIELDS.has(fieldKey) && hasStringValue(amortValue)) {
    return { value: amortValue!.trim(), source: "amortization" };
  }

  if (LOAN_OFFER_METADATA_FIELDS.has(fieldKey)) {
    if (hasStringValue(amortValue) && fieldKey === "borrowedAmount") {
      return { value: amortValue!.trim(), source: "amortization" };
    }
    if (hasStringValue(offerValue)) {
      return { value: offerValue!.trim(), source: "loan_offer" };
    }
    if (hasStringValue(amortValue)) {
      return { value: amortValue!.trim(), source: "amortization" };
    }
    return { value: "" };
  }

  if (hasStringValue(amortValue)) {
    return { value: amortValue!.trim(), source: "amortization" };
  }
  return { value: "" };
}

function resolveNumericFormField(
  fieldKey: CreditPrefillFieldKey,
  amortValue: number | undefined,
  offerValue: number | undefined,
  manual: string | undefined,
  userValidatedFields: CreditUserValidatedFields,
  hasFiscalTruth: boolean,
): { value: string; source?: CreditFieldSource } {
  if (isLocked(fieldKey, userValidatedFields) && manual?.trim()) {
    return { value: manual.trim(), source: "manual" };
  }

  if (hasFiscalTruth && AMORTIZATION_OWNED_FIELDS.has(fieldKey) && hasNumericValue(amortValue)) {
    return { value: formatNumber(amortValue), source: "amortization" };
  }

  if (LOAN_OFFER_METADATA_FIELDS.has(fieldKey)) {
    if (fieldKey === "borrowedAmount" && hasNumericValue(amortValue)) {
      return { value: formatNumber(amortValue), source: "amortization" };
    }
    if (hasNumericValue(offerValue)) {
      return { value: formatNumber(offerValue), source: "loan_offer" };
    }
    if (hasNumericValue(amortValue)) {
      return { value: formatNumber(amortValue), source: "amortization" };
    }
    return { value: "" };
  }

  if (hasNumericValue(amortValue)) {
    return { value: formatNumber(amortValue), source: "amortization" };
  }
  return { value: "" };
}

function resolveDeferralField(
  amortValue: LoanDeferralType | undefined,
  manual: string | undefined,
  userValidatedFields: CreditUserValidatedFields,
  hasFiscalTruth: boolean,
): { value: CreditLoanFormValues["deferralType"]; source?: CreditFieldSource } {
  if (isLocked("deferralType", userValidatedFields) && manual?.trim()) {
    return { value: manual.trim() as CreditLoanFormValues["deferralType"], source: "manual" };
  }
  if (hasFiscalTruth && amortValue && amortValue !== "none") {
    return { value: amortValue, source: "amortization" };
  }
  if (hasFiscalTruth && amortValue) {
    return { value: amortValue, source: "amortization" };
  }
  return { value: "none" };
}

export function buildGovernedPayload(
  values: CreditFormValues,
  installments: LoanInstallment[],
  options?: { documentKind?: "amortization" | "loan_offer" },
): { payload: Record<string, unknown>; fields: CanonicalFieldKey[] } {
  const payload: Record<string, unknown> = {};
  const fields: CanonicalFieldKey[] = [];
  const loan = values.loans[0];
  const kind = options?.documentKind;

  const offerMappings: Array<[CanonicalFieldKey, unknown]> = [
    ["lenderName", loan?.bank],
    ["loanRate", loan?.rate ? Number(loan.rate.replace(",", ".")) : undefined],
    ["loanPrincipal", loan?.borrowedAmount ? Number(loan.borrowedAmount.replace(/\s/g, "")) : undefined],
  ];

  const amortMappings: Array<[CanonicalFieldKey, unknown]> = [
    ["loanTermMonths", loan?.durationMonths ? Number(loan.durationMonths.replace(/\s/g, "")) : undefined],
    ["monthlyPayment", loan?.monthlyPayment ? Number(loan.monthlyPayment.replace(/\s/g, "")) : undefined],
    ["annualInterest", values.summary.annualInterest ? Number(values.summary.annualInterest.replace(/\s/g, "")) : undefined],
    ["annualInsurance", values.summary.annualInsurance ? Number(values.summary.annualInsurance.replace(/\s/g, "")) : undefined],
    ["loanScheduleDate", loan?.firstPaymentDate],
  ];

  const mappings =
    kind === "loan_offer" ? offerMappings : kind === "amortization" ? amortMappings : [...offerMappings, ...amortMappings];

  for (const [canonical, value] of mappings) {
    if (value === undefined || value === null || value === "") continue;
    payload[canonical] = value;
    fields.push(canonical);
  }

  if (kind !== "loan_offer" && installments.length > 0) {
    payload.installmentCount = installments.length;
  }

  return { payload, fields };
}

/**
 * Single source of truth: derive credit form values from draft.creditGptSession.
 * Priority: manual (user-validated) > amortization (fiscal) > loan offer (metadata gaps only) > empty.
 */
export function hydrateCreditFormFromSession(input: CreditGptPrefillInput): CreditGptPrefillResult {
  const userValidatedFields = input.userValidatedFields ?? {};
  const manual = input.manualOverrides;
  const amortDerived = deriveFromAmortization(input.session.amortization, input.revenueYear);
  const offerMeta = deriveOfferMetadata(input.session.loanOffer);
  const { hasFiscalTruth } = amortDerived;
  const fieldSources: Partial<Record<CreditPrefillFieldKey, CreditFieldSource>> = {};

  const bank = resolveStringField(
    "bank",
    undefined,
    offerMeta.bank,
    readManualLoanField(manual, "bank") as string | undefined,
    userValidatedFields,
    hasFiscalTruth,
  );
  const loanType = resolveStringField(
    "loanType",
    undefined,
    offerMeta.loanType,
    readManualLoanField(manual, "loanType") as string | undefined,
    userValidatedFields,
    hasFiscalTruth,
  );
  const borrowedAmount = resolveNumericFormField(
    "borrowedAmount",
    amortDerived.loan.borrowedAmount,
    offerMeta.borrowedAmount,
    readManualLoanField(manual, "borrowedAmount") as string | undefined,
    userValidatedFields,
    hasFiscalTruth,
  );
  const rate = resolveNumericFormField(
    "rate",
    undefined,
    offerMeta.rate,
    readManualLoanField(manual, "rate") as string | undefined,
    userValidatedFields,
    hasFiscalTruth,
  );
  const durationMonths = resolveNumericFormField(
    "durationMonths",
    amortDerived.loan.durationMonths,
    offerMeta.durationMonths,
    readManualLoanField(manual, "durationMonths") as string | undefined,
    userValidatedFields,
    hasFiscalTruth,
  );
  const monthlyPayment = resolveNumericFormField(
    "monthlyPayment",
    amortDerived.loan.monthlyPayment,
    undefined,
    readManualLoanField(manual, "monthlyPayment") as string | undefined,
    userValidatedFields,
    hasFiscalTruth,
  );
  const insurance = resolveNumericFormField(
    "insurance",
    amortDerived.loan.insurance,
    undefined,
    readManualLoanField(manual, "insurance") as string | undefined,
    userValidatedFields,
    hasFiscalTruth,
  );
  const deferral = resolveDeferralField(
    amortDerived.loan.deferralType,
    readManualLoanField(manual, "deferralType") as string | undefined,
    userValidatedFields,
    hasFiscalTruth,
  );
  const loanApplicationFees = resolveNumericFormField(
    "loanApplicationFees",
    undefined,
    offerMeta.loanApplicationFees,
    readManualLoanField(manual, "loanApplicationFees") as string | undefined,
    userValidatedFields,
    hasFiscalTruth,
  );
  const loanGuaranteeFees = resolveNumericFormField(
    "loanGuaranteeFees",
    undefined,
    offerMeta.loanGuaranteeFees,
    readManualLoanField(manual, "loanGuaranteeFees") as string | undefined,
    userValidatedFields,
    hasFiscalTruth,
  );
  const firstPaymentDate = resolveStringField(
    "firstPaymentDate",
    amortDerived.loan.firstPaymentDate,
    undefined,
    readManualLoanField(manual, "firstPaymentDate") as string | undefined,
    userValidatedFields,
    hasFiscalTruth,
  );
  const remainingCapitalLoan = resolveNumericFormField(
    "remainingCapital",
    amortDerived.loan.remainingCapital,
    undefined,
    readManualLoanField(manual, "remainingCapital") as string | undefined,
    userValidatedFields,
    hasFiscalTruth,
  );

  const annualInterest = resolveNumericFormField(
    "annualInterest",
    amortDerived.summary.annualInterest,
    undefined,
    readManualSummaryField(manual, "annualInterest"),
    userValidatedFields,
    hasFiscalTruth,
  );
  const annualInsurance = resolveNumericFormField(
    "annualInsurance",
    amortDerived.summary.annualInsurance,
    undefined,
    readManualSummaryField(manual, "annualInsurance"),
    userValidatedFields,
    hasFiscalTruth,
  );
  const remainingCapitalSummary = resolveNumericFormField(
    "remainingCapital",
    amortDerived.summary.remainingCapital,
    undefined,
    readManualSummaryField(manual, "remainingCapital"),
    userValidatedFields,
    hasFiscalTruth,
  );

  const assignSource = (key: CreditPrefillFieldKey, source?: CreditFieldSource) => {
    if (source) fieldSources[key] = source;
  };
  assignSource("bank", bank.source);
  assignSource("loanType", loanType.source);
  assignSource("borrowedAmount", borrowedAmount.source);
  assignSource("rate", rate.source);
  assignSource("durationMonths", durationMonths.source);
  assignSource("monthlyPayment", monthlyPayment.source);
  assignSource("insurance", insurance.source);
  assignSource("deferralType", deferral.source);
  assignSource("loanApplicationFees", loanApplicationFees.source);
  assignSource("loanGuaranteeFees", loanGuaranteeFees.source);
  assignSource("firstPaymentDate", firstPaymentDate.source);
  assignSource("remainingCapital", remainingCapitalLoan.source ?? remainingCapitalSummary.source);
  assignSource("annualInterest", annualInterest.source);
  assignSource("annualInsurance", annualInsurance.source);
  if (amortDerived.installments.length > 0) {
    fieldSources.installments = "amortization";
  }

  const loan: CreditLoanFormValues = {
    ...emptyLoanFormValues(),
    bank: bank.value,
    loanType: loanType.value,
    borrowedAmount: borrowedAmount.value,
    rate: rate.value,
    durationMonths: durationMonths.value,
    monthlyPayment: monthlyPayment.value,
    insurance: insurance.value,
    deferralType: deferral.value,
    loanApplicationFees: loanApplicationFees.value,
    loanGuaranteeFees: loanGuaranteeFees.value,
    firstPaymentDate: firstPaymentDate.value,
    remainingCapital: remainingCapitalLoan.value,
    isWorksLoan: Boolean(readManualLoanField(manual, "isWorksLoan") ?? false),
  };

  const summary = {
    annualInterest: annualInterest.value,
    annualInsurance: annualInsurance.value,
    remainingCapital: remainingCapitalSummary.value,
    remainingCapitalAsOf: amortDerived.summary.remainingCapitalAsOf,
  };

  const installments = amortDerived.installments;

  const byPhase = {
    deferred: installments.filter((row) => classifyLoanInstallmentPhase(row) === "deferred").length,
    amortizing: installments.filter((row) => classifyLoanInstallmentPhase(row) === "amortizing")
      .length,
    interest_only: installments.filter((row) => classifyLoanInstallmentPhase(row) === "interest_only")
      .length,
    unknown: installments.filter((row) => classifyLoanInstallmentPhase(row) === "unknown").length,
  };

  logUiInstallmentVisibility({
    sessionInstallmentCount: input.session.amortization?.installments?.length ?? 0,
    formInstallmentCount: installments.length,
    displayInstallmentCount: installments.length,
    revenueYear: input.revenueYear,
    extraction: input.session.amortization,
  });

  console.log("[installment-visibility-debug] hydrateCreditFormFromSession", {
    revenueYear: input.revenueYear,
    installmentCount: installments.length,
    deferredRowCountAtUI: byPhase.deferred,
    byPhase,
    insuranceBearingCount: installments.filter((row) => row.insurance > 0).length,
    annualInsurance: amortDerived.summary.annualInsurance,
    annualInterest: amortDerived.summary.annualInterest,
  });

  const nextValues: CreditFormValues = {
    loans: [loan],
    summary,
    installments,
  };

  const changedFields: CreditPrefillFieldKey[] = Object.keys({
    ...loan,
    ...summary,
  }) as CreditPrefillFieldKey[];

  const uncertainFields: CreditFieldKey[] = [];
  if (!summary.annualInsurance.trim() && hasFiscalTruth) uncertainFields.push("insurance");
  if (!loan.rate.trim() && !offerMeta.rate) uncertainFields.push("rate");
  if (deferral.value !== "none" && !loan.deferralType.trim()) uncertainFields.push("deferralType");

  const { payload, fields } = buildGovernedPayload(nextValues, installments, {
    documentKind: input.governedPayloadFor,
  });

  return {
    nextValues,
    installments,
    changedFields,
    skippedFields: [],
    governedPayload: payload,
    governedFields: fields,
    uncertainFields,
    fieldSources,
  };
}

/** @deprecated Use hydrateCreditFormFromSession — kept as alias for pipeline callers. */
export function prefillCreditFormFromGpt(input: CreditGptPrefillInput): CreditGptPrefillResult {
  return hydrateCreditFormFromSession(input);
}

export function mergeCreditUserValidatedFields(
  existing: CreditUserValidatedFields,
  editedKeys: CreditPrefillFieldKey[],
): CreditUserValidatedFields {
  const merged = { ...existing };
  for (const key of editedKeys) {
    merged[key] = true;
  }
  return merged;
}

export function mergeCreditExtractionSession(
  current: CreditExtractionSession,
  kind: "amortization" | "loan_offer",
  extraction: CreditAmortizationExtraction | CreditLoanOfferExtraction,
  traceContext?: { documentId?: string },
): CreditExtractionSession {
  const merged: CreditExtractionSession =
    kind === "amortization"
      ? { ...current, amortization: extraction as CreditAmortizationExtraction }
      : { ...current, loanOffer: extraction as CreditLoanOfferExtraction };

  logCreditExtractionMerge({
    documentId: traceContext?.documentId,
    kind,
    current,
    extraction,
    merged,
  });

  return merged;
}

export function readCreditUserValidatedFields(
  draft?: DeclarationDraft,
): CreditUserValidatedFields {
  return (draft?.creditUserValidatedFields ?? {}) as CreditUserValidatedFields;
}

/** Resolve credit form from draft — session-first unless financing is confirmed. */
export function creditFromDraft(
  draft?: DeclarationDraft,
  revenueYear?: number,
  userValidatedFields?: CreditUserValidatedFields,
): CreditFormValues {
  if (draft?.creditConfirmedAt && draft?.creditFinancing) {
    return normalizeCreditFormValues(financingToFormValues(draft.creditFinancing));
  }

  if (draft?.creditGptSession && revenueYear !== undefined && hasCreditExtractionSession(draft.creditGptSession)) {
    return hydrateCreditFormFromSession({
      session: draft.creditGptSession,
      revenueYear,
      userValidatedFields: userValidatedFields ?? readCreditUserValidatedFields(draft),
      manualOverrides: draft.creditWorkspaceForm,
    }).nextValues;
  }

  if (draft?.creditFinancing) {
    return normalizeCreditFormValues(financingToFormValues(draft.creditFinancing));
  }

  return emptyCreditFormValues();
}

export function creditPrefillUncertainFields(changedFields: CreditPrefillFieldKey[]): CreditFieldKey[] {
  return changedFields.filter(
    (key): key is CreditFieldKey =>
      key !== "annualInterest" &&
      key !== "annualInsurance" &&
      key !== "remainingCapital" &&
      key !== "installments",
  );
}

export function hasCreditExtractionSession(session?: CreditExtractionSession): boolean {
  return Boolean(session?.amortization || session?.loanOffer);
}
