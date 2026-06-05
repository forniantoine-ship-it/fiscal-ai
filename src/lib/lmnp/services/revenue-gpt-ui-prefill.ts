import type {
  Property,
  RevenueGptSession,
  RevenueMonthlyGridRow,
  RevenuePropertySession,
  RevenueRawLine,
  RevenueTransaction,
  RevenusExtractionData,
} from "../types";
import {
  createEmptyGridRows,
  processPropertyTransactions,
  validatePropertyTransaction,
} from "./revenue-transactions";
import type { RevenueGridSource } from "./revenus-runtime-trace";
import {
  detectRawLineSource,
  logRevenueGridSource,
  logRevenueRuntimeStage,
  logRevenueSourceOfTruth,
} from "./revenus-runtime-trace";

export type { RevenueGptSession, RevenueMonthlyGridRow, RevenuePropertySession } from "../types";

function propertyLabel(property: Property | undefined, fallback: string): string {
  if (property?.label?.trim()) return property.label.trim();
  if (property?.city?.trim()) {
    return `Appartement ${property.city}${property.address ? ` ${property.address.split(" ")[0]}` : ""}`;
  }
  return fallback;
}

export function buildMonthKeys(fiscalYear: number): string[] {
  return Array.from({ length: 12 }, (_, index) =>
    `${fiscalYear}-${String(index + 1).padStart(2, "0")}`,
  );
}

export { createEmptyGridRows } from "./revenue-transactions";

export function createEmptyPropertySession(
  property: Property | undefined,
  fiscalYear: number,
  fallbackLabel: string,
): RevenuePropertySession {
  return {
    id: property?.id ?? "property-1",
    propertyId: property?.id,
    label: propertyLabel(property, fallbackLabel),
    rows: createEmptyGridRows(fiscalYear),
    transactions: [],
    lowConfidenceTransactions: [],
    isolatedTransactions: [],
    gridUserEdited: false,
  };
}

export function createEmptyRevenueSession(
  properties: Property[],
  fiscalYear: number,
  mode: RevenueGptSession["mode"] = "manual",
): RevenueGptSession {
  const primary = properties[0];
  const sessions =
    properties.length > 1
      ? [
          createEmptyPropertySession(primary, fiscalYear, "Appartement Bordeaux Gambetta"),
          createEmptyPropertySession(properties[1], fiscalYear, "Studio Lyon Part-Dieu"),
        ]
      : [createEmptyPropertySession(primary, fiscalYear, "Appartement Bordeaux Gambetta")];

  return {
    properties: sessions,
    mode,
    ui: { expandedPropertyIds: [sessions[0]?.id].filter(Boolean) as string[] },
  };
}

export function hasRevenueSessionData(session?: RevenueGptSession): boolean {
  if (!session?.properties.length) return false;
  return session.properties.some(
    (property) =>
      property.gridUserEdited ||
      (property.transactions?.length ?? 0) > 0 ||
      property.rows.some(
        (row) => row.loyers > 0 || row.autresRevenus > 0 || row.charges > 0,
      ),
  );
}

export function applyTransactionsToPropertySession(
  property: RevenuePropertySession,
  input: RevenuePropertySession["transactions"] | Parameters<typeof processPropertyTransactions>[0],
  fiscalYear: number,
): RevenuePropertySession & { deduplicatedCount: number } {
  const processed = processPropertyTransactions(
    input ?? property.transactions ?? [],
    fiscalYear,
    property.rows,
    property.gridUserEdited,
  );

  return {
    ...property,
    transactions: processed.transactions,
    lowConfidenceTransactions: processed.lowConfidenceTransactions,
    isolatedTransactions: processed.isolatedTransactions,
    rows: processed.rows,
    deduplicatedCount: processed.deduplicatedCount,
  };
}

export function sessionFromTransactions(
  properties: Property[],
  fiscalYear: number,
  options?: {
    mode?: RevenueGptSession["mode"];
    previous?: RevenueGptSession;
    linesByPropertyId?: Map<string, RevenueRawLine[]>;
    gridSource?: RevenueGridSource;
  },
): RevenueGptSession {
  const base =
    options?.previous ??
    createEmptyRevenueSession(properties, fiscalYear, options?.mode ?? "upload");

  const gridSource = options?.gridSource ?? "ocr_lines";

  const nextProperties = base.properties.map((propertySession) => {
    const rawLines = options?.linesByPropertyId?.get(propertySession.id) ?? [];

    const lineSource = detectRawLineSource(rawLines, {
      gridSource,
      linesByPropertyId: options?.linesByPropertyId,
    });
    logRevenueRuntimeStage("raw_lines", {
      propertyId: propertySession.id,
      lineCount: rawLines.length,
      lineSource,
      gridSource,
    });
    logRevenueSourceOfTruth(lineSource, {
      fn: "sessionFromTransactions",
      propertyId: propertySession.id,
    });

    const { deduplicatedCount: _deduplicatedCount, ...propertySessionResult } =
      applyTransactionsToPropertySession(propertySession, rawLines, fiscalYear);

    return { propertySessionResult, deduplicatedCount: _deduplicatedCount };
  });

  const propertiesResult = nextProperties.map(({ propertySessionResult }) => propertySessionResult);
  const deduplicatedCount = nextProperties.reduce(
    (sum, item) => sum + item.deduplicatedCount,
    0,
  );

  logRevenueGridSource(gridSource, {
    fn: "sessionFromTransactions",
    propertyCount: propertiesResult.length,
  });

  return summarizeSession({
    ...base,
    mode: options?.mode ?? base.mode ?? "upload",
    properties: propertiesResult,
    meta: {
      ...base.meta,
      deduplicatedCount,
      gridSource,
    },
  });
}

