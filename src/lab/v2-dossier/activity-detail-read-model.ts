import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { ActiviteFieldProvenanceMap } from "@/lib/lmnp/services/activite-field-provenance";
import { readActiviteFieldProvenance } from "@/lib/lmnp/services/activite-field-provenance";
import { hasF009Decisions, remainingQuestions, restoreF009, validActivityDate } from "@/runtime/assistants/f009-activite/assistant";
import type { F009DocumentFieldKey, F009QuestionStep, F009State } from "@/runtime/assistants/f009-activite/types";
import type { V3DocumentProcessingStatus, V3DocumentsReadModel } from "./document-read-model";
import { known } from "./read-model";

/**
 * R15.3 — structured projection of the Activité (F009) data for the V3 workspace.
 * Pure transport: persisted business data once F009 is confirmed (`inpiConfirmedAt`), otherwise the values F009 currently
 * knows (`activiteAssistantState` merged with the draft, exactly as the assistant itself restores them), flagged "to confirm".
 * Nothing is computed, nothing comes from a fixture, no provenance is deduced: absent proof = unknown origin.
 */
export type V3ActivityState = "known" | "unsupported";
export type V3ActivityFactId = "identity" | "siren" | "siret" | "startDate" | "address" | "serviceDate" | "regime";
export type V3ActivityFactStatus = "retained" | "to_confirm";

/** Only what the existing F009 state can prove: entered by the user, extracted from a document, or unknown. */
export type V3ActivityOrigin =
  | { kind: "manual" }
  | { kind: "extracted"; document?: { id: string; label: string } }
  | { kind: "unknown" };

export interface V3ActivityFact {
  id: V3ActivityFactId;
  label: string;
  value: string;
  status: V3ActivityFactStatus;
  origin: V3ActivityOrigin;
}

export type V3ActivityDecision =
  | { kind: "conflict"; field: F009DocumentFieldKey; label: string; confirmedValue: string; newValue: string }
  | { kind: "siret_ambiguous" }
  | { kind: "dates_ambiguous" };

export interface V3ActivityDocument {
  id: string;
  label: string;
  status: V3DocumentProcessingStatus | "unknown";
}

export interface V3ActivityDetail {
  state: V3ActivityState;
  year: number;
  /** True only when F009 was explicitly confirmed (`inpiConfirmedAt`): the facts are then the persisted business data. */
  confirmed: boolean;
  facts: V3ActivityFact[];
  /** Contact data really present (not shown by default; carried for completeness). */
  additional: Array<{ id: "email" | "telephone" | "personalAddress"; label: string; value: string; status: V3ActivityFactStatus }>;
  /** F009's own list of questions still needed, in F009's order. */
  remaining: F009QuestionStep[];
  /** Conflicts / ambiguities awaiting a user decision. */
  decisions: V3ActivityDecision[];
  documents: V3ActivityDocument[];
}

export const V3_ACTIVITY_FIELD_LABELS: Record<F009DocumentFieldKey, string> = {
  siret: "SIRET", dateDebutActivite: "Début d’activité", lastName: "Nom", firstName: "Prénom", email: "Email",
  telephone: "Téléphone", personalAddress: "Adresse personnelle", establishmentAddress: "Adresse de l’établissement",
};

