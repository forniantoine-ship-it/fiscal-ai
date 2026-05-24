"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/design-system/components/Button";
import { PublicLayout } from "@/design-system/layouts/PublicLayout";
import { colors } from "@/design-system/theme/colors";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { DeclarationHowItWorks } from "@/components/lmnp/declaration/DeclarationHowItWorks";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";

const STEPS = [
  {
    title: "Créez votre espace",
    body: "Un dossier LMNP guidé, sans jargon comptable.",
  },
  {
    title: "Déposez vos documents",
    body: "L'IA lit vos pièces et prépare automatiquement votre liasse.",
  },
  {
    title: "Validez et transmettez",
    body: "Vous confirmez l'essentiel avant génération et télétransmission.",
  },
];

export function ConnexionOnboarding() {
  const router = useRouter();

  return (
    <PublicLayout>
      <div className="mx-auto max-w-3xl px-4 py-16 sm:py-24">
        <p style={{ ...typography.caption.desktop, color: colors.text.accent }}>
          Espace LMNP
        </p>
        <h1
          className="mt-3 text-4xl sm:text-5xl"
          style={{
            fontFamily: typography.fontFamily.display,
            fontWeight: typography.fontWeight.regular,
            color: colors.text.primary,
          }}
        >
          Votre déclaration LMNP, guidée pas à pas
        </h1>
        <p className="mt-4 max-w-2xl" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          Fiscal AI prépare automatiquement votre dossier à partir de vos documents. Vous gardez le
          contrôle avant chaque étape importante.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {STEPS.map((item, index) => (
            <div
              key={item.title}
              style={{
                padding: spacing.card.sm,
                borderRadius: "16px",
                border: `1px solid ${colors.border.subtle}`,
                backgroundColor: colors.surface.primary,
              }}
            >
              <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>{index + 1}</p>
              <p className="mt-2" style={{ ...typography.cardTitle.desktop, color: colors.text.primary }}>
                {item.title}
              </p>
              <p className="mt-2" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
                {item.body}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-12">
          <DeclarationHowItWorks />
        </div>

        <div className="mt-12 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <Button onClick={() => router.push(LMNP_ROUTES.dashboard)}>Accéder à mon dossier</Button>
          <Link href="/" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    </PublicLayout>
  );
}
