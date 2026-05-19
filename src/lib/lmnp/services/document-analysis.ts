import type { FieldKey } from "../types/field-keys";
import type { DocumentCategory, DocumentType, Extraction, LmnpDocument } from "../types/domain";
import { moneyFromEuros, parseEurosFromText, textValue } from "../types/values";
import { inferDocumentType } from "./document-classifier";

/** Heuristic amount hints when filename has no digits (euros) */
const DEFAULT_AMOUNTS: Partial<Record<FieldKey, number>> = {
  "income.annualRent": 1520 * 12,
  "expense.propertyTax": 1420,
  "expense.insurance": 348,
  "expense.condo": 1240,
  "expense.worksDeductible": 2100,
  "loan.annualInterest": 4680,
  "amort.furnitureAnnual": 1850,
  "amort.buildingAnnual": 4200,
};

interface ExtractionRule {
  documentTypes: DocumentType[];
  fieldKey: FieldKey;
  label: string;
  baseConfidence: number;
}

const EXTRACTION_RULES: ExtractionRule[] = [
  {
    documentTypes: ["rent_bank_statement", "bank_statement", "lease_contract", "rent_receipt"],
    fieldKey: "income.annualRent",
    label: "Loyers perçus sur l'année",
    baseConfidence: 88,
  },
  {
    documentTypes: ["property_tax"],
    fieldKey: "expense.propertyTax",
    label: "Taxe foncière",
    baseConfidence: 90,
  },
  {
    documentTypes: ["insurance_invoice"],
    fieldKey: "expense.insurance",
    label: "Assurance (PNO)",
    baseConfidence: 86,
  },
  {
    documentTypes: ["condo_charges"],
    fieldKey: "expense.condo",
    label: "Charges de copropriété",
    baseConfidence: 84,
  },
  {
    documentTypes: ["works_invoice"],
    fieldKey: "expense.worksDeductible",
    label: "Travaux et entretien",
    baseConfidence: 82,
  },
  {
    documentTypes: ["loan_interest_certificate", "loan_schedule"],
    fieldKey: "loan.annualInterest",
    label: "Intérêts d'emprunt",
    baseConfidence: 87,
  },
  {
    documentTypes: ["furniture_invoice"],
    fieldKey: "amort.furnitureAnnual",
    label: "Amortissement mobilier",
    baseConfidence: 78,
  },
  {
    documentTypes: ["notary_deed"],
    fieldKey: "amort.buildingAnnual",
    label: "Amortissement du bien (bâti)",
    baseConfidence: 75,
  },
];

function extractAmountFromFileName(fileName: string): number | null {
  const patterns = [
    /(\d{1,3}(?:[\s.]\d{3})*(?:,\d{2})?)\s*€?/,
    /(\d+(?:[.,]\d{2})?)\s*eur/i,
    /(\d{4,6})/,
  ];
  for (const pattern of patterns) {
    const match = fileName.match(pattern);
    if (match) {
      const parsed = parseEurosFromText(match[1]);
      if (parsed !== null && parsed > 0 && parsed < 10_000_000) return parsed;
    }
  }
  return null;
}

function resolveAmount(fieldKey: FieldKey, fileName: string): { euros: number; confidence: number } {
  const fromName = extractAmountFromFileName(fileName);
  if (fromName !== null) {
    return { euros: fromName, confidence: 12 };
  }
  const fallback = DEFAULT_AMOUNTS[fieldKey] ?? 0;
  return { euros: fallback, confidence: -8 };
}

export function analyzeDocument(
  doc: LmnpDocument,
  userCategory: DocumentCategory,
): { documentType: DocumentType; category: DocumentCategory; extractions: Omit<Extraction, "validationItemId">[] } {
  const inferred = inferDocumentType(doc.fileName, userCategory);
  const extractions: Omit<Extraction, "validationItemId">[] = [];

  for (const rule of EXTRACTION_RULES) {
    if (!rule.documentTypes.includes(inferred.documentType)) continue;

    const { euros, confidence: confidenceDelta } = resolveAmount(rule.fieldKey, doc.fileName);
    if (euros <= 0) continue;

    const confidence = Math.min(99, Math.max(55, rule.baseConfidence + confidenceDelta));

    extractions.push({
      id: crypto.randomUUID(),
      documentId: doc.id,
      fiscalYearId: doc.fiscalYearId,
      fieldKey: rule.fieldKey,
      rawValue: `${euros.toFixed(2)} EUR`,
      normalizedValue: moneyFromEuros(euros),
      confidence,
      status: "pending_validation",
    });
  }

  if (inferred.documentType === "lease_contract") {
    const addressMatch = doc.fileName.match(/lyon|paris|marseille|lille|bordeaux/i);
    if (addressMatch) {
      extractions.push({
        id: crypto.randomUUID(),
        documentId: doc.id,
        fiscalYearId: doc.fiscalYearId,
        fieldKey: "property.label",
        rawValue: addressMatch[0],
        normalizedValue: textValue(`Bien — ${addressMatch[0]}`),
        confidence: 70,
        status: "pending_validation",
      });
    }
  }

  return {
    documentType: inferred.documentType,
    category: inferred.category,
    extractions,
  };
}

export async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
