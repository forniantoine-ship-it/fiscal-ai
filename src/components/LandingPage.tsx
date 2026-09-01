"use client";

import { useEffect, useState, type ReactNode } from "react";

import { PublicLayout } from "@/design-system/layouts/PublicLayout";
import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import { PrimaryButton, SecondaryButton } from "@/components/landing/LandingButtons";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import {
  DEMO_FLOW,
  HeroDashboardMockup,
} from "@/components/landing/ProductMockups";

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
        <p style={{ ...typography.body.desktop, color: colors.text.tertiary }}>{subtitle}</p>
      ) : null}
    </div>
  );
}

function TrustPoint({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        ...typography.caption.desktop,
        color: colors.text.muted,
      }}
    >
      {children}
    </span>
  );
}

function HeroSection() {
  return (
    <section
      className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-20"
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
          <PrimaryButton href={LMNP_ROUTES.signup}>Commencer ma déclaration</PrimaryButton>
          <SecondaryButton href="/#demonstration">Voir la démonstration</SecondaryButton>
        </div>

        <div
          className="flex flex-wrap items-center"
          style={{ gap: spacing.scale[4], rowGap: spacing.scale[2] }}
        >
          <TrustPoint>Télétransmission EDI incluse</TrustPoint>
          <span aria-hidden style={{ color: colors.border.default }}>
            ·
          </span>
          <TrustPoint>Sauvegarde automatique</TrustPoint>
          <span aria-hidden style={{ color: colors.border.default }}>
            ·
          </span>
          <TrustPoint>Aucune connaissance comptable nécessaire</TrustPoint>
        </div>
      </div>

      <div className="relative lg:pl-4">
        <div
          aria-hidden
          className="absolute -inset-8 -z-10 opacity-60"
          style={{ backgroundImage: gradients.landing.glowRight }}
        />
        <HeroDashboardMockup />
      </div>
    </section>
  );
}

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Déposez vos documents",
    description:
      "Acte notarié, prêt, revenus, charges…\nImportez simplement vos documents.",
  },
  {
    step: "02",
    title: "L'IA prépare votre dossier",
    description:
      "L'IA détecte automatiquement les informations nécessaires et prépare votre déclaration.",
  },
  {
    step: "03",
    title: "Vérifiez simplement",
    description: "Corrigez ou validez les informations détectées.",
  },
  {
    step: "04",
    title: "Génération et télétransmission",
    description: "Votre déclaration est générée et télétransmise automatiquement.",
  },
] as const;

