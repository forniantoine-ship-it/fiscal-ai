import type { DocumentType } from "../types";
import type { FieldKey } from "../types/field-keys";

/** Mapping document métier → onglet LMNP (affichage UX). */
export const DOCUMENT_TYPE_TAB: Partial<
  Record<DocumentType, "recettes" | "depenses" | "immobilisations" | "emprunts" | "activite">
> = {
  furniture_invoice: "immobilisations",
  notary_deed: "immobilisations",
  property_tax: "depenses",
  insurance_invoice: "depenses",
  condo_charges: "depenses",
  works_invoice: "depenses",
  rent_bank_statement: "recettes",
  rent_receipt: "recettes",
  bank_statement: "recettes",
  lease_contract: "recettes",
  loan_interest_certificate: "emprunts",
  loan_schedule: "emprunts",
};

export const DOCUMENT_TYPE_SHORT_LABEL: Partial<Record<DocumentType, string>> = {
  furniture_invoice: "Facture meublé",
  property_tax: "Taxe foncière",
  rent_bank_statement: "Relevé de loyers",
  rent_receipt: "Quittance de loyer",
  loan_interest_certificate: "Intérêts bancaires",
  loan_schedule: "Tableau d'amortissement",
  insurance_invoice: "Assurance",
  condo_charges: "Charges copropriété",
  works_invoice: "Factures travaux",
  notary_deed: "Acte notarié",
};

export const FIELD_KEY_TAB_HINT: Partial<Record<FieldKey, string>> = {
  "income.annualRent": "Recettes",
  "expense.propertyTax": "Dépenses",
  "amort.furnitureAnnual": "Immobilisations",
  "loan.annualInterest": "Emprunts",
};
