"use client";

import Link from "next/link";
import type { Extraction, OcrFieldKey, ValidationItem } from "@/lib/lmnp/types";
import { lmnpTabRoute } from "@/lib/lmnp/routes";
import { FIELD_REGISTRY } from "@/lib/lmnp/types/field-keys";
import { formatNormalizedValue, isPreValidated } from "@/lib/lmnp/validation/display";
import { getTabLabelForField } from "@/lib/lmnp/validation/ledger-display";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { ConfidenceScore } from "./ConfidenceScore";
import { NormalizedValueDisplay } from "./NormalizedValueDisplay";
import { PreValidatedBadge } from "./PreValidatedBadge";
import { ValidationFieldActions } from "./ValidationFieldActions";

interface ValidationFieldRowProps {
  item: ValidationItem;
  extractions: Extraction[];
  activeFieldKey?: OcrFieldKey | null;
  onFieldHover?: (fieldKey: OcrFieldKey | null) => void;
  onApprove: () => void;
  onCorrect: () => void;
  onReject: () => void;
}

function rowSurface({
  highlighted,
  preValidated,
}: {
  highlighted: boolean;
  preValidated: boolean;
}) {
  if (highlighted) {
    return {
      border: `1px solid ${colors.border.selected}`,
      backgroundColor: colors.surface.selected,
      boxShadow: shadows.card.hover,
    };
  }
  if (preValidated) {
    return {
      border: `1px solid ${colors.workflow.completedBorder}`,
      backgroundColor: colors.workflow.completedBackground,
      boxShadow: `inset 3px 0 0 0 ${colors.success.DEFAULT}`,
    };
  }
  return {
    border: `1px solid ${colors.border.subtle}`,
    backgroundColor: colors.surface.secondary,
    boxShadow: shadows.card.default,
  };
}

export function ValidationFieldRow({
  item,
  extractions,
  activeFieldKey,
  onFieldHover,
  onApprove,
  onCorrect,
  onReject,
}: ValidationFieldRowProps) {
  const preValidated = isPreValidated(item.confidence);
  const linkedExtractions = extractions.filter((e) => item.extractionIds.includes(e.id));
  const tabLabel = getTabLabelForField(item.fieldKey);
  const primaryExtraction = linkedExtractions[0];
  const warnings = linkedExtractions.flatMap((e) => e.warnings ?? []);
  const isHighlighted =
    primaryExtraction?.ocrFieldKey && activeFieldKey === primaryExtraction.ocrFieldKey;
  const surface = rowSurface({ highlighted: Boolean(isHighlighted), preValidated });

  return (
    <article
      style={{
        borderRadius: radius.lg,
        padding: spacing.scale[5],
        ...surface,
      }}
      onMouseEnter={() => {
        if (primaryExtraction?.ocrFieldKey) onFieldHover?.(primaryExtraction.ocrFieldKey);
      }}
      onMouseLeave={() => onFieldHover?.(null)}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h4 style={{ ...typography.body.desktop, color: colors.text.primary, fontWeight: typography.fontWeight.medium }}>
              {item.label}
            </h4>
            {item.isRequired ? (
              <span
                style={{
                  borderRadius: radius.full,
                  backgroundColor: colors.warning.surface,
                  border: `1px solid ${colors.warning.border}`,
                  padding: `${spacing.scale[1]} ${spacing.scale[2]}`,
                  ...typography.caption.desktop,
                  color: colors.warning.DEFAULT,
                }}
              >
                Obligatoire
              </span>
            ) : null}
            {preValidated ? <PreValidatedBadge /> : null}
            {primaryExtraction?.ocrFieldKey ? (
              <span
                style={{
                  borderRadius: radius.full,
                  backgroundColor: colors.surface.inset,
                  padding: `${spacing.scale[1]} ${spacing.scale[2]}`,
                  ...typography.caption.desktop,
                  color: colors.text.muted,
                }}
              >
                Détecté sur le document
              </span>
            ) : null}
          </div>

          <NormalizedValueDisplay value={item.proposedValue} />

          {linkedExtractions.length > 0 ? (
            <ul
              className="space-y-1.5"
              style={{
                borderRadius: radius.md,
                backgroundColor: colors.surface.inset,
                padding: spacing.scale[3],
                ...typography.caption.desktop,
              }}
            >
              {linkedExtractions.map((ext) => (
                <li key={ext.id} className="space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span style={{ color: colors.text.muted }}>
                      Extrait IA : <span style={{ color: colors.text.secondary }}>{ext.rawValue}</span>
                    </span>
                    <ConfidenceScore score={ext.confidence} size="sm" showRing={false} />
                  </div>
                  {ext.warnings?.map((w) => (
                    <p key={w} style={{ color: colors.text.muted }}>
                      ⚠ {w}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          ) : null}

          {warnings.length > 0 && linkedExtractions.length === 0 ? (
            <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>{warnings[0]}</p>
          ) : null}
        </div>

        <ConfidenceScore score={item.confidence} size="sm" />
      </div>

      <ValidationFieldActions
        onApprove={onApprove}
        onCorrect={onCorrect}
        onReject={onReject}
        approveLabel={preValidated ? "Confirmer" : "Approuver"}
      />

      <p className="mt-3" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
        Approuver crée une ligne dans l&apos;onglet{" "}
        <span style={{ color: colors.text.accent }}>{tabLabel}</span> — modification possible ensuite.
      </p>
    </article>
  );
}

export function ValidationFieldRowDone({ item }: { item: ValidationItem }) {
  const value = item.finalValue ?? item.proposedValue;
  const tabLabel = getTabLabelForField(item.fieldKey);
  const tabHref = lmnpTabRoute(FIELD_REGISTRY[item.fieldKey].tab);

  const statusLabel =
    item.status === "approved"
      ? "Validé par IA + vous"
      : item.status === "corrected"
        ? "Corrigé par vous"
        : "Rejeté";

  return (
    <li
      className="flex flex-wrap items-center justify-between gap-2"
      style={{
        borderRadius: radius.md,
        backgroundColor: colors.surface.secondary,
        padding: `${spacing.scale[3]} ${spacing.scale[4]}`,
        ...typography.body.desktop,
      }}
    >
      <div className="min-w-0">
        <span style={{ color: colors.text.secondary }}>{item.label}</span>
        {item.documentFileName ? (
          <p className="truncate" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
            Source : {item.documentFileName}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span style={{ color: colors.text.primary, fontWeight: typography.fontWeight.medium }}>
          {formatNormalizedValue(value)}
        </span>
        <span
          style={{
            borderRadius: radius.full,
            padding: `${spacing.scale[1]} ${spacing.scale[2]}`,
            ...typography.caption.desktop,
            backgroundColor:
              item.status === "ignored" ? colors.surface.tertiary : colors.surface.selected,
            color: item.status === "ignored" ? colors.text.muted : colors.text.accent,
          }}
        >
          {statusLabel}
        </span>
        {item.status !== "ignored" ? (
          <Link href={tabHref} style={{ ...typography.caption.desktop, color: colors.text.muted }}>
            → {tabLabel}
          </Link>
        ) : null}
      </div>
    </li>
  );
}
