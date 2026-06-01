"use client";

import { useState } from "react";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { typography } from "@/design-system/theme/typography";
import type { AiActivityEvent } from "@/lib/lmnp/types/ai-activity";
import { useLmnp } from "@/lib/lmnp/store";

// ─── Severity config ──────────────────────────────────────────────────────────

type SeverityConfig = {
  background: string;
  border: string;
  icon: string;
  iconColor: string;
};

function severityConfig(severity: AiActivityEvent["severity"]): SeverityConfig {
  switch (severity) {
    case "success":
      return {
        background: colors.success.surface,
        border: colors.success.border,
        icon: "✓",
        iconColor: colors.success.DEFAULT,
      };
    case "warning":
      return {
        background: colors.warning.surface,
        border: colors.warning.border,
        icon: "⚠",
        iconColor: colors.warning.DEFAULT,
      };
    case "blocking":
      return {
        background: "#FFF7F0",
        border: "#F5C4A0",
        icon: "!",
        iconColor: colors.orange[700],
      };
    case "info":
    default:
      return {
        background: colors.surface.secondary,
        border: colors.border.subtle,
        icon: "i",
        iconColor: colors.text.tertiary,
      };
  }
}

// ─── Conflict resolution UI ────────────────────────────────────────────────────

interface ConflictActionsProps {
  event: AiActivityEvent;
  onKeepExisting: () => void;
  onUseNew: () => void;
}

function ConflictActions({ event, onKeepExisting, onUseNew }: ConflictActionsProps) {
  const { metadata } = event;
  if (!metadata) return null;

  const fields = metadata.conflictingFields ?? [];
  const prev = metadata.previousValues ?? {};
  const next = metadata.nextValues ?? {};

  return (
    <div style={{ marginTop: "12px" }}>
      {fields.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "8px",
            marginBottom: "12px",
            fontSize: typography.fontSize.xs,
          }}
        >
          <div
            style={{
              background: colors.surface.primary,
              border: `1px solid ${colors.border.default}`,
              borderRadius: radius.md,
              padding: "8px 12px",
            }}
          >
            <div style={{ color: colors.text.muted, marginBottom: "4px", fontWeight: 500 }}>
              Valeur existante
            </div>
            {fields.map((f) => (
              <div key={f} style={{ color: colors.text.secondary }}>
                <span style={{ color: colors.text.muted }}>{f}:</span>{" "}
                <strong>{String(prev[f] ?? "—")}</strong>
              </div>
            ))}
          </div>
          <div
            style={{
              background: colors.surface.primary,
              border: `1px solid ${colors.warning.border}`,
              borderRadius: radius.md,
              padding: "8px 12px",
            }}
          >
            <div style={{ color: colors.text.muted, marginBottom: "4px", fontWeight: 500 }}>
              Valeur détectée
            </div>
            {fields.map((f) => (
              <div key={f} style={{ color: colors.text.secondary }}>
                <span style={{ color: colors.text.muted }}>{f}:</span>{" "}
                <strong>{String(next[f] ?? "—")}</strong>
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
            padding: "8px 12px",
            borderRadius: radius.md,
            border: `1px solid ${colors.border.default}`,
            background: colors.surface.primary,
            color: colors.text.secondary,
            fontSize: typography.fontSize.sm,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Conserver les valeurs existantes
        </button>
        <button
          onClick={onUseNew}
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: radius.md,
            border: `1px solid ${colors.warning.border}`,
            background: colors.warning.light,
            color: colors.warning.DEFAULT,
            fontSize: typography.fontSize.sm,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Utiliser les nouvelles valeurs
        </button>
      </div>
    </div>
  );
}

// ─── Resolution badge ─────────────────────────────────────────────────────────

function ResolutionBadge({ event }: { event: AiActivityEvent }) {
  if (!event.resolvedAt || event.resolutionState === "pending") return null;

  const label =
    event.resolutionState === "dismissed"
      ? "Ignoré"
      : event.type === "conflict_detected"
        ? "Résolu"
        : null;

  if (!label) return null;

  const date = new Date(event.resolvedAt).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
  });

  return (
    <div
      style={{
        marginTop: "8px",
        display: "flex",
        alignItems: "center",
        gap: "4px",
        fontSize: typography.fontSize.xs,
        color: colors.text.muted,
      }}
    >
      <span style={{ color: colors.success.DEFAULT }}>→</span>
      <span>
        {label} le {date}
      </span>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

interface AiActivityCardProps {
  event: AiActivityEvent;
  onReimport?: () => void;
}

export function AiActivityCard({ event, onReimport }: AiActivityCardProps) {
  const { dispatch } = useLmnp();
  const cfg = severityConfig(event.severity);
  const isConflictPending =
    event.type === "conflict_detected" && event.resolutionState === "pending";
  const isResolved =
    event.resolutionState === "resolved" || event.resolutionState === "dismissed";
  const isAnalysisFailed = event.type === "analysis_failed";

  const [resolving, setResolving] = useState(false);

  const handleKeepExisting = () => {
    setResolving(true);
    dispatch({ type: "RESOLVE_AI_ACTIVITY_EVENT", eventId: event.id, resolutionState: "resolved" });
  };

  const handleUseNew = () => {
    setResolving(true);
    dispatch({ type: "RESOLVE_AI_ACTIVITY_EVENT", eventId: event.id, resolutionState: "resolved" });
  };

  const handleDismiss = () => {
    dispatch({ type: "DISMISS_AI_ACTIVITY_EVENT", eventId: event.id });
  };

  return (
    <div
      style={{
        background: cfg.background,
        border: `1px solid ${cfg.border}`,
        borderRadius: radius.lg,
        padding: "12px 16px",
        opacity: resolving ? 0.6 : 1,
        transition: "opacity 0.2s ease",
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
        {/* Icon dot */}
        <div
          aria-hidden
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: cfg.iconColor,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 700,
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          {cfg.icon}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
            }}
          >
            <span
              style={{
                fontSize: typography.fontSize.sm,
                fontWeight: 600,
                color: colors.text.primary,
                lineHeight: 1.4,
              }}
            >
              {event.title}
            </span>

            <span
              style={{
                fontSize: typography.fontSize.xs,
                color: colors.text.muted,
                flexShrink: 0,
              }}
            >
              {new Date(event.createdAt).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "short",
              })}
            </span>
          </div>

          <p
            style={{
              margin: "4px 0 0",
              fontSize: typography.fontSize.sm,
              color: colors.text.secondary,
              lineHeight: 1.5,
            }}
          >
            {event.description}
          </p>

          {isConflictPending && !isResolved && (
            <ConflictActions
              event={event}
              onKeepExisting={handleKeepExisting}
              onUseNew={handleUseNew}
            />
          )}

          {isAnalysisFailed && onReimport && (
            <button
              onClick={onReimport}
              style={{
                marginTop: "8px",
                padding: "8px 12px",
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

          <ResolutionBadge event={event} />
        </div>

        {!isConflictPending && !isResolved && event.severity !== "blocking" && (
          <button
            onClick={handleDismiss}
            aria-label="Ignorer"
            title="Ignorer"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: colors.text.muted,
              fontSize: 14,
              lineHeight: 1,
              padding: 2,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