export function formatActivityDate(value: string): string {
  if (!validActivityDate(value)) return value;
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

/** Provenance key(s) of the persisted map (`activiteFieldProvenance`) for each fact. Facts absent here have no persisted provenance. */
const PERSISTED_KEYS: Partial<Record<V3ActivityFactId, Array<keyof ActiviteFieldProvenanceMap>>> = {
  identity: ["lastName", "firstName"], siren: ["siren"], address: ["establishmentAddress"],
};
/** F009 field(s) whose `confirmed === false` proves "taken from the analysed document, not yet confirmed". */
const F009_FIELDS: Partial<Record<V3ActivityFactId, F009DocumentFieldKey[]>> = {
  identity: ["lastName", "firstName"], siret: ["siret"], startDate: ["dateDebutActivite"], address: ["establishmentAddress"],
};

function processingStatusFor(id: string, documents: V3DocumentsReadModel | undefined): V3ActivityDocument["status"] {
  if (!documents || documents.state !== "known") return "unknown";
  return documents.documents.find(item => item.id === id)?.processingStatus ?? "unknown";
}

export function buildV3ActivityDetail(workspace: PersistedWorkspace, documents?: V3DocumentsReadModel): V3ActivityDetail {
  const year = workspace.fiscalYear.year;
  // MB-MULTI-V3-READMODEL-1 — F009 est au niveau ACTIVITÉ : même lecture en mono et en multi, jamais par bien.
  const draft = workspace.declarationDraft;
  const confirmed = Boolean(draft?.inpiConfirmedAt);
  const status: V3ActivityFactStatus = confirmed ? "retained" : "to_confirm";
  // Confirmed: the persisted business data is authoritative. Otherwise: what F009 currently knows (same restore as the assistant).
  const state: F009State = confirmed && draft
    ? restoreF009({ ...draft, activiteAssistantState: undefined })
    : restoreF009(draft);
  const provenance = readActiviteFieldProvenance(draft);
  const inpiDoc = workspace.documents.find(doc => doc.id === draft?.inpiDocumentId);
  const analysedDoc = confirmed ? undefined : workspace.documents.find(doc => doc.id === state.analyzingDocumentId);

  const originOf = (id: V3ActivityFactId): V3ActivityOrigin => {
    if (id === "serviceDate") return { kind: "manual" }; // asked to the user by F009 ("service_date"), never extracted
    const fields = F009_FIELDS[id];
    if (analysedDoc && fields?.every(field => state.confirmed?.[field] === false)) {
      // `confirmed === false` is only ever set by F009 when a value comes from the analysed document.
      return { kind: "extracted", document: { id: analysedDoc.id, label: analysedDoc.fileName } };
    }
    const keys = PERSISTED_KEYS[id];
    const entries = keys?.map(key => provenance[key]);
    if (entries && entries.every(entry => entry?.status === "extracted" && entry.origin === "inpi_document")) {
      return { kind: "extracted", ...(inpiDoc ? { document: { id: inpiDoc.id, label: inpiDoc.fileName } } : {}) };
    }
    if (entries && entries.every(entry => entry?.origin === "user")) return { kind: "manual" };
    return { kind: "unknown" };
  };

  const facts: V3ActivityFact[] = [];
  const add = (id: V3ActivityFactId, label: string, value: string | null) => {
    if (value) facts.push({ id, label, value, status, origin: originOf(id) });
  };
  add("identity", "Exploitant", [known(state.firstName), known(state.lastName)].filter(Boolean).join(" ") || null);
  add("siren", "SIREN", known(state.siret && state.siret.length >= 9 ? state.siret.slice(0, 9) : state.siren));
  add("siret", "SIRET", known(state.siret));
  add("startDate", "Début d’activité", state.dateDebutActivite ? formatActivityDate(state.dateDebutActivite) : null);
  if (known(state.establishmentAddress)) add("address", "Adresse de l’établissement", known(state.establishmentAddress));
  else if (known(state.personalAddress)) add("address", "Adresse personnelle utilisée en repli", known(state.personalAddress));
  add("serviceDate", "Date de mise en service", state.dateMiseEnService ? formatActivityDate(state.dateMiseEnService) : null);
  if (workspace.fiscalYear.regimeConfirmedAt) {
    facts.push({ id: "regime", label: "Régime", value: workspace.fiscalYear.regime === "reel" ? "Réel" : "Micro-BIC", status: "retained", origin: { kind: "unknown" } });
  }

  const additional: V3ActivityDetail["additional"] = [];
  if (known(state.email)) additional.push({ id: "email", label: "Email", value: known(state.email)!, status });
  if (known(state.telephone)) additional.push({ id: "telephone", label: "Téléphone", value: known(state.telephone)!, status });
  if (known(state.establishmentAddress) && known(state.personalAddress)) additional.push({ id: "personalAddress", label: "Adresse personnelle", value: known(state.personalAddress)!, status });

  const decisions: V3ActivityDecision[] = [];
  if (!confirmed && hasF009Decisions(state)) {
    for (const [field, conflict] of Object.entries(state.conflicts ?? {}) as Array<[F009DocumentFieldKey, { confirmedValue: string; newValue: string } | undefined]>) {
      if (!conflict) continue;
      // Same filtering as F009's own review screen: an address conflict coupled to a SIRET conflict is not shown twice.
      if (field === "establishmentAddress" && state.conflicts?.siret) continue;
      decisions.push({ kind: "conflict", field, label: V3_ACTIVITY_FIELD_LABELS[field], confirmedValue: conflict.confirmedValue, newValue: conflict.newValue });
    }
    if (state.review?.siretAmbiguous) decisions.push({ kind: "siret_ambiguous" });
    if (state.review?.datesAmbiguous) decisions.push({ kind: "dates_ambiguous" });
  }

  const usedDocuments: V3ActivityDocument[] = inpiDoc
    ? [{ id: inpiDoc.id, label: inpiDoc.fileName, status: processingStatusFor(inpiDoc.id, documents) }]
    : [];

  return { state: "known", year, confirmed, facts, additional, remaining: remainingQuestions(state), decisions, documents: usedDocuments };
}
