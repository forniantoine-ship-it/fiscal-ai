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
  notary_deed: "Acte notarié",
  furniture_invoice: "Facture de meubles",
  property_tax: "Taxe foncière",
  loan_interest_certificate: "Crédit immobilier",
  loan_schedule: "Tableau de crédit",
  insurance_invoice: "Assurance habitation",
  rent_bank_statement: "Relevés de loyers",
  rent_receipt: "Quittance de loyer",
  lease_contract: "Bail / location",
  works_invoice: "Factures de travaux",
  condo_charges: "Charges copropriété",
  bank_statement: "Relevé bancaire",
};

export const FIELD_KEY_TAB_HINT: Partial<Record<FieldKey, string>> = {
  "income.annualRent": "Mes loyers",
  "expense.propertyTax": "Mes dépenses",
  "amort.furnitureAnnual": "Mobilier & bien",
  "loan.annualInterest": "Mon crédit",
};