export function sessionFromPipelineLines(
  properties: Property[],
  fiscalYear: number,
  linesByPropertyId: Map<string, RevenueRawLine[]>,
  gridSource: RevenueGridSource,
  previous?: RevenueGptSession,
  metaExtras?: Pick<
    NonNullable<RevenueGptSession["meta"]>,
    "extractionSupervision" | "extractionPipelineId"
  >,
): RevenueGptSession {
  const session = sessionFromTransactions(properties, fiscalYear, {
    mode: "upload",
    previous,
    linesByPropertyId,
    gridSource,
  });
  if (!metaExtras) return session;
  return {
    ...session,
    meta: {
      ...session.meta,
      ...metaExtras,
    },
  };
}

function summarizeSession(session: RevenueGptSession): RevenueGptSession {
  let hasSecurityDeposit = false;
  let lowConfidenceCount = 0;
  let transactionCount = 0;

  for (const property of session.properties) {
    transactionCount += property.transactions?.length ?? 0;
    lowConfidenceCount += property.lowConfidenceTransactions?.length ?? 0;
    hasSecurityDeposit ||= (property.isolatedTransactions ?? []).some(
      (transaction) => transaction.category === "deposit",
    );
  }

  return {
    ...session,
    meta: {
      ...session.meta,
      deduplicatedCount: session.meta?.deduplicatedCount ?? 0,
      hasSecurityDeposit,
      lowConfidenceCount,
      transactionCount,
    },
  };
}

/** @deprecated Prefer sessionFromTransactions — kept for legacy extraction restore. */
export function sessionFromExtraction(
  extraction: RevenusExtractionData,
  fiscalYear: number,
  options?: { mode?: RevenueGptSession["mode"]; previous?: RevenueGptSession },
): RevenueGptSession {
  const transactionsByPropertyId = new Map<string, RevenueRawLine[]>();

  for (const property of extraction.properties) {
    const lines: RevenueRawLine[] = (property.events ?? []).map((event) => ({
      id: event.id,
      date: event.date,
      label: event.label ?? event.sourceType ?? "Événement détecté",
      amount: event.amount,
      direction: "credit" as const,
      sourceType: event.sourceType ?? "bank_statement",
      sourceDocumentId: event.sourceDocumentId ?? property.id,
      confidence: event.confidence ?? 50,
    }));

    transactionsByPropertyId.set(property.id, lines);
  }

  const previous: RevenueGptSession = {
    ...(options?.previous ?? { properties: [] }),
    properties: extraction.properties.map((property) => {
      const existing = options?.previous?.properties.find((item) => item.id === property.id);
      return (
        existing ?? {
          id: property.id,
          label: property.label,
          propertyId: property.propertyId,
          rows: createEmptyGridRows(fiscalYear),
          transactions: [],
          lowConfidenceTransactions: [],
          isolatedTransactions: [],
          gridUserEdited: false,
        }
      );
    }),
  };

  return sessionFromTransactions([], fiscalYear, {
    mode: options?.mode ?? options?.previous?.mode ?? "upload",
    previous,
    linesByPropertyId: transactionsByPropertyId,
    gridSource: "ocr_lines",
  });
}

export function sessionFromLegacyExtraction(
  extraction: RevenusExtractionData,
  fiscalYear: number,
): RevenueGptSession {
  return sessionFromExtraction(extraction, fiscalYear, { mode: "upload" });
}

