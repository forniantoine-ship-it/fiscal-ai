import type {
  DeclarationDraft,
  LmnpDocument,
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
