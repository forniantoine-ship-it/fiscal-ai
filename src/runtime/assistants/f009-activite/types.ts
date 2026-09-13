import type { F009DocumentProjection } from "@/lib/documents/facts/f009-fact-projection";

export type F009QuestionStep = "identifier" | "identity" | "address" | "activity_date" | "service_date";

export type F009Step =
  | F009QuestionStep
  | "situation" | "document" | "pending_registration" | "review" | "edit"
  // Legacy persisted steps, migrated on restore; no V1 UI remains.
  | "orientation"
  | "collect_siret"
  | "collect_activity"
  | "mise_en_service"
  | "confirmation"
  | "complete"
  // Legacy and shared document steps.
  | "intro"
  | "no_document"
  | "collect_identity"
  | "manual_profile"
  | "analyzing"
  | "analysis_failed"
  | "review_extracted_data"
  | "ask_missing_data";

export type F009Orientation =
  | "registered_siret"
  | "registered_no_siret"
  | "not_sure"
  | "not_yet";

export type F009FieldSource = "manual" | "siret" | "user_correction";

/** Fields whose provenance/confirmation is tracked across the document and manual paths. */
export type F009DocumentFieldKey =
  | "siret"
  | "dateDebutActivite"
  | "lastName"
  | "firstName"
  | "email"
  | "telephone"
  | "personalAddress"
  | "establishmentAddress";

export const ALL_F009_DOCUMENT_FIELD_KEYS: readonly F009DocumentFieldKey[] = [
  "siret",
  "dateDebutActivite",
  "lastName",
  "firstName",
  "email",
  "telephone",
  "personalAddress",
  "establishmentAddress",
];

/** An unresolved contradiction between an already-confirmed value and a newer candidate — never auto-resolved (garde-fou 3). */
export type F009FieldConflict = {
  confirmedValue: string;
  newValue: string;
};

/**
 * In-progress data for the no-document path (spec §04 "Parcours manuel").
 * `profile` intentionally stays loosely typed here: the runtime machine does not
 * depend on the Tunnel A UI's `InpiProfile` shape (machine indépendante de l'UI, §09).
 */
export type F009ManualProfileState = {
  siretKnown?: boolean;
  profile?: Record<string, string>;
  dateDebutActivite?: string;
  /** Two-screen manual path (Option B) — "profile" is the default until submitted once. */
  stage?: "profile" | "date";
};

export type F009AnalysisFailureCause = "unrecognized" | "ocr_failed" | "network";

export interface F009V2Progress {
  version?: 2;
  registration?: "yes" | "no" | "unknown";
  deferred?: boolean;
  editing?: boolean;
  inputs?: Partial<Record<F009Step, Record<string, string>>>;
  resolutions?: Array<{ field: F009DocumentFieldKey; previous?: string; proposed?: string; selected: string; documentId?: string }>;
}

export interface F009State extends F009V2Progress {
  error?: string;
  step: F009Step;
  orientation?: F009Orientation;
  siret?: string;
  /**
   * Manual-entry only: kept when no SIRET is known but the user provides a SIREN
   * directly. When a SIRET is known, `persistCompletion` derives SIREN from it and
   * this field is not used — see correctif "MANUAL_PROFILE" §4.
   */
  siren?: string;
  dateDebutActivite?: string;
  dateMiseEnService?: string;
  regimeFiscal?: "reel_simplifie" | "reel_normal";
  fieldSources: Partial<Record<string, F009FieldSource>>;
  explanation?: string;
  prorataPercent?: number;

  // --- Profile fields (nom/prénom/email/téléphone/adresses), sourced from the same
  // INPI document, jalon "préremplissage" — same fusion/confirm/correct machinery
  // as siret/dateDebutActivite via F009DocumentFieldKey. ---
  lastName?: string;
  firstName?: string;
  email?: string;
  telephone?: string;
  personalAddress?: string;
  /** Carried alongside `personalAddress` for `declarationDraft`; not independently confirmable. */
  personalAddressCity?: string;
  personalAddressPostalCode?: string;
  establishmentAddress?: string;
  establishmentAddressCity?: string;
  establishmentAddressPostalCode?: string;

  /** Stack of previously-visited steps, for GO_BACK. Never includes the current step (garde-fou 1). */
  history?: F009Step[];
  /** Raw candidate data from the last successful document analysis — wholesale-replaced on each new analysis (garde-fou 4). */
  review?: F009DocumentProjection;
  /** Which document/manual-sourced fields the user has explicitly confirmed — locks against silent overwrite (garde-fou 3). */
  confirmed?: Partial<Record<F009DocumentFieldKey | "dateMiseEnService", boolean>>;
  /** Unresolved contradictions blocking progression until the user chooses explicitly (garde-fou 3). */
  conflicts?: Partial<Record<F009DocumentFieldKey, F009FieldConflict>>;
  /** Cause of the last analysis failure, for the ANALYSIS_FAILED message (spec §07). */
  analysisFailureCause?: F009AnalysisFailureCause;
  /** No-document path in-progress data (spec §04). */
  manualProfile?: F009ManualProfileState;
  /** Document currently (or last) being analyzed — lets ANALYZING be resumed against the same upload, no re-upload needed (Étape 4). */
  analyzingDocumentId?: string;
}

