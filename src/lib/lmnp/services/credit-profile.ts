import type { CreditFinancingData, DeclarationDraft, LmnpDocument } from "../types";

export type CreditFieldKey =
  | "bank"
  | "loanType"
  | "borrowedAmount"
  | "rate"
  | "durationMonths"
  | "monthlyPayment"
  | "insurance"
  | "deferralType"
  | "loanGuaranteeFees"
  | "loanApplicationFees"
  | "firstPaymentDate"
  | "remainingCapital"
  | "isWorksLoan";

export type CreditLoanFormValues = {
  bank: string;
  loanType: string;
  borrowedAmount: string;
  rate: string;
  durationMonths: string;
  monthlyPayment: string;
  insurance: string;
  deferralType: string;
  loanGuaranteeFees: string;
  loanApplicationFees: string;
  startDate: string;
  firstPaymentDate: string;
  remainingCapital: string;
  isWorksLoan: boolean;
};

export type CreditFormValues = {
  loans: CreditLoanFormValues[];
  summary: {
    annualInterest: string;
    annualInsurance: string;
    remainingCapital: string;
    /** Reference date for remainingCapital label, e.g. 2025-12-31 */
    remainingCapitalAsOf?: string;
  };
  installments?: import("../types").LoanInstallment[];
};

export type CreditDocumentKind = "amortization" | "loan_offer";

export function classifyCreditFileName(fileName: string): CreditDocumentKind {
  if (/amort|echeancier|[ée]ch[eé]ancier|tableau/i.test(fileName)) {
    return "amortization";
  }
  if (/offre|attestation|proposition|simulation/i.test(fileName)) {
    return "loan_offer";
  }
  return "amortization";
}

export function classifyCreditDocument(doc: LmnpDocument): CreditDocumentKind {
  if (
    doc.documentType === "loan_schedule" ||
    /amort|echeancier|tableau/i.test(doc.fileName)
  ) {
    return "amortization";
  }
  if (
    doc.documentType === "loan_interest_certificate" ||
    /offre|attestation|proposition|simulation/i.test(doc.fileName)
  ) {
    return "loan_offer";
  }
  return "amortization";
}

export function isCreditDocument(doc: LmnpDocument, linkedDocumentId?: string): boolean {
  if (linkedDocumentId && doc.id === linkedDocumentId) return true;
  return (
    doc.category === "emprunt" ||
    doc.documentType === "loan_interest_certificate" ||
    doc.documentType === "loan_schedule" ||
    /emprunt|pret|pr[eê]t|credit|interet|banque|amortissement|offre/i.test(doc.fileName)
  );
}

export function countCreditDocuments(documents: LmnpDocument[], linkedDocumentId?: string): number {
  return documents.filter((doc) => isCreditDocument(doc, linkedDocumentId)).length;
}

