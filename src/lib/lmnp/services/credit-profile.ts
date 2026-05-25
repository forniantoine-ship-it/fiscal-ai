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
  | "fees"
  | "startDate"
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
  fees: string;
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
    annualFinancingCharges: string;
    remainingCapital: string;
  };
};

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
    fees: String(loan.fees),
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
        annualFinancingCharges: "",
        remainingCapital: "",
      },
    };
  }

  return {
    loans: data.loans.map(loanToFormValues),
    summary: {
      annualInterest: String(data.summary.annualInterest),
      annualInsurance: String(data.summary.annualInsurance),
      annualFinancingCharges: String(data.summary.annualFinancingCharges),
      remainingCapital: String(data.summary.remainingCapital),
    },
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
    fees: "",
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
    fees: parseNumber(loan.fees),
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
      annualFinancingCharges: parseNumber(values.summary.annualFinancingCharges),
      remainingCapital: parseNumber(values.summary.remainingCapital),
    },
    installments: MOCK_CREDIT_FINANCING.installments,
  };
}

export function creditFromDraft(draft?: DeclarationDraft): CreditFormValues {
  return financingToFormValues(draft?.creditFinancing);
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

export const MOCK_CREDIT_FINANCING: CreditFinancingData = {
  loans: [
    {
      id: "loan-1",
      bank: "Crédit Agricole",
      loanType: "Prêt immobilier amortissable",
      borrowedAmount: 180_000,
      rate: 3.15,
      durationMonths: 240,
      monthlyPayment: 1_012,
      insurance: 42,
      deferralType: "none",
      fees: 850,
      startDate: "2022-10-01",
      firstPaymentDate: "2022-11-05",
      remainingCapital: 168_420,
      isWorksLoan: false,
    },
    {
      id: "loan-2",
      bank: "Crédit Agricole",
      loanType: "Prêt travaux",
      borrowedAmount: 25_000,
      rate: 2.9,
      durationMonths: 120,
      monthlyPayment: 238,
      insurance: 8,
      deferralType: "partial",
      deferralMonths: 6,
      fees: 0,
      startDate: "2023-03-01",
      firstPaymentDate: "2023-09-05",
      remainingCapital: 21_180,
      isWorksLoan: true,
    },
  ],
  summary: {
    fiscalYearLabel: "2025",
    annualInterest: 4_820,
    annualInsurance: 600,
    annualFinancingCharges: 5_420,
    remainingCapital: 189_600,
  },
  installments: [
    {
      date: "2025-01-05",
      totalPayment: 1_054,
      principal: 412,
      interest: 580,
      insurance: 50,
      fees: 12,
    },
    {
      date: "2025-02-05",
      totalPayment: 1_054,
      principal: 418,
      interest: 574,
      insurance: 50,
      fees: 12,
    },
    {
      date: "2025-03-05",
      totalPayment: 1_054,
      principal: 424,
      interest: 568,
      insurance: 50,
      fees: 12,
    },
    {
      date: "2025-04-05",
      totalPayment: 1_054,
      principal: 430,
      interest: 562,
      insurance: 50,
      fees: 12,
    },
    {
      date: "2025-05-05",
      totalPayment: 1_054,
      principal: 436,
      interest: 556,
      insurance: 50,
      fees: 12,
    },
    {
      date: "2025-06-05",
      totalPayment: 1_054,
      principal: 442,
      interest: 550,
      insurance: 50,
      fees: 12,
    },
  ],
};

export const MOCK_CREDIT_FORM: CreditFormValues = financingToFormValues(MOCK_CREDIT_FINANCING);

export const MOCK_CREDIT_UNCERTAIN_FIELDS: CreditFieldKey[] = ["deferralType", "fees"];
