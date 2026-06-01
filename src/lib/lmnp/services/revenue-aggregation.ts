import type {
  RevenueEvent,
  RevenueEventCategory,
  RevenueTransaction,
  RevenusExtractionData,
  RevenusMonthlyEntry,
  RevenusPropertyData,
} from "../types";

export const FRENCH_MONTHS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
] as const;

const INCOME_CATEGORIES = new Set<RevenueEventCategory>(["rent", "platform_payout"]);
const FEE_CATEGORIES = new Set<RevenueEventCategory>(["fee", "charges"]);

export function revenueCategoryLabel(category: RevenueEventCategory): string {
  switch (category) {
    case "rent":
      return "Loyer";
    case "platform_payout":
      return "Versement plateforme";
    case "charges":
      return "Charges";
    case "fee":
      return "Frais";
    case "refund":
      return "Remboursement";
    default:
      return "Non identifié";
  }
}

function parseEventDate(date: string | null): Date | null {
  if (!date?.trim()) return null;
  const normalized = date.includes("/")
    ? date.split("/").reverse().join("-")
    : date;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function monthKeyFromDate(date: string | null, fallbackYear: number): string | null {
  const parsed = parseEventDate(date);
  if (!parsed) return null;
  const year = parsed.getFullYear();
  const month = parsed.getMonth() + 1;
  if (year !== fallbackYear) return null;
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function monthLabelFromKey(key: string): string {
  const [, monthPart] = key.split("-");
  const monthIndex = Number(monthPart) - 1;
  return FRENCH_MONTHS[monthIndex] ?? key;
}

const FRENCH_MONTH_NAME_PATTERNS: Array<{ pattern: RegExp; index: number }> = [
  { pattern: /^janvier\b/i, index: 1 },
  { pattern: /^f[eé]vrier\b/i, index: 2 },
  { pattern: /^mars\b/i, index: 3 },
  { pattern: /^avril\b/i, index: 4 },
  { pattern: /^mai\b/i, index: 5 },
  { pattern: /^juin\b/i, index: 6 },
  { pattern: /^juillet\b/i, index: 7 },
  { pattern: /^ao[uû]t\b/i, index: 8 },
  { pattern: /^septembre\b/i, index: 9 },
  { pattern: /^octobre\b/i, index: 10 },
  { pattern: /^novembre\b/i, index: 11 },
  { pattern: /^d[eé]cembre\b/i, index: 12 },
];

export function monthNumberFromLabel(monthLabel: string): number | null {
  const trimmed = monthLabel.trim();
  if (!trimmed) return null;
  for (const { pattern, index } of FRENCH_MONTH_NAME_PATTERNS) {
    if (pattern.test(trimmed)) return index;
  }
  return null;
}

export function monthKeyFromMonthLabel(monthLabel: string, fiscalYear: number): string | null {
  const monthNumber = monthNumberFromLabel(monthLabel);
  if (!monthNumber) return null;
  return `${fiscalYear}-${String(monthNumber).padStart(2, "0")}`;
}

export function monthKeyForTransaction(
  transaction: Pick<RevenueTransaction, "date" | "monthLabel" | "structuredMapping">,
  fiscalYear: number,
): string | null {
  const fromDate = monthKeyFromDate(transaction.date, fiscalYear);
  if (fromDate) return fromDate;
  if (transaction.monthLabel) {
    return monthKeyFromMonthLabel(transaction.monthLabel, fiscalYear);
  }
  return null;
}

function daysApart(a: string | null, b: string | null): number | null {
  const left = parseEventDate(a);
  const right = parseEventDate(b);
  if (!left || !right) return null;
  return Math.abs(left.getTime() - right.getTime()) / 86_400_000;
}

function pickPreferredEvent(current: RevenueEvent, candidate: RevenueEvent): RevenueEvent {
  const currentScore = current.confidence ?? 0;
  const candidateScore = candidate.confidence ?? 0;
  if (candidateScore > currentScore) {
    return {
      ...candidate,
      mergedFromIds: [...new Set([...(candidate.mergedFromIds ?? []), current.id])],
      deduplicated: true,
    };
  }
  return {
    ...current,
    mergedFromIds: [...new Set([...(current.mergedFromIds ?? []), candidate.id])],
    deduplicated: true,
  };
}

function areLikelyDuplicates(a: RevenueEvent, b: RevenueEvent): boolean {
  if (a.id === b.id) return false;
  if (Math.abs(a.amount - b.amount) > 1) return false;
  if (!INCOME_CATEGORIES.has(a.category) || !INCOME_CATEGORIES.has(b.category)) return false;
  const distance = daysApart(a.date, b.date);
  if (distance === null || distance > 7) return false;

  const labelA = (a.label ?? "").toLowerCase();
  const labelB = (b.label ?? "").toLowerCase();
  const sharedLabel =
    labelA.length > 0 &&
    labelB.length > 0 &&
    (labelA.includes(labelB.slice(0, 4)) || labelB.includes(labelA.slice(0, 4)));

  return sharedLabel || a.amount === b.amount;
}

export function deduplicateRevenueEvents(events: RevenueEvent[]): {
  events: RevenueEvent[];
  deduplicatedCount: number;
  notes: string[];
} {
  const kept: RevenueEvent[] = [];
  const removedIds = new Set<string>();
  const notes: string[] = [];
  let deduplicatedCount = 0;

  for (const event of events) {
    if (removedIds.has(event.id)) continue;

    let merged = { ...event };
    for (const other of events) {
      if (other.id === merged.id || removedIds.has(other.id)) continue;
      if (!areLikelyDuplicates(merged, other)) continue;

      merged = pickPreferredEvent(merged, other);
      removedIds.add(other.id);
      deduplicatedCount += 1;
      notes.push(
        `Doublon fusionné : ${formatCurrency(other.amount)} (${revenueCategoryLabel(other.category)})`,
      );
    }

    kept.push(merged);
  }

  return { events: kept, deduplicatedCount, notes };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function sumCategory(events: RevenueEvent[], categories: Set<RevenueEventCategory>): number {
  return events.reduce(
    (sum, event) => (categories.has(event.category) ? sum + event.amount : sum),
    0,
  );
}

function countIncomeEvents(events: RevenueEvent[]): number {
  return events.filter((event) => INCOME_CATEGORIES.has(event.category)).length;
}

function buildMonthlyEntries(events: RevenueEvent[], fiscalYear: number): RevenusMonthlyEntry[] {
  const buckets = new Map<string, RevenueEvent[]>();

  for (const event of events) {
    const key = monthKeyFromDate(event.date, fiscalYear);
    if (!key) continue;
    const current = buckets.get(key) ?? [];
    current.push(event);
    buckets.set(key, current);
  }

  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([monthKey, monthEvents]) => {
      const collectedAmount = sumCategory(monthEvents, INCOME_CATEGORIES);
      const detectedFees = sumCategory(monthEvents, FEE_CATEGORIES);
      return {
        month: monthLabelFromKey(monthKey),
        monthKey,
        collectedAmount,
        detectedFees: detectedFees > 0 ? detectedFees : undefined,
        events: monthEvents,
      };
    });
}

function detectMissingMonths(months: RevenusMonthlyEntry[], fiscalYear: number): string[] {
  const present = new Set(months.map((entry) => entry.monthKey));
  const missing: string[] = [];

  for (let index = 0; index < 12; index += 1) {
    const key = `${fiscalYear}-${String(index + 1).padStart(2, "0")}`;
    if (!present.has(key)) missing.push(monthLabelFromKey(key));
  }

  return missing;
}

function resolveAnnualRevenue(
  events: RevenueEvent[],
  monthlyIncomeTotal: number,
  annualTotalHint?: number | null,
): number {
  const annualEvent = events.find(
    (event) => event.recurrence === "annual" && INCOME_CATEGORIES.has(event.category),
  );

  if (annualEvent) return annualEvent.amount;
  if (annualTotalHint && annualTotalHint > 0) {
    return Math.max(annualTotalHint, monthlyIncomeTotal);
  }
  return monthlyIncomeTotal;
}

export function rebuildPropertyAggregation(
  property: RevenusPropertyData,
  fiscalYear: number,
): RevenusPropertyData {
  const { events, deduplicatedCount } = deduplicateRevenueEvents(property.events);
  const months = buildMonthlyEntries(events, fiscalYear);
  const monthlyIncomeTotal = sumCategory(events, INCOME_CATEGORIES);
  const detectedFees = sumCategory(events, FEE_CATEGORIES);
  const missingMonths = detectMissingMonths(months, fiscalYear);
  const annualRevenue = resolveAnnualRevenue(events, monthlyIncomeTotal, property.annualTotalHint);

  return {
    ...property,
    events,
    months,
    annualRevenue,
    rentCount: countIncomeEvents(events),
    detectedFees,
    deduplicatedCount,
    missingMonths,
    incomplete: missingMonths.length > 0 || events.some((event) => !event.date || event.amount <= 0),
    hasSecurityDeposit: events.some(
      (event) =>
        event.category === "refund" &&
        /d[eé]p[oô]t|caution|garantie/i.test(event.label ?? ""),
    ),
  };
}

export function recalculateRevenusExtraction(
  data: RevenusExtractionData,
  fiscalYear: number,
): RevenusExtractionData {
  const properties = data.properties.map((property) => rebuildPropertyAggregation(property, fiscalYear));
  const deduplicationNotes = properties.flatMap((property) =>
    (property.deduplicatedCount ?? 0) > 0
      ? [`${property.label} : ${property.deduplicatedCount} doublon(s) fusionné(s)`]
      : [],
  );

  const summary = {
    totalRevenue: properties.reduce((sum, property) => sum + property.annualRevenue, 0),
    rentCount: properties.reduce((sum, property) => sum + property.rentCount, 0),
    totalFees: properties.reduce((sum, property) => sum + property.detectedFees, 0),
    hasSecurityDeposit: properties.some((property) => property.hasSecurityDeposit),
    eventCount: properties.reduce((sum, property) => sum + property.events.length, 0),
    missingMonthCount: properties.reduce((sum, property) => sum + (property.missingMonths?.length ?? 0), 0),
    deduplicatedCount: properties.reduce((sum, property) => sum + (property.deduplicatedCount ?? 0), 0),
  };

  return {
    ...data,
    properties,
    events: properties.flatMap((property) => property.events),
    summary,
    deduplicationNotes,
  };
}

export function createEmptyRevenueEvent(partial?: Partial<RevenueEvent>): RevenueEvent {
  return {
    id: crypto.randomUUID(),
    date: null,
    amount: 0,
    category: "rent",
    label: "",
    sourceType: "Saisie manuelle",
    confidence: undefined,
    recurrence: null,
    ...partial,
  };
}

export function patchPropertyEvent(
  property: RevenusPropertyData,
  eventId: string,
  patch: Partial<RevenueEvent>,
  fiscalYear: number,
): RevenusPropertyData {
  const events = property.events.map((event) =>
    event.id === eventId ? { ...event, ...patch } : event,
  );
  return rebuildPropertyAggregation({ ...property, events }, fiscalYear);
}

export function addPropertyEvent(
  property: RevenusPropertyData,
  event: RevenueEvent,
  fiscalYear: number,
): RevenusPropertyData {
  return rebuildPropertyAggregation({ ...property, events: [...property.events, event] }, fiscalYear);
}

export function removePropertyEvent(
  property: RevenusPropertyData,
  eventId: string,
  fiscalYear: number,
): RevenusPropertyData {
  return rebuildPropertyAggregation(
    { ...property, events: property.events.filter((event) => event.id !== eventId) },
    fiscalYear,
  );
}
