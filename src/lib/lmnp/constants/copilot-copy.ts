import type { DocumentType } from "../types";

export const TAB_COPY = {
  activite: {
    title: "Mon bien",
    description: "Où se situe votre logement et quel régime fiscal vous choisissez.",
    sidebar: "Mon bien",
  },
  recettes: {
    title: "Mes loyers",
    description: "Montants détectés par l’IA depuis vos relevés — vérifiez et confirmez en un clic.",
    sidebar: "Mes loyers",
  },
  depenses: {
    title: "Mes dépenses",
    description: "Taxe foncière, assurance, travaux… pré-remplis par l’IA depuis vos factures.",
    sidebar: "Mes dépenses",
  },
  immobilisations: {
    title: "Mobilier & bien",
    description: "Factures de meubles et acte notarié — l’IA calcule tout pour vous.",
    sidebar: "Mobilier & bien",
  },
  emprunts: {
    title: "Mon crédit",
    description: "Intérêts de votre prêt immobilier (pas le capital remboursé).",
    sidebar: "Mon crédit",
  },
} as const;

export const PILLAR_HUMAN_LABELS = {
  documents: "Vos documents",
  validations: "Montants à valider",
  coherence: "Points à clarifier",
  tabs: "Votre déclaration",
} as const;

export const FISCAL_STATUS_HUMAN: Record<string, string> = {
  draft: "On démarre ensemble",
  collecting_documents: "Ajoutez vos documents",
  analyzing: "L’IA lit vos documents",
  pending_validation: "Vérifiez les montants proposés",
  ready_to_close: "Votre dossier est prêt",
  closed: "Déclaration terminée",
};

export const CONFIDENCE_HUMAN: Record<string, string> = {
  starting: "Première étape",
  building: "Bien lancé",
  advancing: "Vous avancez bien",
  almost_ready: "Presque terminé",
  ready: "Prêt pour la déclaration",
};

export function humanDocumentLabel(
  documentType: DocumentType,
  fileName?: string,
): string {
  const fromType = DOCUMENT_TYPE_HUMAN_LABEL[documentType];
  if (fromType && documentType !== "unknown") return fromType;
  return fileName ?? "Document";
}

export const DOCUMENT_TYPE_HUMAN_LABEL: Partial<Record<DocumentType, string>> = {
  notary_deed: "Acte notarié",
  furniture_invoice: "Facture de meubles",
  property_tax: "Taxe foncière",
  loan_interest_certificate: "Crédit immobilier",
  loan_schedule: "Tableau de crédit",
  insurance_invoice: "Assurance habitation",
  rent_bank_statement: "Relevés de loyers",
  rent_receipt: "Quittance de loyer",
  lease_contract: "Bail / contrat de location",
  works_invoice: "Factures de travaux",
  condo_charges: "Charges de copropriété",
  bank_statement: "Relevé bancaire",
};

