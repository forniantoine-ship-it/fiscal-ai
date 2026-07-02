import type { Anomaly } from "../../contracts/Anomaly";
import type { FieldSource } from "../../contracts/FieldSource";
import type { CoproLigneInput } from "../../capabilities/f012/compute-copro-deductible";
import type { TravauxQualificationChoix } from "../../capabilities/f012/qualify-travail";
import type {
  ChargesExerciceResult,
  ComposantNouveau,
  F012CategoryId,
  NatureIntervention,
  ProfilCharges,
} from "../../capabilities/f012/types";

export type F012Step =
  | "profilage"
  | "category_collect"
  | "completeness"
  | "aggregate_review"
  | "complete";

export type { F012CategoryId };

export interface F012TravauxDraft {
  id: string;
  description: string;
  montant: number;
  choix?: TravauxQualificationChoix;
  natureIntervention?: NatureIntervention;
  montantReparation?: number;
}

export interface F012CollectedData {
  taxeFonciere?: number;
  assurancePno?: number;
  assuranceGli?: number;
  coproLignes: CoproLigneInput[];
  honorairesGestion?: number;
  fraisEtatDesLieux?: number;
  honorairesComptable?: number;
  fraisBancaires?: number;
  travaux: F012TravauxDraft[];
  divers: { id: string; description: string; montant: number }[];
  skippedCategories: F012CategoryId[];
}

export interface F012Result {
  charges: ChargesExerciceResult;
  explanation: string;
  immobilisationNotes: string[];
  anomalies: Anomaly[];
  composantsNouveaux: ComposantNouveau[];
}

export interface F012State {
  step: F012Step;
  profil?: ProfilCharges;
  categoryInventory: F012CategoryId[];
  currentCategoryIndex: number;
  collected: F012CollectedData;
  pendingTravaux?: Partial<F012TravauxDraft>;
  travauxSubStep?: "description" | "qualification" | "split";
  result?: F012Result;
  fieldSources: Partial<Record<string, FieldSource>>;
}

export interface F012Suggestion {
  id: string;
  label: string;
}

export interface F012Message {
  role: "assistant" | "user";
  content: string;
  suggestions?: F012Suggestion[];
}

export type F012Action =
  | { type: "restart" }
  | {
      type: "submit_profilage";
      copropriete: boolean;
      agence: boolean;
      travaux: boolean;
      vacance: boolean;
      comptable: boolean;
    }
  | { type: "skip_category" }
  | { type: "submit_taxe_fonciere"; montant: number; source?: FieldSource }
  | { type: "submit_assurance_pno"; montant: number; source?: FieldSource }
  | { type: "submit_assurance_gli"; montant: number; source?: FieldSource }
  | {
      type: "submit_copro";
      lignes: CoproLigneInput[];
      source?: FieldSource;
    }
  | {
      type: "submit_gestion";
      honorairesGestion: number;
      fraisEtatDesLieux?: number;
      source?: FieldSource;
    }
  | { type: "submit_comptable"; montant: number; source?: FieldSource }
  | { type: "submit_frais_bancaires"; montant: number; source?: FieldSource }
  | { type: "submit_divers"; description: string; montant: number; source?: FieldSource }
  | { type: "start_travaux" }
  | { type: "submit_travaux_description"; description: string; montant: number }
  | { type: "submit_travaux_qualification"; choix: TravauxQualificationChoix }
  | { type: "submit_travaux_split"; montantReparation: number }
  | { type: "finish_travaux_category" }
  | { type: "confirm_completeness"; hasOther: boolean }
  | { type: "confirm_all" };

export interface F012AssistantTurn {
  state: F012State;
  messages: F012Message[];
  completed: boolean;
  event?: "CHARGES_PARTIELLE" | "COMPOSANT_NOUVEAU" | "CHARGES_TERMINE";
}

export interface F012Deps {
  dateMiseEnService?: string;
}

export function createInitialF012State(): F012State {
  return {
    step: "profilage",
    categoryInventory: [],
    currentCategoryIndex: 0,
    collected: {
      coproLignes: [],
      travaux: [],
      divers: [],
      skippedCategories: [],
    },
    fieldSources: {},
  };
}
