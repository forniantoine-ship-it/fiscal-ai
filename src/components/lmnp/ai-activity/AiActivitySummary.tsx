"use client";

import { useMemo } from "react";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { typography } from "@/design-system/theme/typography";
import type { AiActivityEvent, AiActivityStep } from "@/lib/lmnp/types/ai-activity";

interface AiActivitySummaryProps {
  events: AiActivityEvent[];
  step: AiActivityStep;
  headline?: string;
}

function stepLabel(step: AiActivityStep): string {
  switch (step) {
    case "financement":
      return "Analyse du financement";
    case "charges":
      return "Analyse des charges";
    case "amortissement":
      return "Analyse des amortissements";
    case "revenus":
      return "Analyse des revenus";
    case "fiscalite":
      return "Analyse fiscale";
  }
}

interface StatPillProps {
  count: number;
  label: string;
  color?: string;
}

function StatPill({ count, label, color = colors.text.secondary }: StatPillProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <span
        style={{
          fontVariantNumeric: "tabular-nums",
          fontWeight: 700,
          fontSize: typography.fontSize.sm,
          color,
          minWidth: 18,
          textAlign: "center",
        }}
      >
        {count}
      </span>
      <span style={{ fontSize: typography.fontSize.sm, color: colors.text.secondary }}>{label}</span>
    </div>
  );
}

export function AiActivitySummary({ events, step, headline }: AiActivitySummaryProps) {
  const stats = useMemo(() => {
    const docs = new Set<string>();
    events.forEach((ev) => ev.relatedDocumentIds?.forEach((id) => docs.add(id)));

    const enriched = events.filter((ev) => ev.type === "document_enriched").length;
    const ignored = events.filter((ev) => ev.type === "document_ignored").length;
    const conflicts = events.filter(
      (ev) => ev.type === "conflict_detected" && ev.resolutionState === "pending",
    ).length;
    const merges = events.filter((ev) => ev.type === "entity_merge").length;

    return { docs: docs.size, enriched, ignored, conflicts, merges };
  }, [events]);

  if (events.length === 0) return null;

  const unresolvedColor = stats.conflicts > 0 ? colors.warning.DEFAULT : colors.success.DEFAULT;

  return (
    <div
      style={{
        background: colors.surface.secondary,
        border: `1px solid ${colors.border.subtle}`,
        borderRadius: radius.lg,
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: 15 }} aria-hidden>
          🧠
        </span>
        <span
          style={{
            fontSize: typography.fontSize.sm,
            fontWeight: 600,
            color: colors.text.primary,
          }}
        >
          {headline ?? stepLabel(step)}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "4px 16px",
        }}
      >
        <StatPill count={stats.docs} label="document(s) analysé(s)" />
        {stats.enriched > 0 && (
          <StatPill count={stats.enriched} label="enrichissement(s)" color={colors.success.DEFAULT} />
        )}
        {stats.ignored > 0 && (
          <StatPill count={stats.ignored} label="déjà connu(s)" color={colors.text.tertiary} />
        )}
        {stats.merges > 0 && (
          <StatPill count={stats.merges} label="document(s) regroupé(s)" />
        )}
        <StatPill
          count={stats.conflicts}
          label={stats.conflicts === 0 ? "conflit non résolu" : "conflit(s) non résolu(s)"}
          color={unresolvedColor}
        />
      </div>
    </div>
  );
}
