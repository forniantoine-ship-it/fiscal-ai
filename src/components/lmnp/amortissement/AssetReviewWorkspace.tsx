"use client";

/**
 * Asset Review Workspace
 *
 * The core user experience of the LMNP platform.
 * Every BusinessAsset is reviewed here before the declaration is generated.
 *
 * Design principle:
 *   The user MUST understand every accounting decision.
 *   "I understand my LMNP accounting" — NOT "mysterious accounting."
 *
 * Each asset shows:
 *   - Label, supplier, total amount, duration
 *   - Fiscal treatment (plain French — never "immobilisation corporelle")
 *   - Linked invoices
 *   - AI explanation + reasons WHY
 *   - Validation status + actions
 */

import { useState } from "react";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import type {
  BusinessAsset,
  FiscalDecision,
  GuidanceMessage,
  WorkGroup,
} from "@/lib/lmnp/engine/business-engine.types";
import { CATEGORY_LABELS_FR } from "@/lib/lmnp/engine/business-asset-engine";
import {
  generateAssetGuidance,
  generateDeclarationGuidance,
} from "@/lib/lmnp/engine/user-guidance-engine";
import {
  getDurationRangeLabel,
  getDurationWarning,
} from "@/lib/lmnp/engine/fiscal-knowledge-rules";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AssetReviewWorkspaceProps {
  assets: BusinessAsset[];
  decisions: FiscalDecision[];
  workGroups: WorkGroup[];
  onValidate: (assetId: string) => void;
  onEdit: (assetId: string) => void;
  onSplit: (assetId: string, invoiceDocumentId: string) => void;
}

// ---------------------------------------------------------------------------
// Workspace root
// ---------------------------------------------------------------------------

