"use client";

import { Button } from "@/design-system/components/Button";
import { Card } from "@/design-system/components/Card";
import { colors } from "@/design-system/theme/colors";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

interface ValidationSummaryBarProps {
  pendingCount: number;
  highConfidenceCount: number;
  analyzedDocumentsCount: number;
  validatedCount: number;
  onBulkApproveHighConfidence: () => void;
}

export function ValidationSummaryBar({
  pendingCount,
  highConfidenceCount,
  analyzedDocumentsCount,
  validatedCount,
  onBulkApproveHighConfidence,
}: ValidationSummaryBarProps) {
  return (
    <Card variant="muted" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Documents analysés" value={analyzedDocumentsCount} tone="primary" />
      <Stat label="À confirmer" value={pendingCount} tone="warning" />
      <Stat
        label="Pré-validés ≥ 95 %"
        value={highConfidenceCount}
        tone="accent"
        hint="Lecture nette par l'IA"
      />
      <Stat label="Déjà validés" value={validatedCount} tone="success" />

      {highConfidenceCount > 0 && pendingCount > 0 ? (
        <div className="flex items-center sm:col-span-2 lg:col-span-4">
          <Button variant="secondary" onClick={onBulkApproveHighConfidence}>
            Valider tous les champs ≥ 95 % ({highConfidenceCount})
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone: "primary" | "warning" | "accent" | "success";
  hint?: string;
}) {
  const valueColor =
    tone === "warning"
      ? colors.warning.DEFAULT
      : tone === "accent"
        ? colors.text.accent
        : tone === "success"
          ? colors.success.DEFAULT
          : colors.text.primary;

  return (
    <div>
      <p
        style={{
          ...typography.caption.desktop,
          color: colors.text.muted,
          letterSpacing: typography.letterSpacing.label,
          textTransform: "uppercase",
        }}
      >
        {label}
      </p>
      <p
        className="mt-1 tabular-nums"
        style={{
          fontFamily: typography.fontFamily.display,
          fontSize: typography.fontSize["2xl"],
          lineHeight: typography.lineHeight.title,
          color: valueColor,
        }}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
