/**
 * Modèle d'affichage pur de la carte antériorité (sans DOM / sans store).
 */

import type { PriorHistoryEligibility } from "@/lib/lmnp/services/declaration/prior-history-eligibility";
import type { PriorHistoryDeclarationStatus } from "@/lib/lmnp/types/domain";

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
      "Pour établir correctement votre déclaration, nous devons reprendre certains éléments de votre comptabilité précédente.",
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
  | { kind: "external_takeover" }
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
    if (eligibility.status === "NATIVE_CONTINUITY") {
      return { kind: "hidden" };
    }
    // Lot 5.2 — reprise externe validée : carte reste visible (état « terminée »).
    if (eligibility.status === "EXTERNAL_HISTORY") {
      return { kind: "external_takeover" };
    }
    return { kind: "confirmed" };
  }
  if (eligibility.reason === "ANSWER_REQUIRED") return { kind: "question" };
  // Lot 5.2 — EXTERNAL_HISTORY ouvre le parcours de reprise, plus un hard-block.
  if (eligibility.reason === "EXTERNAL_HISTORY_DECLARED") {
    return { kind: "external_takeover" };
  }
  return {
    kind: "blocked",
    message: PRIOR_HISTORY_COPY.blocked[eligibility.reason],
    detail: eligibility.detail,
    canChangeAnswer: eligibility.needsAnswer,
  };
}
