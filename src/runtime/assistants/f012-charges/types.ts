import type { Anomaly } from "../../contracts/Anomaly";
import type { FieldSource } from "../../contracts/FieldSource";
import type { CoproLigneInput } from "../../capabilities/f012/compute-copro-deductible";
import type { FinancementChargesSummary } from "../../capabilities/f012/detect-financement-overlap";
import type { TravauxQualificationChoix } from "../../capabilities/f012/qualify-travail";
import type { ChargeFamilyId, ChargeRegistry, FamilyUnknownReason } from "../../capabilities/f012/charge";
import type {
  ChargeProposal,
  DocumentConflictChoice,
  DocumentaryFamilyId,
  F012DocumentReview,
} from "./charge-proposal";
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

export interface F012DiversItem {
  id: string;
  description: string;
  montant: number;
  /**
   * Cycle 3 — posé quand la description recouvre une charge déjà comptée par
   * F-011 (RAI-000, AX-009). La ligne reste visible (jamais supprimée
   * silencieusement) mais est exclue du total déductible par
   * `computeChargesExercice` — voir `detect-financement-overlap.ts`.
   */
  financementOverlap?: "assurance_emprunteur";
}

/**
 * Cycle 12A — lignes supplémentaires dans une famille déjà couverte par un
 * slot scalaire. Le moteur fiscal les replie sur le champ existant ; le
 * registry les conserve distinctes.
 */
export interface F012FamilyLine {
  id: string;
  familyId: ChargeFamilyId;
  category: F012CategoryId;
  description: string;
  montant: number;
  paidAt?: string;
  financementOverlap?: "assurance_emprunteur";
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
  divers: F012DiversItem[];
  /** Cycle 12A — extras distincts, jamais un 0 de substitution. */
  familyLines?: F012FamilyLine[];
  skippedCategories: F012CategoryId[];
  /**
   * Cycle 5A — familles à compléter plus tard (document manquant, je ne sais pas).
   * Jamais une Charge à 0. Absent = aucun unknown explicite (le skip historique
   * reste lu à part par l'adaptateur).
   */
  unknownFamilies?: Array<{ familyId: ChargeFamilyId; reason: FamilyUnknownReason }>;
  /** Cycle 5A — « je sais que je n'ai rien payé ». Distinct de unknown et de skip. */
  noneFamilies?: ChargeFamilyId[];
  /**
   * Cycle 8A — review documentaire terminée, aucune proposition retenue.
   * Distinct de `none` (« rien payé ») et de `pending` (jamais vérifiée).
   * Jamais une Charge à 0.
   */
  reviewedEmptyFamilies?: ChargeFamilyId[];
  /** Cycle 7 — documents déjà revus, par famille. Jamais un résultat fiscal. */
  documentIdsByFamily?: Partial<Record<ChargeFamilyId, string[]>>;
  /**
   * Cycle 13A — relances compagnon (GLI, comptable). Pas un statut FamilyCoverage.
   * `captured` reste « étape traitée », jamais « plus aucune dépense possible ».
   */
  slotNudges?: Partial<Record<"gli" | "comptable", "unasked" | "offered" | "declined" | "filled">>;
}

/**
 * Cycle 4D — un seul calcul de blocage, partagé par `buildResult` (assistant)
 * et testable isolément : aucune règle métier actuelle ne produit encore de
 * sévérité `fatal`/`error` (`validateCharges`/`computeChargesExercice` ne
 * produisent que des `warning`), donc ce mécanisme ne peut pas être exercé de
 * bout en bout via le state machine sans inventer une règle fiscale — ce que
 * ce cycle interdit. Il est donc testé ici, en pur, avec des anomalies
 * construites à la main.
 */
export function hasBlockingAnomaly(anomalies: Anomaly[]): boolean {
  return anomalies.some((a) => a.severity === "fatal" || a.severity === "error");
}

export interface F012Result {
  charges: ChargesExerciceResult;
  explanation: string;
  immobilisationNotes: string[];
  anomalies: Anomaly[];
  /**
   * Cycle 4D — vrai si aucune anomalie de sévérité `fatal`/`error` n'est
   * présente dans `anomalies` (mêmes sévérités que `validateCharges`,
   * étendues à `computeChargesExercice` — jamais un second système de
   * validation). `confirm_all` s'appuie dessus pour refuser `CHARGES_TERMINE`
   * uniquement en présence d'une anomalie réellement bloquante ; un simple
   * `warning` ne bloque jamais (KS : l'utilisateur est informé, pas bloqué).
   */
  chargesCoherentes: boolean;
  composantsNouveaux: ComposantNouveau[];
}

/**
 * Cycle 4E — photo de l'état quitté, pour que GO_BACK restaure exactement ce
 * qui existait avant la transition (jamais une approximation dérivée du seul
 * nom d'étape). Même forme que `F012PersistedState` moins `updatedAt` —
 * F-012 est une collection répétable de charges, pas un flux à sous-étapes
 * multi-champs comme F-011 : `collected`/`fieldSources` sont capturés de
 * façon atomique avec le reste, donc contrairement à F-011 aucune
 * réconciliation de provenance après coup n'est nécessaire ici.
 */
