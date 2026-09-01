"use client";

import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { typography } from "@/design-system/theme/typography";
import type { Subject } from "@/lab/advisor-scene/types";

const lifecycleTag: Record<Subject["lifecycle"], string> = {
  undiscovered: "",
  resting: "",
  reported: "à compléter",
  done: "terminé",
};

/**
 * Le rendu visuel minimal d'un sujet. Réutilise les tokens du Design System
 * (couleurs, rayons, typographie) — jamais un composant métier existant.
 *
 * Volontairement sans bordure d'accent ni ombre propre : "présenté" se lit
 * dans la taille et l'élévation que la scène lui donne (Lighting System),
 * jamais dans un contour de sélection (ADR-009 + Sprint 2 — "présenté, pas
 * sélectionné").
 */
export function AdvisorSubjectFace({
  subject,
  isActive,
}: {
  subject: Subject;
  isActive: boolean;
}) {
  const tag = lifecycleTag[subject.lifecycle];

  return (
    <div
      style={{
        width: isActive ? "224px" : "166px",
        borderRadius: radius.xl,
        border: `1px solid ${colors.border.subtle}`,
        backgroundColor: colors.surface.primary,
        padding: isActive ? "26px" : "18px",
        textAlign: "center",
      }}
    >
      <span
        aria-hidden
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: isActive ? "40px" : "30px",
          height: isActive ? "40px" : "30px",
          borderRadius: radius.full,
          backgroundColor: isActive ? colors.orange[500] : colors.surface.secondary,
          color: isActive ? colors.text.inverse : colors.text.muted,
          fontFamily: typography.fontFamily.display,
          fontSize: isActive ? typography.fontSize.lg : typography.fontSize.sm,
          marginBottom: "10px",
        }}
      >
        {subject.label.charAt(0)}
      </span>

      <p
        style={{
          fontFamily: typography.fontFamily.display,
          fontSize: isActive ? typography.fontSize.lg : typography.fontSize.sm,
          color: colors.text.primary,
          margin: 0,
        }}
      >
        {subject.label}
      </p>

      {tag ? (
        <p
          style={{
            ...typography.caption.desktop,
            color: subject.lifecycle === "reported" ? colors.warning.DEFAULT : colors.text.muted,
            marginTop: "6px",
          }}
        >
          {tag}
        </p>
      ) : null}
    </div>
  );
}
