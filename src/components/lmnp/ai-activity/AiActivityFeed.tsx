"use client";

import { useMemo } from "react";
import { colors } from "@/design-system/theme/colors";
import { typography } from "@/design-system/theme/typography";
import type { AiActivityEvent, AiActivityStep } from "@/lib/lmnp/types/ai-activity";
import { AiActivityGroup } from "./AiActivityGroup";
import { AiActivitySummary } from "./AiActivitySummary";

interface AiActivityFeedProps {
  /** All events from the store — the feed filters by step automatically. */
  events: AiActivityEvent[];
  step: AiActivityStep;
  /** Custom headline for the summary block. */
  summaryHeadline?: string;
  /** Called when the user clicks "Réimporter le document" on an analysis_failed card. */
  onReimport?: (event: AiActivityEvent) => void;
}

type EntityGroup = {
  entityId: string;
  entityLabel: string;
  events: AiActivityEvent[];
};

function groupEventsByEntity(events: AiActivityEvent[]): EntityGroup[] {
  const map = new Map<string, EntityGroup>();
  for (const event of events) {
    const key = event.entityId;
    if (!map.has(key)) {
      map.set(key, { entityId: key, entityLabel: event.entityLabel, events: [] });
    }
    map.get(key)!.events.push(event);
  }
  return [...map.values()];
}

export function AiActivityFeed({
  events,
  step,
  summaryHeadline,
  onReimport,
}: AiActivityFeedProps) {
  const stepEvents = useMemo(() => events.filter((ev) => ev.step === step), [events, step]);
  const groups = useMemo(() => groupEventsByEntity(stepEvents), [stepEvents]);

  if (stepEvents.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* AI Summary block */}
      <AiActivitySummary events={stepEvents} step={step} headline={summaryHeadline} />

      {/* Section label */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span
          style={{
            fontSize: typography.fontSize.xs,
            fontWeight: 600,
            color: colors.text.muted,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            whiteSpace: "nowrap",
          }}
        >
          Activité IA
        </span>
        <div style={{ flex: 1, height: 1, background: colors.border.subtle }} />
        <span
          style={{
            fontSize: typography.fontSize.xs,
            color: colors.text.muted,
            background: colors.surface.secondary,
            border: `1px solid ${colors.border.subtle}`,
            borderRadius: 999,
            padding: "1px 8px",
            whiteSpace: "nowrap",
          }}
        >
          {stepEvents.length}
        </span>
      </div>

      {/* Entity groups */}
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {groups.map((group) => (
          <AiActivityGroup
            key={group.entityId}
            entityLabel={group.entityLabel}
            events={group.events}
            onReimport={onReimport}
          />
        ))}
      </div>
    </div>
  );
}
