"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { PublicLayout } from "@/design-system/layouts/PublicLayout";
import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

const GUTTER = `clamp(${spacing.gutter.mobile}, 4vw, ${spacing.gutter.wide})`;

function PrimaryButton({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  return (
    <Link
      href={href}
      className={`inline-flex min-h-[44px] items-center justify-center ${className}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setPressed(false);
      }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        ...typography.button.desktop,
        color: colors.text.inverse,
        backgroundImage: pressed
          ? gradients.button.primaryPressed
          : hovered
            ? gradients.button.primaryHover
            : gradients.button.primary,
        borderRadius: radius.full,
        padding: `${spacing.scale[3]} ${spacing.scale[8]}`,
        boxShadow: hovered ? shadows.button.primaryHover : shadows.button.primary,
        transition: motions.hover.button,
      }}
    >
      {children}
    </Link>
  );
}

function SecondaryButton({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <Link
      href={href}
      className={`inline-flex min-h-[44px] items-center justify-center ${className}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...typography.button.desktop,
        color: colors.text.secondary,
        backgroundColor: hovered ? colors.surface.interactive : colors.surface.primary,
        border: `1px solid ${hovered ? colors.border.strong : colors.border.default}`,
        borderRadius: radius.full,
        padding: `${spacing.scale[3]} ${spacing.scale[8]}`,
        boxShadow: hovered ? shadows.button.secondaryHover : shadows.none,
        transition: motions.hover.ghost,
      }}
    >
      {children}
    </Link>
  );
}

