"use client";

import Link from "next/link";

import { colors } from "@/design-system/theme/colors";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import type { MissingDossierItem } from "@/lib/lmnp/services/validation-profile";

type ValidationIncompleteCardProps = {
  missing: MissingDossierItem[];
  cardStyle: React.CSSProperties;
};

export function ValidationIncompleteCard({ missing, cardStyle }: ValidationIncompleteCardProps) {
  if (missing.length === 0) return null;

  return (
    <div className="w-full space-y-4">
      <section
        className="w-full animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
        style={{ ...cardStyle, textAlign: "center" }}
      >
        <p
          style={{
            fontFamily: typography.fontFamily.display,
            fontSize: typography.fontSize.lg,
            color: colors.text.primary,
          }}
        >
          Certaines informations restent à compléter.
        </p>
        <p className="mx-auto mt-2 max-w-md" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          La génération officielle sera disponible une fois ces éléments renseignés.
        </p>
      </section>

      <ul className="mx-auto flex max-w-md flex-col gap-2">
        {missing.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className="flex items-center justify-between gap-4 outline-none"
              style={{
                borderRadius: radius.md,
                border: `1px solid ${colors.border.subtle}`,
                backgroundColor: colors.surface.primary,
                padding: `${spacing.scale[3]} ${spacing.scale[4]}`,
                transition: motions.hover.card,
              }}
            >
              <span style={{ ...typography.body.desktop, color: colors.text.primary, fontSize: typography.fontSize.sm }}>
                {item.label}
              </span>
              <span style={{ ...typography.caption.desktop, color: colors.text.accent }}>Compléter</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
