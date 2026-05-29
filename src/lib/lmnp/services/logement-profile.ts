import type { LmnpDocument, Property, PropertyBackgroundExtraction, PropertyType } from "../types";

export type LogementWorkspace = {
  properties: Property[];
};

export type LogementFormValues = {
  label: string;
  address: string;
  addressLine2: string;
  city: string;
  postalCode: string;
  propertyType: PropertyType;
  coproperty: boolean;
  surface: string;
  acquisitionDate: string;
  status: string;
};

export type LogementFieldKey =
  | "label"
  | "address"
  | "addressLine2"
  | "city"
  | "postalCode"
  | "propertyType"
  | "coproperty"
  | "surface"
  | "acquisitionDate"
  | "status";

export function suggestsMultipleProperties(fileName: string): boolean {
  return /multi|plusieurs|2\s*biens|deux\s*biens|multi[-\s]?propri/i.test(fileName);
}

/** Loan-offer documents uploaded in the Logement tunnel may infer Crédit fields. */
export function isLoanOfferInLogementTunnel(fileName: string): boolean {
  return /offre|pret|pr[eê]t|amortissement|tableau/i.test(fileName);
}

export function isLogementDocument(doc: LmnpDocument, linkedDocumentId?: string): boolean {
  if (linkedDocumentId && doc.id === linkedDocumentId) return true;
  return (
    doc.documentType === "notary_deed" ||
    /acte|notaire|acquisition|vente|logement|compromis/i.test(doc.fileName)
  );
}

export function propertyToFormValues(property?: Property): LogementFormValues {
  return {
    label: property?.label ?? "",
    address: property?.address ?? "",
    addressLine2: property?.addressLine2 ?? "",
    city: property?.city ?? "",
    postalCode: property?.postalCode ?? "",
    propertyType: property?.propertyType ?? "appartement",
    coproperty: property?.coproperty ?? false,
    surface: property?.surface ? String(property.surface) : "",
    acquisitionDate: property?.acquisitionDate ?? "",
    status: property?.status ?? "",
  };
}

export function formValuesToProperty(values: LogementFormValues): Partial<Property> {
  return {
    label: values.label.trim(),
    address: values.address.trim(),
    addressLine2: values.addressLine2.trim() || undefined,
    city: values.city.trim(),
    postalCode: values.postalCode.trim(),
    propertyType: values.propertyType,
    coproperty: values.coproperty,
    surface: values.surface.trim() ? Number(values.surface) : undefined,
    acquisitionDate: values.acquisitionDate.trim() || undefined,
    status: values.status.trim() || undefined,
  };
}

export function isLogementProfileIncomplete(values: LogementFormValues): boolean {
  if (!values.label.trim()) return true;
  if (!values.address.trim() || !values.city.trim() || !values.postalCode.trim()) return true;
  if (!values.surface.trim() || !values.acquisitionDate.trim()) return true;
  if (!values.status.trim()) return true;
  return false;
}

export function logementFromWorkspace(ws: LogementWorkspace): LogementFormValues {
  return propertyToFormValues(ws.properties[0]);
}

export const MOCK_LOGEMENT_BACKGROUND: PropertyBackgroundExtraction = {
  acquisitionPrice: 245_000,
  notaryFees: 18_500,
  furnitureAmount: 12_000,
  coproReferences: "Lot 42 — Tantièmes 45/1000",
  amortizationHints: "Bâtiment 85 % · Mobilier 15 %",
  creditHints: "Prêt immobilier détecté — 180 000 €",
};

export const MOCK_LOGEMENT_FORM: LogementFormValues = {
  label: "Appartement Bordeaux Gambetta",
  address: "42 cours Gambetta",
  addressLine2: "",
  city: "Bordeaux",
  postalCode: "33000",
  propertyType: "appartement",
  coproperty: true,
  surface: "62",
  acquisitionDate: "2022-09-14",
  status: "Loué meublé",
};

export const MOCK_LOGEMENT_UNCERTAIN_FIELDS: LogementFieldKey[] = ["addressLine2"];