function SectionIntro({
  title,
  subtitle,
  align = "center",
}: {
  title: string;
  subtitle?: string;
  align?: "left" | "center";
}) {
  return (
    <div
      className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}
      style={{ marginBottom: spacing.section.titleToContent }}
    >
      <h2
        style={{
          ...typography.sectionTitle.desktop,
          color: colors.text.primary,
          marginBottom: subtitle ? spacing.scale[4] : 0,
        }}
        className="max-lg:!text-[30px]"
      >
        {title}
      </h2>
      {subtitle ? (
        <p style={{ ...typography.body.desktop, color: colors.text.tertiary }}>
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

function TrustPill({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center"
      style={{
        ...typography.caption.desktop,
        color: colors.text.tertiary,
        gap: spacing.scale[2],
        padding: `${spacing.scale[2]} ${spacing.scale[3]}`,
        borderRadius: radius.full,
        backgroundColor: colors.surface.secondary,
        border: `1px solid ${colors.border.subtle}`,
      }}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: colors.success.muted }}
      />
      {children}
    </span>
  );
}

function DashboardMockup() {
  const steps = ["Activité", "Logement", "Crédit", "Revenus", "Validation"];
  const documents = [
    { name: "Bail meublé — Appartement Lyon", status: "Analysé", confidence: "98 %" },
    { name: "Tableau d'amortissement", status: "Analysé", confidence: "96 %" },
    { name: "Relevé de compte — Loyers 2024", status: "En cours", confidence: "—" },
  ];

  return (
    <div
      className="w-full"
      style={{
        borderRadius: radius["2xl"],
        backgroundImage: gradients.card.elevated,
        border: `1px solid ${colors.border.subtle}`,
        boxShadow: shadows.hero.floating,
        overflow: "hidden",
        transition: motions.hover.card,
      }}
    >
      <div
        style={{
          padding: spacing.scale[4],
          borderBottom: `1px solid ${colors.border.subtle}`,
          backgroundColor: colors.surface.primary,
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center" style={{ gap: spacing.scale[2] }}>
            <span
              className="inline-flex h-7 w-7 items-center justify-center"
              style={{
                borderRadius: radius.sm,
                backgroundImage: gradients.button.primary,
                color: colors.text.inverse,
                fontSize: typography.fontSize.xs,
                fontWeight: typography.fontWeight.medium,
              }}
            >
              F
            </span>
            <span
              style={{
                ...typography.cardTitle.desktop,
                fontSize: typography.fontSize.base,
                color: colors.text.primary,
              }}
            >
              Exercice 2024
            </span>
          </div>
          <span
            style={{
              ...typography.caption.desktop,
              color: colors.success.DEFAULT,
              padding: `${spacing.scale[1]} ${spacing.scale[3]}`,
              borderRadius: radius.full,
              backgroundColor: colors.success.light,
            }}
          >
            Enregistré
          </span>
        </div>
      </div>

      <div
        className="overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{
          padding: `${spacing.scale[3]} ${spacing.scale[4]} 0`,
          borderBottom: `1px solid ${colors.border.subtle}`,
        }}
      >
        <div className="flex min-w-max" style={{ gap: spacing.scale[5] }}>
          {steps.map((step, index) => (
            <span
              key={step}
              style={{
                ...typography.workflow.desktop,
                color: index === 1 ? colors.text.primary : colors.text.muted,
                fontWeight: index === 1 ? typography.fontWeight.medium : typography.fontWeight.regular,
                paddingBottom: spacing.scale[3],
                borderBottom:
                  index === 1
                    ? `2px solid ${colors.orange[500]}`
                    : "2px solid transparent",
                whiteSpace: "nowrap",
              }}
            >
              {step}
            </span>
          ))}
        </div>
      </div>

      <div style={{ padding: spacing.card.md }}>
        <div
          className="flex items-center justify-between"
          style={{ marginBottom: spacing.scale[5] }}
        >
          <div>
            <p
              style={{
                ...typography.caption.desktop,
                color: colors.text.muted,
                letterSpacing: typography.letterSpacing.caps,
                textTransform: "uppercase",
                marginBottom: spacing.scale[1],
              }}
            >
              Progression du dossier
            </p>
            <p style={{ ...typography.cardTitle.desktop, color: colors.text.primary }}>
              68 % complété
            </p>
          </div>
          <span
            style={{
              ...typography.caption.desktop,
              color: colors.orange[600],
              padding: `${spacing.scale[2]} ${spacing.scale[3]}`,
              borderRadius: radius.full,
              backgroundColor: colors.orange[50],
            }}
          >
            3 documents analysés
          </span>
        </div>

        <div
          style={{
            height: "6px",
            borderRadius: radius.full,
            backgroundColor: colors.surface.inset,
            marginBottom: spacing.scale[6],
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: "68%",
              height: "100%",
              borderRadius: radius.full,
              backgroundImage: gradients.workflow.analyzing,
              transition: motions.workflow.progress,
            }}
          />
        </div>

        <div className="flex flex-col" style={{ gap: spacing.scale[3] }}>
          {documents.map((doc) => (
            <div
              key={doc.name}
              className="flex items-center justify-between gap-4"
              style={{
                padding: spacing.scale[4],
                borderRadius: radius.lg,
                backgroundColor: colors.surface.primary,
                border: `1px solid ${colors.border.subtle}`,
              }}
            >
              <div className="min-w-0">
                <p
                  className="truncate"
                  style={{ ...typography.body.desktop, color: colors.text.primary, fontSize: typography.fontSize.sm }}
                >
                  {doc.name}
                </p>
                <p style={{ ...typography.caption.desktop, color: colors.text.muted, marginTop: spacing.scale[1] }}>
                  {doc.status}
                </p>
              </div>
              <span
                style={{
                  ...typography.caption.desktop,
                  color: doc.status === "En cours" ? colors.orange[600] : colors.success.DEFAULT,
                  whiteSpace: "nowrap",
                }}
              >
                {doc.confidence}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HeroSection() {
  return (
    <section
      className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16"
      style={{ paddingBottom: spacing.section.gapLanding }}
    >
      <div className="flex flex-col" style={{ gap: spacing.scale[8] }}>
        <div className="flex flex-col" style={{ gap: spacing.scale[5] }}>
          <h1
            style={{
              ...typography.hero.desktop,
              color: colors.text.primary,
            }}
            className="max-lg:!text-[40px]"
          >
            Votre déclaration LMNP.
            <br />
            Enfin simple.
          </h1>
          <p
            className="max-w-lg"
            style={{
              ...typography.body.desktop,
              color: colors.text.secondary,
              lineHeight: typography.lineHeight.relaxed,
            }}
          >
            Déposez vos documents.
            <br />
            L&apos;IA prépare automatiquement votre déclaration LMNP.
            <br />
            Vérifiez simplement avant génération et télétransmission.
          </p>
        </div>

        <div
          className="inline-flex w-fit flex-col"
          style={{
            gap: spacing.scale[1],
            padding: spacing.scale[5],
            borderRadius: radius.xl,
            backgroundColor: colors.surface.primary,
            border: `1px solid ${colors.border.subtle}`,
            boxShadow: shadows.card.default,
          }}
        >
          <p
            style={{
              fontFamily: typography.fontFamily.display,
              fontSize: typography.fontSize["4xl"],
              lineHeight: typography.lineHeight.display,
              letterSpacing: typography.letterSpacing.display,
              color: colors.text.primary,
            }}
          >
            149 €{" "}
            <span style={{ fontSize: typography.fontSize.lg, color: colors.text.tertiary }}>
              TTC
            </span>
          </p>
          <p style={{ ...typography.caption.desktop, color: colors.text.tertiary }}>
            Télétransmission EDI incluse.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row" style={{ gap: spacing.scale[3] }}>
          <PrimaryButton href="/essayer">Commencer ma déclaration</PrimaryButton>
          <SecondaryButton href="/#demonstration">Voir la démonstration</SecondaryButton>
        </div>

        <div className="flex flex-wrap" style={{ gap: spacing.scale[3] }}>
          <TrustPill>Télétransmission EDI incluse</TrustPill>
          <TrustPill>Sauvegarde automatique</TrustPill>
          <TrustPill>Aucune connaissance comptable nécessaire</TrustPill>
        </div>
      </div>

      <div className="relative lg:pl-4">
        <div
          aria-hidden
          className="absolute -inset-8 -z-10 opacity-60"
          style={{ backgroundImage: gradients.landing.glowRight }}
        />
        <DashboardMockup />
      </div>
    </section>
  );
}

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Déposez vos documents",
    description: "Bail, amortissements, relevés — glissez vos pièces en quelques secondes.",
  },
  {
    step: "02",
    title: "L'IA prépare votre dossier",
    description: "Extraction silencieuse, classement automatique, montants pré-remplis.",
  },
  {
    step: "03",
    title: "Vérifiez simplement",
    description: "Relisez les éléments essentiels. Corrigez si besoin, en toute clarté.",
  },
  {
    step: "04",
    title: "Génération et télétransmission",
    description: "Votre liasse est générée et transmise. Vous gardez le contrôle.",
  },
] as const;

function HowItWorksSection() {
  return (
    <section
      id="fonctionnalites"
      style={{ paddingBlock: spacing.section.gapLanding }}
    >
      <SectionIntro
        title="Comment ça marche"
        subtitle="Quatre étapes. Un parcours calme, sans jargon comptable."
      />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {HOW_IT_WORKS.map((item) => (
          <article
            key={item.step}
            style={{
              padding: spacing.card.lg,
              borderRadius: radius.xl,
              backgroundColor: colors.surface.primary,
              border: `1px solid ${colors.border.subtle}`,
              boxShadow: shadows.card.default,
              transition: motions.hover.card,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = shadows.card.hover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = shadows.card.default;
            }}
          >
            <p
              style={{
                ...typography.caption.desktop,
                color: colors.orange[600],
                letterSpacing: typography.letterSpacing.caps,
                marginBottom: spacing.scale[4],
              }}
            >
              {item.step}
            </p>
            <h3
              style={{
                ...typography.cardTitle.desktop,
                color: colors.text.primary,
                marginBottom: spacing.scale[3],
              }}
            >
              {item.title}
            </h3>
            <p style={{ ...typography.body.desktop, color: colors.text.tertiary, fontSize: typography.fontSize.sm }}>
              {item.description}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

const DEMO_TABS = [
  {
    id: "dashboard",
    label: "Tableau de bord",
    title: "Une vue d'ensemble apaisée",
    description: "Suivez l'avancement de votre dossier sans surcharge visuelle.",
    metric: "68 % complété",
    items: ["3 documents analysés", "2 sections validées", "Sauvegarde automatique"],
  },
  {
    id: "upload",
    label: "Documents",
    title: "Dépôt de documents simplifié",
    description: "Glissez vos pièces. L'IA les lit et les classe pour vous.",
    metric: "Analyse en cours",
    items: ["Bail meublé — analysé", "Amortissements — analysé", "Relevé bancaire — en cours"],
  },
  {
    id: "amortissements",
    label: "Amortissements",
    title: "Amortissements pré-calculés",
    description: "Les montants sont extraits de vos documents, prêts à vérifier.",
    metric: "12 480 € amortis",
    items: ["Immobilisation — bien principal", "Mobilier — inventaire meublé", "Travaux — répartition automatique"],
  },
  {
    id: "validation",
    label: "Validation",
    title: "Validation en toute confiance",
    description: "Chaque montant est visible, expliqué, modifiable avant transmission.",
    metric: "4 champs à relire",
    items: ["Revenus locatifs — validé", "Charges — validé", "Intérêts d'emprunt — à confirmer"],
  },
] as const;

function DemoSection() {
  const [active, setActive] = useState<(typeof DEMO_TABS)[number]["id"]>("dashboard");
  const current = DEMO_TABS.find((tab) => tab.id === active)!;

  return (
    <section
      id="demonstration"
      style={{ paddingBlock: spacing.section.gapLanding }}
    >
      <SectionIntro
        title="Un logiciel qui vous guide calmement"
        subtitle="Découvrez l'expérience Fiscal AI — minimaliste, claire, rassurante."
      />

      <div
        className="overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ marginBottom: spacing.scale[8] }}
      >
        <div className="flex min-w-max justify-center gap-2">
          {DEMO_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActive(tab.id)}
              className="min-h-[44px]"
              style={{
                ...typography.navigation.desktop,
                color: active === tab.id ? colors.text.primary : colors.text.muted,
                fontWeight: active === tab.id ? typography.fontWeight.medium : typography.fontWeight.regular,
                padding: `${spacing.scale[2]} ${spacing.scale[5]}`,
                borderRadius: radius.full,
                border: `1px solid ${active === tab.id ? colors.border.selected : colors.border.subtle}`,
                backgroundColor: active === tab.id ? colors.surface.selected : "transparent",
                transition: motions.workflow.step,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2"
        style={{
          padding: spacing.card.xl,
          borderRadius: radius["2xl"],
          backgroundColor: colors.surface.primary,
          border: `1px solid ${colors.border.subtle}`,
          boxShadow: shadows.hero.floating,
          transition: motions.page.enter,
        }}
      >
        <div>
          <p
            style={{
              ...typography.caption.desktop,
              color: colors.orange[600],
              marginBottom: spacing.scale[3],
            }}
          >
            {current.metric}
          </p>
          <h3
            style={{
              ...typography.sectionTitle.desktop,
              fontSize: typography.fontSize["3xl"],
              color: colors.text.primary,
              marginBottom: spacing.scale[4],
            }}
          >
            {current.title}
          </h3>
          <p
            style={{
              ...typography.body.desktop,
              color: colors.text.secondary,
              marginBottom: spacing.scale[6],
              lineHeight: typography.lineHeight.relaxed,
            }}
          >
            {current.description}
          </p>
          <ul className="flex flex-col" style={{ gap: spacing.scale[3] }}>
            {current.items.map((item) => (
              <li
                key={item}
                className="flex items-center"
                style={{ gap: spacing.scale[3], ...typography.body.desktop, color: colors.text.tertiary }}
              >
                <span
                  aria-hidden
                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: colors.success.muted }}
                />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div
          style={{
            padding: spacing.card.lg,
            borderRadius: radius.xl,
            backgroundImage: gradients.card.inset,
            border: `1px solid ${colors.border.subtle}`,
            minHeight: "280px",
          }}
        >
          <div
            className="flex flex-col"
            style={{ gap: spacing.scale[3] }}
          >
            {current.items.map((item, index) => (
              <div
                key={item}
                style={{
                  padding: spacing.scale[4],
                  borderRadius: radius.lg,
                  backgroundColor: colors.surface.primary,
                  border: `1px solid ${colors.border.subtle}`,
                  opacity: 1 - index * 0.08,
                }}
              >
                <p style={{ ...typography.body.desktop, color: colors.text.primary, fontSize: typography.fontSize.sm }}>
                  {item}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const DIFFERENTIATORS = [
  {
    title: "Simple",
    description:
      "Pas de formulaires interminables. Un parcours guidé, étape par étape, dans un langage clair.",
  },
  {
    title: "Automatique",
    description:
      "L'IA extrait et organise vos données en silence. Vous validez, vous ne saisissez plus.",
  },
  {
    title: "Transparent",
    description:
      "Chaque montant est visible et modifiable. Aucune boîte noire, aucune surprise.",
  },
] as const;

function DifferentiatorsSection() {
  return (
    <section style={{ paddingBlock: spacing.section.gapLanding }}>
      <SectionIntro
        title="Pourquoi c'est différent"
        subtitle="Conçu pour les propriétaires LMNP, pas pour les experts-comptables."
      />
      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {DIFFERENTIATORS.map((item) => (
          <article
            key={item.title}
            style={{
              padding: spacing.card.xl,
              borderRadius: radius.xl,
              backgroundColor: "transparent",
            }}
          >
            <h3
              style={{
                fontFamily: typography.fontFamily.display,
                fontSize: typography.fontSize["2xl"],
                lineHeight: typography.lineHeight.heading,
                letterSpacing: typography.letterSpacing.heading,
                color: colors.text.primary,
                marginBottom: spacing.scale[4],
              }}
            >
              {item.title}
            </h3>
            <p style={{ ...typography.body.desktop, color: colors.text.tertiary, lineHeight: typography.lineHeight.relaxed }}>
              {item.description}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function AiSection() {
  return (
    <section
      style={{
        paddingBlock: spacing.section.gapLanding,
        paddingInline: spacing.card.xl,
        borderRadius: radius["2xl"],
        backgroundColor: colors.surface.primary,
        border: `1px solid ${colors.border.subtle}`,
        boxShadow: shadows.card.default,
      }}
    >
      <div className="mx-auto max-w-3xl text-center">
        <p
          style={{
            ...typography.caption.desktop,
            color: colors.text.muted,
            letterSpacing: typography.letterSpacing.caps,
            textTransform: "uppercase",
            marginBottom: spacing.scale[4],
          }}
        >
          Intelligence discrète
        </p>
        <h2
          style={{
            ...typography.sectionTitle.desktop,
            color: colors.text.primary,
            marginBottom: spacing.scale[5],
          }}
          className="max-lg:!text-[30px]"
        >
          L&apos;IA travaille en silence.
          <br />
          Vous gardez la main.
        </h2>
        <p
          style={{
            ...typography.body.desktop,
            color: colors.text.secondary,
            lineHeight: typography.lineHeight.relaxed,
          }}
        >
          Fiscal AI lit vos documents, extrait les montants et prépare votre dossier
          — sans interface futuriste, sans promesses excessives. Vous vérifiez
          chaque élément avant la génération. C&apos;est un assistant, pas un
          remplacement.
        </p>
      </div>
    </section>
  );
}

const SECURITY_ITEMS = [
  "Hébergement en France",
  "Chiffrement des données en transit et au repos",
  "Sauvegarde automatique continue",
  "Aucune revente de vos données",
] as const;

function SecuritySection() {
  return (
    <section style={{ paddingBlock: spacing.section.gapLanding }}>
      <SectionIntro
        title="Vos données, protégées"
        subtitle="La confiance est au cœur de notre approche."
        align="left"
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SECURITY_ITEMS.map((item) => (
          <div
            key={item}
            className="flex items-center"
            style={{
              gap: spacing.scale[4],
              padding: spacing.scale[5],
              borderRadius: radius.lg,
              border: `1px solid ${colors.border.subtle}`,
              backgroundColor: colors.surface.primary,
            }}
          >
            <span
              aria-hidden
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center"
              style={{
                borderRadius: radius.full,
                backgroundColor: colors.success.light,
                color: colors.success.DEFAULT,
                fontSize: typography.fontSize.sm,
              }}
            >
              ✓
            </span>
            <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>
              {item}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function PricingSection() {
  return (
    <section
      id="tarifs"
      style={{ paddingBlock: spacing.section.gapLanding }}
    >
      <SectionIntro
        title="Un tarif clair"
        subtitle="Tout inclus. Aucun abonnement caché."
      />
      <div
        className="mx-auto max-w-md text-center"
        style={{
          padding: spacing.card.xl,
          borderRadius: radius["2xl"],
          backgroundColor: colors.surface.primary,
          border: `1px solid ${colors.border.subtle}`,
          boxShadow: shadows.hero.floating,
        }}
      >
        <p
          style={{
            fontFamily: typography.fontFamily.display,
            fontSize: typography.fontSize["5xl"],
            lineHeight: typography.lineHeight.display,
            color: colors.text.primary,
            marginBottom: spacing.scale[2],
          }}
        >
          149 €{" "}
          <span style={{ fontSize: typography.fontSize.xl, color: colors.text.tertiary }}>
            TTC
          </span>
        </p>
        <p
          style={{
            ...typography.body.desktop,
            color: colors.text.secondary,
            marginBottom: spacing.scale[6],
          }}
        >
          Déclaration LMNP complète
          <br />
          Télétransmission EDI incluse
        </p>
        <ul
          className="mb-8 flex flex-col text-left"
          style={{ gap: spacing.scale[3], marginBottom: spacing.scale[8] }}
        >
          {[
            "Préparation automatique du dossier",
            "Génération de la liasse fiscale",
            "Télétransmission aux impôts",
            "Support par email",
          ].map((feature) => (
            <li
              key={feature}
              className="flex items-center"
              style={{ gap: spacing.scale[3], ...typography.body.desktop, color: colors.text.tertiary }}
            >
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: colors.orange[400] }}
              />
              {feature}
            </li>
          ))}
        </ul>
        <PrimaryButton href="/essayer" className="w-full">
          Commencer ma déclaration
        </PrimaryButton>
      </div>
    </section>
  );
}

const FAQ_ITEMS = [
  {
    question: "Ai-je besoin de connaissances comptables ?",
    answer:
      "Non. Fiscal AI est conçu pour les propriétaires LMNP sans formation comptable. Vous déposez vos documents, vérifiez les montants extraits, et nous nous occupons de la génération et de la télétransmission.",
  },
  {
    question: "Quels documents dois-je fournir ?",
    answer:
      "Typiquement : votre bail meublé, vos relevés de loyers, votre tableau d'amortissement, vos justificatifs de charges et d'emprunt. La liste s'adapte à votre situation.",
  },
  {
    question: "La télétransmission est-elle vraiment incluse ?",
    answer:
      "Oui. Les 149 € TTC comprennent la préparation du dossier, la génération de la liasse et la télétransmission EDI aux impôts.",
  },
  {
    question: "Puis-je modifier les montants proposés ?",
    answer:
      "Absolument. Chaque montant extrait est visible et modifiable avant validation. Vous gardez le contrôle total sur votre déclaration.",
  },
  {
    question: "Mes données sont-elles sécurisées ?",
    answer:
      "Vos documents sont chiffrés, hébergés en France, et ne sont jamais revendus. La sauvegarde est automatique tout au long du parcours.",
  },
] as const;

function FaqItem({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        borderBottom: `1px solid ${colors.border.subtle}`,
        paddingBlock: spacing.scale[5],
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full min-h-[44px] items-center justify-between gap-4 text-left"
        aria-expanded={open}
      >
        <span style={{ ...typography.body.desktop, color: colors.text.primary, fontWeight: typography.fontWeight.medium }}>
          {question}
        </span>
        <span
          aria-hidden
          style={{
            ...typography.body.desktop,
            color: colors.text.muted,
            transform: open ? "rotate(45deg)" : "rotate(0deg)",
            transition: motions.workflow.step,
          }}
        >
          +
        </span>
      </button>
      <div
        style={{
          maxHeight: open ? "400px" : "0",
          opacity: open ? 1 : 0,
          overflow: "hidden",
          transition: motions.modal.overlay,
        }}
      >
        <p
          style={{
            ...typography.body.desktop,
            color: colors.text.tertiary,
            lineHeight: typography.lineHeight.relaxed,
            paddingTop: spacing.scale[3],
            paddingRight: spacing.scale[8],
          }}
        >
          {answer}
        </p>
      </div>
    </div>
  );
}

function FaqSection() {
  return (
    <section
      id="faq"
      style={{ paddingBlock: spacing.section.gapLanding }}
    >
      <SectionIntro title="Questions fréquentes" />
      <div className="mx-auto max-w-3xl">
        {FAQ_ITEMS.map((item) => (
          <FaqItem key={item.question} question={item.question} answer={item.answer} />
        ))}
      </div>
    </section>
  );
}

function FinalCtaSection() {
  return (
    <section
      className="text-center"
      style={{
        paddingBlock: spacing.scale[32],
        marginBottom: spacing.section.gap,
      }}
    >
      <h2
        style={{
          ...typography.sectionTitle.desktop,
          color: colors.text.primary,
          marginBottom: spacing.scale[5],
        }}
        className="mx-auto max-w-2xl max-lg:!text-[30px]"
      >
        Prêt à simplifier votre déclaration LMNP ?
      </h2>
      <p
        className="mx-auto max-w-xl"
        style={{
          ...typography.body.desktop,
          color: colors.text.secondary,
          marginBottom: spacing.scale[8],
          lineHeight: typography.lineHeight.relaxed,
        }}
      >
        Rejoignez les propriétaires qui ont choisi un parcours calme, clair et
        sans stress.
      </p>
      <div className="flex flex-col items-center justify-center sm:flex-row" style={{ gap: spacing.scale[3] }}>
        <PrimaryButton href="/essayer">Commencer ma déclaration</PrimaryButton>
        <SecondaryButton href="/contact">Nous contacter</SecondaryButton>
      </div>
    </section>
  );
}

export function LandingPage() {
  return (
    <PublicLayout>
      <HeroSection />
      <HowItWorksSection />
      <DemoSection />
      <DifferentiatorsSection />
      <AiSection />
      <SecuritySection />
      <PricingSection />
      <FaqSection />
      <FinalCtaSection />
    </PublicLayout>
  );
}

export default LandingPage;
