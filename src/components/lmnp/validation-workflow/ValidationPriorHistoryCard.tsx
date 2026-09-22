"use client";

import { useState } from "react";

import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import type { PriorHistoryEligibility } from "@/lib/lmnp/services/declaration/prior-history-eligibility";
import type { PriorHistoryDeclarationStatus } from "@/lib/lmnp/types/domain";

/**
 * P0 launch safety — antériorité LMNP au réel non reprise. Une seule question,
 * posée uniquement quand les données ne prouvent pas la situation (jamais
 * quand une continuité Fiscal AI réelle existe), puis persistée avec
 * l'exercice. Aucune décision ici : `resolvePriorHistoryEligibility()` reste
 * l'unique juge, ce composant reflète son résultat.
 */

export const PRIOR_HISTORY_COPY = {
  title: "Votre situation avant cette déclaration",
  question: "Avez-vous déjà déclaré votre activité LMNP au régime réel les années précédentes ?",
  options: [
    { status: "FIRST_REAL_YEAR", label: "Non, c'est ma première déclaration LMNP au régime réel" },
    { status: "FISCAL_AI_PREVIOUS", label: "Oui, l'année précédente a été réalisée avec Fiscal AI" },
    { status: "EXTERNAL_HISTORY", label: "Oui, avec un autre comptable ou logiciel" },
  ] satisfies { status: PriorHistoryDeclarationStatus; label: string }[],
  confirmed: "Première déclaration LMNP au régime réel.",
  change: "Modifier",
  blocked: {
    EXTERNAL_HISTORY_DECLARED:
      "Pour établir correctement votre déclaration, nous devons reprendre certains éléments de votre comptabilité précédente, notamment les déficits et amortissements reportables. Cette reprise n'est pas encore disponible.",
    FISCAL_AI_CLAIM_WITHOUT_CONTINUITY:
      "Nous ne retrouvons pas votre déclaration de l'année précédente dans ce navigateur. Reconnectez-vous depuis l'appareil et le navigateur utilisés l'an dernier. Sans elle, nous ne pouvons pas reprendre vos déficits et amortissements reportables.",
    NATIVE_CONTINUITY_MISSING:
      "Les informations reportées de votre exercice précédent sont introuvables. Nous ne pouvons pas finaliser cette déclaration sans elles, afin d'éviter un calcul erroné. Contactez-nous à aide@fiscal-ai.fr : nous retrouverons votre dossier avec vous.",
  },
  technicalDetail: "Détail technique",
  footer: "Vous ne pouvez pas finaliser votre déclaration pour le moment.",
} as const;

export type PriorHistoryCardView =
  | { kind: "hidden" }
  | { kind: "question" }
  | { kind: "confirmed" }
  | {
      kind: "blocked";
      message: string;
      detail?: string;
      /** true ⇒ le client peut corriger sa réponse. */
      canChangeAnswer: boolean;
    };

/** Pure — testable sans DOM. */
export function resolvePriorHistoryCardView(eligibility: PriorHistoryEligibility): PriorHistoryCardView {
  if (eligibility.eligible) {
    // Continuité native ou reprise externe prouvée par Opening : pas de question.
    if (eligibility.status === "NATIVE_CONTINUITY" || eligibility.status === "EXTERNAL_HISTORY") {
      return { kind: "hidden" };
    }
    return { kind: "confirmed" };
  }
  if (eligibility.reason === "ANSWER_REQUIRED") return { kind: "question" };
  return {
    kind: "blocked",
    message: PRIOR_HISTORY_COPY.blocked[eligibility.reason],
    detail: eligibility.detail,
    canChangeAnswer: eligibility.needsAnswer,
  };
}

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

  const showOptions = view.kind === "question" || editing || (view.kind === "blocked" && view.canChangeAnswer);

  return (
    <section
      aria-labelledby="prior-history-title"
      className="w-full space-y-4"
      style={{ ...cardStyle, boxShadow: view.kind === "blocked" ? shadows.card.default : cardStyle.boxShadow }}
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
