import type { Anomaly } from "../../contracts/Anomaly";
import type { FiscalEngineInputs, FiscalResult } from "../../capabilities/f006/types";
import type { RuntimeContext } from "../../contracts/RuntimeContext";
import { produceFiscalResult } from "../../capabilities/f006/produce-fiscal-result";
import { explainFiscalResult } from "../../presentation/explain-fiscal-result";

export type F006Step = "blocked" | "preview" | "complete";

export interface F006Result {
  fiscalResult: FiscalResult;
  headline: string;
  subtitle: string;
  explanation: string;
  summaryLines: string[];
  anomalies: Anomaly[];
}

export interface F006State {
  step: F006Step;
  result?: F006Result;
  blockingAnomalies?: Anomaly[];
}

export interface F006Suggestion {
  id: string;
  label: string;
}

export interface F006Message {
  role: "assistant" | "user";
  content: string;
  suggestions?: F006Suggestion[];
}

export type F006Action = { type: "compute" } | { type: "confirm" } | { type: "restart" };

export interface F006AssistantTurn {
  state: F006State;
  messages: F006Message[];
  completed: boolean;
  event?: "CALCUL_TERMINE" | "REDIRECT_PREREQUIS";
}

/** Dépendances amont — sorties F-009 à F-014. */
export type F006Deps = FiscalEngineInputs;

export function createInitialF006State(): F006State {
  return { step: "preview" };
}

function missingStepHref(anomaly: Anomaly): string | null {
  const field = anomaly.field ?? "";
  if (field.includes("revenus")) return "/assistants/revenus";
  if (field.includes("charges")) return "/assistants/charges";
  if (field.includes("amortissement")) return "/assistants/amortissements";
  if (field.includes("dateMiseEnService")) return "/assistants/activite";
  if (field.includes("logement")) return "/assistants/logement";
  return null;
}

export class F006FiscalEngineAssistant {
  constructor(
    private readonly ctx: RuntimeContext,
    private readonly deps: F006Deps,
  ) {}

  start(): F006AssistantTurn {
    const messages: F006Message[] = [];
    const computed = produceFiscalResult(this.deps);

    if (!computed.result) {
      const blocking = computed.anomalies.filter(
        (a) => a.severity === "fatal" || a.severity === "error",
      );
      messages.push({
        role: "assistant",
        content:
          "Le calcul fiscal n'est pas encore possible.\n\n" +
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

    const explain = explainFiscalResult({ result: computed.result });
    messages.push({
      role: "assistant",
      content: `${explain.headline}\n\n${explain.subtitle}\n\n${explain.summaryLines.join("\n")}`,
      suggestions: [
        { id: "explain_detail", label: "Comprendre le calcul" },
        { id: "confirm", label: "Valider le résultat fiscal" },
      ],
    });

    return {
      state: {
        step: "preview",
        result: {
          fiscalResult: computed.result,
          ...explain,
          anomalies: computed.anomalies,
        },
      },
      messages,
      completed: false,
    };
  }

  handle(state: F006State, action: F006Action): F006AssistantTurn {
    const messages: F006Message[] = [];

    if (action.type === "restart" || action.type === "compute") {
      return this.start();
    }

    if (action.type === "confirm" && state.result) {
      messages.push({
        role: "assistant",
        content:
          `Résultat fiscal ${state.result.fiscalResult.exercice} enregistré.\n\n` +
          `Résultat imposable : ${Math.round(state.result.fiscalResult.resultatFiscal).toLocaleString("fr-FR")} €`,
      });
      return {
        state: { step: "complete", result: state.result },
        messages,
        completed: true,
        event: "CALCUL_TERMINE",
      };
    }

    return { state, messages, completed: false };
  }

  private blockingSuggestions(anomalies: Anomaly[]): F006Suggestion[] {
    const suggestions: F006Suggestion[] = [];
    for (const anomaly of anomalies) {
      const href = missingStepHref(anomaly);
      if (href === "/assistants/revenus") {
        suggestions.push({ id: "redirect_revenus", label: "Aller aux Revenus" });
      } else if (href === "/assistants/charges") {
        suggestions.push({ id: "redirect_charges", label: "Aller aux Charges" });
      } else if (href === "/assistants/amortissements") {
        suggestions.push({ id: "redirect_amortissements", label: "Aller aux Amortissements" });
      } else if (href === "/assistants/activite") {
        suggestions.push({ id: "redirect_activite", label: "Aller à l'Activité" });
      }
    }
    return suggestions.length
      ? suggestions
      : [{ id: "redirect_dashboard", label: "Retour au tableau de bord" }];
  }
}
