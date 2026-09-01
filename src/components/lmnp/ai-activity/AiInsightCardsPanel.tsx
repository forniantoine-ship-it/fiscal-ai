"use client";

/**
 * AiInsightCardsPanel — canonical persistent AI memory display.
 *
 * ARCHITECTURE RULE:
 * Every uploaded document MUST permanently create a visible explanatory card.
 * Cards remain visible until the user explicitly dismisses them.
 * Cards are sourced exclusively from workspace.aiActivityFeed — no local state.
 *
 * Layout placement:
 *   ZONE 1 — Upload library
 *   ZONE 2 — AiInsightCardsPanel  ← this component
 *   ZONE 3 — Retained business data
 */

import { traceCreditConflictResolution } from "@/lib/lmnp/services/credit-conflict-resolution-timeline";
import { useLmnp } from "@/lib/lmnp/store";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { typography } from "@/design-system/theme/typography";
import type { AiActivityEvent, AiActivityStep } from "@/lib/lmnp/types/ai-activity";

// ─── Color palette by event type ─────────────────────────────────────────────

type CardPalette = {
  background: string;
  border: string;
  iconBackground: string;
  iconColor: string;
  iconChar: string;
  titleColor: string;
};

function paletteForEvent(event: AiActivityEvent): CardPalette {
  // Resolved conflicts show as success
  if (
    event.type === "conflict_detected" &&
    event.resolutionState === "resolved"
  ) {
    return {
      background: colors.success.surface,
      border: colors.success.border,
      iconBackground: colors.success.DEFAULT,
      iconColor: "#fff",
      iconChar: "✓",
      titleColor: colors.success.DEFAULT,
    };
  }

  // Failed analysis — red
  if (event.type === "analysis_failed") {
    return {
      background: colors.error.surface,
      border: colors.error.border,
      iconBackground: colors.error.DEFAULT,
      iconColor: "#fff",
      iconChar: "✕",
      titleColor: colors.error.DEFAULT,
    };
  }

  // Conflict pending — orange
  if (event.type === "conflict_detected") {
    return {
      background: colors.warning.surface,
      border: colors.warning.border,
      iconBackground: colors.warning.DEFAULT,
      iconColor: "#fff",
      iconChar: "⚠",
      titleColor: colors.warning.DEFAULT,
    };
  }

  // Risk or recommendation — orange
  if (event.type === "risk_warning" || event.type === "recommendation") {
    return {
      background: colors.warning.surface,
      border: colors.warning.border,
      iconBackground: colors.warning.DEFAULT,
      iconColor: "#fff",
      iconChar: "⚠",
      titleColor: colors.warning.DEFAULT,
    };
  }

  // Enriched / merge / validation — green
  if (
    event.type === "document_enriched" ||
    event.type === "entity_merge" ||
    event.type === "validation"
  ) {
    return {
      background: colors.success.surface,
      border: colors.success.border,
      iconBackground: colors.success.DEFAULT,
      iconColor: "#fff",
      iconChar: "✓",
      titleColor: colors.success.DEFAULT,
    };
  }

  // No change / ignored / informational — blue (Informations déjà connues)
  return {
    // Soft blue that reads as "informational" without conflicting with the warm palette
    background: "#EEF4FA",
    border: "#BFCFDE",
    iconBackground: "#4A87B4",
    iconColor: "#fff",
    iconChar: "i",
    titleColor: "#2C6490",
  };
}

// ─── Conflict field comparison rows ──────────────────────────────────────────

function ConflictFieldRows({ event }: { event: AiActivityEvent }) {
  const fields = event.metadata?.conflictingFields ?? [];
  const prev = event.metadata?.previousValues ?? {};
  const next = event.metadata?.nextValues ?? {};

  if (fields.length === 0) return null;

  return (
    <ul
      style={{
        margin: "10px 0 0",
        padding: 0,
        listStyle: "none",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      {fields.map((field) => (
        <li
          key={field}
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "4px 24px",
            fontSize: typography.fontSize.sm,
            color: colors.text.secondary,
          }}
        >
          <span>
            <span style={{ color: colors.text.muted }}>• </span>
            <span style={{ color: colors.text.muted }}>{field} précédent : </span>
            <strong style={{ color: colors.text.primary }}>{String(prev[field] ?? "—")}</strong>
          </span>
          <span>
            <span style={{ color: colors.text.muted }}>Nouveau {field.toLowerCase()} : </span>
            <strong style={{ color: colors.warning.DEFAULT }}>
              {String(next[field] ?? "—")}
            </strong>
          </span>
        </li>
      ))}
    </ul>
  );
}