export function AssetReviewWorkspace({
  assets,
  decisions,
  workGroups,
  onValidate,
  onEdit,
  onSplit,
}: AssetReviewWorkspaceProps) {
  const globalGuidance = generateDeclarationGuidance(assets, decisions, workGroups);
  const blockingMessages = globalGuidance.filter((m) => m.severity === "blocking");
  const warningMessages = globalGuidance.filter((m) => m.severity === "warning");

  const pendingAssets = assets.filter((a) => !a.userValidated);
  const validatedAssets = assets.filter((a) => a.userValidated);

  if (assets.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-8">
      {/* Global guidance banner */}
      {blockingMessages.length > 0 || warningMessages.length > 0 ? (
        <GuidanceBannerList messages={[...blockingMessages, ...warningMessages]} />
      ) : null}

      {/* Progress summary */}
      <ReviewProgressBar total={assets.length} validated={validatedAssets.length} />

      {/* Pending validation */}
      {pendingAssets.length > 0 ? (
        <section className="space-y-4">
          <SectionHeader
            title="À valider"
            subtitle={`${pendingAssets.length} actif${pendingAssets.length > 1 ? "s" : ""} en attente de votre confirmation.`}
          />
          <div className="space-y-4">
            {pendingAssets.map((asset) => {
              const decision = decisions.find((d) => d.assetId === asset.id);
              return (
                <AssetReviewCard
                  key={asset.id}
                  asset={asset}
                  decision={decision}
                  onValidate={onValidate}
                  onEdit={onEdit}
                  onSplit={onSplit}
                  isHighlighted
                />
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Validated assets */}
      {validatedAssets.length > 0 ? (
        <section className="space-y-4">
          <SectionHeader
            title="Actifs validés"
            subtitle={`${validatedAssets.length} actif${validatedAssets.length > 1 ? "s" : ""} confirmé${validatedAssets.length > 1 ? "s" : ""}.`}
          />
          <div className="space-y-3">
            {validatedAssets.map((asset) => {
              const decision = decisions.find((d) => d.assetId === asset.id);
              return (
                <AssetReviewCard
                  key={asset.id}
                  asset={asset}
                  decision={decision}
                  onValidate={onValidate}
                  onEdit={onEdit}
                  onSplit={onSplit}
                  isHighlighted={false}
                />
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AssetReviewCard — the core atomic unit of the workspace
// ---------------------------------------------------------------------------

interface AssetReviewCardProps {
  asset: BusinessAsset;
  decision?: FiscalDecision;
  onValidate: (id: string) => void;
  onEdit: (id: string) => void;
  onSplit: (assetId: string, invoiceDocumentId: string) => void;
  isHighlighted: boolean;
}

function AssetReviewCard({
  asset,
  decision,
  onValidate,
  onEdit,
  onSplit,
  isHighlighted,
}: AssetReviewCardProps) {
  const [explanationOpen, setExplanationOpen] = useState(false);
  const [invoicesOpen, setInvoicesOpen] = useState(false);

  const guidance = decision ? generateAssetGuidance(asset, decision) : [];
  const durationWarning = getDurationWarning(asset.category, asset.amortizationYears);
  const isImmobilisation = asset.fiscalTreatment === "immobilisation";
  const categoryLabel = CATEGORY_LABELS_FR[asset.category] ?? asset.category;

  const fmtEur = (n: number) =>
    new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(n);

  const borderColor = asset.userValidated
    ? colors.border.default
    : isHighlighted
      ? (colors.orange[300] ?? "#F5D4B8")
      : colors.border.default;

  return (
    <article
      style={{
        backgroundColor: colors.surface.primary,
        border: `1px solid ${borderColor}`,
        borderRadius: radius.xl,
        boxShadow: isHighlighted ? shadows.workflow.active : shadows.card.default,
        padding: spacing.card.md,
        transition: "box-shadow 200ms ease",
      }}
    >
      {/* ── Header row ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start gap-4">
        {/* Left: label + badges */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CategoryPill label={categoryLabel} />
            <TreatmentPill isImmobilisation={isImmobilisation} />
            {!asset.userValidated && (
              <span
                style={{
                  ...typography.caption.desktop,
                  color: colors.orange[700] ?? "#B45309",
                  backgroundColor: colors.orange[50] ?? "#FFF7ED",
                  border: `1px solid ${colors.orange[200] ?? "#FED7AA"}`,
                  borderRadius: radius.full,
                  padding: `2px ${spacing.scale[2]}`,
                  fontWeight: typography.fontWeight.medium,
                }}
              >
                À valider
              </span>
            )}
            {asset.userValidated && (
              <span
                style={{
                  ...typography.caption.desktop,
                  color: colors.success?.DEFAULT ?? "#5E8A66",
                  backgroundColor: colors.success?.muted ?? "#F0FFF4",
                  border: `1px solid ${colors.success?.light ?? "#C6F6D5"}`,
                  borderRadius: radius.full,
                  padding: `2px ${spacing.scale[2]}`,
                }}
              >
                ✓ Validé
              </span>
            )}
          </div>

          <h3
            className="mt-2"
            style={{
              fontFamily: typography.fontFamily.display,
              fontSize: typography.fontSize.xl,
              fontWeight: typography.fontWeight.regular,
              lineHeight: typography.lineHeight.title,
              letterSpacing: typography.letterSpacing.title,
              color: colors.text.primary,
            }}
          >
            {asset.label}
          </h3>
        </div>

        {/* Right: amount + annual */}
        <div className="text-right shrink-0">
          <p
            style={{
              fontFamily: typography.fontFamily.display,
              fontSize: typography.fontSize["2xl"],
              fontWeight: typography.fontWeight.semibold,
              color: colors.text.primary,
              lineHeight: 1,
            }}
          >
            {fmtEur(asset.amount)}
          </p>
          {isImmobilisation && decision && decision.annualAmortization > 0 ? (
            <p
              className="mt-1"
              style={{ ...typography.caption.desktop, color: colors.text.muted }}
            >
              {fmtEur(decision.annualAmortization)} / an
            </p>
          ) : null}
          {isImmobilisation && asset.amortizationYears > 0 ? (
            <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>
              sur {asset.amortizationYears} ans
            </p>
          ) : null}
        </div>
      </div>

      {/* ── Duration warning ───────────────────────────────────────────────── */}
      {durationWarning ? (
        <div
          className="mt-3 flex gap-2"
          style={{
            backgroundColor: "#FFFBEB",
            border: `1px solid #FDE68A`,
            borderRadius: radius.lg,
            padding: `${spacing.scale[3]} ${spacing.scale[4]}`,
          }}
        >
          <span style={{ color: "#D97706", flexShrink: 0 }}>⚠</span>
          <p style={{ ...typography.caption.desktop, color: "#92400E" }}>{durationWarning}</p>
        </div>
      ) : null}

      {/* ── AI explanation (collapsible) ───────────────────────────────────── */}
      <div className="mt-4">
        <button
          type="button"
          onClick={() => setExplanationOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2"
          style={{
            backgroundColor: colors.surface.secondary,
            border: `1px solid ${colors.border.subtle}`,
            borderRadius: radius.lg,
            padding: `${spacing.scale[3]} ${spacing.scale[4]}`,
            cursor: "pointer",
          }}
        >
          <span className="flex items-center gap-2">
            <span style={{ color: colors.text.accent }}>✦</span>
            <span style={{ ...typography.caption.desktop, fontWeight: typography.fontWeight.medium, color: colors.text.secondary }}>
              Pourquoi ce traitement fiscal ?
            </span>
          </span>
          <span style={{ ...typography.caption.desktop, color: colors.text.muted }}>
            {explanationOpen ? "▲" : "▼"}
          </span>
        </button>

        {explanationOpen ? (
          <div
            className="mt-2 space-y-3"
            style={{
              backgroundColor: colors.surface.secondary,
              border: `1px solid ${colors.border.subtle}`,
              borderRadius: radius.lg,
              padding: spacing.card.sm,
            }}
          >
            <p style={{ ...typography.body.desktop, fontSize: typography.fontSize.sm, color: colors.text.secondary }}>
              {asset.explanation}
            </p>
            {decision && decision.reasons.length > 0 ? (
              <ul className="space-y-1.5 mt-3">
                {decision.reasons.map((reason, i) => (
                  <li key={i} className="flex gap-2">
                    <span style={{ color: colors.text.accent, flexShrink: 0, marginTop: "2px" }}>→</span>
                    <span style={{ ...typography.caption.desktop, color: colors.text.secondary }}>
                      {reason}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {/* Duration range educational note */}
            {isImmobilisation ? (
              <p
                className="mt-3 border-t pt-3"
                style={{
                  ...typography.caption.desktop,
                  color: colors.text.muted,
                  borderColor: colors.border.subtle,
                }}
              >
                Durée habituelle pour cette catégorie : {getDurationRangeLabel(asset.category)}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ── Linked invoices (collapsible) ──────────────────────────────────── */}
      {asset.sourceDocumentIds.length > 0 ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setInvoicesOpen((v) => !v)}
            className="flex items-center gap-2"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <span style={{ ...typography.caption.desktop, color: colors.text.muted }}>
              {asset.sourceDocumentIds.length} facture{asset.sourceDocumentIds.length > 1 ? "s" : ""} liée{asset.sourceDocumentIds.length > 1 ? "s" : ""}
            </span>
            <span style={{ ...typography.caption.desktop, color: colors.text.muted }}>
              {invoicesOpen ? "▲" : "▼"}
            </span>
          </button>

          {invoicesOpen ? (
            <div className="mt-2 space-y-2">
              {asset.sourceDocumentIds.map((docId, i) => (
                <div
                  key={docId}
                  className="flex items-center justify-between gap-4"
                  style={{
                    backgroundColor: colors.surface.secondary,
                    borderRadius: radius.lg,
                    padding: `${spacing.scale[2]} ${spacing.scale[4]}`,
                    border: `1px solid ${colors.border.subtle}`,
                  }}
                >
                  <p style={{ ...typography.caption.desktop, color: colors.text.secondary }}>
                    Document {i + 1}
                  </p>
                  <button
                    type="button"
                    onClick={() => onSplit(asset.id, docId)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      ...typography.caption.desktop,
                      color: colors.text.muted,
                    }}
                  >
                    Extraire
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Action row ─────────────────────────────────────────────────────── */}
      <div className="mt-5 flex flex-wrap gap-3">
        {!asset.userValidated ? (
          <ActionButton
            label="Confirmer cet actif"
            variant="primary"
            onClick={() => onValidate(asset.id)}
          />
        ) : null}
        <ActionButton
          label="Modifier"
          variant="secondary"
          onClick={() => onEdit(asset.id)}
        />
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CategoryPill({ label }: { label: string }) {
  return (
    <span
      style={{
        ...typography.caption.desktop,
        color: colors.text.secondary,
        backgroundColor: colors.surface.secondary,
        border: `1px solid ${colors.border.subtle}`,
        borderRadius: radius.full,
        padding: `2px ${spacing.scale[2]}`,
      }}
    >
      {label}
    </span>
  );
}

function TreatmentPill({ isImmobilisation }: { isImmobilisation: boolean }) {
  return (
    <span
      style={{
        ...typography.caption.desktop,
        color: isImmobilisation
          ? (colors.orange[700] ?? "#B45309")
          : colors.text.secondary,
        backgroundColor: isImmobilisation
          ? (colors.orange[50] ?? "#FFF7ED")
          : colors.surface.secondary,
        border: `1px solid ${isImmobilisation ? (colors.orange[200] ?? "#FED7AA") : colors.border.subtle}`,
        borderRadius: radius.full,
        padding: `2px ${spacing.scale[2]}`,
      }}
    >
      {isImmobilisation ? "Amorti sur plusieurs années" : "Déduit cette année"}
    </span>
  );
}

function ActionButton({
  label,
  variant,
  onClick,
}: {
  label: string;
  variant: "primary" | "secondary";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontFamily: typography.fontFamily.sans,
        fontSize: typography.fontSize.sm,
        fontWeight: typography.fontWeight.medium,
        borderRadius: radius.lg,
        padding: `${spacing.scale[2]} ${spacing.scale[4]}`,
        cursor: "pointer",
        border: variant === "primary"
          ? "none"
          : `1px solid ${colors.border.default}`,
        backgroundColor: variant === "primary"
          ? (colors.orange[500] ?? "#F07C3A")
          : colors.surface.secondary,
        color: variant === "primary" ? "#FFFFFF" : colors.text.secondary,
      }}
    >
      {label}
    </button>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2
        style={{
          fontFamily: typography.fontFamily.display,
          fontSize: typography.fontSize.lg,
          fontWeight: typography.fontWeight.regular,
          color: colors.text.primary,
        }}
      >
        {title}
      </h2>
      <p
        className="mt-1"
        style={{ ...typography.caption.desktop, color: colors.text.muted }}
      >
        {subtitle}
      </p>
    </div>
  );
}

function ReviewProgressBar({ total, validated }: { total: number; validated: number }) {
  const pct = total > 0 ? Math.round((validated / total) * 100) : 0;
  return (
    <div
      style={{
        backgroundColor: colors.surface.secondary,
        borderRadius: radius.xl,
        border: `1px solid ${colors.border.subtle}`,
        padding: `${spacing.scale[4]} ${spacing.scale[5]}`,
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <p
          style={{
            fontFamily: typography.fontFamily.sans,
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.medium,
            color: colors.text.secondary,
          }}
        >
          Validation des actifs
        </p>
        <p
          style={{
            fontFamily: typography.fontFamily.sans,
            fontSize: typography.fontSize.sm,
            color: colors.text.muted,
          }}
        >
          {validated} / {total}
        </p>
      </div>
      <div
        style={{
          height: "4px",
          backgroundColor: colors.border.subtle,
          borderRadius: radius.full,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            backgroundColor: pct === 100 ? (colors.success?.DEFAULT ?? "#5E8A66") : (colors.orange[400] ?? "#F08E51"),
            borderRadius: radius.full,
            transition: "width 400ms ease",
          }}
        />
      </div>
    </div>
  );
}

function GuidanceBannerList({ messages }: { messages: GuidanceMessage[] }) {
  return (
    <div className="space-y-2">
      {messages.map((msg) => (
        <GuidanceBanner key={msg.id} message={msg} />
      ))}
    </div>
  );
}

function GuidanceBanner({ message }: { message: GuidanceMessage }) {
  const isBlocking = message.severity === "blocking";
  const isWarning = message.severity === "warning";

  const bg = isBlocking ? "#FFF7ED" : isWarning ? "#FFFBEB" : colors.surface.secondary;
  const border = isBlocking ? "#FED7AA" : isWarning ? "#FDE68A" : colors.border.subtle;
  const textColor = isBlocking ? "#92400E" : isWarning ? "#78350F" : colors.text.secondary;
  const icon = isBlocking ? "●" : isWarning ? "⚠" : "✦";
  const iconColor = isBlocking ? (colors.orange[500] ?? "#F07C3A") : isWarning ? "#D97706" : colors.text.accent;

  return (
    <div
      className="flex items-start gap-3"
      style={{
        backgroundColor: bg,
        border: `1px solid ${border}`,
        borderRadius: radius.lg,
        padding: `${spacing.scale[3]} ${spacing.scale[4]}`,
      }}
    >
      <span style={{ color: iconColor, flexShrink: 0, marginTop: "1px" }}>{icon}</span>
      <div className="flex-1">
        <p style={{ ...typography.caption.desktop, fontWeight: typography.fontWeight.medium, color: textColor }}>
          {message.title}
        </p>
        <p style={{ ...typography.caption.desktop, color: textColor, opacity: 0.85 }}>
          {message.body}
        </p>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="text-center"
      style={{
        backgroundColor: colors.surface.secondary,
        border: `1px solid ${colors.border.subtle}`,
        borderRadius: radius.xl,
        padding: spacing.card.xl,
      }}
    >
      <p
        style={{
          fontFamily: typography.fontFamily.display,
          fontSize: typography.fontSize.lg,
          color: colors.text.secondary,
        }}
      >
        Aucun actif à réviser pour le moment
      </p>
      <p
        className="mt-2"
        style={{ ...typography.body.desktop, fontSize: typography.fontSize.sm, color: colors.text.muted }}
      >
        Téléversez vos factures de travaux et de mobilier, puis confirmez les regroupements proposés
        par l'IA pour voir apparaître vos actifs ici.
      </p>
    </div>
  );
}
