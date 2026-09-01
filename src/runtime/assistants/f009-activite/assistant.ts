import { formatAddressLine } from "@/lib/documents/facts/f009-fact-projection";

import { explainMiseEnService } from "../../capabilities/f009/explain-mise-en-service";
import { validateActiviteDates } from "../../capabilities/f009/validate-activite-dates";
import { validateSiret } from "../../capabilities/f009/validate-siret";
import type { RuntimeContext } from "../../contracts/RuntimeContext";
import {
  ALL_F009_DOCUMENT_FIELD_KEYS,
  createF009IntroState,
  type F009Action,
  type F009AssistantTurn,
  type F009DocumentFieldKey,
  type F009FieldConflict,
  type F009Message,
  type F009Orientation,
  type F009PersistedState,
  type F009State,
  type F009Step,
  type F009Suggestion,
} from "./types";

const ORIENTATION_SUGGESTIONS: F009Suggestion[] = [
  { id: "registered_siret", label: "Oui, et j'ai mon SIRET" },
  { id: "registered_no_siret", label: "Oui, mais je n'ai pas mon SIRET" },
  { id: "not_sure", label: "Je ne suis pas sûr" },
  { id: "not_yet", label: "Pas encore déclarée" },
];

const INTRO_SUGGESTIONS: F009Suggestion[] = [
  { id: "upload_document", label: "Importer mon extrait INPI" },
  { id: "select_no_document", label: "Je n'ai pas ce document" },
];

const CONFIRMATION_SUGGESTIONS: F009Suggestion[] = [
  { id: "confirm", label: "Oui, tout est correct" },
  { id: "restart", label: "Recommencer" },
];

const MISE_EN_SERVICE_QUESTION =
  "Quand avez-vous loué ce bien pour la première fois — ou quand prévoyez-vous de le louer ?";

const ACTIVITY_START_DATE_QUESTION =
  "Quelle est la date officielle de début de votre activité (immatriculation) ?";

function introPrompt(): F009Message {
  return {
    role: "assistant",
    content:
      "Pour démarrer votre dossier d'activité LMNP, avez-vous votre extrait INPI sous la main ? " +
      "En quelques secondes, nous pouvons en tirer l'essentiel — SIRET, date de début d'activité, et vos coordonnées.",
    suggestions: INTRO_SUGGESTIONS,
  };
}

function orientationAck(orientation: F009Orientation): string {
  switch (orientation) {
    case "registered_siret":
      return "Parfait. Indiquez votre numéro SIRET — nous vérifierons le format avant toute recherche.";
    case "registered_no_siret":
      return "Pas de souci. Nous allons saisir les informations essentielles à la main.";
    case "not_sure":
      return "Nous allons avancer ensemble, étape par étape, avec une saisie guidée.";
    case "not_yet":
      return "Vous pourrez poursuivre votre dossier. Indiquez une date prévisionnelle si votre bien n'est pas encore loué.";
  }
}

function orientationLabel(orientation: F009Orientation): string {
  return ORIENTATION_SUGGESTIONS.find((s) => s.id === orientation)?.label ?? orientation;
}

function fieldLabel(field: F009DocumentFieldKey): string {
  switch (field) {
    case "siret":
      return "le SIRET";
    case "dateDebutActivite":
      return "la date de début d'activité";
    case "lastName":
      return "le nom";
    case "firstName":
      return "le prénom";
    case "email":
      return "l'email";
    case "telephone":
      return "le téléphone";
    case "personalAddress":
      return "l'adresse personnelle";
    case "establishmentAddress":
      return "l'adresse de l'établissement";
  }
}

/** Reads the current value of a document/manual field from state, by key. */
function readF009Field(state: F009State, key: F009DocumentFieldKey): string | undefined {
  switch (key) {
    case "siret":
      return state.siret;
    case "dateDebutActivite":
      return state.dateDebutActivite;
    case "lastName":
      return state.lastName;
    case "firstName":
      return state.firstName;
    case "email":
      return state.email;
    case "telephone":
      return state.telephone;
    case "personalAddress":
      return state.personalAddress;
    case "establishmentAddress":
      return state.establishmentAddress;
  }
}