// ─── Conflict resolution actions ─────────────────────────────────────────────

function ConflictActions({
  event,
  onKeepExisting,
  onUseNew,
}: {
  event: AiActivityEvent;
  onKeepExisting: () => void;
  onUseNew: () => void;
}) {
  return (
    <div style={{ marginTop: 16 }}>
      <p
        style={{
          margin: "0 0 10px",
          fontSize: typography.fontSize.sm,
          color: colors.text.secondary,
          fontStyle: "italic",
        }}
      >
        Quelle version souhaitez-vous utiliser pour ce financement ?
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <ActionButton
          onClick={onKeepExisting}
          variant="primary"
          color={colors.warning.DEFAULT}
        >
          Conserver l&apos;ancien
        </ActionButton>
        <ActionButton onClick={onUseNew} variant="outline">
          Utiliser le nouveau
        </ActionButton>
        <ActionButton
          onClick={() => {
            /* future feature */
          }}
          variant="ghost"
        >
          Comparer les documents
        </ActionButton>
      </div>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  variant,
  color,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant: "primary" | "outline" | "ghost";
  color?: string;
}) {
  const baseStyle: React.CSSProperties = {
    padding: "8px 14px",
    borderRadius: radius.md,
    fontSize: typography.fontSize.sm,
    fontWeight: 600,
    cursor: "pointer",
    lineHeight: 1.4,
    transition: "opacity 0.15s",
    border: "1px solid transparent",
  };

  const styles: Record<string, React.CSSProperties> = {
    primary: {
      ...baseStyle,
      background: colors.warning.light,
      borderColor: colors.warning.border,
      color: color ?? colors.warning.DEFAULT,
    },
    outline: {
      ...baseStyle,
      background: colors.surface.primary,
      borderColor: colors.border.default,
      color: colors.text.secondary,
    },
    ghost: {
      ...baseStyle,
      background: "none",
      borderColor: colors.border.default,
      color: colors.text.secondary,
    },
  };

  return (
    <button onClick={onClick} style={styles[variant]}>
      {children}
    </button>
  );
}

// ─── Resolved conflict display ────────────────────────────────────────────────

function ResolvedConflictNote({ event }: { event: AiActivityEvent }) {
  const usedNew = event.resolutionState === "resolved";
  const date = event.resolvedAt
    ? new Date(event.resolvedAt).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
      })
    : null;

  return (
    <div
      style={{
        marginTop: 10,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: radius.md,
        background: colors.success.surface,
        border: `1px solid ${colors.success.border}`,
      }}
    >
      <span style={{ color: colors.success.DEFAULT, fontSize: 12 }}>✓</span>
      <span style={{ fontSize: typography.fontSize.xs, color: colors.success.DEFAULT }}>
        Résolu{date ? ` le ${date}` : ""} — données{" "}
        {usedNew ? "nouvelles" : "précédentes"} conservées
      </span>
    </div>
  );
}

// ─── Individual insight card ──────────────────────────────────────────────────

interface InsightCardProps {
  event: AiActivityEvent;
  onDismiss: () => void;
  onResolveKeepExisting: () => void;
  onResolveUseNew: () => void;
  onReimport?: () => void;
}

