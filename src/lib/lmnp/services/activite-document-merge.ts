import type { ActiviteFieldKey, ActiviteFormValues } from "@/components/lmnp/activite/ActiviteProfileFields";
import type { ActiviteFactProjection } from "@/lib/documents/facts/activite-fact-projection";
import { normalizePhoneDigits } from "@/lib/documents/facts/grounding-text-matchers";

import {
  ACTIVITE_GPT_PREFILLABLE_FIELDS,
  missingInpiFieldProvenance,
  type ActiviteFieldProvenance,
} from "./activite-field-provenance";
import type {
  ActiviteFieldStore,
  DocumentFactSnapshot,
  DossierFieldCurrent,
  DossierFieldHistoryEntry,
  DossierFieldLedger,
} from "./activite-field-store";
import {
  bootstrapActiviteFieldStoreFromDraft,
  createEmptyActiviteFieldStore,
  readActiviteFieldStore,
  syncUserProtectedFieldsInStore,
} from "./activite-field-store";
import type { DeclarationDraft } from "@/lib/lmnp/types";
import type { ActiviteUserValidatedFields } from "./activite-form-state";
import { readUserValidatedFields, toUserValidatedSet } from "./activite-form-state";
import type { ActiviteFieldProvenanceMap } from "./activite-field-provenance";

export type IncomingActiviteField = {
  fieldKey: ActiviteFieldKey;
  value: string;
  status: "extracted" | "proposed";
  origin: ActiviteFieldProvenance["origin"];
  fieldSource?: ActiviteFieldProvenance["fieldSource"];
  evidence?: string;
  confidence?: number;
  sourceDocumentId: string;
  sourceFactId?: string;
};

export type MergeDocumentIntoStoreResult = {
  store: ActiviteFieldStore;
  applied: ActiviteFieldKey[];
  preserved: ActiviteFieldKey[];
  historized: ActiviteFieldKey[];
  refreshed: ActiviteFieldKey[];
};

function normalizeFieldValue(fieldKey: ActiviteFieldKey, value: string): string {
  if (fieldKey === "siren") {
    return value.replace(/\D/g, "").slice(0, 9);
  }
  if (fieldKey === "telephone") {
    return normalizePhoneDigits(value);
  }
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function valuesAreEquivalent(fieldKey: ActiviteFieldKey, left: string, right: string): boolean {
  return normalizeFieldValue(fieldKey, left) === normalizeFieldValue(fieldKey, right);
}

function isIncomingMergeable(
  provenance: ActiviteFieldProvenance | undefined,
  value: string | undefined,
): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  if (!provenance || provenance.status === "missing") return false;
  if (provenance.rejectedValue) return false;
  if (provenance.status === "extracted") return true;
  if (provenance.status === "proposed") {
    return Boolean(provenance.evidence?.trim() || trimmed);
  }
  return false;
}

export function buildIncomingFieldsFromProjection(
  projection: ActiviteFactProjection,
  documentId: string,
): IncomingActiviteField[] {
  const incoming: IncomingActiviteField[] = [];

  for (const fieldKey of ACTIVITE_GPT_PREFILLABLE_FIELDS) {
    const provenance = projection.fieldProvenance[fieldKey];
    const rawValue = projection.formValues[fieldKey as keyof ActiviteFormValues];
    const trimmed = typeof rawValue === "string" ? rawValue.trim() : "";

    if (!isIncomingMergeable(provenance, trimmed)) continue;

    const projectionEntry = projection.formFieldProjections.find((entry) => entry.fieldKey === fieldKey);
    const sourceFactId = projectionEntry?.sourceFacts[0]?.factId;
    const value = fieldKey === "siren" ? trimmed.replace(/\D/g, "").slice(0, 9) : trimmed;

    incoming.push({
      fieldKey,
      value,
      status: provenance!.status as "extracted" | "proposed",
      origin: provenance!.origin,
      fieldSource: provenance!.fieldSource,
      evidence: provenance!.evidence,
      confidence: provenance!.confidence,
      sourceDocumentId: documentId,
      sourceFactId,
    });
  }

  return incoming;
}

