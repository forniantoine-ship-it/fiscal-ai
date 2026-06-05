import type { LogementDocumentIntent } from "./logement-document-intent";

/**
 * Canonical logement semantic fields — business vocabulary aligned with LMNP model.
 * GPT must fill ONLY these keys for the detected intent.
 */

export type AcquisitionCanonicalFields = {
  acquisitionPrice?: number;
  acquisitionDate?: string;
  propertyAddress?: string;
  propertyPostalCode?: string;
  propertyCity?: string;
  propertyType?: string;
  lotNumbers?: string[];
  livingArea?: number;
  sellerNames?: string[];
  buyerNames?: string[];
  notaryName?: string;
  notaryFees?: number;
};

export type FinancingCanonicalFields = {
  loanAmount?: number;
  interestRate?: number;
  monthlyPayment?: number;
  insuranceAmount?: number;
  durationMonths?: number;
  bankName?: string;
};

export type RentalCanonicalFields = {
  monthlyRent?: number;
  furnished?: boolean;
  tenantName?: string;
  leaseStartDate?: string;
};

export type FiscalCanonicalFields = {
  propertyAddress?: string;
  taxYear?: number;
  taxAmount?: number;
};

export type ChargesCanonicalFields = {
  insuranceAmount?: number;
  insurerName?: string;
  policyStartDate?: string;
};

export type CoproCanonicalFields = {
  callAmount?: number;
  callDate?: string;
  lotNumbers?: string[];
};

export type PerformanceCanonicalFields = {
  energyClass?: string;
  livingArea?: number;
  diagnosticDate?: string;
};

export type LegalCanonicalFields = {
  documentTitle?: string;
  effectiveDate?: string;
};

export type OwnershipCanonicalFields = {
  ownerNames?: string[];
  propertyAddress?: string;
  cadastralReferences?: string[];
};

export type LogementCanonicalFieldsByIntent = {
  acquisition: AcquisitionCanonicalFields;
  financing: FinancingCanonicalFields;
  rental: RentalCanonicalFields;
  fiscal: FiscalCanonicalFields;
  charges: ChargesCanonicalFields;
  copro: CoproCanonicalFields;
  performance: PerformanceCanonicalFields;
  legal: LegalCanonicalFields;
  ownership: OwnershipCanonicalFields;
};

export type LogementCanonicalFields = LogementCanonicalFieldsByIntent[LogementDocumentIntent];

export const CANONICAL_FIELD_KEYS_BY_INTENT: {
  [K in LogementDocumentIntent]: readonly (keyof LogementCanonicalFieldsByIntent[K])[];
} = {
  acquisition: [
    "acquisitionPrice",
    "acquisitionDate",
    "propertyAddress",
    "propertyPostalCode",
    "propertyCity",
    "propertyType",
    "lotNumbers",
    "livingArea",
    "sellerNames",
    "buyerNames",
    "notaryName",
    "notaryFees",
  ],
  financing: [
    "loanAmount",
    "interestRate",
    "monthlyPayment",
    "insuranceAmount",
    "durationMonths",
    "bankName",
  ],
  rental: ["monthlyRent", "furnished", "tenantName", "leaseStartDate"],
  fiscal: ["propertyAddress", "taxYear", "taxAmount"],
  charges: ["insuranceAmount", "insurerName", "policyStartDate"],
  copro: ["callAmount", "callDate", "lotNumbers"],
  performance: ["energyClass", "livingArea", "diagnosticDate"],
  legal: ["documentTitle", "effectiveDate"],
  ownership: ["ownerNames", "propertyAddress", "cadastralReferences"],
};

export type RawDocumentTerm = {
  term: string;
  value?: string;
  mappedField?: string;
};

export type LogementSemanticExtraction = {
  documentIntent: LogementDocumentIntent;
  canonicalFields: LogementCanonicalFields;
  rawDocumentTerms?: RawDocumentTerm[];
};
