import type { LoanInstallment } from "@/lib/lmnp/types";

const LOG_PREFIX = "[installment-table-render-debug]";

export type InstallmentReactKeyAudit = {
  inputRowCount: number;
  reactKeyStrategy: "row.date";
  uniqueReactKeysCount: number;
  /** Rows React would effectively show when key={row.date} (duplicates collapse). */
  effectiveRenderedRowCount: number;
  duplicateKeySlotCount: number;
  duplicateKeys: Array<{ key: string; count: number; indexes: number[] }>;
  first20ReactKeys: string[];
  first20InputRows: Array<{
    index: number;
    reactKey: string;
    date: string;
    principal: number;
    interest: number;
    insurance: number;
    totalPayment: number;
  }>;
  collapseDetected: boolean;
};

export function auditInstallmentReactKeys(rows: LoanInstallment[]): InstallmentReactKeyAudit {
  const keyToIndexes = new Map<string, number[]>();

  rows.forEach((row, index) => {
    const reactKey = row.date;
    const bucket = keyToIndexes.get(reactKey) ?? [];
    bucket.push(index);
    keyToIndexes.set(reactKey, bucket);
  });

  const duplicateKeys = [...keyToIndexes.entries()]
    .filter(([, indexes]) => indexes.length > 1)
    .map(([key, indexes]) => ({ key, count: indexes.length, indexes }))
    .sort((a, b) => b.count - a.count);

  const duplicateKeySlotCount = rows.length - keyToIndexes.size;
  const uniqueReactKeysCount = keyToIndexes.size;

  return {
    inputRowCount: rows.length,
    reactKeyStrategy: "row.date",
    uniqueReactKeysCount,
    effectiveRenderedRowCount: uniqueReactKeysCount,
    duplicateKeySlotCount,
    duplicateKeys: duplicateKeys.slice(0, 20),
    first20ReactKeys: rows.slice(0, 20).map((row) => row.date),
    first20InputRows: rows.slice(0, 20).map((row, index) => ({
      index,
      reactKey: row.date,
      date: row.date,
      principal: row.principal,
      interest: row.interest,
      insurance: row.insurance,
      totalPayment: row.totalPayment,
    })),
    collapseDetected: duplicateKeySlotCount > 0,
  };
}

export function logInstallmentReactKeyAudit(
  stage: string,
  rows: LoanInstallment[],
  extra?: Record<string, unknown>,
): InstallmentReactKeyAudit {
  const audit = auditInstallmentReactKeys(rows);
  console.log(LOG_PREFIX, stage, {
    ...audit,
    ...extra,
    diagnosis: audit.collapseDetected
      ? `React key={row.date} would collapse ${audit.inputRowCount} rows to ${audit.effectiveRenderedRowCount} visible DOM rows`
      : audit.inputRowCount === audit.effectiveRenderedRowCount
        ? "No key collision — visible row count should match input row count"
        : "Unexpected key audit state",
  });
  return audit;
}

/** Stable row identity for React — index disambiguates duplicate dates. */
export function installmentTableRowKey(row: LoanInstallment, index: number): string {
  return `installment-${index}-${row.date}`;
}