export type F012FamilyPhase = "card" | "manual" | "unknown_help" | "paper" | "review" | "slot_nudge";

export type F012QueuedTravaux = {
  description: string;
  montant: number;
};

export type F012HistorySnapshot = {
  step: F012Step;
  profil?: ProfilCharges;
  categoryInventory: F012CategoryId[];
  currentCategoryIndex: number;
  collected: F012CollectedData;
  pendingTravaux?: Partial<F012TravauxDraft>;
  queuedTravaux?: F012QueuedTravaux[];
  pendingFamilyFreeText?: string;
  pendingSlotNudge?: "gli" | "comptable";
  travauxSubStep?: "description" | "qualification" | "split";
  fieldSources: Partial<Record<string, FieldSource>>;
  familyInventory?: ChargeFamilyId[];
  currentFamilyIndex?: number;
  familyPhase?: F012FamilyPhase;
  documentReview?: F012DocumentReview;
  analyzedDocumentIds?: string[];
};

/** Capture les champs dignes d'être restaurés par GO_BACK — jamais `result`, jamais `history` lui-même. */
export function snapshotF012State(state: F012State): F012HistorySnapshot {
  return {
    step: state.step,
    profil: state.profil,
    categoryInventory: state.categoryInventory,
    currentCategoryIndex: state.currentCategoryIndex,
    collected: state.collected,
    pendingTravaux: state.pendingTravaux,
    queuedTravaux: state.queuedTravaux,
    pendingFamilyFreeText: state.pendingFamilyFreeText,
    pendingSlotNudge: state.pendingSlotNudge,
    travauxSubStep: state.travauxSubStep,
    fieldSources: state.fieldSources,
    familyInventory: state.familyInventory,
    currentFamilyIndex: state.currentFamilyIndex,
    familyPhase: state.familyPhase,
    documentReview: state.documentReview,
    analyzedDocumentIds: state.analyzedDocumentIds,
  };
}

