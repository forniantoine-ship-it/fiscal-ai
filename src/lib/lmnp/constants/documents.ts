import type { DocumentCategory, DocumentType, FiscalRegime } from "../types";

export interface DocumentCategoryMeta {
  id: DocumentCategory;
  label: string;
  hint: string;
}

export const DOCUMENT_CATEGORIES: DocumentCategoryMeta[] = [
  { id: "bail", label: "Bail / quittances", hint: "Contrat de location meublée" },
  { id: "revenus", label: "Revenus locatifs", hint: "Relevés bancaires, attestations" },
  { id: "charges", label: "Charges déductibles", hint: "Factures, assurances, syndic" },
  { id: "amortissement", label: "Amortissements", hint: "Factures mobilier, travaux" },
  { id: "emprunt", label: "Emprunt", hint: "Attestation ou tableau d'amortissement" },
  { id: "autre", label: "Autres pièces", hint: "Taxe foncière, documents divers" },
];

export interface DocumentRequirement {
  documentType: DocumentType;
  label: string;
  level: "required" | "recommended" | "conditional";
  regimes: FiscalRegime[];
  /** When true for conditional rules */
  condition?: "has_loan" | "reel_only";
}

export const DOCUMENT_REQUIREMENTS: DocumentRequirement[] = [
  {
    documentType: "lease_contract",
    label: "Bail / contrat de location",
    level: "required",
    regimes: ["reel"],
  },
  {
    documentType: "lease_contract",
    label: "Bail / contrat de location",
    level: "recommended",
    regimes: ["micro-bic"],
  },
  {
    documentType: "rent_bank_statement",
    label: "Relevés de loyers",
    level: "required",
    regimes: ["reel"],
  },
  {
    documentType: "rent_bank_statement",
    label: "Relevés de loyers",
    level: "recommended",
    regimes: ["micro-bic"],
  },
  {
    documentType: "property_tax",
    label: "Taxe foncière",
    level: "required",
    regimes: ["reel"],
    condition: "reel_only",
  },
  {
    documentType: "furniture_invoice",
    label: "Facture de meubles",
    level: "recommended",
    regimes: ["reel", "micro-bic"],
  },
  {
    documentType: "notary_deed",
    label: "Acte notarié",
    level: "recommended",
    regimes: ["reel", "micro-bic"],
  },
  {
    documentType: "works_invoice",
    label: "Factures de travaux",
    level: "recommended",
    regimes: ["reel"],
  },
  {
    documentType: "loan_interest_certificate",
    label: "Crédit immobilier (attestation)",
    level: "conditional",
    regimes: ["micro-bic", "reel"],
    condition: "has_loan",
  },
  {
    documentType: "insurance_invoice",
    label: "Assurance habitation",
    level: "recommended",
    regimes: ["reel"],
  },
];

export const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
