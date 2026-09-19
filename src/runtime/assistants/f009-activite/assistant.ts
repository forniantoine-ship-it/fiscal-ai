import type { DeclarationDraft } from "@/lib/lmnp/types/domain";
import type { InpiStatus } from "@/lib/lmnp/types/dossier";
import { isValidSiren } from "@/lib/documents/extractors/inpi-extraction.helpers";
import { parseAddressComponents } from "@/lib/documents/facts/derivation/rules/address-parse";
import { extractAddressLine, formatAddressLine, type F009DocumentProjection } from "@/lib/documents/facts/f009-fact-projection";
import { validateSiret } from "../../capabilities/f009/validate-siret";
import { validateActiviteDates } from "../../capabilities/f009/validate-activite-dates";
import { explainMiseEnService } from "../../capabilities/f009/explain-mise-en-service";
import type { RuntimeContext } from "../../contracts/RuntimeContext";
import { ALL_F009_DOCUMENT_FIELD_KEYS, toF009PersistedState, type F009Action, type F009AssistantTurn, type F009DocumentFieldKey, type F009PersistedState, type F009QuestionStep, type F009State, type F009Step } from "./types";

export * from "./types";
export const F009_QUESTIONS: Record<F009QuestionStep, { title: string; help: string }> = {
  identifier: { title: "Quel est votre numéro SIRET ?", help: "14 chiffres. Si vous connaissez uniquement votre SIREN, vous pouvez indiquer ses 9 chiffres. Aucun SIREN supplémentaire ne sera demandé." },
  identity: { title: "Quels sont vos nom et prénom ?", help: "L’identité de la personne qui prépare sa déclaration de location meublée." },
  address: { title: "Quelle est l’adresse de votre activité ?", help: "L’adresse de l’établissement déclarée pour votre activité. Elle peut être différente de celle du logement loué." },
  activity_date: { title: "Quelle est la date de début de votre activité ?", help: "La date de début d’activité déclarée au RNE. Elle peut être différente de la date d’immatriculation et de la disponibilité du logement." },
  service_date: { title: "À quelle date votre logement était-il disponible à la location ?", help: "Indiquez la date à laquelle le logement était prêt à être loué, même si le premier locataire est arrivé plus tard. Il ne s’agit pas d’une date prévisionnelle." },
};
export function isQuestionStep(step: F009Step): step is F009QuestionStep { return step in F009_QUESTIONS; }
export function validActivityDate(value?: string): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function hasIdentifier(state: F009State): boolean {
  return Boolean((state.siret && validateSiret({ siret: state.siret }).valid) || (state.siren && isValidSiren(state.siren)));
}
export function nextMissingQuestion(state: F009State): F009QuestionStep | undefined {
  if (!hasIdentifier(state) && !state.deferred) return "identifier";
  if (!state.lastName?.trim() || !state.firstName?.trim()) return "identity";
  if (!state.establishmentAddress?.trim() && !state.personalAddress?.trim()) return "address";
  if (!validActivityDate(state.dateDebutActivite)) return "activity_date";
  if (!validActivityDate(state.dateMiseEnService)) return "service_date";
  return undefined;
}
export function hasF009Decisions(state: F009State): boolean {
  return Object.values(state.conflicts ?? {}).some(Boolean) || Boolean(state.review?.siretAmbiguous || state.review?.datesAmbiguous);
}
function advance(state: F009State, step: F009Step, patch: Partial<F009State> = {}): F009State {
  return { ...state, ...patch, step, error: undefined, history: [...(state.history ?? []), state.step] };
}
function turn(state: F009State, completed = false): F009AssistantTurn { return { state, messages: [], completed }; }
function fail(state: F009State, error: string): F009AssistantTurn { return turn({ ...state, error }); }
function same(a?: string, b?: string): boolean { return (a ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("fr") === (b ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("fr"); }
function sameField(field: F009DocumentFieldKey, a?: string, b?: string): boolean {
  if (!field.endsWith("Address")) return same(a, b);
  const canonical = (value?: string) => {
    const parts = parseAddressComponents(value ?? "");
    return [parts.line, parts.postalCode, parts.city, parts.country].filter(Boolean).join(" ");
  };
  return same(canonical(a), canonical(b));
}
function addressPatch(field: "personalAddress" | "establishmentAddress", value: string): Partial<F009State> {
  const parsed = parseAddressComponents(value);
  return { [field]: value.trim(), [`${field}City`]: parsed.city, [`${field}PostalCode`]: parsed.postalCode };
}
function setValue(state: F009State, field: F009DocumentFieldKey, value: string): F009State {
  let next: F009State = { ...state, [field]: value.trim(), confirmed: { ...state.confirmed, [field]: true }, conflicts: { ...state.conflicts, [field]: undefined } };
  if (field === "personalAddress" || field === "establishmentAddress") next = { ...next, ...addressPatch(field, value) };
  if (field === "siret") next.siren = value.slice(0, 9);
  if (field === "dateDebutActivite" && !same(value, state.dateDebutActivite) && state.dateMiseEnService) {
    // A changed RNE start date can make the previously declared availability date
    // (disponibilité à la location, RAI-003) incoherent with it — validateActiviteDates
    // rejects dateMiseEnService < dateDebutActivite. Never leave a stale value silently
    // re-confirmed at "confirm": clear it so the user is asked again (garde-fou dates).
    next.dateMiseEnService = undefined;
    next.confirmed = { ...next.confirmed, dateMiseEnService: false };
  }
  return next;
}
function validateField(field: F009DocumentFieldKey, raw: string): string | undefined {
  if (!raw.trim()) return "Indiquez une valeur avant de continuer.";
  if (field === "siret") return validateSiret({ siret: raw }).error;
  if (field === "dateDebutActivite" && !validActivityDate(raw)) return "Indiquez une date de début d’activité valide.";
  return undefined;
}
function mergeProjection(state: F009State, projection: F009DocumentProjection): F009State {
  let next: F009State = { ...state, review: { ...projection }, confirmed: { ...state.confirmed }, conflicts: { ...state.conflicts } };
  const incoming = { ...projection, dateDebutActivite: projection.activityStartDate };
  for (const field of ALL_F009_DOCUMENT_FIELD_KEYS) {
    const value = incoming[field];
    if (!value?.trim()) continue;
    // Optional contacts never create an extra decision. Keep the existing contact on contradiction.
    if (field === "email" || field === "telephone") {
      if (!state[field]) next[field] = value;
      continue;
    }
    const current = state[field];
    const decided = [...(state.resolutions ?? [])].reverse().find((r) => r.field === field && r.documentId === state.analyzingDocumentId && same(r.proposed, value) && same(r.selected, current));
    if (decided) continue;
    if (current && !sameField(field, current, value)) {
      next.conflicts![field] = { confirmedValue: current, newValue: value };
    } else if (!current) {
      next = setValue(next, field, value);
      next.confirmed = { ...next.confirmed, [field]: false };
    }
  }
  if (!next.siret && !next.siren && projection.siren && isValidSiren(projection.siren)) next.siren = projection.siren;
  if (next.siret && validateSiret({ siret: next.siret }).valid) next.siren = next.siret.slice(0, 9);
  return next;
}
function seedDraft(draft?: DeclarationDraft): Partial<F009State> {
  if (!draft) return {};
  const address = (line?: string, zip?: string, city?: string) => formatAddressLine(extractAddressLine(line, zip, city), zip, city);
  return {
    siret: draft.siret, siren: draft.siret && validateSiret({ siret: draft.siret }).valid ? draft.siret.slice(0, 9) : draft.siren,
    lastName: draft.exploitantLastName, firstName: draft.exploitantFirstName, email: draft.exploitantEmail, telephone: draft.exploitantTelephone,
    personalAddress: address(draft.personalAddress ?? draft.entrepreneurAddress, draft.personalPostalCode ?? draft.entrepreneurPostalCode, draft.personalCity ?? draft.entrepreneurCity),
    personalAddressCity: draft.personalCity ?? draft.entrepreneurCity, personalAddressPostalCode: draft.personalPostalCode ?? draft.entrepreneurPostalCode,
    establishmentAddress: address(draft.establishmentAddress, draft.establishmentPostalCode, draft.establishmentCity), establishmentAddressCity: draft.establishmentCity, establishmentAddressPostalCode: draft.establishmentPostalCode,
    dateDebutActivite: draft.activityStartDate, dateMiseEnService: draft.dateMiseEnService,
  };
}
const LEGACY_STEPS: Partial<Record<F009Step, F009Step>> = {
  intro: "situation", orientation: "situation", no_document: "document", collect_siret: "identifier", collect_identity: "identity", collect_activity: "activity_date", mise_en_service: "service_date", confirmation: "review", review_extracted_data: "review", manual_profile: "review", ask_missing_data: "review",
};
export function restoreF009(draft?: DeclarationDraft, status?: InpiStatus): F009State {
  const saved = draft?.activiteAssistantState;
  const known = Object.fromEntries(Object.entries(seedDraft(draft)).filter(([, value]) => value !== undefined));
  let state: F009State = { version: 2, step: "situation", fieldSources: {}, ...known, ...saved };
  // An absent legacy session value must never erase a value in the dossier.
  for (const [key, value] of Object.entries(known)) if (state[key as keyof F009State] === undefined) Object.assign(state, { [key]: value });
  state.version = 2;
  state.conflicts = { ...state.conflicts, email: undefined, telephone: undefined };
  state.step = LEGACY_STEPS[state.step] ?? state.step;
  state.history = (saved?.history ?? []).map((step) => LEGACY_STEPS[step] ?? step).filter((step) => step !== "analyzing");
  state.registration ??= status === "registered" ? "yes" : status === "not_started" ? "no" : undefined;
  if (!saved && draft?.inpiConfirmedAt) {
    // Identity confirmed elsewhere (manual INPI form) never proves the dates: resume at the
    // first missing question and only conclude when none is missing. Without a SIRET the
    // dossier is deferred, so the SIRET question is not asked again on the way.
    if (!state.siret) state.deferred = true;
    state.step = nextMissingQuestion(state) ?? "complete";
  }
  if (!saved && !draft?.inpiConfirmedAt && hasIdentifier(state)) { state.registration ??= "yes"; state.step = "review"; }
  if (state.step === "complete" && !state.siret) state.deferred = true;
  // The companion writes the obtained SIRET to the draft, independently of F009.
  if (draft?.siret && validateSiret({ siret: draft.siret }).valid && saved?.deferred && saved.siret !== draft.siret) {
    state = { ...state, siret: draft.siret, siren: draft.siret.slice(0, 9), registration: "yes", deferred: false, step: "review", history: [...(state.history ?? []), "complete"] };
  }
  if (state.review?.datesAmbiguous && !state.review.activityStartDateCandidates && state.review.activityStartDateRaw) {
    // V1 compared two different concepts. Retain the RNE activity date, never substitute immatriculation.
    state.review = { ...state.review, datesAmbiguous: false, activityStartDate: state.review.activityStartDateRaw };
    state.dateDebutActivite ??= state.review.activityStartDateRaw;
  }
  return state;
}
/** Writes only known values; absence is never an instruction to erase a profile. */
export function f009DraftPatch(state: F009State, now: string, completed: boolean): Partial<DeclarationDraft> {
  const patch: Partial<DeclarationDraft> = { activiteAssistantState: toF009PersistedState(state, now) };
  if (!completed) return patch;
  const entries = {
    siret: state.siret, siren: state.siret && validateSiret({ siret: state.siret }).valid ? state.siret.slice(0, 9) : state.siren,
    exploitantLastName: state.lastName, exploitantFirstName: state.firstName, exploitantEmail: state.email, exploitantTelephone: state.telephone,
    activityStartDate: state.dateDebutActivite, dateMiseEnService: state.dateMiseEnService, activityType: "LMNP" as const,
  };
  Object.assign(patch, Object.fromEntries(Object.entries(entries).filter(([, value]) => value !== undefined && value !== "")));
  for (const prefix of ["personal", "establishment"] as const) {
    const value = state[`${prefix}Address`];
    if (value) {
      const parsed = parseAddressComponents(value);
      Object.assign(patch, { [`${prefix}Address`]: parsed.line ?? value, [`${prefix}City`]: parsed.city, [`${prefix}PostalCode`]: parsed.postalCode });
    }
  }
  if (!nextMissingQuestion(state) && !hasF009Decisions(state)) patch.inpiConfirmedAt = now;
  return patch;
}

export class F009ActiviteAssistant {
  constructor(private readonly ctx: RuntimeContext) {}
  start(draft?: DeclarationDraft, status?: InpiStatus): F009AssistantTurn { return turn(restoreF009(draft, status)); }
  resume(persisted: F009PersistedState): F009AssistantTurn { return this.start({ completedSteps: [], activiteAssistantState: persisted }); }
  explanation(state: F009State): string | undefined {
    if (!validActivityDate(state.dateDebutActivite) || !validActivityDate(state.dateMiseEnService)) return undefined;
    return explainMiseEnService({ dateDebutActivite: state.dateDebutActivite!, dateMiseEnService: state.dateMiseEnService! }, this.ctx.fiscalYear).explanation;
  }
  async handle(state: F009State, action: F009Action): Promise<F009AssistantTurn> {
    state = { ...state, error: undefined };
    switch (action.type) {
      case "select_registration": {
        const next = { ...state, registration: action.value, deferred: action.value !== "yes" };
        const missing = nextMissingQuestion(next);
        return turn(advance(next, action.value === "yes" ? (!missing || missing === "service_date" ? "review" : "document") : "pending_registration"));
      }
      case "manual": return turn(advance(state, nextMissingQuestion(state) ?? "review"));
      case "defer": return turn(advance(state, "complete", { deferred: true }), true);
      case "edit": return turn(advance(state, "edit"));
      case "edit_question": return turn(advance(state, action.step, { editing: true }));
      case "stage_input": return turn({ ...state, inputs: { ...state.inputs, [state.step]: action.values } });
      case "siret_obtained": {
        const check = validateSiret({ siret: action.siret });
        if (!check.valid) return fail(state, check.error!);
        const next = setValue(state, "siret", check.normalized!);
        return turn(advance(next, "review", { registration: "yes", deferred: false }));
      }
      case "answer": {
        const values = action.values;
        let next = { ...state };
        switch (state.step) {
          case "identifier": {
            const raw = (values.identifier ?? "").replace(/\s/g, "");
            if (raw.length === 9 && isValidSiren(raw)) {
              if (state.siret && !state.siret.startsWith(raw)) return fail(state, "Ce SIREN diffère du SIRET conservé. Indiquez le SIRET de l’établissement à utiliser.");
              next.siren = raw;
            } else {
              const check = validateSiret({ siret: raw });
              if (!check.valid) return fail(state, check.error!);
              next = setValue(state, "siret", check.normalized!);
              next.deferred = false;
            }
            break;
          }
          case "identity":
            if (!values.lastName?.trim() || !values.firstName?.trim()) return fail(state, "Indiquez votre nom et votre prénom.");
            next = setValue(setValue(state, "lastName", values.lastName), "firstName", values.firstName);
            break;
          case "address":
            if (!values.address?.trim()) return fail(state, "Indiquez l’adresse de votre activité.");
            next = setValue(state, "establishmentAddress", values.address);
            break;
          case "activity_date":
            if (!validActivityDate(values.date)) return fail(state, "Indiquez une date de début d’activité valide.");
            next = setValue(state, "dateDebutActivite", values.date);
            break;
          case "service_date":
            if (!validActivityDate(values.date)) return fail(state, "Indiquez la date à laquelle le logement était disponible à la location.");
            if (values.date > new Date().toISOString().slice(0, 10)) return fail(state, "Cette date est dans le futur. Vous pourrez compléter la disponibilité effective plus tard ; aucune date prévisionnelle ne sera utilisée.");
            next.dateMiseEnService = values.date;
            next.confirmed = { ...next.confirmed, dateMiseEnService: true };
            break;
          default: return turn(state);
        }
        if (next.review && state.step === "activity_date") next.review = { ...next.review, datesAmbiguous: false };
        if (next.review && state.step === "identifier") next.review = { ...next.review, siretAmbiguous: false };
        next.inputs = { ...next.inputs, [state.step]: undefined };
        if (state.step === "identifier" && state.siret && next.siret !== state.siret) {
          const candidate = state.review?.siretCandidates.find((entry) => entry.siret === next.siret);
          if (candidate?.address) next = setValue(next, "establishmentAddress", candidate.address);
          else return turn(advance(next, "address", { editing: true }));
        }
        return turn(advance(next, state.editing ? "review" : nextMissingQuestion(next) ?? "review", { editing: false }));
      }
      case "upload_document":
        if (!action.documentId) return fail(state, "Le document n’est pas disponible. Importez-le à nouveau ou renseignez les informations manuellement.");
        return turn(advance(state, "analyzing", { analyzingDocumentId: action.documentId, analysisFailureCause: undefined }));
      case "analysis_success": return turn(advance(mergeProjection(state, action.projection), "review"));
      case "analysis_failed": return turn({ ...state, step: "analysis_failed", analysisFailureCause: action.cause });
      case "retry": return turn({ ...state, step: "analyzing", analysisFailureCause: undefined });
      case "continue_manually": return turn(advance(state, nextMissingQuestion(state) ?? "review"));
      case "select_establishment": {
        const candidate = state.review?.siretCandidates.find((entry) => entry.siret === action.siret);
        if (!candidate) return fail(state, "Sélectionnez un établissement proposé.");
        const error = validateField("siret", candidate.siret);
        if (error) return fail(state, error);
        let next: F009State = { ...state, review: { ...state.review!, siretAmbiguous: false } };
        // A candidate is a coupled SIRET/address, never an independently guessed address.
        for (const [field, value] of [["siret", candidate.siret], ["establishmentAddress", candidate.address]] as const) {
          if (!value) continue;
          if (next[field] && !sameField(field, next[field], value)) next = { ...next, conflicts: { ...next.conflicts, [field]: { confirmedValue: next[field]!, newValue: value } } };
          else next = setValue(next, field, value);
        }
        if (!candidate.address && !next.conflicts?.siret) return turn(advance(next, "address", { editing: true }));
        return turn(next);
      }
      case "correct_field":
      case "resolve_conflict": {
        const error = validateField(action.field, action.value);
        if (error) return fail(state, error);
        const value = action.field === "siret" ? validateSiret({ siret: action.value }).normalized! : action.value.trim();
        const conflict = state.conflicts?.[action.field];
        let next = setValue(state, action.field, value);
        if (action.field === "siret" && conflict && value === conflict.confirmedValue) next.conflicts = { ...next.conflicts, establishmentAddress: undefined };
        if (action.field === "siret" && value !== state.siret) {
          const candidate = state.review?.siretCandidates.find((entry) => entry.siret === value);
          if (candidate?.address) next = setValue(next, "establishmentAddress", candidate.address);
        }
        next.resolutions = [...(state.resolutions ?? []), { field: action.field, previous: conflict?.confirmedValue ?? state[action.field], proposed: conflict?.newValue, selected: value, documentId: state.analyzingDocumentId }];
        if (action.field === "siret" && conflict && value === conflict.confirmedValue && state.conflicts?.establishmentAddress) {
          const addressConflict = state.conflicts.establishmentAddress;
          next.resolutions.push({ field: "establishmentAddress", previous: addressConflict.confirmedValue, proposed: addressConflict.newValue, selected: addressConflict.confirmedValue, documentId: state.analyzingDocumentId });
        }
        if (next.review && action.field === "siret") next.review = { ...next.review, siretAmbiguous: false };
        if (next.review && action.field === "dateDebutActivite") next.review = { ...next.review, datesAmbiguous: false };
        if (action.field === "siret" && value !== state.siret && !state.review?.siretCandidates.find((entry) => entry.siret === value)?.address) {
          return turn(advance(next, "address", { editing: true }));
        }
        return turn(next);
      }
      case "review_all":
      case "confirm": {
        if (hasF009Decisions(state)) return fail(state, "Choisissez les informations à conserver avant de continuer.");
        if (state.siret) {
          const error = validateField("siret", state.siret);
          if (error) return fail(state, error);
        }
        const confirmed = { ...state.confirmed };
        for (const field of ALL_F009_DOCUMENT_FIELD_KEYS) if (state[field]) confirmed[field] = true;
        const next = { ...state, confirmed };
        const missing = nextMissingQuestion(next);
        if (missing) return turn(advance(next, missing));
        if (next.dateMiseEnService! > new Date().toISOString().slice(0, 10)) return fail(state, "La disponibilité effective est dans le futur. Modifiez cette information ou complétez-la plus tard.");
        const dates = validateActiviteDates({ dateDebutActivite: next.dateDebutActivite!, dateMiseEnService: next.dateMiseEnService! });
        if (!dates.valid) return fail(state, dates.issues.join(" "));
        return turn(advance(next, "complete", { deferred: !next.siret }), true);
      }
      case "go_back": {
        const history = [...(state.history ?? [])];
        let previous = history.pop();
        // Analysis is an effect, not an editable page. Going back must not rerun OCR/GPT.
        while (previous === "analyzing" || previous === state.step) previous = history.pop();
        if (!previous) previous = state.step === "complete" ? "review" : "situation";
        return turn({ ...state, step: previous, history, editing: previous === "edit" ? false : state.editing });
      }
      default: return turn(state);
    }
  }
}
