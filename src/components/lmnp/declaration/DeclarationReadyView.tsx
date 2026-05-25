"use client";

import Link from "next/link";

import { Button } from "@/design-system/components/Button";
import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { documentJourneyRoute, LMNP_ROUTES } from "@/lib/lmnp/routes";
import { useLmnp } from "@/lib/lmnp/store";

const DOCUMENT_ITEMS = [
  { label: "Liasse fiscale PDF", status: "Disponible" },
  { label: "Formulaires CERFA", status: "Disponible" },
  { label: "Accusé télétransmission EDI", status: "Disponible" },
] as const;

export function DeclarationReadyView() {
  const { workspace } = useLmnp();
  const { fiscalYear } = workspace;

  return (
    <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-6 pb-16">
      <div className="flex w-full justify-center">
        <Button href={LMNP_ROUTES.dashboard}>Tableau de bord</Button>
      </div>

      <section
        className="w-full text-center"
        style={{
          borderRadius: radius.lg,
          border: `1px solid ${colors.border.subtle}`,
          boxShadow: shadows.card.default,
          padding: spacing.card.md,
          backgroundImage: [
            `radial-gradient(ellipse 88% 52% at 50% -8%, ${colors.orange[100]} 0%, transparent 62%)`,
            gradients.card.elevated,
          ].join(", "),
        }}
      >
        <p
          style={{
            ...typography.caption.desktop,
            color: colors.text.accent,
            letterSpacing: typography.letterSpacing.label,
          }}
        >
          Déclaration LMNP {fiscalYear.year}
        </p>
        <h1
          className="mx-auto mt-4 max-w-xl text-[1.375rem] sm:text-[1.625rem]"
          style={{
            fontFamily: typography.fontFamily.display,
            fontWeight: typography.fontWeight.regular,
            color: colors.text.primary,
          }}
        >
          Votre déclaration officielle
        </h1>
        <p className="mx-auto mt-3 max-w-lg" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          Documents générés et télétransmission EDI effectuée. Consultez vos pièces et l&apos;historique de votre
          dossier.
        </p>
      </section>

      <ul className="space-y-3">
        {DOCUMENT_ITEMS.map((item) => (
          <li
            key={item.label}
            style={{
              borderRadius: radius.md,
              border: `1px solid ${colors.border.subtle}`,
              backgroundColor: colors.surface.primary,
              padding: `${spacing.scale[4]} ${spacing.scale[5]}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing.scale[4],
            }}
          >
            <span style={{ ...typography.body.desktop, color: colors.text.primary }}>{item.label}</span>
            <span style={{ ...typography.caption.desktop, color: colors.success.DEFAULT }}>{item.status}</span>
          </li>
        ))}
      </ul>

      <p className="text-center" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
        <Link href={documentJourneyRoute("validation")} style={{ color: colors.text.muted }}>
          Revenir à la synthèse du dossier
        </Link>
      </p>
    </div>
  );
}