function InsightCard({
  event,
  onDismiss,
  onResolveKeepExisting,
  onResolveUseNew,
  onReimport,
}: InsightCardProps) {
  const palette = paletteForEvent(event);
  const isConflictPending =
    event.type === "conflict_detected" && event.resolutionState === "pending";
  const isConflictResolved =
    event.type === "conflict_detected" && event.resolutionState === "resolved";
  const isFailed = event.type === "analysis_failed";
  const businessSummary = event.metadata?.businessSummary;

  return (
    <div
      className="animate-[fiscal-fade-in_350ms_cubic-bezier(0.16,1,0.3,1)_both]"
      style={{
        background: palette.background,
        border: `1px solid ${palette.border}`,
        borderRadius: radius.xl,
        padding: "16px 20px",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        {/* Icon */}
        <div
          aria-hidden
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: palette.iconBackground,
            color: palette.iconColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 700,
            flexShrink: 0,
            marginTop: 1,
          }}
        >
          {palette.iconChar}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title */}
          <div
            style={{
              fontSize: typography.fontSize.sm,
              fontWeight: 700,
              color: palette.titleColor,
              lineHeight: 1.3,
              marginBottom: 3,
            }}
          >
            {event.title}
          </div>

          {/* Description */}
          <p
            style={{
              margin: 0,
              fontSize: typography.fontSize.sm,
              color: colors.text.secondary,
              lineHeight: 1.55,
            }}
          >
            {event.description}
          </p>

          {/* Business summary line (e.g. "Intérêts 2025 mis à jour : 1 387 €") */}
          {businessSummary && (
            <p
              style={{
                margin: "6px 0 0",
                fontSize: typography.fontSize.sm,
                color: colors.text.primary,
                fontWeight: 600,
              }}
            >
              {businessSummary}
            </p>
          )}

          {/* Conflict pending: field comparison + actions */}
          {isConflictPending && (
            <>
              <ConflictFieldRows event={event} />
              <ConflictActions
                event={event}
                onKeepExisting={onResolveKeepExisting}
                onUseNew={onResolveUseNew}
              />
            </>
          )}

          {/* Conflict resolved: resolution note */}
          {isConflictResolved && <ResolvedConflictNote event={event} />}

          {/* Analysis failed: reimport action */}
          {isFailed && onReimport && (
            <button
              onClick={onReimport}
              style={{
                marginTop: 10,
                padding: "7px 14px",
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

        {/* Dismiss button — not shown for pending conflicts */}
        {!isConflictPending && (
          <button
            onClick={onDismiss}
            aria-label="Fermer"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: colors.text.muted,
              fontSize: 20,
              lineHeight: 1,
              padding: "0 2px",
              flexShrink: 0,
              marginTop: -2,
              borderRadius: radius.sm,
            }}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

interface AiInsightCardsPanelProps {
  /** Full activity feed for the workspace. */
  events: AiActivityEvent[];
  /** The workflow step to filter events by. */
  step: AiActivityStep;
  /**
   * Called when user clicks "Réimporter" on a failed analysis card.
   */
  onReimport?: () => void;
  /**
   * Called when user chooses "Utiliser le nouveau" on a conflict card.
   * The parent may need to update form values after resolution.
   */
  onConflictUseNew?: (eventId: string) => void;
  /** Called when user chooses "Conserver l'ancien" on a conflict card. */
  onConflictKeepExisting?: (eventId: string) => void;
}

export function AiInsightCardsPanel({
  events,
  step,
  onReimport,
  onConflictUseNew,
  onConflictKeepExisting,
}: AiInsightCardsPanelProps) {
  const { dispatch } = useLmnp();

  // Show ALL non-dismissed events for this step, chronological (oldest first).
  // RULE: no filtering by type, entity, or recency — every card is permanent business memory.
  const visibleEvents = events
    .filter((ev) => ev.step === step && ev.resolutionState !== "dismissed")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  console.log("[ai-event-rendered]", {
    step,
    totalFeedSize: events.length,
    visibleCount: visibleEvents.length,
    visibleIds: visibleEvents.map((e) => e.id),
  });

  if (visibleEvents.length === 0) return null;

  return (
    <div>
      {/* Section title */}
      <div
        style={{
          fontSize: typography.fontSize.sm,
          fontWeight: 600,
          color: colors.text.secondary,
          marginBottom: 10,
          letterSpacing: "0.01em",
        }}
      >
        Informations détectées par l&apos;IA
      </div>

      {/* Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {visibleEvents.map((event) => (
          <InsightCard
            key={event.id}
            event={event}
            onDismiss={() => {
              dispatch({ type: "DISMISS_AI_ACTIVITY_EVENT", eventId: event.id });
            }}
            onResolveKeepExisting={() => {
              dispatch({
                type: "RESOLVE_AI_ACTIVITY_EVENT",
                eventId: event.id,
                resolutionState: "resolved",
              });
              onConflictKeepExisting?.(event.id);
            }}
            onResolveUseNew={() => {
              traceCreditConflictResolution("handle_conflict_use_new_clicked", {
                origin: "InsightCard_button",
                eventId: event.id,
                documentId: event.relatedDocumentIds?.[0] ?? null,
                relay: "before_RESOLVE_and_parent_handler",
              });
              dispatch({
                type: "RESOLVE_AI_ACTIVITY_EVENT",
                eventId: event.id,
                resolutionState: "resolved",
              });
              onConflictUseNew?.(event.id);
            }}
            onReimport={onReimport}
          />
        ))}
      </div>
    </div>
  );
}
