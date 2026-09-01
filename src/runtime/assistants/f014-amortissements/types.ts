import type { Anomaly } from "../../contracts/Anomaly";
import type { AmortissementProfil, PlanAmortissement, ValidationAmortissements } from "../../capabilities/f014/types";

export type F014Step =
  | "blocked"
  | "present"
  | "detail"
  | "pluriannuel"
  | "contestation"
  | "complete";

export interface F014Result {
  plan: PlanAmortissement;
  profil: AmortissementProfil;
  validation: ValidationAmortissements;
  explanation: string;
  headline: string;
  subtitle: string;
  anomalies: Anomaly[];
}

export interface F014State {
  step: F014Step;
  plan?: PlanAmortissement;
  profil?: AmortissementProfil;
  selectedComposantId?: string;
  contestedComposantId?: string;
  result?: F014Result;
}

export interface F014Suggestion {
  id: string;
  label: string;
}

export interface F014Message {
  role: "assistant" | "user";
  content: string;
  suggestions?: F014Suggestion[];
}

export type F014Action =
  | { type: "restart" }
  | { type: "show_detail" }
  | { type: "hide_detail" }
  | { type: "show_pluriannuel" }
  | { type: "hide_pluriannuel" }
  | { type: "explain_composant"; composantId: string }
  | { type: "start_contestation" }
  | { type: "submit_contestation"; composantId: string }
  | { type: "cancel_contestation" }
  | { type: "confirm" };

export interface F014AssistantTurn {
  state: F014State;
  messages: F014Message[];
  completed: boolean;
  event?: "AMORTISSEMENTS_TERMINE" | "AMORTISSEMENTS_CONTESTE" | "REDIRECT_F010";
}

/** Dépendances amont — sorties F-009, F-010, F-012. */
export interface F014Deps {
  dateMiseEnService?: string;
  planLogement?: import("../../capabilities/f010/types").AmortissementPlan;
  prorataRatio?: number;
  composantsNouveaux?: import("../../capabilities/f012/types").ComposantNouveau[];
  planValidePrecedemment?: boolean;
  anneeValidationInitiale?: number | null;
}

export function createInitialF014State(): F014State {
  return { step: "present" };
}
