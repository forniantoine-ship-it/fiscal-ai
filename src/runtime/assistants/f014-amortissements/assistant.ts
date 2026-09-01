import { composePlanAmortissement } from "../../capabilities/f014/compose-plan-amortissement";
import { determineAmortissementProfil } from "../../capabilities/f014/determine-profil";
import { validateAmortissements } from "../../capabilities/f014/validate-amortissements";
import type { PlanAmortissement } from "../../capabilities/f014/types";
import type { RuntimeContext } from "../../contracts/RuntimeContext";
import {
  EXP_F014_PLAN_PLURIANNUEL,
  EXP_F014_TERRAIN_BATI,
  expF014DureeComposant,
  expF014Prorata,
  explainAmortissements,
  explainComposantDetail,
} from "../../presentation/explain-amortissements";
import {
  createInitialF014State,
  type F014Action,
  type F014AssistantTurn,
  type F014Deps,
  type F014Message,
  type F014State,
} from "./types";

function fmtEur(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}

function allComposants(plan: PlanAmortissement) {
  return [...plan.composants, ...plan.nouveaux_elements];
}

function findComposant(plan: PlanAmortissement, id: string) {
  return allComposants(plan).find((c) => c.id === id);
}

function composantLabel(plan: PlanAmortissement, id: string): string {
  return findComposant(plan, id)?.nom_courant ?? id;
}

export class F014AmortissementsAssistant {
  constructor(
    private readonly ctx: RuntimeContext,
    private readonly deps: F014Deps = {},
  ) {}

  start(): F014AssistantTurn {
    const messages: F014Message[] = [];
    const composed = this.composePlan();

    if (!composed) {
      messages.push({
        role: "assistant",
        content:
          "Votre plan d'amortissement n'est pas encore prêt.\n\n" +
          "Complétez l'étape Logement pour continuer.",
        suggestions: [{ id: "redirect_logement", label: "Aller à l'étape Logement" }],
      });
      return {
        state: { step: "blocked" },
        messages,
        completed: false,
        event: "REDIRECT_F010",
      };
    }

    const { plan } = composed;
    const profil = determineAmortissementProfil(plan);
    const explain = explainAmortissements({ plan, profil });

    messages.push({
      role: "assistant",
      content: `${explain.headline}\n\n${explain.subtitle}\n\nDotations de l'exercice : ${fmtEur(plan.total_dotations_exercice)}`,
      suggestions: this.presentSuggestions(profil),
    });

    return {
      state: { step: "present", plan, profil },
      messages,
      completed: false,
    };
  }

