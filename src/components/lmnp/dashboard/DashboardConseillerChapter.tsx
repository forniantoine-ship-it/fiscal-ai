"use client";

import { useMemo, useState } from "react";

import type { WorkflowStepView } from "@/components/lmnp/dashboard/dashboard-workflow-model";
import { Button } from "@/design-system/components/Button";
import { Chapter } from "@/design-system/layouts/FullHeightChapters";
import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

type DashboardConseillerChapterProps = {
  title: string;
  explanation: string;
  primaryLabel: string;
  primaryHref?: string;
  onPrimaryClick?: () => void;
  startJourney?: boolean;
  currentStep: WorkflowStepView | null;
};

type ConseillerSuggestion = {
  id: string;
  question: string;
  answer: string;
};

const REVEAL = "animate-[fiscal-fade-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]";

/** Retire ou remplace les mentions « IA » dans les textes affichés par le conseiller. */
function humanizeConseillerText(text: string): string {
  return text
    .replace(/extraits par l'IA/gi, "extraits automatiquement")
    .replace(/demandés par l'IA/gi, "demandés")
    .replace(/L'IA extrait automatiquement les données importantes/gi, "Les informations importantes sont extraites automatiquement")
    .replace(/L'IA extrait automatiquement/gi, "Les informations sont extraites automatiquement")
    .replace(/l'IA a identifié/gi, "nous avons repéré")
    .replace(/L'IA a identifié/g, "Nous avons repéré")
    .replace(/\bl'IA\b/gi, "votre conseiller")
    .replace(/\bL'IA\b/g, "Votre conseiller")
    .replace(/\bIA\b/g, "conseiller");
}

function formatDocumentForQuestion(requestedDocument: string): string {
  const lower = requestedDocument.toLowerCase();
  if (lower.includes("inpi") || lower.includes("kbis")) return "mon extrait INPI";
  if (lower.includes("acte")) return "mon acte notarié";
  if (lower.includes("tableau")) return "mon tableau d'amortissement";
  if (lower.includes("relevé") || lower.includes("loyer")) return "mes relevés de loyers";
  if (lower.includes("facture") || lower.includes("charges")) return "mes justificatifs de charges";
  if (lower.includes("travaux") || lower.includes("mobilier")) return "mes factures de travaux ou de mobilier";
  return `mon ${lower}`;
}

function resolveDurationHint(
  heroTitle: string,
  startJourney?: boolean,
): string | null {
  if (startJourney) return null;
  if (heroTitle === "Informations à confirmer") return "Quelques minutes";
  if (heroTitle === "Analyse terminée") return "Quelques minutes";
  if (heroTitle === "Votre dossier LMNP est prêt") return "Quelques minutes";
  return null;
}

function buildSuggestions(
  currentStep: WorkflowStepView | null,
  heroTitle: string,
): ConseillerSuggestion[] {
  if (heroTitle === "Informations à confirmer") {
    return [
      {
        id: "what-check",
        question: "Que dois-je vérifier exactement ?",
        answer:
          "Repérez les champs signalés et confirmez ou corrigez chaque valeur. Cela garantit que votre déclaration reflète bien votre situation.",
      },
      {
        id: "can-later",
        question: "Puis-je corriger plus tard ?",
        answer:
          "Oui. Vous pouvez revenir sur cette étape à tout moment avant la validation finale de votre dossier.",
      },
    ];
  }

  if (heroTitle === "Analyse terminée") {
    return [
      {
        id: "what-suggestions",
        question: "Que sont ces suggestions d'amortissement ?",
        answer:
          "Il s'agit de charges que votre conseiller a repérées et qui pourraient être amorties. Vous décidez lesquelles retenir.",
      },
      {
        id: "must-accept",
        question: "Dois-je toutes les accepter ?",
        answer:
          "Non. Examinez chaque suggestion et ne validez que celles qui correspondent à votre situation réelle.",
      },
    ];
  }

  if (heroTitle === "Votre dossier LMNP est prêt") {
    return [
      {
        id: "what-next",
        question: "Que se passe-t-il ensuite ?",
        answer:
          "Vous passez à la préparation de votre déclaration. Vous pourrez la relire avant toute transmission.",
      },
      {
        id: "still-edit",
        question: "Puis-je encore modifier mon dossier ?",
        answer:
          "Oui, tant que vous n'avez pas validé la déclaration finale, chaque étape reste accessible.",
      },
    ];
  }

  const doc = currentStep?.requestedDocument;
  const suggestions: ConseillerSuggestion[] = [];

  if (doc) {
    suggestions.push({
      id: "why-doc",
      question: `Pourquoi ai-je besoin de ${formatDocumentForQuestion(doc)} ?`,
      answer:
        currentStep?.documentPrompt
          ? `${humanizeConseillerText(currentStep.documentPrompt)} Ce document permet de préremplir votre dossier et d'éviter les saisies inutiles.`
          : "Ce document permet de préremplir votre dossier et d'éviter les saisies inutiles.",
    });
  }

  suggestions.push({
    id: "what-happens",
    question: "Que se passe-t-il après l'import ?",
    answer:
      "Votre conseiller lit le document, extrait les informations utiles et vous les présente pour vérification avant validation.",
  });

  if (doc) {
    suggestions.push({
      id: "no-doc",
      question: `Je n'ai pas ${formatDocumentForQuestion(doc)} sous la main`,
      answer:
        "Prenez le temps de le retrouver — vous pouvez revenir quand vous êtes prêt. Aucune saisie n'est perdue entre les visites.",
    });
  }

  return suggestions.slice(0, 3);
}

export function DashboardConseillerChapter({
  title,
  explanation,
  primaryLabel,
  primaryHref,
  onPrimaryClick,
  startJourney,
  currentStep,
}: DashboardConseillerChapterProps) {
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [activeSuggestionId, setActiveSuggestionId] = useState<string | null>(null);

  const displayTitle = humanizeConseillerText(title);
  const displayExplanation = humanizeConseillerText(explanation);
  const durationHint = resolveDurationHint(title, startJourney);
  const suggestions = useMemo(
    () => buildSuggestions(currentStep, title),
    [currentStep, title],
  );
  const activeSuggestion = suggestions.find((item) => item.id === activeSuggestionId) ?? null;

  const toggleQuestions = () => {
    setQuestionsOpen((open) => {
      if (open) setActiveSuggestionId(null);
      return !open;
    });
  };

  const toggleSuggestion = (id: string) => {
    setActiveSuggestionId((current) => (current === id ? null : id));
  };

  return (
    <Chapter aria-label="Le Conseiller">
      <div
        className="mx-auto w-full max-w-xl px-6"
        style={{ paddingBlock: spacing.scale[12] }}
      >
        <div
          className={`text-center ${REVEAL}`}
          style={{
            borderRadius: radius.xl,
            border: `1px solid ${colors.border.selected}`,
            boxShadow: shadows.card.default,
            padding: spacing.card.xl,
            backgroundImage: [
              `radial-gradient(ellipse 88% 56% at 50% 0%, ${colors.orange[100]} 0%, ${colors.orange[50]} 42%, transparent 72%)`,
              gradients.card.elevated,
            ].join(", "),
          }}
        >
          <p
            style={{
              ...typography.caption.desktop,
              color: colors.text.accent,
              letterSpacing: typography.letterSpacing.label,
              textTransform: "uppercase",
            }}
          >
            À faire maintenant
          </p>

          <h1
            className="mx-auto mt-4 max-w-lg"
            style={{
              fontFamily: typography.fontFamily.display,
              fontSize: `clamp(${typography.sectionTitle.mobile.fontSize}px, 5vw, ${typography.sectionTitle.desktop.fontSize}px)`,
              lineHeight: typography.lineHeight.display,
              letterSpacing: typography.letterSpacing.display,
              fontWeight: typography.fontWeight.regular,
              color: colors.text.primary,
            }}
          >
            {displayTitle}
          </h1>

          <p
            className="mx-auto mt-6 max-w-md whitespace-pre-line"
            style={{
              ...typography.body.desktop,
              color: colors.text.secondary,
              lineHeight: typography.lineHeight.relaxed,
            }}
          >
            {displayExplanation}
          </p>

          {durationHint ? (
            <p
              className="mt-6"
              style={{
                ...typography.caption.desktop,
                color: colors.text.tertiary,
              }}
            >
              {durationHint}
            </p>
          ) : null}

          <div className="mt-8 flex justify-center">
            {onPrimaryClick ? (
              <Button onClick={onPrimaryClick}>{primaryLabel}</Button>
            ) : (
              <Button href={primaryHref}>{primaryLabel}</Button>
            )}
          </div>

          <p
            className="mx-auto mt-5 max-w-sm"
            style={{
              ...typography.caption.desktop,
              color: colors.text.muted,
              lineHeight: typography.lineHeight.ui,
            }}
          >
            Vos données sont sécurisées et confidentielles.
          </p>
        </div>

        <div className={`mt-8 text-center ${REVEAL}`} style={{ animationDelay: "120ms" }}>
          <button
            type="button"
            onClick={toggleQuestions}
            aria-expanded={questionsOpen}
            style={{
              ...typography.caption.desktop,
              color: colors.text.muted,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: `${spacing.scale[2]} ${spacing.scale[3]}`,
              textDecoration: questionsOpen ? "none" : "underline",
              textUnderlineOffset: "3px",
            }}
          >
            Une question sur cette étape ?
          </button>

          {questionsOpen ? (
            <div className="mx-auto mt-4 max-w-md text-left">
              <ul className="flex flex-col" style={{ gap: spacing.scale[2] }}>
                {suggestions.map((suggestion) => {
                  const isActive = activeSuggestionId === suggestion.id;
                  return (
                    <li key={suggestion.id}>
                      <button
                        type="button"
                        onClick={() => toggleSuggestion(suggestion.id)}
                        aria-expanded={isActive}
                        className="w-full text-left"
                        style={{
                          ...typography.caption.desktop,
                          color: isActive ? colors.text.secondary : colors.text.muted,
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: `${spacing.scale[2]} 0`,
                        }}
                      >
                        {suggestion.question}
                      </button>
                      {isActive ? (
                        <p
                          className="pb-2"
                          style={{
                            ...typography.caption.desktop,
                            color: colors.text.secondary,
                            lineHeight: typography.lineHeight.relaxed,
                          }}
                        >
                          {humanizeConseillerText(suggestion.answer)}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </Chapter>
  );
}