function emptyCurrent(fieldKey: ActiviteFieldKey): DossierFieldCurrent {
  return {
    fieldKey,
    status: "missing",
    origin: "inpi_document",
  };
}

function readCurrentLedger(
  store: ActiviteFieldStore,
  fieldKey: ActiviteFieldKey,
): DossierFieldLedger {
  return store.fieldLedgers[fieldKey] ?? { current: emptyCurrent(fieldKey), history: [] };
}

function shouldBlockMerge(
  fieldKey: ActiviteFieldKey,
  current: DossierFieldCurrent,
  userValidated: ReadonlySet<ActiviteFieldKey>,
): boolean {
  if (userValidated.has(fieldKey)) return true;
  if (current.userConfirmed) return true;
  if (current.origin === "user" && current.value?.trim()) return true;
  return false;
}

function isDerivedSirenProposed(field: Pick<DossierFieldCurrent, "fieldKey" | "status" | "fieldSource">): boolean {
  return field.fieldKey === "siren" && field.status === "proposed" && field.fieldSource === "derived";
}

function isExtractedSiren(field: Pick<DossierFieldCurrent, "fieldKey" | "status" | "value">): boolean {
  return field.fieldKey === "siren" && field.status === "extracted" && Boolean(field.value?.trim());
}

function shouldSkipIncomingForSirenRule(
  current: DossierFieldCurrent,
  incoming: IncomingActiviteField,
): boolean {
  if (incoming.fieldKey !== "siren") return false;
  return isDerivedSirenProposed(incoming) && isExtractedSiren(current);
}

function toHistoryEntry(
  current: DossierFieldCurrent,
  replacedAt: string,
  replacedByDocumentId: string,
): DossierFieldHistoryEntry | undefined {
  if (!current.value?.trim()) return undefined;

  return {
    value: current.value,
    status: current.status,
    origin: current.origin,
    sourceDocumentId: current.sourceDocumentId ?? "unknown",
    sourceFactId: current.sourceFactId,
    evidence: current.evidence,
    fieldSource: current.fieldSource,
    confidence: current.confidence,
    replacedAt,
    replacedByDocumentId,
    reason: "document_replacement",
  };
}

function incomingToCurrent(incoming: IncomingActiviteField): DossierFieldCurrent {
  return {
    fieldKey: incoming.fieldKey,
    value: incoming.value,
    status: incoming.status,
    origin: incoming.origin,
    sourceDocumentId: incoming.sourceDocumentId,
    sourceFactId: incoming.sourceFactId,
    evidence: incoming.evidence,
    confidence: incoming.confidence,
    fieldSource: incoming.fieldSource,
    userConfirmed: false,
    proposedSnapshot: undefined,
  };
}

function refreshCurrentFromIncoming(
  current: DossierFieldCurrent,
  incoming: IncomingActiviteField,
): DossierFieldCurrent {
  return {
    ...current,
    sourceDocumentId: incoming.sourceDocumentId,
    sourceFactId: incoming.sourceFactId,
    evidence: incoming.evidence ?? current.evidence,
    confidence: incoming.confidence ?? current.confidence,
    fieldSource: incoming.fieldSource ?? current.fieldSource,
    status: incoming.status,
    origin: incoming.origin,
  };
}