  async handle(state: F014State, action: F014Action): Promise<F014AssistantTurn> {
    const messages: F014Message[] = [];

    switch (action.type) {
      case "restart":
        return this.start();

      case "show_detail": {
        if (!state.plan) return { state, messages, completed: false };
        messages.push({
          role: "assistant",
          content: "Détail par composant :",
        });
        for (const c of allComposants(state.plan)) {
          messages.push({
            role: "assistant",
            content: explainComposantDetail(c),
            suggestions: [{ id: `explain_${c.id}`, label: `Expliquer ${c.nom_courant}` }],
          });
        }
        return {
          state: { ...state, step: "detail" },
          messages,
          completed: false,
        };
      }

      case "hide_detail":
        return {
          state: { ...state, step: "present" },
          messages: [{ role: "assistant", content: "Retour à la synthèse." }],
          completed: false,
        };

      case "show_pluriannuel": {
        if (!state.plan) return { state, messages, completed: false };
        messages.push({
          role: "assistant",
          content: EXP_F014_PLAN_PLURIANNUEL,
        });
        const lines = allComposants(state.plan)
          .map((c) => {
            const preview = c.plan_pluriannuel
              .slice(0, 5)
              .map((l) => `  ${l.annee} : ${fmtEur(l.dotation)} (VNC ${fmtEur(l.valeur_nette_comptable)})`)
              .join("\n");
            return `${c.nom_courant} :\n${preview}${c.plan_pluriannuel.length > 5 ? "\n  …" : ""}`;
          })
          .join("\n\n");
        messages.push({ role: "assistant", content: lines });
        return {
          state: { ...state, step: "pluriannuel" },
          messages,
          completed: false,
        };
      }

      case "hide_pluriannuel":
        return {
          state: { ...state, step: "present" },
          messages: [{ role: "assistant", content: "Plan pluriannuel masqué." }],
          completed: false,
        };

      case "explain_composant": {
        if (!state.plan) return { state, messages, completed: false };
        const composant = findComposant(state.plan, action.composantId);
        if (!composant) return { state, messages, completed: false };
        messages.push({
          role: "user",
          content: `Expliquer : ${composant.nom_courant}`,
        });
        messages.push({ role: "assistant", content: expF014DureeComposant(composant) });
        if (composant.nom_technique === "Gros œuvre" || state.plan.composants.indexOf(composant) === 0) {
          messages.push({ role: "assistant", content: EXP_F014_TERRAIN_BATI });
        }
        if (composant.est_proratisee && state.plan.mois_exploitation) {
          messages.push({
            role: "assistant",
            content: expF014Prorata(state.plan.mois_exploitation, state.plan.exercice),
          });
        }
        return {
          state: { ...state, selectedComposantId: action.composantId },
          messages,
          completed: false,
        };
      }

      case "start_contestation": {
        if (!state.plan || state.profil === "PROF-002") {
          return { state, messages, completed: false };
        }
        messages.push({
          role: "assistant",
          content: "Quel composant vous semble incorrect ?",
          suggestions: allComposants(state.plan).map((c) => ({
            id: `contest_${c.id}`,
            label: c.nom_courant,
          })),
        });
        return {
          state: { ...state, step: "contestation" },
          messages,
          completed: false,
        };
      }

      case "submit_contestation": {
        if (!state.plan) return { state, messages, completed: false };
        const label = composantLabel(state.plan, action.composantId);
        messages.push({ role: "user", content: `Problème sur : ${label}` });
        const composant = findComposant(state.plan, action.composantId);
        const source =
          composant?.id.startsWith("f012-")
            ? "La valeur provient de vos travaux déclarés (étape Charges)."
            : "La valeur provient de votre logement (étape Logement).";
        messages.push({
          role: "assistant",
          content:
            `${source}\n\n` +
            "Pour corriger ce montant, retournez à l'étape concernée. Le plan sera recalculé automatiquement.",
          suggestions: [
            composant?.id.startsWith("f012-")
              ? { id: "redirect_charges", label: "Aller à l'étape Charges" }
              : { id: "redirect_logement", label: "Aller à l'étape Logement" },
          ],
        });
        const validation = validateAmortissements({ plan: state.plan, status: "contested" });
        return {
          state: {
            ...state,
            step: "contestation",
            contestedComposantId: action.composantId,
            result: validation.validation
              ? {
                  plan: state.plan,
                  profil: state.profil!,
                  validation: validation.validation,
                  explanation: "",
                  headline: "",
                  subtitle: "",
                  anomalies: validation.anomalies,
                }
              : undefined,
          },
          messages,
          completed: false,
          event: "AMORTISSEMENTS_CONTESTE",
        };
      }

      case "cancel_contestation":
        return {
          state: { ...state, step: "present", contestedComposantId: undefined },
          messages: [{ role: "assistant", content: "Contestation annulée. Le plan reste inchangé." }],
          completed: false,
        };

      case "confirm": {
        if (!state.plan) return { state, messages, completed: false };
        const validationResult = validateAmortissements({ plan: state.plan, status: "validated" });
        if (!validationResult.validation) {
          return { state, messages: validationResult.anomalies.map((a) => ({ role: "assistant", content: a.message })), completed: false };
        }
        const explain = explainAmortissements({ plan: state.plan, profil: state.profil! });
        messages.push({
          role: "user",
          content: state.profil === "PROF-002" ? "Je confirme" : "Je valide ce plan",
        });
        messages.push({ role: "assistant", content: explain.explanation });
        messages.push({
          role: "assistant",
          content: "Vos amortissements sont enregistrés. Vous pouvez passer à l'étape suivante.",
        });
        const result = {
          plan: state.plan,
          profil: state.profil!,
          validation: validationResult.validation,
          explanation: explain.explanation,
          headline: explain.headline,
          subtitle: explain.subtitle,
          anomalies: validationResult.anomalies,
        };
        return {
          state: { ...state, step: "complete", result },
          messages,
          completed: true,
          event: "AMORTISSEMENTS_TERMINE",
        };
      }

      default:
        return { state, messages, completed: false };
    }
  }

  private composePlan() {
    if (!this.deps.planLogement || !this.deps.dateMiseEnService) return null;
    return composePlanAmortissement({
      exerciceFiscal: this.ctx.fiscalYear,
      dateMiseEnService: this.deps.dateMiseEnService,
      planLogement: this.deps.planLogement,
      prorataRatio: this.deps.prorataRatio ?? 1,
      composantsNouveaux: this.deps.composantsNouveaux,
      planValidePrecedemment: this.deps.planValidePrecedemment,
      anneeValidationInitiale: this.deps.anneeValidationInitiale,
    });
  }

  private presentSuggestions(profil: import("../../capabilities/f014/types").AmortissementProfil) {
    const suggestions = [
      { id: "show_detail", label: "Voir le détail par composant" },
      { id: "show_pluriannuel", label: "Voir le plan complet" },
    ];
    if (profil !== "PROF-002") {
      suggestions.push({ id: "start_contestation", label: "Quelque chose vous semble incorrect ?" });
    }
    suggestions.push({
      id: "confirm",
      label: profil === "PROF-002" ? "Confirmer" : "Je valide ce plan",
    });
    return suggestions;
  }
}

export { createInitialF014State };
export type {
  F014Action,
  F014AssistantTurn,
  F014Deps,
  F014Message,
  F014Result,
  F014State,
  F014Step,
  F014Suggestion,
} from "./types";
