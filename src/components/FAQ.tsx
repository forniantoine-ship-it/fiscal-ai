"use client";

import { useState } from "react";

import { SectionHeading } from "@/design-system/components/Section";
import { colors } from "@/design-system/theme/colors";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

const faqs = [
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

function FaqAccordionItem({
  question,
  answer,
  isOpen,
  onToggle,
}: {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      style={{
        overflow: "hidden",
        borderRadius: radius.lg,
        border: `1px solid ${colors.border.subtle}`,
        backgroundColor: colors.surface.primary,
      }}
    >
      <button
        type="button"
        className="flex w-full min-h-[44px] items-center justify-between gap-4 text-left"
        style={{ padding: `${spacing.scale[5]} ${spacing.scale[6]}` }}
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <span style={{ ...typography.body.desktop, color: colors.text.primary, fontWeight: typography.fontWeight.medium }}>
          {question}
        </span>
        <svg
          className="h-5 w-5 shrink-0"
          style={{
            color: colors.text.accent,
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: motions.workflow.step,
          }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen ? (
        <div
          style={{
            borderTop: `1px solid ${colors.border.subtle}`,
            padding: `0 ${spacing.scale[6]} ${spacing.scale[5]}`,
          }}
        >
          <p
            style={{
              ...typography.body.desktop,
              color: colors.text.secondary,
              lineHeight: typography.lineHeight.relaxed,
            }}
          >
            {answer}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section
      id="faq"
      style={{
        borderTop: `1px solid ${colors.border.subtle}`,
        paddingBlock: spacing.section.gapLanding,
      }}
    >
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          label="FAQ"
          title="Questions fréquentes"
          description="Tout ce que vous devez savoir avant de lancer votre déclaration LMNP."
        />

        <div className="mt-12 space-y-3">
          {faqs.map((faq, index) => (
            <FaqAccordionItem
              key={faq.question}
              question={faq.question}
              answer={faq.answer}
              isOpen={openIndex === index}
              onToggle={() => setOpenIndex(openIndex === index ? null : index)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