export function mergeDocumentIntoDossierStore(
  store: ActiviteFieldStore,
  snapshot: DocumentFactSnapshot,
  projection: ActiviteFactProjection,
  options: {
    userValidated?: ActiviteUserValidatedFields;
    ingestedAt?: string;
  } = {},
): MergeDocumentIntoStoreResult {
  const userValidated = toUserValidatedSet(options.userValidated ?? {});
  const ingestedAt = options.ingestedAt ?? snapshot.ingestedAt;
  const incomingFields = buildIncomingFieldsFromProjection(projection, snapshot.documentId);

  const nextStore: ActiviteFieldStore = {
    ...store,
    documentSnapshots: {
      ...store.documentSnapshots,
      [snapshot.documentId]: snapshot,
    },
    fieldLedgers: { ...store.fieldLedgers },
  };

  const applied: ActiviteFieldKey[] = [];
  const preserved: ActiviteFieldKey[] = [];
  const historized: ActiviteFieldKey[] = [];
  const refreshed: ActiviteFieldKey[] = [];

  for (const incoming of incomingFields) {
    const ledger = readCurrentLedger(nextStore, incoming.fieldKey);
    const current = ledger.current;

    if (shouldBlockMerge(incoming.fieldKey, current, userValidated)) {
      nextStore.fieldLedgers[incoming.fieldKey] = ledger;
      preserved.push(incoming.fieldKey);
      continue;
    }

    if (shouldSkipIncomingForSirenRule(current, incoming)) {
      nextStore.fieldLedgers[incoming.fieldKey] = ledger;
      preserved.push(incoming.fieldKey);
      continue;
    }

    if (current.value?.trim()) {
      if (valuesAreEquivalent(incoming.fieldKey, current.value, incoming.value)) {
        nextStore.fieldLedgers[incoming.fieldKey] = {
          current: refreshCurrentFromIncoming(current, incoming),
          history: ledger.history,
        };
        refreshed.push(incoming.fieldKey);
        continue;
      }

      const historyEntry = toHistoryEntry(current, ingestedAt, snapshot.documentId);
      const nextHistory = historyEntry ? [...ledger.history, historyEntry] : ledger.history;
      nextStore.fieldLedgers[incoming.fieldKey] = {
        current: incomingToCurrent(incoming),
        history: nextHistory,
      };
      applied.push(incoming.fieldKey);
      if (historyEntry) historized.push(incoming.fieldKey);
      continue;
    }

    nextStore.fieldLedgers[incoming.fieldKey] = {
      current: incomingToCurrent(incoming),
      history: ledger.history,
    };
    applied.push(incoming.fieldKey);
  }

  return { store: nextStore, applied, preserved, historized, refreshed };
}

export function mergeActiviteDocumentProjection(
  draft: DeclarationDraft | undefined,
  formValues: ActiviteFormValues,
  provenance: ActiviteFieldProvenanceMap,
  snapshot: DocumentFactSnapshot,
  projection: ActiviteFactProjection,
  options?: {
    userValidated?: ActiviteUserValidatedFields;
    ingestedAt?: string;
  },
): MergeDocumentIntoStoreResult {
  const userValidated = {
    ...readUserValidatedFields(draft),
    ...options?.userValidated,
  };
  const bootstrapped = bootstrapActiviteFieldStoreFromDraft(draft, formValues, provenance);
  const baseStore =
    Object.keys(bootstrapped.fieldLedgers).length > 0
      ? bootstrapped
      : readActiviteFieldStore(draft);
  const protectedStore = syncUserProtectedFieldsInStore(
    baseStore,
    formValues,
    provenance,
    userValidated,
  );

  return mergeDocumentIntoDossierStore(protectedStore, snapshot, projection, {
    userValidated,
    ingestedAt: options?.ingestedAt,
  });
}

export function createDocumentFactSnapshot(input: {
  documentId: string;
  extractorId: string;
  facts: DocumentFactSnapshot["facts"];
  ingestedAt?: string;
}): DocumentFactSnapshot {
  return {
    documentId: input.documentId,
    ingestedAt: input.ingestedAt ?? new Date().toISOString(),
    extractorId: input.extractorId,
    facts: input.facts,
  };
}

export function emptyMergeResult(): MergeDocumentIntoStoreResult {
  return {
    store: createEmptyActiviteFieldStore(),
    applied: [],
    preserved: [],
    historized: [],
    refreshed: [],
  };
}
