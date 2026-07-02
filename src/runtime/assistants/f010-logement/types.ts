import type { Anomaly } from "../../contracts/Anomaly";
import type { FieldSource } from "../../contracts/FieldSource";
import type { Localisation } from "../../capabilities/f010/bareme-terrain";
import type { AmortissementPlan, TypeBien } from "../../capabilities/f010/types";

export type F010Step =
  | "orientation"
  | "coming_soon"
  | "acquisition_source"
  | "collect_bien"
  | "collect_frais"
  | "collect_mobilier"
  | "ventilation"
  | "review_plan"
  | "complete";

/** Nature de l'acquisition (Niveau 1 F-010). Seul "achat" (Chemin A) est traité au MVP. */
export type F010Nature =
  | "achat"
  | "vefa"
  | "heritage_donation"
  | "conversion"
  | "indivision"
  | "autre";

/** Disponibilité de l'acte notarié (Niveau 2, Chemin A). */
export type F010AcquisitionSource = "acte" | "partiel" | "manuel";

/** Résultat calculé, produit une fois toutes les entrées réunies. */
export interface F010Result {
  prixRevient: number;
  montantMobilierIsole: number;
  valeurTerrain: number;
  valeurBati: number;
  baseAmortissableBati: number;
  prorataRatio: number;
  dotationAnnuelle: number;
  dureeMoyenneAnnees: number;
  plan: AmortissementPlan;
  planValide: boolean;
  explanation: string;
  anomalies: Anomaly[];
}

export interface F010State {
  step: F010Step;
  nature?: F010Nature;
  acquisitionSource?: F010AcquisitionSource;
  prixAcquisition?: number;
  natureBien?: "ancien" | "neuf";
  typeBien?: TypeBien;
  surface?: number;
  adresse?: string;
  dateAcquisition?: string;
  localisation?: Localisation;
  fraisNotaire?: number;
  choixTraitementFrais?: "integration" | "deduction";
  mobilierInclus?: boolean;
  montantMobilier?: number;
  mobilierMode?: "lot" | "detaille";
  ratioTerrain?: number;
  result?: F010Result;
  fieldSources: Partial<Record<string, FieldSource>>;
}

export interface F010Suggestion {
  id: string;
  label: string;
}

export interface F010Message {
  role: "assistant" | "user";
  content: string;
  suggestions?: F010Suggestion[];
}

export type F010Action =
  | { type: "select_nature"; nature: F010Nature }
  | { type: "select_source"; source: F010AcquisitionSource }
  | {
      type: "submit_bien";
      prixAcquisition: number;
      typeBien: TypeBien;
      natureBien: "ancien" | "neuf";
      dateAcquisition: string;
      surface?: number;
      adresse?: string;
      localisation?: Localisation;
      /** Provenance des champs (extrait de l'acte, saisi, etc.). */
      source?: FieldSource;
    }
  | {
      type: "submit_frais";
      fraisNotaire: number;
      choixTraitementFrais: "integration" | "deduction";
      source?: FieldSource;
    }
  | {
      type: "submit_mobilier";
      montantMobilier: number;
      mode: "lot" | "detaille";
      source?: FieldSource;
    }
  | { type: "skip_mobilier" }
  | {
      type: "submit_ventilation";
      ratioTerrain: number;
      localisation?: Localisation;
      source?: FieldSource;
    }
  | { type: "confirm" }
  | { type: "restart" };

export interface F010AssistantTurn {
  state: F010State;
  messages: F010Message[];
  completed: boolean;
}

/** Dépendances issues des Assistants amont (F-009). */
export interface F010Deps {
  /** date_mise_en_service produite par F-009 (TRF-0011). */
  dateMiseEnService?: string;
}

export function createInitialF010State(): F010State {
  return {
    step: "orientation",
    fieldSources: {},
  };
}
