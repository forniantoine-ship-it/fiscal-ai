export type OnboardingStepId =
  | "welcome"
  | "documents"
  | "ocr"
  | "property"
  | "review";

export interface OnboardingStep {
  id: OnboardingStepId;
  label: string;
  shortLabel: string;
}

export interface UploadedDocument {
  id: string;
  name: string;
  size: number;
  type: string;
  category: DocumentCategory;
}

export type DocumentCategory =
  | "bail"
  | "amortissement"
  | "charges"
  | "revenus"
  | "autre";

export interface OcrExtractedField {
  label: string;
  value: string;
  confidence: number;
}

export interface PropertyFormData {
  address: string;
  city: string;
  postalCode: string;
  acquisitionDate: string;
  acquisitionPrice: string;
  surfaceM2: string;
  annualRent: string;
  regime: "micro-bic" | "reel";
  furnitureValue: string;
  loanInterest: string;
  propertyTax: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  { id: "welcome", label: "Introduction", shortLabel: "Intro" },
  { id: "documents", label: "Documents", shortLabel: "Docs" },
  { id: "ocr", label: "Analyse OCR", shortLabel: "OCR" },
  { id: "property", label: "Bien locatif", shortLabel: "Bien" },
  { id: "review", label: "Validation", shortLabel: "Fin" },
];

export const DOCUMENT_CATEGORIES: {
  id: DocumentCategory;
  label: string;
  hint: string;
}[] = [
  { id: "bail", label: "Bail / quittances", hint: "Contrat de location meublée" },
  { id: "revenus", label: "Revenus locatifs", hint: "Relevés bancaires, attestations" },
  { id: "charges", label: "Charges déductibles", hint: "Factures, assurances, syndic" },
  { id: "amortissement", label: "Amortissements", hint: "Factures mobilier, travaux" },
  { id: "autre", label: "Autres pièces", hint: "Taxe foncière, intérêts d'emprunt" },
];

export const INITIAL_PROPERTY: PropertyFormData = {
  address: "",
  city: "",
  postalCode: "",
  acquisitionDate: "",
  acquisitionPrice: "",
  surfaceM2: "",
  annualRent: "",
  regime: "reel",
  furnitureValue: "",
  loanInterest: "",
  propertyTax: "",
};
