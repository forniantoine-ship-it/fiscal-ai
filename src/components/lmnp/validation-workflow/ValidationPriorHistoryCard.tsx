"use client";

import { useState } from "react";

import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import type { PriorHistoryEligibility } from "@/lib/lmnp/services/declaration/prior-history-eligibility";
import type { PriorHistoryDeclarationStatus } from "@/lib/lmnp/types/domain";
import { ExternalTakeoverFlow } from "./external-takeover/ExternalTakeoverFlow";
import {
  PRIOR_HISTORY_COPY,
  resolvePriorHistoryCardView,
} from "./prior-history-card-view";

export { PRIOR_HISTORY_COPY, resolvePriorHistoryCardView } from "./prior-history-card-view";
export type { PriorHistoryCardView } from "./prior-history-card-view";

/**
 * P0 launch safety — antériorité LMNP au réel. Lot 5.2 : EXTERNAL_HISTORY
 * ouvre le parcours de reprise (plus de hard-block « pas encore disponible »).
 */

type ValidationPriorHistoryCardProps = {
  cardStyle: React.CSSProperties;
  eligibility: PriorHistoryEligibility;
  declared: PriorHistoryDeclarationStatus | undefined;
  onDeclare: (status: PriorHistoryDeclarationStatus) => void;
};

export function ValidationPriorHistoryCard({
  cardStyle,
  eligibility,
  declared,
  onDeclare,
}: ValidationPriorHistoryCardProps) {
  const [editing, setEditing] = useState(false);
  const view = resolvePriorHistoryCardView(eligibility);

  if (view.kind === "hidden") return null;

  const showOptions =
    view.kind === "question" ||
    editing ||
    (view.kind === "blocked" && view.canChangeAnswer);

  return (
    <section
      aria-labelledby="prior-history-title"
      className="w-full space-y-4"
      style={{
        ...cardStyle,
        boxShadow:
          view.kind === "blocked" || view.kind === "external_takeover"
            ? shadows.card.default
            : cardStyle.boxShadow,
      }}
    >
      <h2
        id="prior-history-title"
        style={{ ...typography.body.desktop, color: colors.text.primary, fontWeight: typography.fontWeight.medium }}
      >
        {PRIOR_HISTORY_COPY.title}
      </h2>

      {view.kind === "blocked" ? (
        <div
          role="alert"
          className="space-y-2"
          style={{
            borderRadius: radius.md,
            border: `1px solid ${colors.warning.border}`,
            backgroundColor: colors.warning.surface,
            padding: spacing.scale[3],
          }}
        >
          <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>{view.message}</p>
          {view.detail ? (
            <details style={{ ...typography.caption.desktop, color: colors.text.muted }}>
              <summary>{PRIOR_HISTORY_COPY.technicalDetail}</summary>
              <p>{view.detail}</p>
            </details>
          ) : null}
          <p style={{ ...typography.body.desktop, color: colors.text.primary }}>{PRIOR_HISTORY_COPY.footer}</p>
        </div>
      ) : null}

      {view.kind === "external_takeover" && !editing ? (
        <ExternalTakeoverFlow onChangeAnswer={() => setEditing(true)} />
      ) : null}

      {view.kind === "confirmed" && !editing ? (
        <div className="flex flex-wrap items-center gap-3">
          <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>{PRIOR_HISTORY_COPY.confirmed}</p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            style={{ ...typography.caption.desktop, color: colors.text.accent }}
          >
            {PRIOR_HISTORY_COPY.change}
          </button>
        </div>
      ) : null}

      {showOptions ? (
        <>
          <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>{PRIOR_HISTORY_COPY.question}</p>
          <div className="flex flex-col gap-2">
            {PRIOR_HISTORY_COPY.options.map((option) => {
              const selected = declared === option.status;
              return (
                <button
                  key={option.status}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setEditing(false);
                    onDeclare(option.status);
                  }}
                  className="min-h-[40px] text-left"
                  style={{
                    borderRadius: radius.md,
                    border: `1px solid ${selected ? colors.border.selected : colors.border.default}`,
                    backgroundColor: selected ? colors.surface.selected : colors.surface.primary,
                    color: selected ? colors.text.accent : colors.text.secondary,
                    padding: `${spacing.scale[2]} ${spacing.scale[3]}`,
                    ...typography.body.desktop,
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </section>
  );
}
