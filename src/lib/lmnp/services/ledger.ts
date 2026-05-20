import type {
  ExpenseCategory,
  FieldKey,
  LedgerEntry,
  ValidationItem,
} from "../types";
import { FIELD_REGISTRY } from "../types/field-keys";
import { enumValue } from "../types/values";

const ACCUMULABLE_FIELD_KEYS = new Set<FieldKey>([
  "income.annualRent",
  "income.refactoredCharges",
  "expense.propertyTax",
  "expense.insurance",
  "expense.condo",
  "expense.worksDeductible",
  "expense.managementFees",
  "expense.other",
  "amort.buildingAnnual",
  "amort.furnitureAnnual",
  "loan.annualInterest",
]);

export function isAccumulableFieldKey(fieldKey: FieldKey): boolean {
  return ACCUMULABLE_FIELD_KEYS.has(fieldKey);
}

export function shouldVoidLedgerEntryForValidation(
  entry: LedgerEntry,
  item: ValidationItem,
): boolean {
  if (entry.fieldKey !== item.fieldKey || entry.status !== "active") return false;
  if (!isAccumulableFieldKey(item.fieldKey)) return true;
  if (!item.documentId) return entry.validationItemId === item.id;
  return entry.sourceDocumentIds.includes(item.documentId);
}

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

export function createLedgerEntryFromField(
  params: {
    fiscalYearId: string;
    propertyId?: string;
    fieldKey: FieldKey;
    value: ValidationItem["proposedValue"];
    label?: string;
    origin?: LedgerEntry["origin"];
  },
): LedgerEntry {
  const meta = FIELD_REGISTRY[params.fieldKey];

  return {
    id: crypto.randomUUID(),
    fiscalYearId: params.fiscalYearId,
    propertyId: params.propertyId,
    domain: meta.domain,
    fieldKey: params.fieldKey,
    value: params.value,
    expenseCategory: EXPENSE_FIELD_TO_CATEGORY[params.fieldKey],
    validationItemId: "system",
    sourceDocumentIds: [],
    origin: params.origin ?? "manual",
    status: "active",
    version: 1,
    label: params.label ?? meta.label,
    createdAt: new Date().toISOString(),
  };
}

export function regimeToLedgerValue(regime: "micro-bic" | "reel") {
  return enumValue(regime === "reel" ? "Régime réel" : "Micro-BIC");
}