/**
 * The subset of `F009State` worth persisting across a reload (Étape 4, spec §11/§12).
 * Deliberately excludes purely visual/derived fields — `explanation`/`prorataPercent`
 * are recomputed on resume rather than cached, and `fieldSources` (legacy, unread
 * elsewhere) is dropped. This structured draft substate holds collected values,
 * review decisions and navigation until validation copies known values to the
 * downstream declaration fields. It never stores a conversational transcript.
 */
export type F009PersistedState = F009V2Progress & {
  step: F009Step;
  siret?: string;
  siren?: string;
  dateDebutActivite?: string;
  dateMiseEnService?: string;
  regimeFiscal?: "reel_simplifie" | "reel_normal";
  lastName?: string;
  firstName?: string;
  email?: string;
  telephone?: string;
  personalAddress?: string;
  personalAddressCity?: string;
  personalAddressPostalCode?: string;
  establishmentAddress?: string;
  establishmentAddressCity?: string;
  establishmentAddressPostalCode?: string;
  history?: F009Step[];
  review?: F009DocumentProjection;
  confirmed?: F009State["confirmed"];
  conflicts?: F009State["conflicts"];
  analysisFailureCause?: F009AnalysisFailureCause;
  analyzingDocumentId?: string;
  manualProfile?: F009ManualProfileState;
  updatedAt: string;
};

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
  | { type: "select_registration"; value: "yes" | "no" | "unknown" }
  | { type: "manual" }
  | { type: "defer" }
  | { type: "review_all" }
  | { type: "edit" }
  | { type: "edit_question"; step: F009QuestionStep }
  | { type: "stage_input"; values: Record<string, string> }
  | { type: "answer"; values: Record<string, string> }
  | { type: "siret_obtained"; siret: string }
  | { type: "select_establishment"; siret: string }
  // Legacy persisted steps, migrated on restore; no V1 UI remains.
  | { type: "select_orientation"; orientation: F009Orientation }
  | { type: "submit_siret"; siret: string }
  | { type: "submit_activity"; dateDebutActivite: string; regimeFiscal: "reel_simplifie" | "reel_normal" }
  | { type: "submit_mise_en_service"; dateMiseEnService: string }
  | { type: "confirm" }
  | { type: "restart" }
  // Document-first path
  | { type: "upload_document"; documentId?: string }
  | { type: "select_no_document" }
  | { type: "analysis_success"; projection: F009DocumentProjection }
  | { type: "analysis_failed"; cause: F009AnalysisFailureCause }
  | { type: "retry" }
  | { type: "continue_manually" }
  | { type: "confirm_field"; field: F009DocumentFieldKey }
  | { type: "correct_field"; field: F009DocumentFieldKey; value: string }
  | { type: "resolve_conflict"; field: F009DocumentFieldKey; value: string }
  | { type: "continue_review" }
  | { type: "submit_siret_known"; known: boolean; siret?: string }
  | { type: "submit_identity"; lastName: string; firstName: string }
  | { type: "submit_manual_profile_fields"; profile: Record<string, string> }
  | { type: "submit_manual_activity_date"; dateDebutActivite: string }
  | { type: "go_back" };

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

/** Entry point for the document-first path (spec §02/§09) — what `start()` returns. */
export function createF009IntroState(): F009State {
  return {
    version: 2,
    step: "situation",
    fieldSources: {},
  };
}

/** Serializes the parts of a live F009State worth resuming later (Étape 4). */
export function toF009PersistedState(state: F009State, updatedAt: string): F009PersistedState {
  return {
    version: 2,
    registration: state.registration,
    deferred: state.deferred,
    editing: state.editing,
    inputs: state.inputs,
    resolutions: state.resolutions,
    step: state.step,
    siret: state.siret,
    siren: state.siren,
    dateDebutActivite: state.dateDebutActivite,
    dateMiseEnService: state.dateMiseEnService,
    regimeFiscal: state.regimeFiscal,
    lastName: state.lastName,
    firstName: state.firstName,
    email: state.email,
    telephone: state.telephone,
    personalAddress: state.personalAddress,
    personalAddressCity: state.personalAddressCity,
    personalAddressPostalCode: state.personalAddressPostalCode,
    establishmentAddress: state.establishmentAddress,
    establishmentAddressCity: state.establishmentAddressCity,
    establishmentAddressPostalCode: state.establishmentAddressPostalCode,
    history: state.history,
    review: state.review,
    confirmed: state.confirmed,
    conflicts: state.conflicts,
    analysisFailureCause: state.analysisFailureCause,
    analyzingDocumentId: state.analyzingDocumentId,
    manualProfile: state.manualProfile,
    updatedAt,
  };
}

/**
 * Every stored session is restorable, including completed sessions without SIRET.
 * restoreF009 handles migration; completeness is never guessed from three fields.
 */
export function shouldResumeF009(persisted: F009PersistedState | undefined): boolean {
  return Boolean(persisted);
}
