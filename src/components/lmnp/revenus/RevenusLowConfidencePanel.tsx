"use client";

import { Button } from "@/design-system/components/Button";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { formatCurrency } from "@/lib/lmnp/services/revenus-profile";
import { transactionCategoryLabel } from "@/lib/lmnp/services/revenue-transactions";
import type { RevenueTransaction } from "@/lib/lmnp/types";

type RevenusLowConfidencePanelProps = {
  transactions: RevenueTransaction[];
  onValidate?: (transactionId: string) => void;
};

export function RevenusLowConfidencePanel({
  transactions,
  onValidate,
}: RevenusLowConfidencePanelProps) {
  if (!transactions.length) return null;

  return (
    <div
      className="mt-6 rounded-xl border p-4"
      style={{
        borderColor: colors.border.subtle,
        backgroundColor: colors.surface.secondary,
      }}
    >
      <p
        style={{
          ...typography.caption.desktop,
          color: colors.text.accent,
          letterSpacing: typography.letterSpacing.label,
        }}
      >
        Événements à faible confiance
      </p>
      <p className="mt-2" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
        Ces flux n&apos;ont pas été intégrés automatiquement à la grille. Validez-les ou saisissez
        les montants manuellement dans la grille.
      </p>
      <ul className="mt-4 space-y-3">
        {transactions.map((transaction) => (
          <li
            key={transaction.id}
            className="flex flex-wrap items-start justify-between gap-3 rounded-lg border px-3 py-3"
            style={{
              borderColor: colors.border.subtle,
              backgroundColor: colors.surface.primary,
              borderRadius: radius.md,
            }}
          >
            <div className="min-w-0">
              <p style={{ ...typography.body.desktop, color: colors.text.primary }}>
                {transaction.description}
              </p>
              <p className="mt-1" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
                {transaction.date ?? "Date inconnue"} · {transactionCategoryLabel(transaction.category)}
                {transaction.sourceType ? ` · ${transaction.sourceType}` : ""}
                {transaction.accountContext ? ` · ${transaction.accountContext}` : ""}
              </p>
              {transaction.recurrenceScore !== undefined ? (
                <p className="mt-1" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
                  Récurrence {transaction.recurrenceScore}/100
                </p>
              ) : null}
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="text-right">
                <p
                  style={{
                    ...typography.body.desktop,
                    color:
                      transaction.direction === "credit" ? colors.success.DEFAULT : colors.error.DEFAULT,
                    fontWeight: typography.fontWeight.medium,
                  }}
                >
                  {transaction.direction === "credit" ? "+" : "-"}
                  {formatCurrency(Math.abs(transaction.amount))}
                </p>
                {transaction.confidence !== undefined ? (
                  <p className="mt-1" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
                    Confiance {transaction.confidence}%
                  </p>
                ) : null}
              </div>
              {onValidate ? (
                <Button variant="secondary" onClick={() => onValidate(transaction.id)}>
                  Valider pour la grille
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

type RevenusIsolatedTransactionsPanelProps = {
  transactions: RevenueTransaction[];
};

export function RevenusIsolatedTransactionsPanel({
  transactions,
}: RevenusIsolatedTransactionsPanelProps) {
  if (!transactions.length) return null;

  return (
    <div
      className="mt-6 rounded-xl border p-4"
      style={{
        borderColor: colors.border.subtle,
        backgroundColor: colors.surface.primary,
      }}
    >
      <p
        style={{
          ...typography.caption.desktop,
          color: colors.text.muted,
          letterSpacing: typography.letterSpacing.label,
        }}
      >
        Flux isolés (hors grille)
      </p>
      <ul className="mt-3 space-y-2">
        {transactions.map((transaction) => (
          <li
            key={transaction.id}
            className="flex flex-wrap items-center justify-between gap-3"
            style={{ ...typography.body.desktop, color: colors.text.secondary }}
          >
            <span>
              {transactionCategoryLabel(transaction.category)} · {transaction.description}
            </span>
            <span style={{ color: colors.text.primary, fontWeight: typography.fontWeight.medium }}>
              {formatCurrency(Math.abs(transaction.amount))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
