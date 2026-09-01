import type { Anomaly } from "../../contracts/Anomaly";
import type { FieldSource } from "../../contracts/FieldSource";
import type { ChargesFinancementExercice, TypePret } from "../../capabilities/f011/types";
import type {
  F011CreditPrefill,
  F011PrefillConflict,
  F011PrefillFieldKey,
} from "@/lib/lmnp/services/f011/credit-bridge";

export type F011Step =
  | "presence_emprunt"
  | "blocked_missing_date"
  | "nombre_prets"
  /** Cycle 5 — "Avez-vous le tableau d'amortissement de ce prêt ?", à égalité, jamais un repli. */
  | "loan_source_choice"
  | "loan_upload"
  | "loan_analyzing"
  | "loan_review_extraction"
  | "loan_type"
  | "loan_collect"
  | "loan_insurance"
  | "loan_guarantee"
  | "loan_fees"
  | "loan_ira"
  | "loan_review"
  | "aggregate_review"
  | "complete"
  | "skipped";

export type TypeGarantie = "caution" | "hypotheque_ippd" | "aucune" | "autre";

export interface F011LoanDraft {
  pretId: string;
  typePret: TypePret;
  capitalInitial: number;
  tauxNominal: number;
  dureeMois: number;
  datePremiereMensualite: string;
  assuranceAnnuelle?: number;
  assuranceType?: "bancaire" | "externe";
  /** Nature de la garantie — détermine si un montant est déductible en charge F-011 (caution)
   * ou doit être intégré au prix de revient F-010 (hypothèque/IPPD, hors périmètre de cet Assistant). */
  typeGarantie?: TypeGarantie;
  /** Commission de caution — déductible, uniquement si typeGarantie === "caution". */
  commissionCaution?: number;
  fraisDossier?: number;
  /** Connu explicitement par confirmation utilisateur — jamais déduit de datePremiereMensualite. */
  souscritCetExercice?: boolean;
  remboursementAnticipeCetExercice?: boolean;
  iraMontant?: number;
}

export interface F011Result {
  charges: ChargesFinancementExercice;
  explanation: string;
  anomalies: Anomaly[];
  skipped: boolean;
}

/**
 * Cycle 3 — photo de tout ce qui définit "où on en était" avant une transition,
 * pour que GO_BACK restaure un état exact plutôt que de recalculer une
 * approximation. Un seul mécanisme d'historique, utilisé uniformément par
 * chaque transition (`advance`) — y compris à la frontière prêt N → prêt N-1,
 * qui ne perd donc jamais les données du prêt quitté.
 */
export type F011HistorySnapshot = {
  step: F011Step;
  presenceEmprunt?: boolean;
  nombrePrets?: number;
  currentLoanIndex: number;
  loans: F011LoanDraft[];
  pendingLoan?: Partial<F011LoanDraft>;
  analyzingDocumentId?: string;
  pendingExtraction?: F011PendingExtraction;
  extractionConflicts?: F011PrefillConflict[];
};

/** Extraction documentaire déjà pontée (Cycle 4), en attente de revue (Cycle 5). */
export type F011PendingExtraction = {
  documentId: string;
  prefill: F011CreditPrefill;
};

