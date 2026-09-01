/**
 * Temporary runtime audit instrumentation for the Revenus tunnel.
 * Remove or gate behind DEBUG flag once OCR → transaction wiring is complete.
 */

import type {
  DeclarationDraft,
  RevenueGptSession,
  RevenueMonthlyGridRow,
  RevenuePropertySession,
  RevenueRawLine,
  RevenueTransaction,
} from "../types";

export type RevenueRuntimeStage =
  | "upload"
  | "ocr_dispatch"
  | "ocr_complete"
  | "session_prefill"
  | "raw_lines"
  | "normalization"
  | "transaction_extraction"
  | "structured_mapping"
  | "clustering"
  | "aggregation"
  | "persist"
  | "confirm"
  | "ui_render"
  | "duplicate_batch_skipped";

export type RevenueSourceOfTruth =
  | "ocr_extraction"
  | "gpt_extraction"
  | "structured_table_parser"
  | "mock_raw_lines"
  | "legacy_revenus_extraction"
  | "persisted_revenue_gpt_session"
  | "normalized_transactions"
  | "user_grid_edit"
  | "manual_empty_session"
  | "synthetic_grid_export"
  | "fallback_heuristic"
  | "unknown";

export type RevenueHydrationBranch =
  | "revenue_gpt_session"
  | "legacy_revenus_extraction"
  | "confirmed_empty_fallback"
  | "create_empty_session";

export type RevenueRenderOrigin =
  | "persisted_draft"
  | "mock_pipeline"
  | "legacy_restore"
  | "manual_entry"
  | "user_edited_grid"
  | "mixed";

const MOCK_COUNTERPARTY_MARKERS = ["M. Dupont", "M. Martin", "Compte courant LMNP"];
const MOCK_LABEL_MARKERS = ["Total encaissements locatifs", "Versement Airbnb juillet"];

export function logRevenueRuntimeStage(
  stage: RevenueRuntimeStage,
  detail: Record<string, unknown> = {},
): void {
  console.log("[revenue-runtime-stage]", { stage, ...detail });
}

export function logRevenueSourceOfTruth(
  source: RevenueSourceOfTruth,
  detail: Record<string, unknown> = {},
): void {
  console.log("[revenue-source-of-truth]", { source, ...detail });
}

export function logRevenueHydrationBranch(
  branch: RevenueHydrationBranch,
  detail: Record<string, unknown> = {},
): void {
  console.log("[revenue-hydration-branch]", { branch, ...detail });
}

export function logRevenueRenderOrigin(
  origin: RevenueRenderOrigin,
  detail: Record<string, unknown> = {},
): void {
  console.log("[revenue-render-origin]", { origin, ...detail });
}

export type RevenueGridSource = "ocr_lines" | "mock_lines" | "persisted_session" | "user_manual";

export function logRevenueGridSource(
  source: RevenueGridSource,
  detail: Record<string, unknown> = {},
): void {
  console.log("[revenue-grid-source]", { source, ...detail });
}

export function detectRawLineSource(
  lines: RevenueRawLine[],
  options?: { gridSource?: RevenueGridSource; linesByPropertyId?: Map<string, RevenueRawLine[]> },
): RevenueSourceOfTruth {
  if (lines.some((line) => line.structuredTable || line.sourceColumnHeader)) {
    return "structured_table_parser";
  }
  if (options?.gridSource === "ocr_lines") return "gpt_extraction";
  if (options?.gridSource === "mock_lines") return "mock_raw_lines";
  if (options?.gridSource === "user_manual") return "manual_empty_session";
  if (options?.gridSource === "persisted_session") return "persisted_revenue_gpt_session";

  if (options?.linesByPropertyId?.size) {
    return "legacy_revenus_extraction";
  }

  const sample = lines.slice(0, 5);
  const looksMock = sample.some(
    (line) =>
      MOCK_COUNTERPARTY_MARKERS.some((marker) => line.counterparty?.includes(marker)) ||
      MOCK_LABEL_MARKERS.some((marker) => (line.label ?? "").includes(marker)),
  );

  return looksMock ? "mock_raw_lines" : "gpt_extraction";
}