function analysisFailureMessage(cause: F009State["analysisFailureCause"]): string {
  switch (cause) {
    case "network":
      return "La connexion a été interrompue pendant l'analyse. Vérifiez votre connexion, puis réessayez — ou continuez sans document.";
    case "unrecognized":
      return "Ce document ne ressemble pas à un extrait INPI. Vérifiez qu'il s'agit bien du bon fichier, ou continuez sans document.";
    case "ocr_failed":
    default:
      return "Nous n'avons pas pu lire ce document. Vous pouvez réessayer, ou continuer sans document.";
  }
}

/**
 * Pushes the step being left onto the history stack and applies the given patch —
 * the single place every forward transition goes through, so GO_BACK (garde-fou 1)
 * works uniformly across the legacy and document-first paths alike.
 */
function advance(state: F009State, patch: Partial<F009State>, nextStep: F009Step): F009State {
  return {
    ...state,
    ...patch,
    step: nextStep,
    history: [...(state.history ?? []), state.step],
  };
}

/**
 * Fusion rule shared by manuel→document and document→document (garde-fou 3):
 * a value the user has not explicitly confirmed is freely replaceable by a newer
 * candidate, regardless of the candidate's origin; a confirmed value is never
 * silently overwritten — a contradiction becomes an explicit, unresolved conflict;
 * and the absence of a value in a newer analysis never erases an established one.
 */
function resolveDocumentField(input: {
  currentValue?: string;
  currentlyConfirmed: boolean;
  newValue?: string;
}): { value?: string; confirmed: boolean; conflict?: F009FieldConflict } {
  if (input.newValue === undefined) {
    return { value: input.currentValue, confirmed: input.currentlyConfirmed };
  }
  if (!input.currentlyConfirmed) {
    return { value: input.newValue, confirmed: false };
  }
  if (input.currentValue === input.newValue) {
    return { value: input.currentValue, confirmed: true };
  }
  return {
    value: input.currentValue,
    confirmed: true,
    conflict: { confirmedValue: input.currentValue!, newValue: input.newValue },
  };
}

/**
 * Dependency invalidation (garde-fou 2): changing the date de début d'activité
 * invalidates the date de mise en service confirmed against it, and the prorata
 * explanation computed from it — forcing both back through re-validation instead
 * of silently carrying a now-stale confirmation or figure forward.
 */
function invalidateDependentsOfActivityStart(state: F009State): Partial<F009State> {
  return {
    dateMiseEnService: undefined,
    explanation: undefined,
    prorataPercent: undefined,
    confirmed: { ...state.confirmed, dateMiseEnService: undefined },
  };
}

/**
 * Contextualized resume message (spec §08): summarizes what's already known and
 * what's left, from the persisted state alone — never a generic "let's start over".
 */
function buildResumeMessage(persisted: F009PersistedState): F009Message {
  if (persisted.step === "analyzing") {
    return { role: "assistant", content: "Nous reprenons l'analyse de votre document." };
  }
  if (persisted.step === "analysis_failed") {
    return {
      role: "assistant",
      content: analysisFailureMessage(persisted.analysisFailureCause),
    };
  }

  const known: string[] = [];
  if (persisted.siret) known.push(`votre SIRET (${persisted.siret})`);
  if (persisted.dateDebutActivite) known.push("votre date de début d'activité");
  if (persisted.dateMiseEnService) known.push("votre date de mise en service");
  if (persisted.lastName || persisted.firstName) known.push("votre identité");
  if (persisted.email || persisted.telephone) known.push("vos coordonnées");
  if (persisted.personalAddress) known.push("votre adresse personnelle");
  if (persisted.establishmentAddress) known.push("l'adresse de votre établissement");

  const missing: string[] = [];
  if (!persisted.siret) missing.push("votre SIRET");
  if (!persisted.dateDebutActivite) missing.push("votre date de début d'activité");
  if (!persisted.dateMiseEnService) missing.push("votre date de mise en service");

  if (known.length === 0) {
    return { role: "assistant", content: "Reprenons là où vous en étiez." };
  }

  const knownSentence = `Vous avez déjà fourni ${known.join(", ")}.`;
  const missingSentence = missing.length > 0 ? ` Il ne manque que ${missing.join(", ")}.` : "";
  return { role: "assistant", content: `${knownSentence}${missingSentence}` };
}