export interface F011State {
  step: F011Step;
  presenceEmprunt?: boolean;
  nombrePrets?: number;
  currentLoanIndex: number;
  loans: F011LoanDraft[];
  pendingLoan?: Partial<F011LoanDraft>;
  result?: F011Result;
  fieldSources: Partial<Record<string, FieldSource>>;
  /** Pile des états quittés, pour reprendre GO_BACK là où il en était (Cycle 3). */
  history?: F011HistorySnapshot[];
  /** Document dont l'analyse est en cours — permet de reprendre l'analyse sans re-upload. */
  analyzingDocumentId?: string;
  /** Dernière extraction pontée, pas encore appliquée/validée par l'utilisateur. */
  pendingExtraction?: F011PendingExtraction;
  /** Champs où le document contredit une valeur déjà présente — jamais appliqués silencieusement (Cycle 5 §6). */
  extractionConflicts?: F011PrefillConflict[];
  /**
   * Correctif Cycle 9 — un montant de frais de garantie vu dans le document
   * (`guaranteeFees`, remonté en `unmapped` par le bridge — nature jamais
   * déduite) est conservé ici pour être montré à l'entrée de la question
   * garantie, sans jamais être appliqué automatiquement à `commissionCaution`.
   */
  detectedGuaranteeFees?: number;
  /**
   * Correctif Cycle 10 — incrémenté uniquement par `set_nombre_prets`, qui
   * relance la collecte des prêts depuis le prêt 0. `currentLoanIndex` seul
   * ne suffit pas à identifier un prêt de façon unique dans le temps : il est
   * remis à 0 par `set_nombre_prets`, donc un retour en arrière jusqu'à
   * "Combien de prêts" suivi d'un nouveau choix retombe sur le même index
   * qu'une tentative de prêt 1 déjà abandonnée. Ce compteur, combiné à
   * `currentLoanIndex`, donne au panel une identité de prêt qui distingue
   * "même prêt" (GO_BACK) de "nouveau contexte" (nombre de prêts changé) —
   * voir `resolveLoanFormAction`.
   */
  loanFormGeneration: number;
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
  | { type: "set_loan_type"; typePret: TypePret }
  | {
      type: "submit_loan_terms";
      capitalInitial: number;
      tauxNominal: number;
      dureeMois: number;
      datePremiereMensualite: string;
      source?: FieldSource;
    }
  | { type: "set_insurance"; assuranceType: "bancaire" | "externe"; assuranceAnnuelle?: number }
  | { type: "set_guarantee"; typeGarantie: TypeGarantie; commissionCaution?: number }
  | { type: "set_fees"; souscritCetExercice: boolean; fraisDossier?: number }
  | { type: "set_ira"; remboursementAnticipe: boolean; montant?: number }
  | { type: "confirm_loan" }
  | { type: "confirm_all" }
  | { type: "go_back" }
  | { type: "edit_loan"; pretId: string }
  | { type: "choose_loan_source"; source: "document" | "manual" }
  | { type: "upload_document"; documentId: string }
  | { type: "analysis_success"; documentId: string; prefill: F011CreditPrefill }
  | { type: "analysis_failed" }
  | { type: "retry_analysis" }
  | { type: "resolve_conflict"; field: F011PrefillFieldKey; choice: "keep_existing" | "use_document" }
  | { type: "confirm_extraction" };

export interface F011AssistantTurn {
  state: F011State;
  messages: F011Message[];
  completed: boolean;
  event?: "FINANCEMENT_SKIP" | "PRET_CONFIGURE" | "FINANCEMENT_TERMINE" | "FINANCEMENT_BLOQUE";
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
    loanFormGeneration: 0,
  };
}

/**
 * Cycle 2 — état conversationnel de l'Assistant Financement (F-011), pour
 * reprise après refresh/navigation (miroir de `logementAssistantState`/
 * `activiteAssistantState`). Jamais le résultat calculé : le calcul est
 * refait à la reprise à partir des prêts déjà saisis, jamais rejoué depuis
 * une valeur fiscale figée.
 */
export type F011PersistedState = {
  step: F011Step;
  presenceEmprunt?: boolean;
  nombrePrets?: number;
  currentLoanIndex: number;
  loans: F011LoanDraft[];
  pendingLoan?: Partial<F011LoanDraft>;
  fieldSources: Partial<Record<string, FieldSource>>;
  /** GO_BACK doit survivre à un refresh — même mécanisme unique qu'en mémoire (Cycle 3). */
  history?: F011HistorySnapshot[];
  /** Cycle 5 — pour reprendre une analyse en cours sans re-upload après un refresh. */
  analyzingDocumentId?: string;
  /** Cycle 5 — la revue documentaire elle-même, jamais le résultat fiscal calculé. */
  pendingExtraction?: F011PendingExtraction;
  extractionConflicts?: F011PrefillConflict[];
  detectedGuaranteeFees?: number;
  /** Correctif Cycle 10 — absent des états persistés avant ce correctif ; `resume()` retombe alors sur 0. */
  loanFormGeneration?: number;
  updatedAt: string;
};

/** Sérialise les parts de `F011State` dignes d'être reprises plus tard — jamais `result`. */
export function toF011PersistedState(state: F011State, updatedAt: string): F011PersistedState {
  return {
    step: state.step,
    presenceEmprunt: state.presenceEmprunt,
    nombrePrets: state.nombrePrets,
    currentLoanIndex: state.currentLoanIndex,
    loans: state.loans,
    pendingLoan: state.pendingLoan,
    fieldSources: state.fieldSources,
    history: state.history,
    analyzingDocumentId: state.analyzingDocumentId,
    pendingExtraction: state.pendingExtraction,
    extractionConflicts: state.extractionConflicts,
    detectedGuaranteeFees: state.detectedGuaranteeFees,
    loanFormGeneration: state.loanFormGeneration,
    updatedAt,
  };
}

/**
 * Whether a persisted session is worth resuming (vs. starting fresh). No
 * progress (`presence_emprunt`) and finished sessions (`complete`,
 * `skipped` — covered instead by the legacy `financementCharges`/
 * `creditDeclaredNoneAt` shortcuts) are both "nothing to resume" — miroir
 * exact de `shouldResumeF010`.
 */
export function shouldResumeF011(persisted: F011PersistedState | undefined): boolean {
  return Boolean(
    persisted &&
      persisted.step !== "presence_emprunt" &&
      persisted.step !== "complete" &&
      persisted.step !== "skipped",
  );
}
