"use client";

import { useState } from "react";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { typography } from "@/design-system/theme/typography";
import type { AiActivityEvent, AiActivityStep } from "@/lib/lmnp/types/ai-activity";
import { useLmnp } from "@/lib/lmnp/store";

// ─── Event selection ──────────────────────────────────────────────────────────

/**
 * Selects the single most important event to show as the primary insight.
 * Priority: pending conflict → latest non-dismissed event.
 */
export function selectPrimaryInsightEvent(
  events: AiActivityEvent[],
  step: AiActivityStep,
): AiActivityEvent | null {
  const stepEvents = events
    .filter((ev) => ev.step === step)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (stepEvents.length === 0) return null;

  // Always surface a pending conflict first
  const pendingConflict = stepEvents.find(
    (ev) => ev.type === "conflict_detected" && ev.resolutionState === "pending",
  );
  if (pendingConflict) return pendingConflict;

  // Latest non-dismissed event is the primary insight
  return stepEvents.find((ev) => ev.resolutionState !== "dismissed") ?? null;
}

// ─── Severity display config ──────────────────────────────────────────────────

type DisplayConfig = {
  background: string;
  border: string;
  iconBackground: string;
  iconColor: string;
  iconChar: string;
  titleColor: string;
};

function displayConfig(event: AiActivityEvent): DisplayConfig {
  switch (event.severity) {
    case "success":
      return {
        background: colors.success.surface,
        border: colors.success.border,
        iconBackground: colors.success.DEFAULT,
        iconColor: "#fff",
        iconChar: "✓",
        titleColor: colors.success.DEFAULT,
      };
    case "warning":
    case "blocking":
      return {
        background: colors.warning.surface,
        border: colors.warning.border,
        iconBackground: colors.warning.DEFAULT,
        iconColor: "#fff",
        iconChar: "⚠",
        titleColor: colors.warning.DEFAULT,
      };
    case "info":
    default:
      return {
        background: colors.surface.secondary,
        border: colors.border.default,
        iconBackground: colors.text.muted,
        iconColor: "#fff",
        iconChar: "i",
        titleColor: colors.text.primary,
      };
  }
}

// ─── Conflict resolution section ──────────────────────────────────────────────

interface ConflictPanelProps {
  event: AiActivityEvent;
  onKeepExisting: () => void;
  onUseNew: () => void;
}

function ConflictPanel({ event, onKeepExisting, onUseNew }: ConflictPanelProps) {
  const fields = event.metadata?.conflictingFields ?? [];
  const prev = event.metadata?.previousValues ?? {};
  const next = event.metadata?.nextValues ?? {};

  return (
    <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
      {fields.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "8px",
          }}
        >
          {/* Existing */}
          <div
            style={{
              background: colors.surface.primary,
              border: `1px solid ${colors.border.default}`,
              borderRadius: radius.md,
              padding: "12px",
            }}
          >
            <div
              style={{
                fontSize: typography.fontSize.xs,
                fontWeight: 600,
                color: colors.text.muted,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: "8px",
              }}
            >
              Données actuelles
            </div>
            {fields.map((f) => (
              <div key={f} style={{ marginBottom: "4px" }}>
                <span
                  style={{ fontSize: typography.fontSize.xs, color: colors.text.muted }}
                >
                  {f}
                </span>
                <div
                  style={{
                    fontSize: typography.fontSize.sm,
                    fontWeight: 600,
                    color: colors.text.primary,
                  }}
                >
                  {String(prev[f] ?? "—")}
                </div>
              </div>
            ))}
          </div>

          {/* Detected */}
          <div
            style={{
              background: "#FFF8F3",
              border: `1px solid ${colors.warning.border}`,
              borderRadius: radius.md,
              padding: "12px",
            }}
          >
            <div
              style={{
                fontSize: typography.fontSize.xs,
                fontWeight: 600,
                color: colors.warning.DEFAULT,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: "8px",
              }}
            >
              Valeurs détectées
            </div>
            {fields.map((f) => (
              <div key={f} style={{ marginBottom: "4px" }}>
                <span
                  style={{ fontSize: typography.fontSize.xs, color: colors.text.muted }}
                >
                  {f}
                </span>
                <div
                  style={{
                    fontSize: typography.fontSize.sm,
                    fontWeight: 600,
                    color: colors.warning.DEFAULT,
                  }}
                >
                  {String(next[f] ?? "—")}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: "8px" }}>
        <button
          onClick={onKeepExisting}
          style={{
            flex: 1,
            padding: "10px 16px",
            borderRadius: radius.md,
            border: `1px solid ${colors.border.default}`,
            background: colors.surface.primary,
            color: colors.text.secondary,
            fontSize: typography.fontSize.sm,
            fontWeight: 500,
            cursor: "pointer",
            transition: "background 0.15s",
          }}
        >
          Conserver les données actuelles
        </button>
        <button
          onClick={onUseNew}
          style={{
            flex: 1,
            padding: "10px 16px",
            borderRadius: radius.md,
            border: `1px solid ${colors.warning.border}`,
            background: colors.warning.light,
            color: colors.warning.DEFAULT,
            fontSize: typography.fontSize.sm,
            fontWeight: 600,
            cursor: "pointer",
            transition: "background 0.15s",
          }}
        >
          Utiliser les nouvelles valeurs
        </button>
      </div>
    </div>
  );
}

// ─── Resolution badge ─────────────────────────────────────────────────────────

