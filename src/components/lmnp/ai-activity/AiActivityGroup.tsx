"use client";

import { colors } from "@/design-system/theme/colors";
import { typography } from "@/design-system/theme/typography";
import type { AiActivityEvent } from "@/lib/lmnp/types/ai-activity";
import { AiActivityCard } from "./AiActivityCard";

interface AiActivityGroupProps {
  entityLabel: string;
  events: AiActivityEvent[];
  onReimport?: (event: AiActivityEvent) => void;
}

export function AiActivityGroup({ entityLabel, events, onReimport }: AiActivityGroupProps) {
  if (events.length === 0) return null;

  const hasPending = events.some(
    (ev) => ev.type === "conflict_detected" && ev.resolutionState === "pending",
  );
  const hasWarning = events.some((ev) => ev.severity === "warning" || ev.severity === "blocking");

  const indicatorColor = hasPending
    ? "#E8A857"
    : hasWarning
      ? "#C8A87A"
      : colors.text.muted;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {/* Entity heading */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: indicatorColor,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: typography.fontSize.xs,
            fontWeight: 600,
            color: colors.text.tertiary,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {entityLabel}
        </span>
      </div>

      {/* Cards */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          paddingLeft: "16px",
          borderLeft: `2px solid ${colors.border.subtle}`,
        }}
      >
        {events.map((event) => (
          <AiActivityCard
            key={event.id}
            event={event}
            onReimport={onReimport ? () => onReimport(event) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
