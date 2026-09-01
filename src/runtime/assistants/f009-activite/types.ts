import type { F009DocumentProjection } from "@/lib/documents/facts/f009-fact-projection";

export type F009Step =
  // Legacy manual-entry path (unchanged)
  | "orientation"
  | "collect_siret"
  | "collect_activity"
  | "mise_en_service"
  | "confirmation"
  | "complete"
  // Document-first path (spec "F009, Document d'Abord" §09) — the entry point since Étape 3.
  | "intro"
  | "no_document"
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

export interface F009State {
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
 * elsewhere) is dropped. `declarationDraft` stays the business source of truth; this
 * is session/resume state only, never a second store for siret/dates themselves.
 */
export type F009PersistedState = {
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
  // Legacy manual-entry path (unchanged)
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
    step: "intro",
    fieldSources: {},
  };
}

/** Serializes the parts of a live F009State worth resuming later (Étape 4). */
export function toF009PersistedState(state: F009State, updatedAt: string): F009PersistedState {
  return {
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
 * Whether a persisted session is worth resuming (vs. starting fresh). No progress
 * (`intro`) and finished sessions (`complete`, covered instead by the existing
 * siret+dates completion shortcut) are both "nothing to resume" (spec §11, point 8).
 */
export function shouldResumeF009(persisted: F009PersistedState | undefined): boolean {
  return Boolean(persisted && persisted.step !== "intro" && persisted.step !== "complete");
}