function ConflictResolutionBadge({ event }: { event: AiActivityEvent }) {
  if (
    event.type !== "conflict_detected" ||
    !event.resolvedAt ||
    event.resolutionState === "pending"
  )
    return null;

  const label =
    event.resolutionState === "dismissed" ? "Conflit ignoré" : "Conflit résolu";

  const date = new Date(event.resolvedAt).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
  });

  return (
    <div
      style={{
        marginTop: "12px",
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "6px 10px",
        borderRadius: radius.md,
        background: colors.success.surface,
        border: `1px solid ${colors.success.border}`,
        width: "fit-content",
      }}
    >
      <span style={{ color: colors.success.DEFAULT, fontSize: 12 }}>✓</span>
      <span style={{ fontSize: typography.fontSize.xs, color: colors.success.DEFAULT }}>
        {label} le {date}
      </span>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

interface PrimaryAiInsightCardProps {
  /** Full activity feed for the workspace. */
  events: AiActivityEvent[];
  /** The workflow step to filter events by. */
  step: AiActivityStep;
  /**
   * Called when user clicks "Voir les modifications" on an enrichment card.
   * Use to open the form in edit mode.
   */
  onViewDetails?: () => void;
  /** Called when user clicks "Réimporter le document" on a failed card. */
  onReimport?: () => void;
  /**
   * If true, the card is hidden even when events exist.
   * Use to suppress during active analysis animation.
   */
  hidden?: boolean;
}

export function PrimaryAiInsightCard({
  events,
  step,
  onViewDetails,
  onReimport,
  hidden = false,
}: PrimaryAiInsightCardProps) {
  const { dispatch } = useLmnp();
  const [resolving, setResolving] = useState(false);

  const primary = selectPrimaryInsightEvent(events, step);

  if (!primary || hidden) return null;

  const cfg = displayConfig(primary);
  const isConflictPending =
    primary.type === "conflict_detected" && primary.resolutionState === "pending";
  const isConflictResolved =
    primary.type === "conflict_detected" &&
    (primary.resolutionState === "resolved" || primary.resolutionState === "dismissed");
  const isEnrichment = primary.type === "document_enriched";
  const isFailed = primary.type === "analysis_failed";
  const isIgnored = primary.type === "document_ignored";
  const isValidation = primary.type === "validation";

  const handleKeepExisting = () => {
    setResolving(true);
    dispatch({
      type: "RESOLVE_AI_ACTIVITY_EVENT",
      eventId: primary.id,
      resolutionState: "resolved",
    });
  };

  const handleUseNew = () => {
    setResolving(true);
    dispatch({
      type: "RESOLVE_AI_ACTIVITY_EVENT",
      eventId: primary.id,
      resolutionState: "resolved",
    });
    onViewDetails?.();
  };

  const handleDismiss = () => {
    dispatch({
      type: "DISMISS_AI_ACTIVITY_EVENT",
      eventId: primary.id,
    });
  };

  return (
    <div
      className="animate-[fiscal-fade-in_350ms_cubic-bezier(0.16,1,0.3,1)_both]"
      style={{
        background: cfg.background,
        border: `1.5px solid ${cfg.border}`,
        borderRadius: radius.xl,
        padding: "20px 24px",
        boxShadow: shadows.card.default,
        opacity: resolving ? 0.65 : 1,
        transition: "opacity 0.25s ease",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
        {/* Prominent icon */}
        <div
          aria-hidden
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: cfg.iconBackground,
            color: cfg.iconColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 15,
            fontWeight: 700,
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          {cfg.iconChar}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title */}
          <div
            style={{
              fontSize: typography.fontSize.base,
              fontWeight: 700,
              color: cfg.titleColor,
              lineHeight: 1.3,
              marginBottom: "4px",
            }}
          >
            {primary.title}
          </div>

          {/* Description */}
          <p
            style={{
              margin: 0,
              fontSize: typography.fontSize.sm,
              color: colors.text.secondary,
              lineHeight: 1.6,
            }}
          >
            {primary.description}
          </p>

          {/* Conflict: show comparison + actions */}
          {isConflictPending && (
            <ConflictPanel
              event={primary}
              onKeepExisting={handleKeepExisting}
              onUseNew={handleUseNew}
            />
          )}

          {/* Conflict resolved badge */}
          {isConflictResolved && <ConflictResolutionBadge event={primary} />}

          {/* Enrichment: offer to view details */}
          {isEnrichment && onViewDetails && !isConflictPending && (
            <button
              onClick={onViewDetails}
              style={{
                marginTop: "12px",
                padding: "0",
                border: "none",
                background: "none",
                color: colors.text.accent,
                fontSize: typography.fontSize.sm,
                fontWeight: 600,
                cursor: "pointer",
                textDecoration: "underline",
                textDecorationColor: "transparent",
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.textDecorationColor = colors.text.accent;
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.textDecorationColor = "transparent";
              }}
            >
              Voir les modifications →
            </button>
          )}

          {/* Analysis failed: offer reimport */}
          {isFailed && onReimport && (
            <button
              onClick={onReimport}
              style={{
                marginTop: "12px",
                display: "inline-block",
                padding: "8px 16px",
                borderRadius: radius.md,
                border: `1px solid ${colors.border.default}`,
                background: colors.surface.primary,
                color: colors.text.secondary,
                fontSize: typography.fontSize.sm,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Réimporter le document
            </button>
          )}
        </div>

        {/* Dismiss button — only for non-blocking, non-conflict-pending events */}
        {!isConflictPending && primary.severity !== "blocking" && !isValidation && (
          <button
            onClick={handleDismiss}
            aria-label="Fermer"
            title="Fermer"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: colors.text.muted,
              fontSize: 18,
              lineHeight: 1,
              padding: 4,
              flexShrink: 0,
              marginTop: -2,
              borderRadius: radius.sm,
              transition: "color 0.15s",
            }}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
