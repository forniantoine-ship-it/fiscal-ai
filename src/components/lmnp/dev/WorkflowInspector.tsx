"use client";

/**
 * WorkflowInspector — temporary developer observability overlay.
 *
 * USAGE:
 *   Add ?inspector=1 to any page URL.
 *   Shows a floating panel with all workflow state relevant to the financing tunnel.
 *
 * IMPORTANT: This file is dev-only. Do NOT render in production.
 *   Already guarded by NODE_ENV check inside the component.
 */

import { useEffect, useState } from "react";
import { selectPrimaryInsightEvent } from "@/components/lmnp/ai-activity";
import type { AiActivityEvent, AiActivityStep } from "@/lib/lmnp/types/ai-activity";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorkflowInspectorProps {
  /** Human-readable phase label. E.g. "ANALYZING", "FORM_VISIBLE", "CONFIRMED" */
  phase: string;
  /** All local state booleans */
  localState: Record<string, unknown>;
  /** Derived selector values */
  derivedState: Record<string, unknown>;
  /** Ref values (current snapshot) */
  refs?: Record<string, unknown>;
  /** Active blockers preventing workflow progression */
  blockers?: string[];
  /** Current activity feed slice for this step */
  events?: AiActivityEvent[];
  /** Step being inspected */
  step?: AiActivityStep;
  /** Source of current hydration ("draft" | "execution" | "session") */
  hydrationSource?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: unknown }) {
  const display =
    value === null
      ? "null"
      : value === undefined
        ? "undefined"
        : typeof value === "boolean"
          ? value
            ? "✓ true"
            : "✗ false"
          : typeof value === "object"
            ? JSON.stringify(value).slice(0, 80)
            : String(value);

  const isBad =
    typeof value === "boolean" && !value && label.startsWith("show");
  const isBlocking =
    typeof value === "string" && value.includes("BLOCKED");

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
        padding: "2px 0",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <span style={{ color: "#9CA3AF", fontSize: 11 }}>{label}</span>
      <span
        style={{
          fontFamily: "monospace",
          fontSize: 11,
          color: isBlocking
            ? "#F87171"
            : isBad
              ? "#FBBF24"
              : typeof value === "boolean"
                ? value
                  ? "#34D399"
                  : "#F87171"
                : "#E5E7EB",
          textAlign: "right",
          maxWidth: 200,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {String(display)}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "#6B7280",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 4,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WorkflowInspector({
  phase,
  localState,
  derivedState,
  refs,
  blockers = [],
  events = [],
  step,
  hydrationSource,
}: WorkflowInspectorProps) {
  const [visible, setVisible] = useState(false);
  const [minimized, setMinimized] = useState(false);

  // Only mount in dev mode
  const isDev = process.env.NODE_ENV === "development";

  useEffect(() => {
    if (!isDev) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("inspector") === "1") {
      setVisible(true);
    }

    const handler = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === "I") setVisible((v) => !v);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isDev]);

  if (!isDev || !visible) return null;

  const primaryEvent = step ? selectPrimaryInsightEvent(events, step) : null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 9999,
        width: minimized ? 180 : 340,
        background: "rgba(10,10,15,0.95)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 10,
        fontFamily: "monospace",
        fontSize: 11,
        color: "#E5E7EB",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        overflow: "hidden",
        transition: "width 0.2s ease",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 12px",
          background: "rgba(255,255,255,0.05)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12 }}>🔬</span>
          <span style={{ fontWeight: 700, fontSize: 11, color: "#F9FAFB" }}>
            Workflow Inspector
          </span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => setMinimized((m) => !m)}
            style={{
              background: "none",
              border: "none",
              color: "#9CA3AF",
              cursor: "pointer",
              fontSize: 14,
              padding: "0 4px",
            }}
          >
            {minimized ? "▲" : "▼"}
          </button>
          <button
            onClick={() => setVisible(false)}
            style={{
              background: "none",
              border: "none",
              color: "#9CA3AF",
              cursor: "pointer",
              fontSize: 14,
              padding: "0 4px",
            }}
          >
            ×
          </button>
        </div>
      </div>

      {!minimized && (
        <div style={{ padding: "10px 12px", maxHeight: "80vh", overflowY: "auto" }}>
          {/* Phase */}
          <div
            style={{
              marginBottom: 10,
              padding: "6px 10px",
              borderRadius: 6,
              background:
                phase.includes("BLOCKED")
                  ? "rgba(239,68,68,0.15)"
                  : phase.includes("CONFIRMED") || phase.includes("DONE")
                    ? "rgba(52,211,153,0.15)"
                    : "rgba(251,191,36,0.12)",
              border: `1px solid ${
                phase.includes("BLOCKED")
                  ? "rgba(239,68,68,0.3)"
                  : phase.includes("CONFIRMED")
                    ? "rgba(52,211,153,0.3)"
                    : "rgba(251,191,36,0.2)"
              }`,
              color: phase.includes("BLOCKED")
                ? "#F87171"
                : phase.includes("CONFIRMED")
                  ? "#34D399"
                  : "#FBBF24",
              fontWeight: 700,
              fontSize: 12,
              textAlign: "center",
            }}
          >
            {phase}
          </div>

          {/* Blockers */}
          {blockers.length > 0 && (
            <Section title="⛔ Blockers">
              {blockers.map((b, i) => (
                <div
                  key={i}
                  style={{
                    padding: "3px 6px",
                    borderRadius: 4,
                    background: "rgba(239,68,68,0.15)",
                    color: "#F87171",
                    fontSize: 11,
                    marginBottom: 3,
                  }}
                >
                  {b}
                </div>
              ))}
            </Section>
          )}

          {/* Hydration */}
          {hydrationSource && (
            <Section title="Hydration">
              <Row label="source" value={hydrationSource} />
            </Section>
          )}

          {/* Local state */}
          <Section title="Local state">
            {Object.entries(localState).map(([k, v]) => (
              <Row key={k} label={k} value={v} />
            ))}
          </Section>

          {/* Derived selectors */}
          <Section title="Derived selectors">
            {Object.entries(derivedState).map(([k, v]) => (
              <Row key={k} label={k} value={v} />
            ))}
          </Section>

          {/* Refs snapshot */}
          {refs && Object.keys(refs).length > 0 && (
            <Section title="Refs">
              {Object.entries(refs).map(([k, v]) => (
                <Row key={k} label={k} value={v} />
              ))}
            </Section>
          )}

          {/* Primary insight */}
          {step && (
            <Section title="Primary insight">
              {primaryEvent ? (
                <>
                  <Row label="type" value={primaryEvent.type} />
                  <Row label="severity" value={primaryEvent.severity} />
                  <Row label="resolutionState" value={primaryEvent.resolutionState} />
                  <Row label="title" value={primaryEvent.title} />
                </>
              ) : (
                <span style={{ color: "#6B7280", fontSize: 11 }}>No primary event</span>
              )}
            </Section>
          )}

          {/* Recent events */}
          {events.length > 0 && (
            <Section title={`Feed (${events.length} events)`}>
              {events
                .filter((e) => !step || e.step === step)
                .slice(0, 5)
                .map((ev) => (
                  <div
                    key={ev.id}
                    style={{
                      padding: "3px 0",
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                    }}
                  >
                    <span
                      style={{
                        color:
                          ev.severity === "success"
                            ? "#34D399"
                            : ev.severity === "warning" || ev.severity === "blocking"
                              ? "#FBBF24"
                              : "#9CA3AF",
                      }}
                    >
                      {ev.type}
                    </span>
                    <span style={{ color: "#6B7280" }}> — {ev.title.slice(0, 30)}</span>
                  </div>
                ))}
            </Section>
          )}

          <div style={{ color: "#4B5563", fontSize: 10, marginTop: 6, textAlign: "center" }}>
            Shift+I to toggle • ?inspector=1 to auto-open
          </div>
        </div>
      )}
    </div>
  );
}