export function gridSummary(session: RevenueGptSession) {
  let totalRevenue = 0;
  let totalFees = 0;
  let rentCount = 0;

  for (const property of session.properties) {
    for (const row of property.rows) {
      totalRevenue += row.loyers + row.autresRevenus;
      totalFees += row.charges;
      if (row.loyers > 0 || row.autresRevenus > 0) rentCount += 1;
    }
  }

  return {
    totalRevenue,
    totalFees,
    rentCount,
    hasSecurityDeposit: Boolean(session.meta?.hasSecurityDeposit),
    deduplicatedCount: session.meta?.deduplicatedCount ?? 0,
    lowConfidenceCount: session.meta?.lowConfidenceCount ?? 0,
    transactionCount: session.meta?.transactionCount ?? 0,
  };
}

export function sessionToExtractionData(
  session: RevenueGptSession,
  fiscalYear: number,
): RevenusExtractionData {
  const summaryBase = gridSummary(session);

  return {
    properties: session.properties.map((property) => {
      const months = property.rows.map((row) => ({
        month: row.month,
        monthKey: row.monthKey,
        collectedAmount: row.loyers + row.autresRevenus,
        detectedFees: row.charges > 0 ? row.charges : undefined,
        events: [
          ...(row.loyers > 0
            ? [
                {
                  id: `${property.id}-${row.monthKey}-loyer`,
                  date: `${row.monthKey}-05`,
                  amount: row.loyers,
                  category: "rent" as const,
                  sourceType: "Grille",
                },
              ]
            : []),
          ...(row.autresRevenus > 0
            ? [
                {
                  id: `${property.id}-${row.monthKey}-autres`,
                  date: `${row.monthKey}-05`,
                  amount: row.autresRevenus,
                  category: "platform_payout" as const,
                  sourceType: "Grille",
                },
              ]
            : []),
          ...(row.charges > 0
            ? [
                {
                  id: `${property.id}-${row.monthKey}-charges`,
                  date: `${row.monthKey}-05`,
                  amount: row.charges,
                  category: "charges" as const,
                  sourceType: "Grille",
                },
              ]
            : []),
        ],
      }));

      const annualRevenue = property.rows.reduce(
        (sum, row) => sum + row.loyers + row.autresRevenus,
        0,
      );
      const detectedFees = property.rows.reduce((sum, row) => sum + row.charges, 0);
      const rentCount = property.rows.filter(
        (row) => row.loyers > 0 || row.autresRevenus > 0,
      ).length;

      return {
        id: property.id,
        label: property.label,
        propertyId: property.propertyId,
        events: months.flatMap((month) => month.events ?? []),
        months,
        annualRevenue,
        detectedFees,
        rentCount,
        hasSecurityDeposit: session.meta?.hasSecurityDeposit,
        incomplete: property.rows.some(
          (row) => row.loyers < 0 || row.autresRevenus < 0 || row.charges < 0,
        ),
      };
    }),
    events: session.events,
    summary: {
      totalRevenue: summaryBase.totalRevenue,
      rentCount: summaryBase.rentCount,
      totalFees: summaryBase.totalFees,
      hasSecurityDeposit: summaryBase.hasSecurityDeposit,
      eventCount: summaryBase.transactionCount,
      deduplicatedCount: summaryBase.deduplicatedCount,
      lowConfidenceCount: summaryBase.lowConfidenceCount,
    },
    deduplicationNotes:
      summaryBase.deduplicatedCount > 0
        ? [`${summaryBase.deduplicatedCount} doublon(s) fusionné(s) lors de la reconstruction`]
        : undefined,
  };
}

export function validateLowConfidenceTransaction(
  session: RevenueGptSession,
  propertyId: string,
  transactionId: string,
  fiscalYear: number,
): RevenueGptSession {
  const property = session.properties.find((item) => item.id === propertyId);
  if (!property) return session;

  const validatedTransactions = validatePropertyTransaction(
    property.transactions ?? [],
    transactionId,
    fiscalYear,
  );

  const { deduplicatedCount, ...nextProperty } = applyTransactionsToPropertySession(
    { ...property, gridUserEdited: property.gridUserEdited },
    validatedTransactions,
    fiscalYear,
  );
  void deduplicatedCount;

  return summarizeSession({
    ...session,
    properties: session.properties.map((item) =>
      item.id === propertyId ? nextProperty : item,
    ),
  });
}

export function patchPropertyRows(
  session: RevenueGptSession,
  propertyId: string,
  rows: RevenueMonthlyGridRow[],
): RevenueGptSession {
  return {
    ...session,
    properties: session.properties.map((property) =>
      property.id === propertyId ? { ...property, rows, gridUserEdited: true } : property,
    ),
    meta: {
      ...session.meta,
      gridSource: "user_manual",
    },
  };
}

export function patchSessionUi(
  session: RevenueGptSession,
  ui: RevenueGptSession["ui"],
): RevenueGptSession {
  return { ...session, ui: { ...session.ui, ...ui } };
}

export function revenueSessionPatch(session: RevenueGptSession): { revenueGptSession: RevenueGptSession } {
  return { revenueGptSession: session };
}
