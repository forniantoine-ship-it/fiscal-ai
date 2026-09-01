"use client";

import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { typography } from "@/design-system/theme/typography";
import { compositionLabels, type CompositionId } from "@/lab/advisor-scene/composition";
import { scenarios } from "@/lab/advisor-scene/scenarios/fixtures";
import { sceneVariants, type SceneVariant } from "@/lab/advisor-scene/variants";

const buttonStyle = {
  border: `1px solid ${colors.border.default}`,
  borderRadius: radius.full,
  padding: "8px 16px",
  backgroundColor: colors.surface.primary,
  color: colors.text.secondary,
  ...typography.caption.desktop,
  cursor: "pointer" as const,
};

export function LabControlPanel({
  scenarioId,
  onScenarioChange,
  compositionId,
  onCompositionChange,
  variantId,
  onVariantChange,
  caption,
  beatIndex,
  beatCount,
  isLast,
  playing,
  onNext,
  onReset,
  onTogglePlay,
}: {
  scenarioId: string;
  onScenarioChange: (id: string) => void;
  compositionId: CompositionId;
  onCompositionChange: (id: CompositionId) => void;
  variantId: SceneVariant["id"];
  onVariantChange: (id: SceneVariant["id"]) => void;
  caption: string;
  beatIndex: number;
  beatCount: number;
  isLast: boolean;
  playing: boolean;
  onNext: () => void;
  onReset: () => void;
  onTogglePlay: () => void;
}) {
  return (
    <div
      style={{
        borderRadius: radius.xl,
        border: `1px solid ${colors.border.subtle}`,
        backgroundColor: colors.surface.primary,
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "center" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span style={{ ...typography.caption.desktop, color: colors.text.muted }}>Scénario</span>
          <select
            value={scenarioId}
            onChange={(e) => onScenarioChange(e.target.value)}
            style={{
              border: `1px solid ${colors.border.default}`,
              borderRadius: radius.md,
              padding: "8px 10px",
              ...typography.body.desktop,
            }}
          >
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span style={{ ...typography.caption.desktop, color: colors.text.muted }}>Composition</span>
          <select
            value={compositionId}
            onChange={(e) => onCompositionChange(e.target.value as CompositionId)}
            style={{
              border: `1px solid ${colors.border.default}`,
              borderRadius: radius.md,
              padding: "8px 10px",
              ...typography.body.desktop,
            }}
          >
            {Object.entries(compositionLabels).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span style={{ ...typography.caption.desktop, color: colors.text.muted }}>Version</span>
          <select
            value={variantId}
            onChange={(e) => onVariantChange(e.target.value as SceneVariant["id"])}
            style={{
              border: `1px solid ${colors.border.default}`,
              borderRadius: radius.md,
              padding: "8px 10px",
              ...typography.body.desktop,
            }}
          >
            {sceneVariants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: "flex", gap: "8px", marginLeft: "auto" }}>
          <button type="button" style={buttonStyle} onClick={onReset}>
            Revenir au début
          </button>
          <button type="button" style={buttonStyle} onClick={onTogglePlay}>
            {playing ? "Pause" : "Lecture automatique"}
          </button>
          <button
            type="button"
            style={{ ...buttonStyle, opacity: isLast ? 0.4 : 1 }}
            onClick={onNext}
            disabled={isLast}
          >
            Beat suivant →
          </button>
        </div>
      </div>

      <div
        style={{
          borderTop: `1px solid ${colors.border.subtle}`,
          paddingTop: "14px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <p style={{ ...typography.body.desktop, color: colors.text.primary, margin: 0 }}>{caption}</p>
        <span style={{ ...typography.caption.desktop, color: colors.text.muted, whiteSpace: "nowrap" }}>
          beat {beatIndex + 1} / {beatCount}
        </span>
      </div>
    </div>
  );
}