export function revenueYearFromDeclaration(declarationYear: number): number {
  return declarationYear - 1;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function loanToFormValues(loan: CreditFinancingData["loans"][0]): CreditLoanFormValues {
  return {
    bank: loan.bank,
    loanType: loan.loanType,
    borrowedAmount: String(loan.borrowedAmount),
    rate: String(loan.rate),
    durationMonths: String(loan.durationMonths),
    monthlyPayment: String(loan.monthlyPayment),
    insurance: String(loan.insurance),
    deferralType: loan.deferralType ?? "none",
    loanGuaranteeFees: String(loan.loanGuaranteeFees ?? 0),
    loanApplicationFees: String(loan.loanApplicationFees ?? loan.fees ?? 0),
    startDate: loan.startDate,
    firstPaymentDate: loan.firstPaymentDate,
    remainingCapital: String(loan.remainingCapital),
    isWorksLoan: Boolean(loan.isWorksLoan),
  };
}

export function financingToFormValues(data?: CreditFinancingData): CreditFormValues {
  if (!data?.loans.length) {
    return {
      loans: [emptyLoanFormValues()],
      summary: {
        annualInterest: "",
        annualInsurance: "",
        remainingCapital: "",
      },
    };
  }

  return {
    loans: data.loans.map(loanToFormValues),
    summary: {
      annualInterest: String(data.summary.annualInterest),
      annualInsurance: String(data.summary.annualInsurance),
      remainingCapital: String(data.summary.remainingCapital),
    },
    installments: data.installments,
  };
}

export function emptyCreditFormValues(): CreditFormValues {
  return {
    loans: [emptyLoanFormValues()],
    summary: {
      annualInterest: "",
      annualInsurance: "",
      remainingCapital: "",
    },
    installments: [],
  };
}

export function emptyLoanFormValues(): CreditLoanFormValues {
  return {
    bank: "",
    loanType: "",
    borrowedAmount: "",
    rate: "",
    durationMonths: "",
    monthlyPayment: "",
    insurance: "",
    deferralType: "none",
    loanGuaranteeFees: "",
    loanApplicationFees: "",
    startDate: "",
    firstPaymentDate: "",
    remainingCapital: "",
    isWorksLoan: false,
  };
}

function parseNumber(value: string): number {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formValuesToFinancing(values: CreditFormValues, revenueYear: number): CreditFinancingData {
  const loans = values.loans.map((loan, index) => ({
    id: `loan-${index + 1}`,
    bank: loan.bank.trim(),
    loanType: loan.loanType.trim(),
    borrowedAmount: parseNumber(loan.borrowedAmount),
    rate: parseNumber(loan.rate),
    durationMonths: parseNumber(loan.durationMonths),
    monthlyPayment: parseNumber(loan.monthlyPayment),
    insurance: parseNumber(loan.insurance),
    deferralType: (loan.deferralType || "none") as CreditFinancingData["loans"][0]["deferralType"],
    fees: parseNumber(loan.loanApplicationFees),
    loanGuaranteeFees: parseNumber(loan.loanGuaranteeFees),
    loanApplicationFees: parseNumber(loan.loanApplicationFees),
    startDate: loan.startDate.trim(),
    firstPaymentDate: loan.firstPaymentDate.trim(),
    remainingCapital: parseNumber(loan.remainingCapital),
    isWorksLoan: loan.isWorksLoan,
  }));

  return {
    loans,
    summary: {
      fiscalYearLabel: String(revenueYear),
      annualInterest: parseNumber(values.summary.annualInterest),
      annualInsurance: parseNumber(values.summary.annualInsurance),
      remainingCapital: parseNumber(values.summary.remainingCapital),
    },
    installments: values.installments?.length ? values.installments : [],
  };
}

/** Maps legacy persisted form shapes (fees, annualFinancingCharges) to current fields. */
export function normalizeCreditFormValues(values: CreditFormValues): CreditFormValues {
  const legacySummary = values.summary as CreditFormValues["summary"] & {
    annualFinancingCharges?: string;
  };

  const summary = {
    annualInterest: values.summary.annualInterest ?? "",
    annualInsurance: values.summary.annualInsurance ?? "",
    remainingCapital: values.summary.remainingCapital ?? "",
    remainingCapitalAsOf: values.summary.remainingCapitalAsOf,
  };

  const loans = values.loans.map((loan) => {
    const legacyLoan = loan as CreditLoanFormValues & { fees?: string };
    return {
      ...emptyLoanFormValues(),
      ...loan,
      loanGuaranteeFees: loan.loanGuaranteeFees ?? "",
      loanApplicationFees:
        loan.loanApplicationFees?.trim() || legacyLoan.fees?.trim() || "",
    };
  });

  void legacySummary.annualFinancingCharges;

  return { loans: loans.length ? loans : [emptyLoanFormValues()], summary, installments: values.installments ?? [] };
}

export function isCreditProfileIncomplete(values: CreditFormValues): boolean {
  if (!values.summary.annualInterest.trim() || !values.summary.remainingCapital.trim()) return true;
  return values.loans.some(
    (loan) => !loan.bank.trim() || !loan.borrowedAmount.trim() || !loan.monthlyPayment.trim(),
  );
}

export function suggestsMultipleLoans(fileName: string): boolean {
  return /2\s*pr[eê]ts|deux\s*pr[eê]ts|multi|travaux.*principal|principal.*travaux/i.test(fileName);
}
