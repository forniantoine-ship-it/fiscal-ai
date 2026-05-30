import type { RevenueTransactionCategory } from "../types";
import { classifyRevenueHeader, categoryFromColumnHeader } from "./revenus-header-classification";

export type RevenueGridColumn = "loyers" | "autresRevenus" | "charges" | "isolated";

export { categoryFromColumnHeader } from "./revenus-header-classification";

export function logRevenueRowMapping(params: {
  sourceHeader: string;
  parsedAmount: number;
  category: RevenueTransactionCategory;
  targetGridColumn: RevenueGridColumn;
  monthKey?: string | null;
  structured?: boolean;
}): void {
  console.log("[revenue-row-mapping]", {
    sourceHeader: params.sourceHeader,
    parsedAmount: params.parsedAmount,
    assignedCategory: params.category,
    targetGridColumn: params.targetGridColumn,
    monthKey: params.monthKey ?? null,
    structured: params.structured ?? true,
  });
}

export function gridColumnForCategory(category: RevenueTransactionCategory): RevenueGridColumn {
  switch (category) {
    case "rent":
      return "loyers";
    case "additional_income":
    case "platform_payout":
    case "caf_subsidy":
    case "reimbursement":
      return "autresRevenus";
    case "charges":
    case "fee":
      return "charges";
    default:
      return "isolated";
  }
}

export function gridColumnFromHeader(header: string): RevenueGridColumn | null {
  return classifyRevenueHeader(header).targetGridColumn;
}
