import type { DocumentCategory, DocumentType } from "../types";

const FILENAME_RULES: { pattern: RegExp; documentType: DocumentType; category: DocumentCategory }[] = [
  { pattern: /bail|loyer|quittance|location/i, documentType: "lease_contract", category: "bail" },
  { pattern: /relev|banque|virement|encaissement/i, documentType: "rent_bank_statement", category: "revenus" },
  { pattern: /taxe[\s_-]?fonci/i, documentType: "property_tax", category: "autre" },
  { pattern: /assurance|pno|gli/i, documentType: "insurance_invoice", category: "charges" },
  { pattern: /syndic|copro|charges?\s*copro/i, documentType: "condo_charges", category: "charges" },
  { pattern: /travaux|entretien|facture[\s_-]?trav/i, documentType: "works_invoice", category: "charges" },
  { pattern: /mobilier|meuble|electro/i, documentType: "furniture_invoice", category: "amortissement" },
  { pattern: /interet|emprunt|pret|banque.*20\d{2}/i, documentType: "loan_interest_certificate", category: "emprunt" },
  { pattern: /tableau.*amort|echeancier/i, documentType: "loan_schedule", category: "emprunt" },
  { pattern: /notaire|acte/i, documentType: "notary_deed", category: "amortissement" },
];

export function inferDocumentType(
  fileName: string,
  userCategory: DocumentCategory,
): { documentType: DocumentType; category: DocumentCategory } {
  for (const rule of FILENAME_RULES) {
    if (rule.pattern.test(fileName)) {
      return { documentType: rule.documentType, category: rule.category };
    }
  }

  const fallbackByCategory: Record<DocumentCategory, DocumentType> = {
    bail: "lease_contract",
    revenus: "rent_bank_statement",
    charges: "insurance_invoice",
    amortissement: "furniture_invoice",
    emprunt: "loan_interest_certificate",
    autre: "property_tax",
  };

  return {
    documentType: fallbackByCategory[userCategory],
    category: userCategory,
  };
}