export function resolveHydrationBranch(draft?: DeclarationDraft): RevenueHydrationBranch {
  if (draft?.revenueGptSession?.properties.length) return "revenue_gpt_session";
  if (draft?.revenusConfirmedAt) return "confirmed_empty_fallback";
  return "create_empty_session";
}

export function inferSessionRenderOrigin(session: RevenueGptSession): RevenueRenderOrigin {
  if (session.mode === "manual") return "manual_entry";

  const anyUserEdited = session.properties.some((property) => property.gridUserEdited);
  if (anyUserEdited) return "user_edited_grid";

  const transactions = session.properties.flatMap((property) => property.transactions ?? []);
  const looksMock = transactions.some(
    (transaction) =>
      MOCK_COUNTERPARTY_MARKERS.some((marker) => transaction.counterparty?.includes(marker)) ||
      MOCK_LABEL_MARKERS.some((marker) =>
        (transaction.label ?? transaction.description).includes(marker),
      ),
  );

  if (looksMock) return "mock_pipeline";
  if (transactions.length === 0) return "manual_entry";
  return "mixed";
}

export function traceGridRowOrigins(
  property: RevenuePropertySession,
  fiscalYear: number,
): Array<{ monthKey: string; origins: RevenueSourceOfTruth[] }> {
  return property.rows.map((row) => ({
    monthKey: row.monthKey,
    origins: inferRowSources(property, row, fiscalYear),
  }));
}

function inferRowSources(
  property: RevenuePropertySession,
  row: RevenueMonthlyGridRow,
  fiscalYear: number,
): RevenueSourceOfTruth[] {
  const sources = new Set<RevenueSourceOfTruth>();

  if (property.gridUserEdited) sources.add("user_grid_edit");

  const monthTransactions = (property.transactions ?? []).filter((transaction) => {
    const date = transaction.date ?? "";
    return date.includes(row.monthKey) || date.includes(row.monthKey.replace("-", "/"));
  });

  if (monthTransactions.some(isLikelyMockTransaction)) {
    sources.add("mock_raw_lines");
  } else if (monthTransactions.length > 0) {
    sources.add("normalized_transactions");
  }

  if (
    row.loyers === 0 &&
    row.autresRevenus === 0 &&
    row.charges === 0 &&
    sources.size === 0
  ) {
    sources.add("manual_empty_session");
  }

  if (sources.size === 0 && (row.loyers > 0 || row.autresRevenus > 0 || row.charges > 0)) {
    sources.add("unknown");
  }

  void fiscalYear;
  return [...sources];
}

function isLikelyMockTransaction(transaction: RevenueTransaction): boolean {
  return (
    MOCK_COUNTERPARTY_MARKERS.some((marker) => transaction.counterparty?.includes(marker)) ||
    MOCK_LABEL_MARKERS.some((marker) =>
      (transaction.label ?? transaction.description).includes(marker),
    )
  );
}

export function traceOcrOrphan(params: {
  documentIds: string[];
  ocrExtractionCount: number;
  consumedByRevenusPipeline: boolean;
}): void {
  logRevenueRuntimeStage("ocr_complete", {
    documentIds: params.documentIds,
    ocrExtractionCount: params.ocrExtractionCount,
    consumedByRevenusPipeline: params.consumedByRevenusPipeline,
    note: params.consumedByRevenusPipeline
      ? "OCR linked to revenus pipeline"
      : "OCR result stored in workspace.extractions only — NOT fed to transaction engine",
  });

  if (!params.consumedByRevenusPipeline) {
    logRevenueSourceOfTruth("ocr_extraction", {
      status: "orphaned",
      reason: "applyExtractionToSession uses sessionFromTransactions(mock) instead of OCR output",
    });
  }
}
