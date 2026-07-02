import { explainMiseEnService } from "../../capabilities/f009/explain-mise-en-service";
import { validateActiviteDates } from "../../capabilities/f009/validate-activite-dates";
import { validateSiret } from "../../capabilities/f009/validate-siret";
import type { RuntimeContext } from "../../contracts/RuntimeContext";
import {
  createInitialF009State,
  type F009Action,
  type F009AssistantTurn,
  type F009Message,
  type F009Orientation,
  type F009State,
  type F009Suggestion,
} from "./types";

const ORIENTATION_SUGGESTIONS: F009Suggestion[] = [
  { id: "registered_siret", label: "Oui, et j'ai mon SIRET" },
  { id: "registered_no_siret", label: "Oui, mais je n'ai pas mon SIRET" },
  { id: "not_sure", label: "Je ne suis pas sûr" },
  { id: "not_yet", label: "Pas encore déclarée" },
];

function orientationPrompt(): F009Message {
  return {
    role: "assistant",
    content:
      "Commençons par votre activité LMNP. " +
      "Avez-vous déjà déclaré votre activité de location meublée ?",
    suggestions: ORIENTATION_SUGGESTIONS,
  };
}

function orientationAck(orientation: F009Orientation): string {
  switch (orientation) {
    case "registered_siret":
      return "Parfait. Indiquez votre numéro SIRET — nous vérifierons le format avant toute recherche.";
    case "registered_no_siret":
      return "Pas de souci. Nous allons saisir les informations essentielles à la main.";
    case "not_sure":
      return "Nous allons avancer ensemble, étape par étape, avec une saisie guidée.";
    case "not_yet":
      return "Vous pourrez poursuivre votre dossier. Indiquez une date prévisionnelle si votre bien n'est pas encore loué.";
  }
}

export class F009ActiviteAssistant {
  constructor(private readonly ctx: RuntimeContext) {}

  start(): F009AssistantTurn {
    return {
      state: createInitialF009State(),
      messages: [orientationPrompt()],
      completed: false,
    };
  }

  async handle(state: F009State, action: F009Action): Promise<F009AssistantTurn> {
    const messages: F009Message[] = [];

    switch (action.type) {
      case "restart":
        return this.start();

      case "select_orientation": {
        const next: F009State = {
          ...state,
          orientation: action.orientation,
          step:
            action.orientation === "registered_siret" ? "collect_siret" : "collect_activity",
        };
        messages.push({ role: "user", content: orientationLabel(action.orientation) });
        messages.push({ role: "assistant", content: orientationAck(action.orientation) });
        return { state: next, messages, completed: false };
      }

      case "submit_siret": {
        messages.push({ role: "user", content: `SIRET : ${action.siret}` });
        const result = validateSiret({ siret: action.siret });
        if (!result.valid) {
          messages.push({
            role: "assistant",
            content: result.error ?? "Ce SIRET ne semble pas valide.",
          });
          return { state, messages, completed: false };
        }
        const next: F009State = {
          ...state,
          siret: result.normalized,
          step: "collect_activity",
          fieldSources: { ...state.fieldSources, siret: "siret" },
        };
        messages.push({
          role: "assistant",
          content:
            "Merci. Quelle est la date officielle de début de votre activité (immatriculation) ? " +
            "Nous utiliserons le régime réel simplifié pour ce dossier.",
        });
        return { state: next, messages, completed: false };
      }

      case "submit_activity": {
        messages.push({
          role: "user",
          content: `Début d'activité : ${action.dateDebutActivite}`,
        });
        const next: F009State = {
          ...state,
          dateDebutActivite: action.dateDebutActivite,
          regimeFiscal: action.regimeFiscal,
          step: "mise_en_service",
          fieldSources: {
            ...state.fieldSources,
            dateDebutActivite: "manual",
            regimeFiscal: "manual",
          },
        };
        messages.push({
          role: "assistant",
          content:
            "Quand avez-vous loué ce bien pour la première fois — " +
            "ou quand prévoyez-vous de le louer ?",
        });
        return { state: next, messages, completed: false };
      }

      case "submit_mise_en_service": {
        messages.push({
          role: "user",
          content: `Mise en service : ${action.dateMiseEnService}`,
        });
        if (!state.dateDebutActivite) {
          messages.push({
            role: "assistant",
            content: "Il nous manque la date de début d'activité pour continuer.",
          });
          return { state, messages, completed: false };
        }

        const dateCheck = validateActiviteDates({
          dateDebutActivite: state.dateDebutActivite,
          dateMiseEnService: action.dateMiseEnService,
        });
        if (!dateCheck.valid) {
          messages.push({
            role: "assistant",
            content: dateCheck.issues.join(" "),
          });
          return { state, messages, completed: false };
        }

        const explanation = explainMiseEnService(
          {
            dateDebutActivite: state.dateDebutActivite,
            dateMiseEnService: action.dateMiseEnService,
          },
          this.ctx.fiscalYear,
        );

        const next: F009State = {
          ...state,
          dateMiseEnService: action.dateMiseEnService,
          explanation: explanation.explanation,
          prorataPercent: explanation.prorataPercent,
          step: "confirmation",
          fieldSources: {
            ...state.fieldSources,
            dateMiseEnService: "manual",
          },
        };
        messages.push({ role: "assistant", content: explanation.explanation });
        messages.push({
          role: "assistant",
          content: "Ces informations vous semblent-elles correctes ?",
          suggestions: [
            { id: "confirm", label: "Oui, tout est correct" },
            { id: "restart", label: "Recommencer" },
          ],
        });
        return { state: next, messages, completed: false };
      }

      case "confirm": {
        messages.push({ role: "user", content: "Oui, tout est correct" });
        messages.push({
          role: "assistant",
          content:
            "Votre activité est enregistrée. Nous pouvons passer à l'étape suivante de votre dossier.",
        });
        return {
          state: { ...state, step: "complete" },
          messages,
          completed: true,
        };
      }

      default:
        return { state, messages, completed: false };
    }
  }
}

function orientationLabel(orientation: F009Orientation): string {
  return ORIENTATION_SUGGESTIONS.find((s) => s.id === orientation)?.label ?? orientation;
}

export { createInitialF009State };
export type {
  F009Action,
  F009AssistantTurn,
  F009FieldSource,
  F009Message,
  F009Orientation,
  F009State,
  F009Step,
  F009Suggestion,
} from "./types";
