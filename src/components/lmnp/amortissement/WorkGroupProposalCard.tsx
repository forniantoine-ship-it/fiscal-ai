"use client";

import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import type { WorkGroup } from "@/lib/lmnp/engine/business-engine.types";
import { CATEGORY_LABELS_FR } from "@/lib/lmnp/engine/business-asset-engine";

// ---------------------------------------------------------------------------
// WorkGroupProposalCard
// ---------------------------------------------------------------------------

interface WorkGroupProposalCardProps {
  group: WorkGroup;
  /** Called when the user confirms the grouping (optionally with overrides). */
  onConfirm: (id: string, overrides?: { label?: string; durationYears?: number }) => void;
  /** Called when the user chooses to keep invoices separate. */
  onReject: (id: string) => void;
}

/**
 * Displays a WorkGroup proposal to the user.
 *
 * Follows the core UX rule: the engine PROPOSES, the user DECIDES.
 * The card shows exactly WHY these invoices were grouped and gives the
 * user clear, simple options to confirm or split.
 */
export function WorkGroupProposalCard({
  group,
  onConfirm,
  onReject,
}: WorkGroupProposalCardProps) {
  const formattedTotal = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(group.totalAmount);

  const categoryLabel = CATEGORY_LABELS_FR[group.dominantCategory] ?? group.dominantCategory;

  const cardStyle: React.CSSProperties = {
    backgroundColor: colors.surface.primary,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radius.xl,
    boxShadow: shadows.card.default,
    padding: spacing.scale[6],
  };

  const invoiceRowStyle: React.CSSProperties = {
    backgroundColor: colors.surface.secondary,
    borderRadius: radius.lg,
    padding: `${spacing.scale[3]} ${spacing.scale[4]}`,
    border: `1px solid ${colors.border.subtle}`,
  };

  return (
    <article style={cardStyle}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <CategoryBadge label={categoryLabel} />
            <ConfidenceBadge confidence={group.confidence} />
          </div>
          <h3
            className="mt-2 truncate"
            style={{
              fontFamily: typography.fontFamily.display,
              fontSize: typography.fontSize["xl"],
              fontWeight: typography.fontWeight.semibold,
              color: colors.text.primary,
            }}
          >
            {group.detectedProjectLabel}
          </h3>
          {group.supplier ? (
            <p
              className="mt-0.5"
              style={{ ...typography.caption.desktop, color: colors.text.muted }}
            >
              Fournisseur : {group.supplier}
            </p>
          ) : null}
        </div>

        <div className="text-right shrink-0">
          <p
            style={{
              fontFamily: typography.fontFamily.display,
              fontSize: typography.fontSize["2xl"],
              fontWeight: typography.fontWeight.semibold,
              color: colors.text.primary,
            }}
          >
            {formattedTotal}
          </p>
          {group.proposedDurationYears > 0 ? (
            <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>
              Amortissement sur {group.proposedDurationYears} ans
            </p>
          ) : null}
        </div>
      </div>

      {/* AI explanation */}
      <div
        className="mt-4 flex gap-2"
        style={{
          backgroundColor: colors.surface.secondary,
          borderRadius: radius.lg,
          padding: `${spacing.scale[3]} ${spacing.scale[4]}`,
        }}
      >
        <span style={{ color: colors.text.accent, flexShrink: 0 }}>✦</span>
        <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          {group.explanation}
        </p>
      </div>

      {/* Invoice list */}
      {group.invoices.length > 0 ? (
        <div className="mt-4 space-y-2">
          <p
            style={{ ...typography.caption.desktop, color: colors.text.muted, fontWeight: typography.fontWeight.medium }}
          >
            {group.invoices.length === 1
              ? "1 facture dans ce groupe"
              : `${group.invoices.length} factures dans ce groupe`}
          </p>
          <div className="space-y-2">
            {group.invoices.map((inv, i) => (
              <div key={inv.documentId ?? i} style={invoiceRowStyle} className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p
                    className="truncate"
                    style={{ ...typography.caption.desktop, color: colors.text.primary, fontWeight: typography.fontWeight.medium }}
                  >
                    {inv.supplier ?? "Fournisseur inconnu"}
                  </p>
                  {inv.invoiceDate ? (
                    <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>
                      {formatDate(inv.invoiceDate)}
                    </p>
                  ) : null}
                </div>
                <p
                  className="shrink-0"
                  style={{ ...typography.caption.desktop, color: colors.text.primary, fontWeight: typography.fontWeight.medium }}
                >
                  {new Intl.NumberFormat("fr-FR", {
                    style: "currency",
                    currency: "EUR",
                    maximumFractionDigits: 0,
                  }).format(inv.amountTTC)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Actions */}
      <div className="mt-5 flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={() => onConfirm(group.id)}
          style={{
            flex: 1,
            backgroundColor: colors.orange[500] ?? "#F07C3A",
            color: "#FFFFFF",
            border: "none",
            borderRadius: radius.lg,
            padding: `${spacing.scale[3]} ${spacing.scale[4]}`,
            fontFamily: typography.fontFamily.sans,
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.semibold,
            cursor: "pointer",
          }}
        >
          Confirmer le regroupement
        </button>
        <button
          type="button"
          onClick={() => onReject(group.id)}
          style={{
            flex: 1,
            backgroundColor: colors.surface.secondary,
            color: colors.text.secondary,
            border: `1px solid ${colors.border.default}`,
            borderRadius: radius.lg,
            padding: `${spacing.scale[3]} ${spacing.scale[4]}`,
            fontFamily: typography.fontFamily.sans,
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.medium,
            cursor: "pointer",
          }}
        >
          Traiter séparément
        </button>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// WorkGroupProposalList
// ---------------------------------------------------------------------------

interface WorkGroupProposalListProps {
  groups: WorkGroup[];
  onConfirm: (id: string, overrides?: { label?: string; durationYears?: number }) => void;
  onReject: (id: string) => void;
}

/**
 * Renders all pending WorkGroup proposals with a contextual header.
 * Shows nothing when there are no pending proposals.
 */
export function WorkGroupProposalList({
  groups,
  onConfirm,
  onReject,
}: WorkGroupProposalListProps) {
  const pending = groups.filter((g) => g.status === "proposed");

  if (pending.length === 0) return null;

  return (
    <section className="space-y-4">
      <div>
        <h2
          style={{
            fontFamily: typography.fontFamily.display,
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text.primary,
          }}
        >
          Regroupements détectés par l'IA
        </h2>
        <p
          className="mt-1"
          style={{ ...typography.body.desktop, color: colors.text.secondary }}
        >
          L'IA a détecté que certaines factures appartiennent probablement au même projet.
          Confirmez ou refusez chaque regroupement — vous gardez toujours le contrôle.
        </p>
      </div>

      <div className="space-y-4">
        {pending.map((group) => (
          <WorkGroupProposalCard
            key={group.id}
            group={group}
            onConfirm={onConfirm}
            onReject={onReject}
          />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// BusinessAssetCard — confirmed asset display
// ---------------------------------------------------------------------------

import type { BusinessAsset } from "@/lib/lmnp/engine/business-engine.types";

interface BusinessAssetCardProps {
  asset: BusinessAsset;
  annualAmortization?: number;
  onEdit?: (id: string) => void;
  onValidate?: (id: string) => void;
}

/**
 * Shows a confirmed BusinessAsset — the accounting source of truth.
 * Displays the fiscal treatment and explanation so the user always
 * understands what the software decided.
 */
export function BusinessAssetCard({
  asset,
  annualAmortization,
  onEdit,
  onValidate,
}: BusinessAssetCardProps) {
  const formattedAmount = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(asset.amount);

  const formattedAnnual = annualAmortization
    ? new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(annualAmortization)
    : null;

  const isImmobilisation = asset.fiscalTreatment === "immobilisation";
  const categoryLabel = CATEGORY_LABELS_FR[asset.category] ?? asset.category;

  const cardStyle: React.CSSProperties = {
    backgroundColor: colors.surface.primary,
    border: `1px solid ${asset.userValidated ? colors.border.default : colors.orange[200] ?? "#F5D4B8"}`,
    borderRadius: radius.xl,
    boxShadow: shadows.card.default,
    padding: spacing.scale[5],
  };

  return (
    <article style={cardStyle}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <CategoryBadge label={categoryLabel} />
            <TreatmentBadge isImmobilisation={isImmobilisation} />
            {!asset.userValidated && (
              <span
                style={{
                  ...typography.caption.desktop,
                  color: colors.orange[600] ?? "#D97706",
                  backgroundColor: colors.orange[50] ?? "#FFF7ED",
                  border: `1px solid ${colors.orange[200] ?? "#FED7AA"}`,
                  borderRadius: radius.full,
                  padding: `2px ${spacing.scale[2]}`,
                }}
              >
                À valider
              </span>
            )}
          </div>
          <h3
            className="mt-2 truncate"
            style={{
              fontFamily: typography.fontFamily.display,
              fontSize: typography.fontSize.lg,
              fontWeight: typography.fontWeight.semibold,
              color: colors.text.primary,
            }}
          >
            {asset.label}
          </h3>
        </div>

        <div className="text-right shrink-0">
          <p
            style={{
              fontFamily: typography.fontFamily.display,
              fontSize: typography.fontSize["xl"],
              fontWeight: typography.fontWeight.semibold,
              color: colors.text.primary,
            }}
          >
            {formattedAmount}
          </p>
          {isImmobilisation && formattedAnnual ? (
            <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>
              {formattedAnnual} / an
            </p>
          ) : null}
          {isImmobilisation && asset.amortizationYears > 0 ? (
            <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>
              sur {asset.amortizationYears} ans
            </p>
          ) : null}
        </div>
      </div>

      {/* Fiscal explanation */}
      <p
        className="mt-3"
        style={{ ...typography.body.desktop, color: colors.text.secondary }}
      >
        {asset.explanation}
      </p>

      {/* Actions row */}
      {(onEdit || onValidate) ? (
        <div className="mt-4 flex gap-2">
          {!asset.userValidated && onValidate ? (
            <button
              type="button"
              onClick={() => onValidate(asset.id)}
              style={{
                backgroundColor: colors.orange[500] ?? "#F07C3A",
                color: "#FFFFFF",
                border: "none",
                borderRadius: radius.md,
                padding: `${spacing.scale[2]} ${spacing.scale[3]}`,
              fontFamily: typography.fontFamily.sans,
              fontSize: typography.fontSize.xs,
              fontWeight: typography.fontWeight.semibold,
              cursor: "pointer",
            }}
          >
            Valider
          </button>
        ) : null}
        {onEdit ? (
          <button
            type="button"
            onClick={() => onEdit(asset.id)}
            style={{
              backgroundColor: colors.surface.secondary,
              color: colors.text.secondary,
              border: `1px solid ${colors.border.default}`,
              borderRadius: radius.md,
              padding: `${spacing.scale[2]} ${spacing.scale[3]}`,
              fontFamily: typography.fontFamily.sans,
                fontSize: typography.fontSize.xs,
                fontWeight: typography.fontWeight.medium,
                cursor: "pointer",
              }}
            >
              Modifier
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function CategoryBadge({ label }: { label: string }) {
  return (
    <span
      style={{
        ...typography.caption.desktop,
        color: colors.text.secondary,
        backgroundColor: colors.surface.secondary,
        border: `1px solid ${colors.border.subtle}`,
        borderRadius: radius.full,
        padding: `2px ${spacing.scale[2]}`,
        fontWeight: typography.fontWeight.medium,
      }}
    >
      {label}
    </span>
  );
}

function TreatmentBadge({ isImmobilisation }: { isImmobilisation: boolean }) {
  return (
    <span
      style={{
        ...typography.caption.desktop,
        color: isImmobilisation ? colors.text.accent : colors.text.secondary,
        backgroundColor: isImmobilisation
          ? (colors.orange[50] ?? "#FFF7ED")
          : colors.surface.secondary,
        border: `1px solid ${isImmobilisation ? (colors.orange[200] ?? "#FED7AA") : colors.border.subtle}`,
        borderRadius: radius.full,
        padding: `2px ${spacing.scale[2]}`,
      }}
    >
      {isImmobilisation ? "Immobilisation" : "Charge"}
    </span>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  if (pct >= 80) return null; // Don't clutter high-confidence cards
  return (
    <span
      style={{
        ...typography.caption.desktop,
        color: colors.text.muted,
        backgroundColor: colors.surface.secondary,
        border: `1px solid ${colors.border.subtle}`,
        borderRadius: radius.full,
        padding: `2px ${spacing.scale[2]}`,
      }}
    >
      Confiance {pct}%
    </span>
  );
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}
