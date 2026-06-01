import type {
  DeclarationDraft,
  LmnpDocument,
  Property,
  RevenueEvent,
  RevenusExtractionData,
  RevenusPropertyData,
} from "../types";
import {
  createEmptyRevenueEvent,
  deduplicateRevenueEvents,
  monthKeyFromDate,
  monthLabelFromKey,
  recalculateRevenusExtraction,
  revenueCategoryLabel,
  rebuildPropertyAggregation,
} from "./revenue-aggregation";

export type { RevenusExtractionData, RevenusMonthlyEntry, RevenusPropertyData, RevenueEvent } from "../types";
export {
  createEmptyRevenueEvent,
  patchPropertyEvent,
  addPropertyEvent,
  removePropertyEvent,
  recalculateRevenusExtraction,
  rebuildPropertyAggregation,
  revenueCategoryLabel,
} from "./revenue-aggregation";

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

/** Any file uploaded in the revenus tunnel is a revenue support — no rigid document typing. */
export function isRevenusDocument(doc: LmnpDocument, linkedDocumentIds?: string[]): boolean {
  if (linkedDocumentIds?.includes(doc.id)) return true;
  return doc.category === "revenus";
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

function event(partial: Omit<RevenueEvent, "id"> & { id?: string }): RevenueEvent {
  return {
    id: partial.id ?? crypto.randomUUID(),
    ...partial,
  };
}

function buildMonthlyRentEvents(fiscalYear: number, rentAmount = 1500, feeMonths: number[] = []): RevenueEvent[] {
  const events: RevenueEvent[] = [];

  for (let month = 1; month <= 12; month += 1) {
    const date = `${String(month).padStart(2, "0")}/05/${fiscalYear}`;
    events.push(
      event({
        date,
        amount: rentAmount,
        category: "rent",
        sourceType: "Relevé bancaire",
        label: "Virement loyer",
        confidence: 92,
        recurrence: "monthly",
      }),
    );

    if (month === 1) {
      events.push(
        event({
          date,
          amount: rentAmount,
          category: "rent",
          sourceType: "Quittance",
          label: "Loyer janvier",
          confidence: 84,
          recurrence: "monthly",
        }),
      );
    }

    if (feeMonths.includes(month)) {
      events.push(
        event({
          date,
          amount: 40,
          category: "charges",
          sourceType: "Quittance",
          label: "Charges locatives",
          confidence: 88,
        }),
      );
    }
  }

  return events;
}

function buildPrimaryPropertyEvents(fiscalYear: number, property?: Property): RevenueEvent[] {
  const events = buildMonthlyRentEvents(fiscalYear, 1500, [1, 3, 5, 8, 10, 12]);
  events.push(
    event({
      date: `15/07/${fiscalYear}`,
      amount: 980,
      category: "platform_payout",
      sourceType: "Export Airbnb",
      label: "Versement juillet",
      confidence: 79,
      recurrence: "one_shot",
    }),
    event({
      date: `15/07/${fiscalYear}`,
      amount: 120,
      category: "fee",
      sourceType: "Export Airbnb",
      label: "Commission plateforme",
      confidence: 81,
    }),
    event({
      date: `01/06/${fiscalYear}`,
      amount: 1500,
      category: "refund",
      sourceType: "Attestation",
      label: "Dépôt de garantie encaissé",
      confidence: 70,
      recurrence: "one_shot",
    }),
  );

  if (property?.label?.toLowerCase().includes("airbnb")) {
    return events.filter((item) => item.category !== "rent" || item.sourceType !== "Quittance");
  }

  return events;
}

function buildSecondaryPropertyEvents(fiscalYear: number): RevenueEvent[] {
  return buildMonthlyRentEvents(fiscalYear, 800, [2, 6, 10]).slice(0, 20);
}

export function buildRevenusExtraction(
  properties: Property[],
  fiscalYear = new Date().getFullYear() - 1,
): RevenusExtractionData {
  const primary = properties[0];
  const primaryProperty: RevenusPropertyData = rebuildPropertyAggregation(
    {
      id: primary?.id ?? "property-1",
      propertyId: primary?.id,
      label: propertyLabel(primary, "Appartement Bordeaux Gambetta"),
      events: buildPrimaryPropertyEvents(fiscalYear, primary),
      annualRevenue: 0,
      rentCount: 0,
      detectedFees: 0,
      months: [],
      annualTotalHint: 18_420,
    },
    fiscalYear,
  );

  const allProperties =
    properties.length > 1
      ? [
          primaryProperty,
          rebuildPropertyAggregation(
            {
              id: properties[1].id,
              propertyId: properties[1].id,
              label: propertyLabel(properties[1], "Studio Lyon Part-Dieu"),
              events: buildSecondaryPropertyEvents(fiscalYear),
              annualRevenue: 0,
              rentCount: 0,
              detectedFees: 0,
              months: [],
            },
            fiscalYear,
          ),
        ]
      : [primaryProperty];

  return recalculateRevenusExtraction(
    {
      properties: allProperties,
      summary: {
        totalRevenue: 0,
        rentCount: 0,
        totalFees: 0,
        hasSecurityDeposit: false,
      },
    },
    fiscalYear,
  );
}

export function hydrateRevenusExtraction(
  draft: DeclarationDraft | undefined,
  fiscalYear: number,
): RevenusExtractionData | undefined {
  const data = revenusFromDraft(draft);
  if (!data) return undefined;
  return recalculateRevenusExtraction(data, fiscalYear);
}

export function revenusFromDraft(draft?: DeclarationDraft): RevenusExtractionData | undefined {
  const data = draft?.revenusExtraction;
  if (!data) return undefined;

  return {
    ...data,
    properties: data.properties.map((property) => ({
      ...property,
      events: property.events ?? legacyEventsFromMonths(property),
    })),
  };
}

function legacyEventsFromMonths(property: RevenusPropertyData): RevenueEvent[] {
  return property.months.flatMap((month) =>
    month.events?.length
      ? month.events
      : [
          createEmptyRevenueEvent({
            date: month.monthKey ? `${month.monthKey}-05` : null,
            amount: month.collectedAmount,
            category: "rent",
            label: month.month,
            sourceType: "Import",
          }),
        ],
  );
}

export function isRevenusExtractionIncomplete(data: RevenusExtractionData): boolean {
  return data.properties.some((property) => property.incomplete);
}

export function recalculateRevenusSummary(
  data: RevenusExtractionData,
  fiscalYear: number,
): RevenusExtractionData["summary"] {
  return recalculateRevenusExtraction(data, fiscalYear).summary;
}

export function describeSourceTypes(documents: LmnpDocument[]): string[] {
  const labels = new Set<string>();
  for (const doc of documents) {
    const ext = doc.fileName.split(".").pop()?.toLowerCase();
    if (ext === "csv" || ext === "xlsx" || ext === "xls") labels.add("Tableur");
    else if (ext === "pdf") labels.add("PDF");
    else if (/png|jpe?g|webp|gif/.test(ext ?? "")) labels.add("Capture");
    else labels.add("Document");
  }
  return [...labels];
}

export function monthKeysForProperty(property: RevenusPropertyData, fiscalYear: number): string[] {
  return property.events
    .map((item) => monthKeyFromDate(item.date, fiscalYear))
    .filter((value): value is string => Boolean(value));
}

export function monthLabelFromPropertyMonth(entry: { month: string; monthKey?: string }): string {
  if (entry.monthKey) return monthLabelFromKey(entry.monthKey);
  return entry.month;
}

/** Expose dedup preview for tests and future GPT merge step. */
export function previewDeduplicatedEvents(events: RevenueEvent[]) {
  return deduplicateRevenueEvents(events);
}
