export type F009Step =
  | "orientation"
  | "collect_siret"
  | "collect_activity"
  | "mise_en_service"
  | "explanation"
  | "confirmation"
  | "complete";

export type F009Orientation =
  | "registered_siret"
  | "registered_no_siret"
  | "not_sure"
  | "not_yet";

export type F009FieldSource = "manual" | "siret" | "user_correction";

export interface F009State {
  step: F009Step;
  orientation?: F009Orientation;
  siret?: string;
  dateDebutActivite?: string;
  dateMiseEnService?: string;
  regimeFiscal?: "reel_simplifie" | "reel_normal";
  fieldSources: Partial<Record<string, F009FieldSource>>;
  explanation?: string;
  prorataPercent?: number;
}

export interface F009Suggestion {
  id: string;
  label: string;
}

export interface F009Message {
  role: "assistant" | "user";
  content: string;
  suggestions?: F009Suggestion[];
}

export type F009Action =
  | { type: "select_orientation"; orientation: F009Orientation }
  | { type: "submit_siret"; siret: string }
  | { type: "submit_activity"; dateDebutActivite: string; regimeFiscal: "reel_simplifie" | "reel_normal" }
  | { type: "submit_mise_en_service"; dateMiseEnService: string }
  | { type: "confirm" }
  | { type: "restart" };

export interface F009AssistantTurn {
  state: F009State;
  messages: F009Message[];
  completed: boolean;
}

export function createInitialF009State(): F009State {
  return {
    step: "orientation",
    fieldSources: {},
  };
}