export class F009ActiviteAssistant {
  constructor(private readonly ctx: RuntimeContext) {}

  start(): F009AssistantTurn {
    return {
      state: createF009IntroState(),
      messages: [introPrompt()],
      completed: false,
    };
  }

  /**
   * Resumes a persisted session exactly where it was left (Étape 4) — never
   * `start()`'s INTRO. `explanation`/`prorataPercent` are recomputed rather than
   * trusted from storage, consistent with CONFIRMING never showing a cached figure.
   */
  resume(persisted: F009PersistedState): F009AssistantTurn {
    const state: F009State = {
      step: persisted.step,
      siret: persisted.siret,
      siren: persisted.siren,
      dateDebutActivite: persisted.dateDebutActivite,
      dateMiseEnService: persisted.dateMiseEnService,
      regimeFiscal: persisted.regimeFiscal,
      lastName: persisted.lastName,
      firstName: persisted.firstName,
      email: persisted.email,
      telephone: persisted.telephone,
      personalAddress: persisted.personalAddress,
      personalAddressCity: persisted.personalAddressCity,
      personalAddressPostalCode: persisted.personalAddressPostalCode,
      establishmentAddress: persisted.establishmentAddress,
      establishmentAddressCity: persisted.establishmentAddressCity,
      establishmentAddressPostalCode: persisted.establishmentAddressPostalCode,
      fieldSources: {},
      history: persisted.history,
      review: persisted.review,
      confirmed: persisted.confirmed,
      conflicts: persisted.conflicts,
      analysisFailureCause: persisted.analysisFailureCause,
      analyzingDocumentId: persisted.analyzingDocumentId,
      manualProfile: persisted.manualProfile,
    };

    if (state.step === "confirmation" && state.dateDebutActivite && state.dateMiseEnService) {
      const explanation = explainMiseEnService(
        { dateDebutActivite: state.dateDebutActivite, dateMiseEnService: state.dateMiseEnService },
        this.ctx.fiscalYear,
      );
      state.explanation = explanation.explanation;
      state.prorataPercent = explanation.prorataPercent;
    }

    return {
      state,
      messages: [buildResumeMessage(persisted)],
      completed: false,
    };
  }

  /** Recomputes the prorata fresh from current state every time (garde-fou 2 — never cached). */
  private enterConfirmation(
    state: F009State,
    dateMiseEnService: string,
    messages: F009Message[],
  ): F009State {
    const explanation = explainMiseEnService(
      { dateDebutActivite: state.dateDebutActivite!, dateMiseEnService },
      this.ctx.fiscalYear,
    );

    const next = advance(
      state,
      {
        dateMiseEnService,
        explanation: explanation.explanation,
        prorataPercent: explanation.prorataPercent,
        confirmed: { ...state.confirmed, dateMiseEnService: true },
        fieldSources: { ...state.fieldSources, dateMiseEnService: "manual" },
      },
      "confirmation",
    );

    messages.push({ role: "assistant", content: explanation.explanation });
    messages.push({
      role: "assistant",
      content: "Ces informations vous semblent-elles correctes ?",
      suggestions: CONFIRMATION_SUGGESTIONS,
    });
    return next;
  }

