import type { Anomaly } from "../../contracts/Anomaly";
import type { FieldSource } from "../../contracts/FieldSource";
import type {
  ContinuiteBail,
  ModeCharges,
  PeriodeLocation,
  RecettesExerciceResult,
  TypeLocation,
  VacancePeriode,
} from "../../capabilities/f013/types";

export type F013Step =
  | "diagnostic"
  | "loyer_collect"
  | "ancrage"
  | "declaration"
  | "confrontation"
  | "decalage_jan_dec"
  | "qualify_ecart"
  | "ecart_impaye"
  | "ecart_vacance"
  | "ecart_loyer_inferieur"
  | "ecart_surplus"
  | "sources_plateforme"
  | "aggregate_review"
  | "complete";

export interface F013Diagnostic {
  typeLocation: TypeLocation;
  continuiteBail: ContinuiteBail;
  modeCharges: ModeCharges;
}

export interface F013CollectedData {
  loyerMensuel?: number;
  provisionChargesMensuelle?: number;
  montantDeclare?: number;
  janvierEncaisseDecPrecedent?: boolean;
  decembreEncaisseJanvierSuivant?: boolean;
  ecartRaison?: string;
  impayeGli?: boolean;
  impayeIndemnite?: number;
  vacancePeriodes: VacancePeriode[];
  loyerInferieurMois?: number;
  loyerInferieurMontant?: number;
  recettesPlateforme?: number;
  periodes: PeriodeLocation[];
}

export interface F013Result {
  recettes: RecettesExerciceResult;
  explanation: string;
  anomalies: Anomaly[];
}

export interface F013State {
  step: F013Step;
  diagnostic?: F013Diagnostic;
  collected: F013CollectedData;
  result?: F013Result;
  fieldSources: Partial<Record<string, FieldSource>>;
  modeCollecte: boolean;
}

export interface F013Suggestion {
  id: string;
  label: string;
}

export interface F013Message {
  role: "assistant" | "user";
  content: string;
  suggestions?: F013Suggestion[];
}

export type F013Action =
  | { type: "restart" }
  | {
      type: "submit_diagnostic";
      typeLocation: TypeLocation;
      continuiteBail: ContinuiteBail;
      modeCharges: ModeCharges;
    }
  | { type: "submit_loyer"; loyerMensuel: number; provisionChargesMensuelle?: number; source?: FieldSource }
  | { type: "submit_declaration"; montant: number; source?: FieldSource }
  | { type: "submit_decalage"; janvierOui: boolean; decembreOui: boolean }
  | { type: "submit_ecart_raison"; raison: "impaye" | "vacance" | "loyer_inferieur" | "autre" | "rattrapage" | "complementaire" | "erreur_saisie" }
  | { type: "submit_impaye"; gli: boolean; indemnite?: number }
  | { type: "submit_vacance"; dateDebut: string; dateFin: string; enTravaux: boolean }
  | { type: "submit_loyer_inferieur"; mois: number; montantPerçu: number }
  | { type: "submit_plateforme"; montant: number; source?: FieldSource }
  | { type: "confirm_all" };

export interface F013AssistantTurn {
  state: F013State;
  messages: F013Message[];
  completed: boolean;
  event?: "REVENUS_PARTIELLE" | "VACANCE_DETECTEE" | "REVENUS_TERMINE";
}

export interface F013Deps {
  dateMiseEnService?: string;
  loyerMensuel?: number;
}

export function createInitialF013State(): F013State {
  return {
    step: "diagnostic",
    collected: {
      vacancePeriodes: [],
      periodes: [],
    },
    fieldSources: {},
    modeCollecte: false,
  };
}
