import type { DocumentCategory, DocumentType } from "../types";
import type { FieldKey } from "../types/field-keys";
import { categoryFromDocumentType } from "./map-to-extractions";
import type { SanitizedOcrResult } from "./validate";

export type InconsistencyCode =
  | "CATEGORY_MISMATCH"
  | "TYPE_UNCERTAIN"
  | "AMOUNT_PERIOD_MISMATCH"
  | "VAT_UNEXPECTED"
  | "NO_FISCAL_AMOUNT"
  | "MONTHLY_NOT_CONVERTED";

export interface DocumentInconsistency {
  code: InconsistencyCode;
  severity: "warning" | "info";
  message: string;
}

const CATEGORY_TYPE_HINTS: Partial<Record<DocumentCategory, DocumentType[]>> = {
  bail: ["lease_contract", "rent_receipt"],
  revenus: ["rent_bank_statement", "bank_statement", "rent_receipt"],
  charges: ["insurance_invoice", "condo_charges", "works_invoice", "property_tax"],
  amortissement: ["furniture_invoice", "notary_deed"],
  emprunt: ["loan_interest_certificate", "loan_schedule"],
  autre: ["property_tax", "unknown"],
};

export function detectDocumentInconsistencies(params: {
  userCategory: DocumentCategory;
  sanitized: SanitizedOcrResult;
  suggestedType?: DocumentType;
}): DocumentInconsistency[] {
  const { userCategory, sanitized, suggestedType } = params;
  const issues: DocumentInconsistency[] = [];
  const detected = sanitized.documentType;
  const detectedCategory = categoryFromDocumentType(detected);

  if (detected === "unknown") {
    issues.push({
      code: "TYPE_UNCERTAIN",
      severity: "warning",
      message: "Le type de document n'a pas pu être identifié avec certitude.",
    });
  }

  if (sanitized.documentTypeConfidence < 65) {
    issues.push({
      code: "TYPE_UNCERTAIN",
      severity: "warning",
      message: `Classification incertaine (${sanitized.documentTypeConfidence} % de confiance).`,
    });
  }

  const allowedTypes = CATEGORY_TYPE_HINTS[userCategory];
  if (
    allowedTypes &&
    detected !== "unknown" &&
    !allowedTypes.includes(detected) &&
    detectedCategory !== userCategory
  ) {
    issues.push({
      code: "CATEGORY_MISMATCH",
      severity: "warning",
      message: `Document classé « ${detected} » mais déposé en catégorie « ${userCategory} ».`,
    });
  }

  if (
    suggestedType &&
    suggestedType !== "unknown" &&
    detected !== "unknown" &&
    suggestedType !== detected &&
    sanitized.documentTypeConfidence < 80
  ) {
    issues.push({
      code: "TYPE_UNCERTAIN",
      severity: "info",
      message: `Le nom du fichier suggère « ${suggestedType} », l'IA a détecté « ${detected} ».`,
    });
  }

  if (
    sanitized.amountPeriod === "monthly" &&
    (detected === "lease_contract" ||
      detected === "rent_receipt" ||
      detected === "rent_bank_statement")
  ) {
    issues.push({
      code: "MONTHLY_NOT_CONVERTED",
      severity: "info",
      message: "Montant mensuel détecté — une conversion annuelle (×12) sera proposée avec prudence.",
    });
  }

  if (
    sanitized.amountPeriod === "monthly" &&
    detected === "property_tax"
  ) {
    issues.push({
      code: "AMOUNT_PERIOD_MISMATCH",
      severity: "warning",
      message: "Montant mensuel détecté sur un avis de taxe foncière — vérifiez le montant annuel.",
    });
  }

  if (sanitized.vatAmount && !sanitized.vatAmount.rejected) {
    const noVatTypes: DocumentType[] = [
      "property_tax",
      "lease_contract",
      "rent_receipt",
      "loan_interest_certificate",
    ];
    if (noVatTypes.includes(detected)) {
      issues.push({
        code: "VAT_UNEXPECTED",
        severity: "warning",
        message: "TVA détectée sur un document qui n'en contient habituellement pas.",
      });
    }
  }

  const hasAnyAmount =
    sanitized.totalAmount && !sanitized.totalAmount.rejected;
  const fiscalTypes: DocumentType[] = [
    "property_tax",
    "insurance_invoice",
    "condo_charges",
    "works_invoice",
    "loan_interest_certificate",
    "rent_bank_statement",
    "lease_contract",
  ];

  if (fiscalTypes.includes(detected) && !hasAnyAmount) {
    issues.push({
      code: "NO_FISCAL_AMOUNT",
      severity: "warning",
      message: "Aucun montant fiscal fiable extrait — saisie manuelle recommandée.",
    });
  }

  return dedupeInconsistencies(issues);
}

export function resolveDocumentType(params: {
  ocrType: DocumentType;
  ocrConfidence: number;
  userCategory: DocumentCategory;
  suggestedType: DocumentType;
}): DocumentType {
  const { ocrType, ocrConfidence, userCategory, suggestedType } = params;

  if (ocrType !== "unknown" && ocrConfidence >= 75) {
    return ocrType;
  }

  if (suggestedType !== "unknown" && ocrConfidence < 65) {
    return suggestedType;
  }

  if (ocrType === "unknown" && userCategory === "charges") {
    // Filename-inferred charge types are kept; generic uploads stay unknown (expense.other).
    if (
      suggestedType === "insurance_invoice" ||
      suggestedType === "property_tax" ||
      suggestedType === "condo_charges" ||
      suggestedType === "works_invoice"
    ) {
      return suggestedType;
    }
    return "unknown";
  }

  if (ocrType === "unknown") {
    return suggestedType !== "unknown" ? suggestedType : inferFromCategory(userCategory);
  }

  return ocrType;
}

function inferFromCategory(category: DocumentCategory): DocumentType {
  const map: Record<DocumentCategory, DocumentType> = {
    bail: "lease_contract",
    revenus: "rent_bank_statement",
    charges: "unknown",
    amortissement: "furniture_invoice",
    emprunt: "loan_interest_certificate",
    autre: "property_tax",
  };
  return map[category];
}

function dedupeInconsistencies(issues: DocumentInconsistency[]): DocumentInconsistency[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const key = `${i.code}-${i.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function inconsistencyAffectsTrust(issues: DocumentInconsistency[]): boolean {
  return issues.some(
    (i) =>
      i.severity === "warning" &&
      (i.code === "CATEGORY_MISMATCH" ||
        i.code === "TYPE_UNCERTAIN" ||
        i.code === "NO_FISCAL_AMOUNT" ||
        i.code === "AMOUNT_PERIOD_MISMATCH"),
  );
}

export function getPrimaryAmountField(
  documentType: DocumentType,
  userCategory?: DocumentCategory,
): FieldKey | null {
  if (documentType === "unknown" && userCategory === "charges") {
    return "expense.other";
  }

  const map: Partial<Record<DocumentType, FieldKey>> = {
    lease_contract: "income.annualRent",
    rent_receipt: "income.annualRent",
    rent_bank_statement: "income.annualRent",
    bank_statement: "income.annualRent",
    property_tax: "expense.propertyTax",
    insurance_invoice: "expense.insurance",
    condo_charges: "expense.condo",
    works_invoice: "expense.worksDeductible",
    furniture_invoice: "amort.furnitureAnnual",
    loan_interest_certificate: "loan.annualInterest",
    loan_schedule: "loan.annualInterest",
    notary_deed: "amort.buildingAnnual",
  };
  return map[documentType] ?? null;
}