function HowItWorksSection() {
  return (
    <section id="fonctionnement" style={{ paddingBlock: spacing.section.gapLanding }}>
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
            <p
              className="whitespace-pre-line"
              style={{
                ...typography.body.desktop,
                color: colors.text.tertiary,
                fontSize: typography.fontSize.sm,
                lineHeight: typography.lineHeight.relaxed,
              }}
            >
              {item.description}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function DemoSection() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % DEMO_FLOW.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, []);

  const active = DEMO_FLOW[activeIndex];
  const ActiveMockup = active.Mockup;

  return (
    <section id="demonstration" style={{ paddingBlock: spacing.section.gapLanding }}>
      <SectionIntro
        title="Une expérience fluide"
        subtitle="De vos documents à la déclaration prête — sans effort."
      />

      <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <div className="flex flex-col" style={{ gap: spacing.scale[2] }}>
            {DEMO_FLOW.map((step, index) => {
              const isActive = index === activeIndex;
              const isPast = index < activeIndex;

              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className="flex min-h-[44px] items-center text-left"
                  style={{
                    gap: spacing.scale[4],
                    padding: spacing.scale[4],
                    borderRadius: radius.lg,
                    border: `1px solid ${isActive ? colors.border.selected : colors.border.subtle}`,
                    backgroundColor: isActive ? colors.surface.selected : "transparent",
                    transition: motions.workflow.step,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      ...typography.caption.desktop,
                      color: isActive ? colors.orange[600] : isPast ? colors.success.DEFAULT : colors.text.muted,
                      width: "1.5rem",
                      flexShrink: 0,
                    }}
                  >
                    {isPast ? "✓" : index + 1}
                  </span>
                  <span
                    style={{
                      ...typography.body.desktop,
                      color: isActive ? colors.text.primary : colors.text.secondary,
                      fontWeight: isActive ? typography.fontWeight.medium : typography.fontWeight.regular,
                    }}
                  >
                    {step.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-8">
          <div
            key={active.id}
            style={{
              animation: "fiscal-fade-in 0.5s ease-out",
            }}
          >
            <ActiveMockup />
          </div>
        </div>
      </div>
    </section>
  );
}

const DIFFERENTIATORS = [
  {
    title: "Simple",
    description: "Aucune connaissance comptable nécessaire.",
  },
  {
    title: "Automatique",
    description: "L'IA prépare votre déclaration à partir de vos documents.",
  },
  {
    title: "Transparent",
    description: "149 € TTC, télétransmission incluse.",
  },
] as const;

function DifferentiatorsSection() {
  return (
    <section style={{ paddingBlock: spacing.section.gapLanding }}>
      <div className="mx-auto max-w-2xl text-center" style={{ marginBottom: spacing.section.titleToContent }}>
        <p
          style={{
            ...typography.body.desktop,
            color: colors.text.secondary,
            lineHeight: typography.lineHeight.relaxed,
          }}
        >
          Les logiciels LMNP sont souvent complexes.
          <br />
          Nous avons conçu une alternative beaucoup plus simple.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {DIFFERENTIATORS.map((item) => (
          <article
            key={item.title}
            className="text-center"
            style={{
              padding: spacing.card.xl,
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
            <p
              style={{
                ...typography.body.desktop,
                color: colors.text.tertiary,
                lineHeight: typography.lineHeight.relaxed,
              }}
            >
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
        <h2
          style={{
            ...typography.sectionTitle.desktop,
            color: colors.text.primary,
            marginBottom: spacing.scale[5],
          }}
          className="max-lg:!text-[30px]"
        >
          Une IA utile et silencieuse.
        </h2>
        <p
          style={{
            ...typography.body.desktop,
            color: colors.text.secondary,
            lineHeight: typography.lineHeight.relaxed,
          }}
        >
          L&apos;IA analyse vos documents, prépare les amortissements, classe vos charges et
          structure automatiquement votre dossier LMNP.
        </p>
      </div>
    </section>
  );
}

const SECURITY_ITEMS = [
  {
    title: "Documents chiffrés",
    description: "Vos pièces sont protégées tout au long du parcours.",
  },
  {
    title: "Sauvegarde sécurisée",
    description: "Votre dossier est enregistré automatiquement à chaque étape.",
  },
  {
    title: "Confidentialité",
    description: "Vos données ne sont jamais revendues ni partagées.",
  },
  {
    title: "Hébergement sécurisé",
    description: "Infrastructure fiable, hébergée en France.",
  },
] as const;

function SecuritySection() {
  return (
    <section id="securite" style={{ paddingBlock: spacing.section.gapLanding }}>
      <SectionIntro
        title="Vos documents, en confiance"
        subtitle="La sécurité de votre dossier est une priorité."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SECURITY_ITEMS.map((item) => (
          <div
            key={item.title}
            style={{
              padding: spacing.scale[6],
              borderRadius: radius.lg,
              border: `1px solid ${colors.border.subtle}`,
              backgroundColor: colors.surface.primary,
            }}
          >
            <p
              style={{
                ...typography.body.desktop,
                color: colors.text.primary,
                fontWeight: typography.fontWeight.medium,
                marginBottom: spacing.scale[2],
              }}
            >
              {item.title}
            </p>
            <p style={{ ...typography.body.desktop, color: colors.text.tertiary, fontSize: typography.fontSize.sm }}>
              {item.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

const PRICING_FEATURES = [
  "Génération déclaration",
  "Amortissements automatiques",
  "Télétransmission EDI",
  "Sauvegarde dossier",
  "Génération PDF",
] as const;

function PricingSection() {
  return (
    <section id="tarifs" style={{ paddingBlock: spacing.section.gapLanding }}>
      <SectionIntro title="Un tarif clair" subtitle="Tout inclus. Aucun abonnement." />
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
            ...typography.caption.desktop,
            color: colors.text.muted,
            letterSpacing: typography.letterSpacing.caps,
            textTransform: "uppercase",
            marginBottom: spacing.scale[4],
          }}
        >
          Déclaration LMNP
        </p>
        <p
          style={{
            fontFamily: typography.fontFamily.display,
            fontSize: typography.fontSize["5xl"],
            lineHeight: typography.lineHeight.display,
            color: colors.text.primary,
            marginBottom: spacing.scale[6],
          }}
        >
          149 €{" "}
          <span style={{ fontSize: typography.fontSize.xl, color: colors.text.tertiary }}>
            TTC
          </span>
        </p>
        <ul
          className="mb-8 flex flex-col text-left"
          style={{ gap: spacing.scale[3], marginBottom: spacing.scale[8] }}
        >
          {PRICING_FEATURES.map((feature) => (
            <li
              key={feature}
              className="flex items-center"
              style={{
                gap: spacing.scale[3],
                ...typography.body.desktop,
                color: colors.text.tertiary,
              }}
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
        <PrimaryButton href={LMNP_ROUTES.signup} className="w-full">
          Commencer ma déclaration
        </PrimaryButton>
        <p
          style={{
            ...typography.caption.desktop,
            color: colors.text.muted,
            marginTop: spacing.scale[6],
            lineHeight: typography.lineHeight.relaxed,
          }}
        >
          Plusieurs logements ?
          <br />
          Demandez un devis personnalisé.
        </p>
      </div>
    </section>
  );
}

const FAQ_ITEMS = [
  {
    question: "Dois-je connaître la comptabilité ?",
    answer:
      "Non. Fiscal AI est conçu pour les propriétaires LMNP sans formation comptable. Vous déposez vos documents, vérifiez les informations détectées, et nous nous occupons du reste.",
  },
  {
    question: "La télétransmission est-elle incluse ?",
    answer:
      "Oui. Les 149 € TTC comprennent la génération de votre déclaration et la télétransmission EDI aux impôts.",
  },
  {
    question: "Quels documents dois-je fournir ?",
    answer:
      "Acte notarié, tableau d'amortissement, relevés de loyers, justificatifs de charges et d'emprunt. La liste s'adapte à votre situation.",
  },
  {
    question: "Puis-je corriger les informations ?",
    answer:
      "Oui. Chaque montant extrait est visible et modifiable avant validation. Vous gardez le contrôle total sur votre déclaration.",
  },
  {
    question: "Mes documents sont-ils sécurisés ?",
    answer:
      "Vos documents sont chiffrés, hébergés en France, et ne sont jamais revendus. La sauvegarde est automatique tout au long du parcours.",
  },
  {
    question: "LMNP et LMP sont-ils compatibles ?",
    answer:
      "Fiscal AI est optimisé pour la déclaration LMNP au régime réel. Pour le statut LMP ou des situations complexes, contactez-nous pour un accompagnement personnalisé.",
  },
  {
    question: "Combien de temps cela prend-il ?",
    answer:
      "La plupart des dossiers sont prêts en moins d'une heure, une fois vos documents déposés. L'analyse IA est quasi instantanée.",
  },
  {
    question: "Puis-je reprendre mon dossier plus tard ?",
    answer:
      "Oui. Votre dossier est sauvegardé automatiquement. Vous pouvez reprendre à tout moment, là où vous vous étiez arrêté.",
  },
] as const;

function FaqItem({ question, answer }: { question: string; answer: string }) {
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
        className="flex min-h-[44px] w-full items-center justify-between gap-4 text-left"
        aria-expanded={open}
      >
        <span
          style={{
            ...typography.body.desktop,
            color: colors.text.primary,
            fontWeight: typography.fontWeight.medium,
          }}
        >
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
    <section id="faq" style={{ paddingBlock: spacing.section.gapLanding }}>
      <SectionIntro title="Questions fréquentes" />
      <div className="mx-auto max-w-3xl">
        {FAQ_ITEMS.map((item) => (
          <FaqItem key={item.question} question={item.question} answer={item.answer} />
        ))}
      </div>
    </section>
  );
}

const SOCIAL_PROOF = [
  "Pensé pour les non comptables",
  "Une expérience LMNP plus simple",
  "Déclaration assistée par IA",
] as const;

function SocialProofSection() {
  return (
    <section style={{ paddingBlock: spacing.section.gap }}>
      <div
        className="flex flex-wrap items-center justify-center"
        style={{ gap: spacing.scale[8] }}
      >
        {SOCIAL_PROOF.map((item) => (
          <span
            key={item}
            style={{
              ...typography.caption.desktop,
              color: colors.text.muted,
              letterSpacing: typography.letterSpacing.caps,
              textTransform: "uppercase",
            }}
          >
            {item}
          </span>
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
        Votre déclaration LMNP n&apos;a jamais été aussi simple.
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
        Déposez vos documents.
        <br />
        L&apos;IA prépare le reste.
      </p>
      <PrimaryButton href={LMNP_ROUTES.signup}>Commencer ma déclaration</PrimaryButton>
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
      <SocialProofSection />
      <FinalCtaSection />
    </PublicLayout>
  );
}

export default LandingPage;