  async handle(state: F009State, action: F009Action): Promise<F009AssistantTurn> {
    const messages: F009Message[] = [];

    switch (action.type) {
      case "restart":
        return this.start();

      // ---------------------------------------------------------------
      // Legacy manual-entry path — behaviour unchanged, now history-tracked.
      // ---------------------------------------------------------------

      case "select_orientation": {
        const next = advance(
          state,
          { orientation: action.orientation },
          action.orientation === "registered_siret" ? "collect_siret" : "collect_activity",
        );
        messages.push({ role: "user", content: orientationLabel(action.orientation) });
        messages.push({ role: "assistant", content: orientationAck(action.orientation) });
        return { state: next, messages, completed: false };
      }

      case "submit_siret": {
        messages.push({ role: "user", content: `SIRET : ${action.siret}` });
        const result = validateSiret({ siret: action.siret });
        if (!result.valid) {
          messages.push({
            role: "assistant",
            content: result.error ?? "Ce SIRET ne semble pas valide.",
          });
          return { state, messages, completed: false };
        }
        const next = advance(
          state,
          {
            siret: result.normalized,
            confirmed: { ...state.confirmed, siret: true },
            fieldSources: { ...state.fieldSources, siret: "siret" },
          },
          "collect_activity",
        );
        messages.push({
          role: "assistant",
          content:
            "Merci. Quelle est la date officielle de début de votre activité (immatriculation) ? " +
            "Nous utiliserons le régime réel simplifié pour ce dossier.",
        });
        return { state: next, messages, completed: false };
      }

      case "submit_activity": {
        messages.push({
          role: "user",
          content: `Début d'activité : ${action.dateDebutActivite}`,
        });
        const changed =
          state.dateDebutActivite !== undefined &&
          state.dateDebutActivite !== action.dateDebutActivite;
        const next = advance(
          state,
          {
            dateDebutActivite: action.dateDebutActivite,
            regimeFiscal: action.regimeFiscal,
            confirmed: { ...state.confirmed, dateDebutActivite: true },
            fieldSources: {
              ...state.fieldSources,
              dateDebutActivite: "manual",
              regimeFiscal: "manual",
            },
            ...(changed ? invalidateDependentsOfActivityStart(state) : {}),
          },
          "mise_en_service",
        );
        messages.push({ role: "assistant", content: MISE_EN_SERVICE_QUESTION });
        return { state: next, messages, completed: false };
      }

      case "submit_mise_en_service": {
        messages.push({
          role: "user",
          content: `Mise en service : ${action.dateMiseEnService}`,
        });
        if (!state.dateDebutActivite) {
          messages.push({
            role: "assistant",
            content: "Il nous manque la date de début d'activité pour continuer.",
          });
          return { state, messages, completed: false };
        }

        const dateCheck = validateActiviteDates({
          dateDebutActivite: state.dateDebutActivite,
          dateMiseEnService: action.dateMiseEnService,
        });
        if (!dateCheck.valid) {
          messages.push({ role: "assistant", content: dateCheck.issues.join(" ") });
          return { state, messages, completed: false };
        }

        const next = this.enterConfirmation(state, action.dateMiseEnService, messages);
        return { state: next, messages, completed: false };
      }

      case "confirm": {
        messages.push({ role: "user", content: "Oui, tout est correct" });
        messages.push({
          role: "assistant",
          content:
            "Votre activité est enregistrée. Nous pouvons passer à l'étape suivante de votre dossier.",
        });
        return {
          state: advance(state, {}, "complete"),
          messages,
          completed: true,
        };
      }

      // ---------------------------------------------------------------
      // Document-first path (spec "F009, Document d'Abord" §09).
      // ---------------------------------------------------------------

      case "upload_document": {
        if (state.step === "analyzing") {
          // A second upload while one is already in flight is ignored rather than
          // risking two concurrent analyses interleaving into the same review state.
          return { state, messages, completed: false };
        }
        messages.push({ role: "user", content: "Import d'un document" });
        const next = advance(state, { analyzingDocumentId: action.documentId }, "analyzing");
        messages.push({ role: "assistant", content: "L'IA prépare vos informations…" });
        return { state: next, messages, completed: false };
      }

      case "select_no_document": {
        messages.push({ role: "user", content: "Je n'ai pas ce document" });
        const next = advance(state, {}, "no_document");
        messages.push({
          role: "assistant",
          content:
            "Pas de souci, nous allons avancer étape par étape. Connaissez-vous déjà votre numéro SIRET ?",
        });
        return { state: next, messages, completed: false };
      }

      case "analysis_success": {
        const projection = action.projection;

        // Same fusion rule (garde-fou 3) applied uniformly to all 8 document/manual
        // fields — SIRET and the date keep their ambiguity gate; the 6 profile
        // fields (reused from Tunnel A's own projection, see f009-fact-projection.ts)
        // are never ambiguous at this layer, so they resolve directly.
        const newValueByField: Record<F009DocumentFieldKey, string | undefined> = {
          siret: projection.siretAmbiguous ? undefined : projection.siret,
          dateDebutActivite: projection.datesAmbiguous ? undefined : projection.activityStartDate,
          lastName: projection.lastName,
          firstName: projection.firstName,
          email: projection.email,
          telephone: projection.telephone,
          personalAddress: projection.personalAddress,
          establishmentAddress: projection.establishmentAddress,
        };

        const resolutions = Object.fromEntries(
          ALL_F009_DOCUMENT_FIELD_KEYS.map((key) => [
            key,
            resolveDocumentField({
              currentValue: readF009Field(state, key),
              currentlyConfirmed: Boolean(state.confirmed?.[key]),
              newValue: newValueByField[key],
            }),
          ]),
        ) as Record<F009DocumentFieldKey, ReturnType<typeof resolveDocumentField>>;

        const dateChanged =
          state.dateDebutActivite !== undefined &&
          resolutions.dateDebutActivite.value !== undefined &&
          resolutions.dateDebutActivite.value !== state.dateDebutActivite;

        // City/postal code ride along with their address line: only refreshed when
        // the line itself was freshly adopted from this analysis (never protected
        // independently — they are not exposed as their own confirmable field).
        const personalAdopted =
          projection.personalAddress !== undefined &&
          resolutions.personalAddress.value === projection.personalAddress;
        const establishmentAdopted =
          projection.establishmentAddress !== undefined &&
          resolutions.establishmentAddress.value === projection.establishmentAddress;

        const next = advance(
          state,
          {
            review: projection,
            siret: resolutions.siret.value,
            dateDebutActivite: resolutions.dateDebutActivite.value,
            lastName: resolutions.lastName.value,
            firstName: resolutions.firstName.value,
            email: resolutions.email.value,
            telephone: resolutions.telephone.value,
            personalAddress: resolutions.personalAddress.value,
            personalAddressCity: personalAdopted ? projection.personalAddressCity : state.personalAddressCity,
            personalAddressPostalCode: personalAdopted
              ? projection.personalAddressPostalCode
              : state.personalAddressPostalCode,
            establishmentAddress: resolutions.establishmentAddress.value,
            establishmentAddressCity: establishmentAdopted
              ? projection.establishmentAddressCity
              : state.establishmentAddressCity,
            establishmentAddressPostalCode: establishmentAdopted
              ? projection.establishmentAddressPostalCode
              : state.establishmentAddressPostalCode,
            confirmed: {
              ...state.confirmed,
              ...Object.fromEntries(
                ALL_F009_DOCUMENT_FIELD_KEYS.map((key) => [key, resolutions[key].confirmed]),
              ),
            },
            conflicts: Object.fromEntries(
              ALL_F009_DOCUMENT_FIELD_KEYS.map((key) => [key, resolutions[key].conflict]),
            ),
            fieldSources: {
              ...state.fieldSources,
              ...(resolutions.siret.value && !resolutions.siret.conflict
                ? { siret: "siret" as const }
                : {}),
            },
            ...(dateChanged ? invalidateDependentsOfActivityStart(state) : {}),
          },
          "review_extracted_data",
        );

        messages.push({
          role: "assistant",
          content: "J'ai trouvé ces informations dans votre extrait INPI :",
        });
        return { state: next, messages, completed: false };
      }

      case "analysis_failed": {
        const next = advance(state, { analysisFailureCause: action.cause }, "analysis_failed");
        messages.push({ role: "assistant", content: analysisFailureMessage(action.cause) });
        return { state: next, messages, completed: false };
      }

      case "retry": {
        messages.push({ role: "user", content: "Réessayer" });
        const next = advance(state, { analysisFailureCause: undefined }, "analyzing");
        messages.push({ role: "assistant", content: "L'IA prépare vos informations…" });
        return { state: next, messages, completed: false };
      }

      case "continue_manually": {
        messages.push({ role: "user", content: "Continuer en manuel" });
        const next = advance(state, { analysisFailureCause: undefined }, "no_document");
        messages.push({
          role: "assistant",
          content:
            "Pas de souci, nous allons avancer étape par étape. Connaissez-vous déjà votre numéro SIRET ?",
        });
        return { state: next, messages, completed: false };
      }

      case "confirm_field": {
        const { field } = action;
        messages.push({ role: "user", content: `Je confirme ${fieldLabel(field)}` });
        const next: F009State = {
          ...state,
          confirmed: { ...state.confirmed, [field]: true },
          conflicts: { ...state.conflicts, [field]: undefined },
          fieldSources: {
            ...state.fieldSources,
            [field]: field === "siret" ? "siret" : "manual",
          },
        };
        // ASK_MISSING_DATA asks for dateDebutActivite before dateMiseEnService when
        // the document didn't provide it (correctif blocage) — once resolved here,
        // prompt the next sub-question rather than leaving the chat silent.
        if (state.step === "ask_missing_data" && field === "dateDebutActivite") {
          messages.push({ role: "assistant", content: MISE_EN_SERVICE_QUESTION });
        }
        return { state: next, messages, completed: false };
      }

      case "correct_field": {
        const { field, value } = action;
        messages.push({ role: "user", content: `${fieldLabel(field)} : ${value}` });
        const changed = field === "dateDebutActivite" && value !== state.dateDebutActivite;
        const next: F009State = {
          ...state,
          [field]: value,
          confirmed: { ...state.confirmed, [field]: true },
          conflicts: { ...state.conflicts, [field]: undefined },
          fieldSources: { ...state.fieldSources, [field]: "user_correction" },
          ...(changed ? invalidateDependentsOfActivityStart(state) : {}),
        };
        if (state.step === "ask_missing_data" && field === "dateDebutActivite") {
          messages.push({ role: "assistant", content: MISE_EN_SERVICE_QUESTION });
        }
        return { state: next, messages, completed: false };
      }

      case "resolve_conflict": {
        const { field, value } = action;
        messages.push({ role: "user", content: `${fieldLabel(field)} retenu : ${value}` });
        const changed = field === "dateDebutActivite" && value !== state.dateDebutActivite;
        const next: F009State = {
          ...state,
          [field]: value,
          confirmed: { ...state.confirmed, [field]: true },
          conflicts: { ...state.conflicts, [field]: undefined },
          ...(changed ? invalidateDependentsOfActivityStart(state) : {}),
        };
        if (state.step === "ask_missing_data" && field === "dateDebutActivite") {
          messages.push({ role: "assistant", content: MISE_EN_SERVICE_QUESTION });
        }
        return { state: next, messages, completed: false };
      }

      case "continue_review": {
        const unresolved = ALL_F009_DOCUMENT_FIELD_KEYS.filter(
          (field) => state.conflicts?.[field] !== undefined,
        );
        if (unresolved.length > 0) {
          messages.push({
            role: "assistant",
            content:
              "Merci de choisir une valeur pour les champs en contradiction avant de continuer.",
          });
          return { state, messages, completed: false };
        }

        if (state.dateMiseEnService && state.confirmed?.dateMiseEnService) {
          const next = this.enterConfirmation(state, state.dateMiseEnService, messages);
          return { state: next, messages, completed: false };
        }

        const next = advance(state, {}, "ask_missing_data");
        messages.push({
          role: "assistant",
          content: state.dateDebutActivite ? MISE_EN_SERVICE_QUESTION : ACTIVITY_START_DATE_QUESTION,
        });
        return { state: next, messages, completed: false };
      }

      case "submit_siret_known": {
        messages.push({
          role: "user",
          content: action.known ? "Oui, je le connais" : "Non / je ne suis pas sûr",
        });

        let patch: Partial<F009State> = {
          manualProfile: { ...state.manualProfile, siretKnown: action.known },
        };

        if (action.known && action.siret) {
          const result = validateSiret({ siret: action.siret });
          if (!result.valid) {
            messages.push({
              role: "assistant",
              content: result.error ?? "Ce SIRET ne semble pas valide.",
            });
            return { state, messages, completed: false };
          }
          patch = {
            ...patch,
            siret: result.normalized,
            confirmed: { ...state.confirmed, siret: true },
            fieldSources: { ...state.fieldSources, siret: "siret" },
          };
        }

        const next = advance(state, patch, "manual_profile");
        messages.push({ role: "assistant", content: "Complétons maintenant votre profil." });
        return { state: next, messages, completed: false };
      }

      case "submit_manual_profile_fields": {
        const p = action.profile;
        messages.push({ role: "user", content: "Profil renseigné" });

        // Absence never erases an established value (garde-fou 3, applied here to
        // manual re-submission too) — an empty field on resubmission keeps whatever
        // was already there rather than blanking it.
        const keep = (current: string | undefined, incoming: string | undefined) => {
          const trimmed = incoming?.trim();
          return trimmed ? { value: trimmed, provided: true } : { value: current, provided: false };
        };

        const lastName = keep(state.lastName, p.lastName);
        const firstName = keep(state.firstName, p.firstName);
        const siren = keep(state.siren, p.siren);
        const email = keep(state.email, p.email);
        const telephone = keep(state.telephone, p.telephone);

        // Combined via the same formatAddressLine used for the document path, so
        // F009State.personalAddress/establishmentAddress mean the same thing
        // regardless of origin — no parallel address representation.
        const personalLine = keep(undefined, p.personalAddress);
        const personalCity = keep(state.personalAddressCity, p.personalCity);
        const personalPostalCode = keep(state.personalAddressPostalCode, p.personalPostalCode);
        const personalAddress = personalLine.provided
          ? formatAddressLine(personalLine.value, personalPostalCode.value, personalCity.value)
          : state.personalAddress;

        const establishmentLine = keep(undefined, p.establishmentAddress);
        const establishmentCity = keep(state.establishmentAddressCity, p.establishmentCity);
        const establishmentPostalCode = keep(state.establishmentAddressPostalCode, p.establishmentPostalCode);
        const establishmentAddress = establishmentLine.provided
          ? formatAddressLine(establishmentLine.value, establishmentPostalCode.value, establishmentCity.value)
          : state.establishmentAddress;

        const next: F009State = {
          ...state,
          lastName: lastName.value,
          firstName: firstName.value,
          siren: siren.value,
          email: email.value,
          telephone: telephone.value,
          personalAddress,
          personalAddressCity: personalCity.value,
          personalAddressPostalCode: personalPostalCode.value,
          establishmentAddress,
          establishmentAddressCity: establishmentCity.value,
          establishmentAddressPostalCode: establishmentPostalCode.value,
          confirmed: {
            ...state.confirmed,
            ...(lastName.provided ? { lastName: true } : {}),
            ...(firstName.provided ? { firstName: true } : {}),
            ...(email.provided ? { email: true } : {}),
            ...(telephone.provided ? { telephone: true } : {}),
            ...(personalLine.provided ? { personalAddress: true } : {}),
            ...(establishmentLine.provided ? { establishmentAddress: true } : {}),
          },
          fieldSources: {
            ...state.fieldSources,
            ...(lastName.provided ? { lastName: "manual" as const } : {}),
            ...(firstName.provided ? { firstName: "manual" as const } : {}),
            ...(email.provided ? { email: "manual" as const } : {}),
            ...(telephone.provided ? { telephone: "manual" as const } : {}),
            ...(personalLine.provided ? { personalAddress: "manual" as const } : {}),
            ...(establishmentLine.provided ? { establishmentAddress: "manual" as const } : {}),
          },
          manualProfile: { ...state.manualProfile, profile: action.profile, stage: "date" },
        };

        messages.push({
          role: "assistant",
          content: "Quelle est la date officielle de début de votre activité (immatriculation) ?",
        });
        return { state: next, messages, completed: false };
      }

      case "submit_manual_activity_date": {
        messages.push({
          role: "user",
          content: `Début d'activité : ${action.dateDebutActivite}`,
        });
        const changed =
          state.dateDebutActivite !== undefined &&
          state.dateDebutActivite !== action.dateDebutActivite;
        const next = advance(
          state,
          {
            dateDebutActivite: action.dateDebutActivite,
            confirmed: { ...state.confirmed, dateDebutActivite: true },
            manualProfile: { ...state.manualProfile, dateDebutActivite: action.dateDebutActivite },
            fieldSources: { ...state.fieldSources, dateDebutActivite: "manual" },
            ...(changed ? invalidateDependentsOfActivityStart(state) : {}),
          },
          "ask_missing_data",
        );
        messages.push({ role: "assistant", content: MISE_EN_SERVICE_QUESTION });
        return { state: next, messages, completed: false };
      }

      case "go_back": {
        // Sub-navigation inside MANUAL_PROFILE (profile ↔ date, correctif Option B) —
        // this hasn't pushed onto the top-level history stack, since the step itself
        // never changed. Data already entered on the profile screen is untouched.
        if (state.step === "manual_profile" && state.manualProfile?.stage === "date") {
          return {
            state: { ...state, manualProfile: { ...state.manualProfile, stage: "profile" } },
            messages,
            completed: false,
          };
        }

        const history = state.history ?? [];

        if (history.length === 0) {
          // A session resumed straight into COMPLETE (legacy shortcut) has no
          // history yet but must still be reopenable (garde-fou 1, point 2).
          if (state.step === "complete") {
            return { state: { ...state, step: "confirmation" }, messages, completed: false };
          }
          return { state, messages, completed: false };
        }

        const previousStep = history[history.length - 1]!;
        const next: F009State = {
          ...state,
          step: previousStep,
          history: history.slice(0, -1),
        };
        return { state: next, messages, completed: false };
      }

      default:
        return { state, messages, completed: false };
    }
  }
}

export {
  createInitialF009State,
  createF009IntroState,
  toF009PersistedState,
  shouldResumeF009,
  ALL_F009_DOCUMENT_FIELD_KEYS,
} from "./types";
export type {
  F009Action,
  F009AnalysisFailureCause,
  F009AssistantTurn,
  F009DocumentFieldKey,
  F009FieldConflict,
  F009FieldSource,
  F009ManualProfileState,
  F009Message,
  F009Orientation,
  F009PersistedState,
  F009State,
  F009Step,
  F009Suggestion,
} from "./types";
