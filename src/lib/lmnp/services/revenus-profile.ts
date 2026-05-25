import type {
  DeclarationDraft,
  LmnpDocument,
  Property,
  RevenusExtractionData,
  RevenusMonthlyEntry,
  RevenusPropertyData,
} from "../types";

export type { RevenusExtractionData, RevenusMonthlyEntry, RevenusPropertyData };

const MOCK_MONTHS: RevenusMonthlyEntry[] = [
  { month: "Janvier", collectedAmount: 1540, detectedFees: 40 },
  { month: "Février", collectedAmount: 1540 },
  { month: "Mars", collectedAmount: 1540, detectedFees: 20 },
  { month: "Avril", collectedAmount: 1540 },
  { month: "Mai", collectedAmount: 1540, detectedFees: 40 },
  { month: "Juin", collectedAmount: 1540 },
  { month: "Juillet", collectedAmount: 1540 },
  { month: "Août", collectedAmount: 1540, detectedFees: 40 },
  { month: "Septembre", collectedAmount: 1540 },
  { month: "Octobre", collectedAmount: 1540, detectedFees: 40 },
  { month: "Novembre", collectedAmount: 1540 },
  { month: "Décembre", collectedAmount: 1540, detectedFees: 40 },
];

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function isRevenusDocument(doc: LmnpDocument, linkedDocumentIds?: string[]): boolean {
  if (linkedDocumentIds?.includes(doc.id)) return true;
  return (
    doc.category === "revenus" ||
    doc.category === "bail" ||
    doc.documentType === "rent_receipt" ||
    doc.documentType === "rent_bank_statement" ||
    doc.documentType === "bank_statement" ||
    doc.documentType === "lease_contract" ||
    /loyer|quittance|relev|encaissement|location|airbnb|booking|csv/i.test(doc.fileName)
  );
}

export function countRevenusDocuments(
  documents: LmnpDocument[],
  linkedDocumentIds?: string[],
): number {
  return documents.filter((doc) => isRevenusDocument(doc, linkedDocumentIds)).length;
}

export function resolveRevenusDocuments(
  documents: LmnpDocument[],
  linkedDocumentIds?: string[],
): LmnpDocument[] {
  return [...documents]
    .filter((doc) => isRevenusDocument(doc, linkedDocumentIds))
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

function propertyLabel(property: Property | undefined, fallback: string): string {
  if (property?.label?.trim()) return property.label.trim();
  if (property?.city?.trim()) {
    return `Appartement ${property.city}${property.address ? ` ${property.address.split(" ")[0]}` : ""}`;
  }
  return fallback;
}

export function buildRevenusExtraction(properties: Property[]): RevenusExtractionData {
  const primary = properties[0];
  const primaryProperty: RevenusPropertyData = {
    id: primary?.id ?? "property-1",
    propertyId: primary?.id,
    label: propertyLabel(primary, "Appartement Bordeaux Gambetta"),
    annualRevenue: 18_420,
    rentCount: 12,
    detectedFees: 340,
    months: MOCK_MONTHS,
    hasSecurityDeposit: true,
    incomplete: false,
  };

  const allProperties =
    properties.length > 1
      ? [
          primaryProperty,
          {
            id: properties[1].id,
            propertyId: properties[1].id,
            label: propertyLabel(properties[1], "Studio Lyon Part-Dieu"),
            annualRevenue: 9_600,
            rentCount: 12,
            detectedFees: 120,
            months: MOCK_MONTHS.map((entry) => ({
              ...entry,
              collectedAmount: 800,
              detectedFees: entry.detectedFees ? 10 : undefined,
            })),
            incomplete: true,
          },
        ]
      : [primaryProperty];

  const summary = {
    totalRevenue: allProperties.reduce((sum, item) => sum + item.annualRevenue, 0),
    rentCount: allProperties.reduce((sum, item) => sum + item.rentCount, 0),
    totalFees: allProperties.reduce((sum, item) => sum + item.detectedFees, 0),
    hasSecurityDeposit: allProperties.some((item) => item.hasSecurityDeposit),
  };

  return { properties: allProperties, summary };
}

export function revenusFromDraft(draft?: DeclarationDraft): RevenusExtractionData | undefined {
  return draft?.revenusExtraction;
}

export function isRevenusExtractionIncomplete(data: RevenusExtractionData): boolean {
  return data.properties.some((property) => property.incomplete);
}

export function recalculateRevenusSummary(data: RevenusExtractionData): RevenusExtractionData["summary"] {
  return {
    totalRevenue: data.properties.reduce((sum, item) => sum + item.annualRevenue, 0),
    rentCount: data.properties.reduce((sum, item) => sum + item.rentCount, 0),
    totalFees: data.properties.reduce((sum, item) => sum + item.detectedFees, 0),
    hasSecurityDeposit: data.properties.some((item) => item.hasSecurityDeposit),
  };
}
