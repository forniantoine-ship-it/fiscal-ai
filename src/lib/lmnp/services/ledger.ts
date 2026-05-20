import type {
  ExpenseCategory,
  FieldKey,
  LedgerEntry,
  ValidationItem,
} from "../types";
import { FIELD_REGISTRY } from "../types/field-keys";

const EXPENSE_FIELD_TO_CATEGORY: Partial<Record<FieldKey, ExpenseCategory>> = {
  "expense.propertyTax": "property_tax",
  "expense.insurance": "insurance",
  "expense.condo": "condo",
  "expense.worksDeductible": "works_deductible",
  "expense.managementFees": "management_fees",
  "expense.other": "other",
};

export function createLedgerEntryFromValidation(
  item: ValidationItem,
  fiscalYearId: string,
): LedgerEntry {
  const value = item.finalValue ?? item.proposedValue;
  const meta = FIELD_REGISTRY[item.fieldKey];

  return {
    id: crypto.randomUUID(),
    fiscalYearId,
    propertyId: item.propertyId,
    domain: meta.domain,
    fieldKey: item.fieldKey,
    value,
    expenseCategory: EXPENSE_FIELD_TO_CATEGORY[item.fieldKey],
    validationItemId: item.id,
    sourceDocumentIds: item.documentId ? [item.documentId] : [],
    origin: item.status === "corrected" ? "manual" : "ai_extracted",
    status: "active",
    version: 1,
    label: item.label,
    createdAt: new Date().toISOString(),
  };
}

export function voidLedgerEntry(entry: LedgerEntry): LedgerEntry {
  return { ...entry, status: "voided" };
}
