import type { Anomaly } from "../../contracts/Anomaly";
import type { FieldSource } from "../../contracts/FieldSource";
import type { Localisation } from "../../capabilities/f010/bareme-terrain";
import type { AmortissementPlan, TypeBien } from "../../capabilities/f010/types";
import type { F010ActePrefill } from "@/lib/lmnp/services/f010/acte-to-assistant";

export type F010Step =
  | "orientation"
  | "coming_soon"
  | "acquisition_source"
  | "collect_bien"
  | "review_extraction"
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

/** Champs F010 dont la provenance/confirmation est individuellement traçable (Cycle 3 ; `adresse` ajouté Cycle 4C1 pour la review documentaire). */
export type F010FieldKey =
  | "prixAcquisition"
  | "dateAcquisition"
  | "typeBien"
  | "surface"
  | "adresse"
  | "fraisNotaire"
  | "choixTraitementFrais"
  | "montantMobilier"
  | "ratioTerrain";

/**
 * Cycle 4C1 — champs réellement revus sur l'écran de review documentaire.
 * Volontairement plus étroit que `F010FieldKey` : `choixTraitementFrais`,
 * `montantMobilier`, `ratioTerrain` et `natureBien` ne sont jamais
 * extractibles d'un document et restent purement conversationnels.
 */
export type F010ReviewFieldKey =
  | "prixAcquisition"
  | "dateAcquisition"
  | "typeBien"
  | "surface"
  | "fraisNotaire"
  | "adresse";

/**
 * `pending` : proposition présente, en attente de confirmation/correction.
 * `confirmed` : la proposition a été acceptée telle quelle.
 * `corrected` : l'utilisateur a saisi une valeur différente de la proposition.
 * `unavailable` : le document n'a fourni aucune valeur pour ce champ.
 * Volontairement aucun score de confiance — cette information n'existe nulle
 * part dans le pipeline actuel, jamais simulée.
 */
export type F010ReviewFieldStatus = "pending" | "confirmed" | "corrected" | "unavailable";

export type F010ExtractionReviewField = {
  /** Valeur proposée par le document, déjà formatée pour l'affichage — absente si `unavailable`. */
  proposedValue?: string;
  source: FieldSource;
  status: F010ReviewFieldStatus;
};

/**
 * Proposition issue d'un document, distincte de `F010State` (la valeur
 * validée), de `governedFields` (verrou cross-tunnel) et de
 * `propertyBackgroundExtraction`/`declarationDraft` (écriture définitive à la
 * confirmation) — la review ne duplique aucun de ces trois, elle précède
 * simplement le moment où une valeur devient officielle.
 */
