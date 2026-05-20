import type { DocumentCategory, DocumentType, Extraction, LmnpDocument } from "../types";
import type { FieldKey } from "../types/field-keys";
import { moneyFromEuros, textValue } from "../types/values";
import type { OcrDocumentResult } from "./schema";

const DOCUMENT_TYPE_TO_CATEGORY: Record<DocumentType, DocumentCategory> = {
  lease_contract: "bail",
  rent_receipt: "bail",
  rent_bank_statement: "revenus",
  bank_statement: "revenus",
  property_tax: "autre",
  insurance_invoice: "charges",
  condo_charges: "charges",
  works_invoice: "charges",
  furniture_invoice: "amortissement",
  loan_interest_certificate: "emprunt",
  loan_schedule: "emprunt",
  notary_deed: "amortissement",
  unknown: "autre",
};

const AMOUNT_FIELD_BY_DOCUMENT_TYPE: Partial<Record<DocumentType, FieldKey>> = {
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

function clampConfidence(n: number): number {
  return Math.min(99, Math.max(0, Math.round(n)));
}

function makeExtraction(
  doc: LmnpDocument,
  fieldKey: FieldKey,
  rawValue: string,
  normalizedValue: Extraction["normalizedValue"],
  confidence: number,
  displayLabel?: string,
): Omit<Extraction, "validationItemId"> {
  return {
    id: crypto.randomUUID(),
    documentId: doc.id,
    fiscalYearId: doc.fiscalYearId,
    fieldKey,
    rawValue,
    normalizedValue,
    confidence: clampConfidence(confidence),
    status: "pending_validation",
    displayLabel,
  };
}

export function categoryFromDocumentType(documentType: DocumentType): DocumentCategory {
  return DOCUMENT_TYPE_TO_CATEGORY[documentType] ?? "autre";
}

export function ocrResultToExtractions(
  doc: LmnpDocument,
  ocr: OcrDocumentResult,
): Omit<Extraction, "validationItemId">[] {
  const extractions: Omit<Extraction, "validationItemId">[] = [];
  const amountField = AMOUNT_FIELD_BY_DOCUMENT_TYPE[ocr.documentType];

  if (ocr.totalAmount && ocr.totalAmount.euros > 0 && amountField) {
    const euros = ocr.totalAmount.euros;
    extractions.push(
      makeExtraction(
        doc,
        amountField,
        `${euros.toFixed(2)} EUR`,
        moneyFromEuros(euros),
        ocr.totalAmount.confidence,
      ),
    );
  }

  if (ocr.vatAmount && ocr.vatAmount.euros > 0) {
    const euros = ocr.vatAmount.euros;
    extractions.push(
      makeExtraction(
        doc,
        "expense.other",
        `TVA ${euros.toFixed(2)} EUR`,
        moneyFromEuros(euros),
        ocr.vatAmount.confidence,
        "TVA",
      ),
    );
  }

  if (ocr.supplierName?.text?.trim()) {
    const text = ocr.supplierName.text.trim();
    extractions.push(
      makeExtraction(
        doc,
        "property.label",
        text,
        textValue(text),
        ocr.supplierName.confidence,
        "Émetteur / fournisseur",
      ),
    );
  }

  if (ocr.invoiceDate?.value) {
    extractions.push(
      makeExtraction(
        doc,
        "expense.other",
        ocr.invoiceDate.value,
        { type: "date", date: ocr.invoiceDate.value },
        ocr.invoiceDate.confidence,
        "Date du document",
      ),
    );
  }

  return extractions;
}

export interface DocumentAnalysisResult {
  documentType: DocumentType;
  category: DocumentCategory;
  extractions: Omit<Extraction, "validationItemId">[];
  ocr?: OcrDocumentResult;
}

export function buildAnalysisResult(
  doc: LmnpDocument,
  ocr: OcrDocumentResult,
  userCategory: DocumentCategory,
): DocumentAnalysisResult {
  const documentType = ocr.documentType === "unknown" ? inferFallbackType(userCategory) : ocr.documentType;
  const category =
    ocr.documentType === "unknown" ? userCategory : categoryFromDocumentType(documentType);

  return {
    documentType,
    category,
    extractions: ocrResultToExtractions(doc, { ...ocr, documentType }),
    ocr,
  };
}

function inferFallbackType(userCategory: DocumentCategory): DocumentType {
  const map: Record<DocumentCategory, DocumentType> = {
    bail: "lease_contract",
    revenus: "rent_bank_statement",
    charges: "insurance_invoice",
    amortissement: "furniture_invoice",
    emprunt: "loan_interest_certificate",
    autre: "property_tax",
  };
  return map[userCategory];
}
