"use client";

import { useState, type ReactNode } from "react";
import type { OcrFieldKey, ValidationItem } from "@/lib/lmnp/types";
import type { DocumentValidationGroup } from "@/lib/lmnp/validation/grouping";
import { DOCUMENT_TYPE_LABELS } from "@/lib/lmnp/validation/grouping";
import { DOCUMENT_CATEGORIES } from "@/lib/lmnp/constants/documents";
import { Card } from "@/design-system/components/Card";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { DocumentPreviewPanel } from "./DocumentPreviewPanel";
import { ManualExtractionFallback } from "./ManualExtractionFallback";
import { ValidationFieldRow } from "./ValidationFieldRow";

interface DocumentValidationCardProps {
  group: DocumentValidationGroup;
  file?: File;
  onApprove: (item: ValidationItem) => void;
  onCorrect: (item: ValidationItem) => void;
  onReject: (item: ValidationItem) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "success";
}) {
  const palette =
    tone === "accent"
      ? {
          background: colors.surface.selected,
          border: colors.border.selected,
          color: colors.text.accent,
        }
      : tone === "success"
        ? {
            background: colors.success.surface,
            border: colors.success.border,
            color: colors.success.DEFAULT,
          }
        : {
            background: colors.surface.inset,
            border: colors.border.subtle,
            color: colors.text.secondary,
          };

  return (
    <span
      style={{
        borderRadius: radius.full,
        border: `1px solid ${palette.border}`,
        backgroundColor: palette.background,
        color: palette.color,
        padding: `${spacing.scale[1]} ${spacing.scale[3]}`,
        ...typography.caption.desktop,
      }}
    >
      {children}
    </span>
  );
}

export function DocumentValidationCard({
  group,
  file,
  onApprove,
  onCorrect,
  onReject,
}: DocumentValidationCardProps) {
  const { document, items, extractions, pendingCount, preValidatedCount } = group;
  const pendingItems = items.filter((i) => i.status === "pending");
  const [activeFieldKey, setActiveFieldKey] = useState<OcrFieldKey | null>(null);

  const fileName = document?.fileName ?? "Champs sans document source";
  const categoryLabel = document
    ? DOCUMENT_CATEGORIES.find((c) => c.id === document.category)?.label
    : null;
  const typeLabel = document
    ? DOCUMENT_TYPE_LABELS[document.documentType] ?? document.documentType
    : null;

  const showManualFallback =
    document &&
    pendingItems.length === 0 &&
    (document.ocrMeta?.usedHeuristicFallback ||
      document.ocrMeta?.warnings.some((w) => w.includes("manuelle")) ||
      (document.ocrMeta?.fieldsDetected === 0 && document.status === "analyzed"));

  const ocrWarnings = document?.ocrMeta?.warnings ?? [];
  const inconsistencies = document?.ocrMeta?.inconsistencies ?? [];

  if (pendingItems.length === 0 && !showManualFallback) return null;

  return (
    <Card className="overflow-hidden !p-0" style={{ boxShadow: shadows.card.hover }}>
      <header
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        style={{
          borderBottom: `1px solid ${colors.border.subtle}`,
          backgroundColor: colors.surface.secondary,
          padding: `${spacing.scale[4]} ${spacing.scale[5]}`,
        }}
      >
        <div className="flex min-w-0 items-start gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center"
            style={{
              borderRadius: radius.lg,
              backgroundColor: colors.warning.surface,
              color: colors.warning.DEFAULT,
              border: `1px solid ${colors.warning.border}`,
            }}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <p
              className="truncate"
              style={{ ...typography.body.desktop, color: colors.text.primary, fontWeight: typography.fontWeight.medium }}
            >
              {fileName}
            </p>
            <p className="mt-0.5" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
              {[typeLabel, categoryLabel, document ? formatSize(document.sizeBytes) : null]
                .filter(Boolean)
                .join(" · ")}
              {document?.ocrMeta ? (
                <span> · Type {document.ocrMeta.documentTypeConfidence}% confiance</span>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {pendingCount > 0 ? (
            <StatusPill>
              {pendingCount} champ{pendingCount > 1 ? "s" : ""} à valider
            </StatusPill>
          ) : null}
          {preValidatedCount > 0 ? (
            <StatusPill tone="accent">{preValidatedCount} haute confiance</StatusPill>
          ) : null}
          {document?.status === "analyzed" ? <StatusPill tone="success">Analysé</StatusPill> : null}
        </div>
      </header>

      {ocrWarnings.length > 0 || inconsistencies.length > 0 ? (
        <div
          style={{
            borderBottom: `1px solid ${colors.border.subtle}`,
            backgroundColor: colors.warning.surface,
            padding: `${spacing.scale[3]} ${spacing.scale[5]}`,
          }}
        >
          <ul className="space-y-1" style={{ ...typography.caption.desktop }}>
            {inconsistencies
              .filter((i) => i.severity === "warning")
              .map((i) => (
                <li key={i.message} className="flex items-start gap-2" style={{ color: colors.warning.DEFAULT }}>
                  <span className="mt-0.5">⚠</span>
                  {i.message}
                </li>
              ))}
            {ocrWarnings.map((w) => (
              <li key={w} className="flex items-start gap-2" style={{ color: colors.text.muted }}>
                <span className="mt-0.5">·</span>
                {w}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-0 lg:grid-cols-[minmax(240px,340px)_1fr]">
        {document ? (
          <div
            style={{
              borderBottom: `1px solid ${colors.border.subtle}`,
              padding: spacing.scale[4],
            }}
            className="lg:border-b-0 lg:border-r"
          >
            <p
              className="mb-2"
              style={{
                ...typography.caption.desktop,
                color: colors.text.muted,
                letterSpacing: typography.letterSpacing.label,
                textTransform: "uppercase",
              }}
            >
              Aperçu document
            </p>
            <DocumentPreviewPanel
              file={file}
              extractions={extractions}
              activeFieldKey={activeFieldKey}
              onFieldHover={setActiveFieldKey}
            />
          </div>
        ) : null}

        <div className="space-y-3" style={{ padding: spacing.scale[5] }}>
          {pendingItems.map((item) => (
            <ValidationFieldRow
              key={item.id}
              item={item}
              extractions={extractions}
              activeFieldKey={activeFieldKey}
              onFieldHover={setActiveFieldKey}
              onApprove={() => onApprove(item)}
              onCorrect={() => onCorrect(item)}
              onReject={() => onReject(item)}
            />
          ))}

          {showManualFallback && document ? (
            <ManualExtractionFallback document={document} warnings={ocrWarnings} />
          ) : null}
        </div>
      </div>
    </Card>
  );
}