export type F010ExtractionReview = {
  documentId: string;
  fields: Record<F010ReviewFieldKey, F010ExtractionReviewField>;
};

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
  /** Pile des étapes quittées, pour GO_BACK — jamais l'étape courante (Cycle 3). */
  history?: F010Step[];
  /** Quels champs l'utilisateur a explicitement soumis/validés — protège contre un écrasement silencieux par un document ultérieur (Cycle 3). */
  confirmed?: Partial<Record<F010FieldKey, boolean>>;
  /**
   * Proposition du dernier document analysé, en cours de revue
   * (`review_extraction`). Remplacée intégralement par chaque nouvelle
   * analyse (règle anti-fantôme, Cycle 3/garde-fou 4 F009) — jamais fusionnée
   * champ à champ avec une review précédente.
   */
  review?: F010ExtractionReview;
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
      /**
       * Cycle 4B — n'est plus demandée systématiquement à cette étape (ne bloque
       * aucun calcul principal) ; devient contextuelle à l'estimation des frais.
       * Optionnelle ici : quand absente, le handler préserve la valeur déjà
       * connue de `state.natureBien` s'il y en a une (jamais un effacement).
       */
      natureBien?: "ancien" | "neuf";
      dateAcquisition: string;
      surface?: number;
      adresse?: string;
      localisation?: Localisation;
      /**
       * Provenance PAR CHAMP (Cycle 3) — remplace l'ancien flag global unique
       * qui taguait prix/type/date identiquement quelle que soit leur origine
       * réelle. Un champ omis retombe sur "manual".
       */
      fieldSources?: Partial<Record<"prixAcquisition" | "typeBien" | "dateAcquisition" | "surface", FieldSource>>;
    }
  | {
      /**
       * Cycle 4C1 — un document a été analysé avec succès et propose des
       * valeurs pour tout ou partie des 6 champs revus. Ne doit JAMAIS être
       * dispatché sur un échec d'extraction (c'est ce qui garantit qu'un
       * échec n'entre jamais en `review_extraction` — pas une branche
       * conditionnelle dans le runtime, une absence de dispatch côté panel).
       */
      type: "analysis_success";
      documentId: string;
      proposal: F010ActePrefill;
    }
  | {
      /** L'utilisateur accepte la proposition telle quelle pour ce champ. */
      type: "confirm_extracted_field";
      field: F010ReviewFieldKey;
    }
  | {
      /** L'utilisateur remplace la proposition par sa propre valeur — devient confirmée. */
      type: "correct_extracted_field";
      field: F010ReviewFieldKey;
      value: string;
    }
  | {
      type: "submit_frais";
      fraisNotaire: number;
      choixTraitementFrais: "integration" | "deduction";
      /**
       * Cycle 4B — transmise quand connue (répondue au moment d'une estimation,
       * ou déjà présente d'une session antérieure) ; absente sinon (l'utilisateur
       * a saisi ses frais directement, jamais demandée dans ce cas).
       */
      natureBien?: "ancien" | "neuf";
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
  | { type: "restart" }
  | { type: "go_back" };

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

/**
 * Cycle 2/3 — sous-ensemble de `F010State` digne d'être conservé entre deux
 * sessions (Cycle 2, reprise ; Cycle 3, retour arrière/conflits). Exclut
 * délibérément :
 *  - `result` : recalculé à la reprise via `computePlan`, jamais mis en cache
 *    (même principe que F009 pour `explanation`/`prorataPercent` — un correctif
 *    du moteur de calcul entre deux sessions ne doit jamais laisser un plan
 *    obsolète affiché) ;
 *  - tout ce qui duplique `declarationDraft` (`governedFields`,
 *    `propertyBackgroundExtraction`, `documents`) — jamais recopié ici.
 */
export type F010PersistedState = {
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
  fieldSources: F010State["fieldSources"];
  /** Pile des étapes quittées, pour reprendre GO_BACK là où il en était (Cycle 3). */
  history?: F010Step[];
  /** Quels champs sont confirmés — protège contre un écrasement silencieux à la reprise (Cycle 3). */
  confirmed?: Partial<Record<F010FieldKey, boolean>>;
  /**
   * Review documentaire en cours (Cycle 4C1) — un refresh pendant
   * `review_extraction` doit retrouver exactement les mêmes propositions et
   * les mêmes statuts par champ, jamais recalculés ni redemandés.
   */
  review?: F010ExtractionReview;
  /**
   * Document dont l'analyse est en cours ou vient de se terminer — permet de
   * reprendre l'analyse (ou son résultat) sans re-upload. N'est PAS un doublon
   * de `state.documents`/`fileRegistry` : seul l'id est référencé ici.
   */
  analyzingDocumentId?: string;
  /**
   * Dernier résultat d'extraction non encore intégré/validé par le parcours
   * assistant (jamais soumis via `submit_bien`). Distinct de `F010State`
   * (qui ne reçoit ces valeurs qu'à la soumission), de `governedFields` et de
   * `propertyBackgroundExtraction` (qui ne sont écrits, eux, qu'à la
   * confirmation d'étape / à `persistCompletion`).
   */
  pendingExtraction?: F010ActePrefill;
  updatedAt: string;
};

/** Sérialise les parts de `F010State` dignes d'être reprises plus tard. */
export function toF010PersistedState(
  state: F010State,
  updatedAt: string,
  pendingExtraction?: F010ActePrefill,
  analyzingDocumentId?: string,
): F010PersistedState {
  return {
    step: state.step,
    nature: state.nature,
    acquisitionSource: state.acquisitionSource,
    prixAcquisition: state.prixAcquisition,
    natureBien: state.natureBien,
    typeBien: state.typeBien,
    surface: state.surface,
    adresse: state.adresse,
    dateAcquisition: state.dateAcquisition,
    localisation: state.localisation,
    fraisNotaire: state.fraisNotaire,
    choixTraitementFrais: state.choixTraitementFrais,
    mobilierInclus: state.mobilierInclus,
    montantMobilier: state.montantMobilier,
    mobilierMode: state.mobilierMode,
    ratioTerrain: state.ratioTerrain,
    fieldSources: state.fieldSources,
    history: state.history,
    confirmed: state.confirmed,
    review: state.review,
    analyzingDocumentId,
    pendingExtraction,
    updatedAt,
  };
}

/**
 * Whether a persisted session is worth resuming (vs. starting fresh). No
 * progress (`orientation`) and finished sessions (`complete`, covered instead
 * by the legacy `logementConfirmedAt` shortcut) are both "nothing to resume" —
 * miroir exact de `shouldResumeF009`.
 */
export function shouldResumeF010(persisted: F010PersistedState | undefined): boolean {
  return Boolean(persisted && persisted.step !== "orientation" && persisted.step !== "complete");
}
