import type { Anomaly } from "../../contracts/Anomaly";
import type { FieldSource } from "../../contracts/FieldSource";
import type { ChargesFinancementExercice, TypePret } from "../../capabilities/f011/types";

export type F011Step =
  | "presence_emprunt"
  | "nombre_prets"
  | "loan_collect"
  | "loan_review"
  | "aggregate_review"
  | "complete"
  | "skipped";

export interface F011LoanDraft {
  pretId: string;
  typePret: TypePret;
  capitalInitial: number;
  tauxNominal: number;
  dureeMois: number;
  datePremiereMensualite: string;
  assuranceAnnuelle?: number;
  assuranceType?: "bancaire" | "externe";
}

export interface F011Result {
  charges: ChargesFinancementExercice;
  explanation: string;
  anomalies: Anomaly[];
  skipped: boolean;
}

export interface F011State {
  step: F011Step;
  presenceEmprunt?: boolean;
  nombrePrets?: number;
  currentLoanIndex: number;
  loans: F011LoanDraft[];
  pendingLoan?: Partial<F011LoanDraft>;
  result?: F011Result;
  fieldSources: Partial<Record<string, FieldSource>>;
}

export interface F011Suggestion {
  id: string;
  label: string;
}

export interface F011Message {
  role: "assistant" | "user";
  content: string;
  suggestions?: F011Suggestion[];
}

export type F011Action =
  | { type: "restart" }
  | { type: "set_presence_emprunt"; presence: boolean }
  | { type: "set_nombre_prets"; count: number }
  | {
      type: "submit_loan";
      typePret: TypePret;
      capitalInitial: number;
      tauxNominal: number;
      dureeMois: number;
      datePremiereMensualite: string;
      assuranceAnnuelle?: number;
      assuranceType?: "bancaire" | "externe";
      source?: FieldSource;
    }
  | { type: "confirm_loan" }
  | { type: "confirm_all" };

export interface F011AssistantTurn {
  state: F011State;
  messages: F011Message[];
  completed: boolean;
  event?: "FINANCEMENT_SKIP" | "PRET_CONFIGURE" | "FINANCEMENT_TERMINE";
}

export interface F011Deps {
  dateMiseEnService?: string;
  prixRevient?: number;
}

export function createInitialF011State(): F011State {
  return {
    step: "presence_emprunt",
    currentLoanIndex: 0,
    loans: [],
    fieldSources: {},
  };
}
