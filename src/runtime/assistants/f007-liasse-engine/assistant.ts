import type { Anomaly } from "../../contracts/Anomaly";
import type { FiscalResult } from "../../capabilities/f006/types";
import type { IdentiteDeclarante, LiasseRepresentation } from "../../capabilities/f007/types";
import type { RuntimeContext } from "../../contracts/RuntimeContext";
import { produceLiasse } from "../../capabilities/f007/produce-liasse";
import { explainLiasse } from "../../presentation/explain-liasse";

export type F007Step = "blocked" | "preview" | "complete";

export interface F007Result {
  liasse: LiasseRepresentation;
  headline: string;
  subtitle: string;
  explanation: string;
  summaryLines: string[];
  anomalies: Anomaly[];
}

export interface F007State {
  step: F007Step;
  result?: F007Result;
  blockingAnomalies?: Anomaly[];
}

export interface F007Suggestion {
  id: string;
  label: string;
}

export interface F007Message {
  role: "assistant" | "user";
  content: string;
  suggestions?: F007Suggestion[];
}

export type F007Action = { type: "generate" } | { type: "confirm" } | { type: "restart" };

export interface F007AssistantTurn {
  state: F007State;
  messages: F007Message[];
  completed: boolean;
  event?: "DECLARATION_GENEREE" | "REDIRECT_PREREQUIS";
}

/** Dépendances amont — FiscalResult F-006 + identité ENT-013. */
export type F007Deps = {
  fiscalResult: FiscalResult;
  identite: IdentiteDeclarante;
};

export function createInitialF007State(): F007State {
  return { step: "preview" };
}

export class F007LiasseEngineAssistant {
  constructor(
    private readonly ctx: RuntimeContext,
    private readonly deps: F007Deps,
  ) {}

  start(): F007AssistantTurn {
    const messages: F007Message[] = [];
    const computed = produceLiasse(this.deps);

    if (!computed.liasse) {
      const blocking = computed.anomalies.filter(
        (a) => a.severity === "fatal" || a.severity === "error",
      );
      messages.push({
        role: "assistant",
        content:
          "La génération de la liasse n'est pas encore possible.\n\n" +
          blocking.map((a) => `• ${a.message}`).join("\n"),
        suggestions: this.blockingSuggestions(blocking),
      });
      return {
        state: { step: "blocked", blockingAnomalies: blocking },
        messages,
        completed: false,
        event: "REDIRECT_PREREQUIS",
      };
    }

    const explain = explainLiasse({ liasse: computed.liasse });
    messages.push({
      role: "assistant",
      content: `${explain.headline}\n\n${explain.subtitle}\n\n${explain.summaryLines.join("\n")}`,
      suggestions: [
        { id: "explain_detail", label: "Comprendre la transformation" },
        { id: "confirm", label: "Valider la liasse générée" },
      ],
    });

    return {
      state: {
        step: "preview",
        result: {
          liasse: computed.liasse,
          ...explain,
          anomalies: computed.anomalies,
        },
      },
      messages,
      completed: false,
    };
  }

  handle(state: F007State, action: F007Action): F007AssistantTurn {
    const messages: F007Message[] = [];

    if (action.type === "restart" || action.type === "generate") {
      return this.start();
    }

    if (action.type === "confirm" && state.result) {
      messages.push({
        role: "assistant",
        content:
          `Liasse exercice ${state.result.liasse.exercice} enregistrée.\n\n` +
          `Formulaire 2031-SD généré avec ${state.result.liasse.formulairesGeneres[0]?.cases.length ?? 0} cases.`,
      });
      return {
        state: { step: "complete", result: state.result },
        messages,
        completed: true,
        event: "DECLARATION_GENEREE",
      };
    }

    return { state, messages, completed: false };
  }

  private blockingSuggestions(anomalies: Anomaly[]): F007Suggestion[] {
    const suggestions: F007Suggestion[] = [];
    for (const anomaly of anomalies) {
      const field = anomaly.field ?? "";
      if (field.includes("fiscalResult")) {
        suggestions.push({ id: "redirect_fiscal", label: "Aller au Calcul fiscal" });
      }
      if (field.includes("identite") || field.includes("siret")) {
        suggestions.push({ id: "redirect_activite", label: "Compléter l'Activité" });
      }
    }
    return suggestions.length
      ? suggestions
      : [{ id: "redirect_dashboard", label: "Retour au tableau de bord" }];
  }
}