export interface F012State {
  step: F012Step;
  profil?: ProfilCharges;
  categoryInventory: F012CategoryId[];
  currentCategoryIndex: number;
  collected: F012CollectedData;
  pendingTravaux?: Partial<F012TravauxDraft>;
  queuedTravaux?: F012QueuedTravaux[];
  pendingFamilyFreeText?: string;
  pendingSlotNudge?: "gli" | "comptable";
  travauxSubStep?: "description" | "qualification" | "split";
  result?: F012Result;
  fieldSources: Partial<Record<string, FieldSource>>;
  familyInventory?: ChargeFamilyId[];
  currentFamilyIndex?: number;
  familyPhase?: F012FamilyPhase;
  documentReview?: F012DocumentReview;
  analyzedDocumentIds?: string[];
  /** GO_BACK (Cycle 4E) doit survivre à un refresh — même mécanisme unique qu'en mémoire. */
  history?: F012HistorySnapshot[];
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
  | { type: "unknown_category"; reason?: FamilyUnknownReason }
  /** Cycle 5A — write-path `none` (pas d'UI 6 cartes). N'écrase jamais un unknown. */
  | { type: "none_category" }
  | { type: "open_family_manual" }
  | { type: "open_family_paper" }
  | {
      type: "receive_document_proposals";
      documentId: string;
      familyId: DocumentaryFamilyId;
      proposals: ChargeProposal[];
      fileName?: string;
    }
  | { type: "confirm_proposal"; proposalId: string }
  | { type: "modify_proposal"; proposalId: string; amount: number }
  | { type: "ignore_proposal"; proposalId: string; reason?: string }
  | { type: "fill_proposal_manual"; proposalId: string; amount: number }
  | { type: "confirm_all_proposals" }
  | { type: "resolve_document_conflict"; choice: DocumentConflictChoice; label?: string }
  | { type: "commit_document_review" }
  | { type: "unknown_family"; reason?: FamilyUnknownReason }
  | { type: "none_family" }
  | { type: "continue_after_unknown" }
  | {
      type: "submit_family_impots";
      taxeFonciere?: number;
      autreDescription?: string;
      autreMontant?: number;
      freeText?: string;
      paidAt?: string;
    }
  | {
      type: "submit_family_syndic";
      montantPaye?: number;
      epargneTravaux: "oui" | "non" | "unknown";
      epargneMontant?: number;
      freeText?: string;
      paidAt?: string;
    }
  | {
      type: "submit_family_assurance";
      montant?: number;
      gliMontant?: number;
      description?: string;
      freeText?: string;
      paidAt?: string;
    }
  | {
      type: "submit_family_gestion";
      honorairesGestion?: number;
      fraisEtatDesLieux?: number;
      honorairesComptable?: number;
      fraisMiseEnLocation?: number;
      description?: string;
      freeText?: string;
      paidAt?: string;
    }
  | {
      type: "submit_family_autres";
      fraisBancaires?: number;
      diversDescription?: string;
      diversMontant?: number;
      items?: Array<{ description: string; montant: number }>;
      freeText?: string;
      paidAt?: string;
    }
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
  | { type: "confirm_completeness"; hasOther: boolean; familyId?: ChargeFamilyId; freeText?: string }
  /** Cycle 13A — une relance compagnon, une seule fois. */
  | { type: "respond_slot_nudge"; slot: "gli" | "comptable"; accepted: boolean; montant?: number }
  /** Cycle 11 — revient sur une famille `unknown` sans défaire les autres. */
  | { type: "revisit_incomplete" }
  | { type: "revisit_family"; familyId: ChargeFamilyId; freeText?: string }
  | { type: "confirm_all" }
  | { type: "go_back" };

export interface F012AssistantTurn {
  state: F012State;
  messages: F012Message[];
  completed: boolean;
  event?: "CHARGES_PARTIELLE" | "COMPOSANT_NOUVEAU" | "CHARGES_TERMINE";
}

export interface F012Deps {
  dateMiseEnService?: string;
  /**
   * Cycle 3 — sortie F-011 déjà validée, réutilisée telle quelle (RAI-000 :
   * "le domaine ne recalcule jamais les sorties d'un autre domaine"). Sert
   * uniquement à détecter un doublon assurance emprunteur dans "Charges
   * diverses" — jamais un second état parallèle à F-011.
   */
  financementCharges?: FinancementChargesSummary;
  /** Cycle 6 — F-010 déjà tranché. `undefined` = on pose encore la question syndic. */
  knownCopropriete?: boolean;
}

/**
 * Cycle 2 — état conversationnel de l'Assistant Charges (F-012), pour reprise
 * après refresh/navigation (miroir de `F011PersistedState`). Jamais le résultat
 * calculé : `aggregate_review` est recalculé à la reprise à partir des charges
 * déjà saisies (`collected`), jamais rejoué depuis une valeur fiscale figée.
 */
export type F012PersistedState = {
  step: F012Step;
  profil?: ProfilCharges;
  categoryInventory: F012CategoryId[];
  currentCategoryIndex: number;
  collected: F012CollectedData;
  pendingTravaux?: Partial<F012TravauxDraft>;
  queuedTravaux?: F012QueuedTravaux[];
  pendingFamilyFreeText?: string;
  pendingSlotNudge?: "gli" | "comptable";
  travauxSubStep?: "description" | "qualification" | "split";
  fieldSources: Partial<Record<string, FieldSource>>;
  /**
   * Cycle 5 — projection métier dérivée de `collected` (jamais `result`).
   * Absente des snapshots GO_BACK : le registry se reconstruit depuis `collected`.
   */
  registry?: ChargeRegistry;
  /** GO_BACK (Cycle 4E) doit survivre à un refresh — même pile qu'en mémoire. */
  history?: F012HistorySnapshot[];
  familyInventory?: ChargeFamilyId[];
  currentFamilyIndex?: number;
  familyPhase?: F012FamilyPhase;
  documentReview?: F012DocumentReview;
  analyzedDocumentIds?: string[];
  updatedAt: string;
};

/**
 * Sérialise les parts de `F012State` dignes d'être reprises plus tard — jamais `result`.
 * Le registry (projection de `collected`) s'attache via `toF012PersistedStateWithRegistry`.
 */
export function toF012PersistedState(state: F012State, updatedAt: string): F012PersistedState {
  return {
    step: state.step,
    profil: state.profil,
    categoryInventory: state.categoryInventory,
    currentCategoryIndex: state.currentCategoryIndex,
    collected: state.collected,
    pendingTravaux: state.pendingTravaux,
    queuedTravaux: state.queuedTravaux,
    pendingFamilyFreeText: state.pendingFamilyFreeText,
    pendingSlotNudge: state.pendingSlotNudge,
    travauxSubStep: state.travauxSubStep,
    fieldSources: state.fieldSources,
    history: state.history,
    familyInventory: state.familyInventory,
    currentFamilyIndex: state.currentFamilyIndex,
    familyPhase: state.familyPhase,
    documentReview: state.documentReview,
    analyzedDocumentIds: state.analyzedDocumentIds,
    updatedAt,
  };
}

/**
 * Whether a persisted session is worth resuming (vs. starting fresh). No
 * progress (`profilage` — rien n'a encore été soumis) and finished sessions
 * (`complete`, couvert par le repli legacy `chargesAssistant`) sont tous deux
 * "rien à reprendre" — miroir exact de `shouldResumeF011`.
 */
export function shouldResumeF012(persisted: F012PersistedState | undefined): boolean {
  return Boolean(persisted && persisted.step !== "profilage" && persisted.step !== "complete");
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
