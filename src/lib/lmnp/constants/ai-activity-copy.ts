import type { DocumentType } from "../types";

/** Rotation minimale pendant l’analyse (pas de chatbot). */
export const AI_ANALYSIS_PHASES = ["Lecture…", "Montants…", "Pré-remplissage…"] as const;

export const AI_ACTIVITY_BY_TYPE: Partial<Record<DocumentType, readonly string[]>> = {
  loan_interest_certificate: ["Crédit…", "Intérêts…", "Pré-remplissage…"],
  loan_schedule: ["Crédit…", "Échéances…"],
  property_tax: ["Taxe foncière…", "Montants…"],
  rent_bank_statement: ["Loyers…", "Encaissements…"],
  furniture_invoice: ["Meubles…", "Pré-remplissage…"],
  notary_deed: ["Acte…", "Valeurs…"],
  insurance_invoice: ["Assurance…", "Charges…"],
  works_invoice: ["Travaux…", "Montants…"],
  lease_contract: ["Bail…", "Loyers…"],
};

/** Signal court après analyse. */
export const AI_DETECTED_SUCCESS: Partial<Record<DocumentType, string>> = {
  loan_interest_certificate: "Crédit immobilier identifié",
  loan_schedule: "Tableau de crédit identifié",
  property_tax: "Taxe foncière identifiée",
  rent_bank_statement: "Relevés de loyers identifiés",
  furniture_invoice: "Facture de meubles identifiée",
  notary_deed: "Acte notarié identifié",
  insurance_invoice: "Assurance habitation identifiée",
  works_invoice: "Factures de travaux identifiées",
  lease_contract: "Bail identifié",
  rent_receipt: "Quittance identifiée",
  condo_charges: "Charges copropriété identifiées",
  bank_statement: "Relevé bancaire identifié",
};

export function getAnalysisPhasesForType(documentType: DocumentType): readonly string[] {
  return AI_ACTIVITY_BY_TYPE[documentType] ?? AI_ANALYSIS_PHASES;
}
