import type { ActiviteFieldKey, ActiviteFormValues } from "@/components/lmnp/activite/ActiviteProfileFields";
import type { DocumentFact } from "@/lib/documents/facts/document-fact";
import type { DeclarationDraft } from "@/lib/lmnp/types";
import type { FieldSource } from "@/runtime/contracts/FieldSource";

import {
  ACTIVITE_GPT_PREFILLABLE_FIELDS,
  missingInpiFieldProvenance,
  type ActiviteFieldOrigin,
  type ActiviteFieldProvenance,
  type ActiviteFieldProvenanceMap,
  type ActiviteFieldStatus,
  type ActiviteProposedSnapshot,
} from "./activite-field-provenance";

export const ACTIVITE_FIELD_STORE_SCHEMA_VERSION = "1.0.0";

export type ActiviteFieldStoreHistoryReason = "document_replacement" | "user_edit" | "user_confirmation";

export type DocumentFactSnapshot = {
  documentId: string;
  ingestedAt: string;
  extractorId: string;
  facts: DocumentFact[];
};

export type DossierFieldHistoryEntry = {
  value: string;
  status: ActiviteFieldStatus;
  origin: ActiviteFieldOrigin;
  sourceDocumentId: string;
  sourceFactId?: string;
  evidence?: string;
  fieldSource?: FieldSource;
  confidence?: number;
  replacedAt: string;
  replacedByDocumentId: string;
  reason: ActiviteFieldStoreHistoryReason;
};

export type DossierFieldCurrent = {
  fieldKey: ActiviteFieldKey;
  value?: string;
  status: ActiviteFieldStatus;
  origin: ActiviteFieldOrigin;
  sourceDocumentId?: string;
  sourceFactId?: string;
  evidence?: string;
  confidence?: number;
  fieldSource?: FieldSource;
  userConfirmed?: boolean;
  proposedSnapshot?: ActiviteProposedSnapshot;
};

export type DossierFieldLedger = {
  current: DossierFieldCurrent;
  history: DossierFieldHistoryEntry[];
};

export type ActiviteFieldStore = {
  schemaVersion: string;
  documentSnapshots: Record<string, DocumentFactSnapshot>;
  fieldLedgers: Partial<Record<ActiviteFieldKey, DossierFieldLedger>>;
};

export function createEmptyActiviteFieldStore(): ActiviteFieldStore {
  return {
    schemaVersion: ACTIVITE_FIELD_STORE_SCHEMA_VERSION,
    documentSnapshots: {},
    fieldLedgers: {},
  };
}

export function readActiviteFieldStore(draft?: DeclarationDraft): ActiviteFieldStore {
  const stored = draft?.activiteFieldStore as ActiviteFieldStore | undefined;
  if (stored?.schemaVersion) return stored;
  return createEmptyActiviteFieldStore();
}

function currentFromProvenance(
  fieldKey: ActiviteFieldKey,
  value: string,
  provenance: ActiviteFieldProvenance,
  sourceDocumentId?: string,
): DossierFieldCurrent {
  return {
    fieldKey,
    value,
    status: provenance.status,
    origin: provenance.origin,
    sourceDocumentId,
    evidence: provenance.evidence,
    confidence: provenance.confidence,
    fieldSource: provenance.fieldSource,
    userConfirmed: provenance.userConfirmed,
    proposedSnapshot: provenance.proposedSnapshot,
  };
}

export function bootstrapActiviteFieldStoreFromDraft(
  draft: DeclarationDraft | undefined,
  formValues: ActiviteFormValues,
  provenance: ActiviteFieldProvenanceMap,
): ActiviteFieldStore {
  const existing = readActiviteFieldStore(draft);
  if (Object.keys(existing.fieldLedgers).length > 0) {
    return existing;
  }

  const store = createEmptyActiviteFieldStore();
  const sourceDocumentId = draft?.inpiDocumentId;

  for (const fieldKey of ACTIVITE_GPT_PREFILLABLE_FIELDS) {
    const rawValue = formValues[fieldKey as keyof ActiviteFormValues];
    const value = typeof rawValue === "string" ? rawValue.trim() : "";
    if (!value) continue;

    const fieldProvenance = provenance[fieldKey] ?? missingInpiFieldProvenance();
    if (fieldProvenance.status === "missing") continue;

    store.fieldLedgers[fieldKey] = {
      current: currentFromProvenance(fieldKey, value, fieldProvenance, sourceDocumentId),
      history: [],
    };
  }

  return store;
}

export function ledgerToProvenance(ledger: DossierFieldLedger | undefined): ActiviteFieldProvenance {
  if (!ledger?.current.value) {
    return missingInpiFieldProvenance();
  }

  const current = ledger.current;
  return {
    status: current.status,
    origin: current.origin,
    fieldSource: current.fieldSource,
    evidence: current.evidence,
    confidence: current.confidence,
    userConfirmed: current.userConfirmed,
    proposedSnapshot: current.proposedSnapshot,
  };
}

export function storeToFormValues(store: ActiviteFieldStore): ActiviteFormValues {
  const values: ActiviteFormValues = {};

  for (const fieldKey of ACTIVITE_GPT_PREFILLABLE_FIELDS) {
    const value = store.fieldLedgers[fieldKey]?.current.value;
    if (value) {
      (values as Record<string, string | undefined>)[fieldKey] = value;
    }
  }

  return values;
}

export function storeToProvenanceMap(store: ActiviteFieldStore): ActiviteFieldProvenanceMap {
  const provenance: ActiviteFieldProvenanceMap = {};

  for (const fieldKey of ACTIVITE_GPT_PREFILLABLE_FIELDS) {
    provenance[fieldKey] = ledgerToProvenance(store.fieldLedgers[fieldKey]);
  }

  return provenance;
}

export function syncUserProtectedFieldsInStore(
  store: ActiviteFieldStore,
  formValues: ActiviteFormValues,
  provenance: ActiviteFieldProvenanceMap,
  userValidated: Partial<Record<ActiviteFieldKey, boolean>>,
): ActiviteFieldStore {
  const next: ActiviteFieldStore = {
    ...store,
    fieldLedgers: { ...store.fieldLedgers },
  };

  for (const fieldKey of ACTIVITE_GPT_PREFILLABLE_FIELDS) {
    if (!userValidated[fieldKey]) continue;

    const rawValue = formValues[fieldKey as keyof ActiviteFormValues];
    const value = typeof rawValue === "string" ? rawValue.trim() : "";
    if (!value) continue;

    const fieldProvenance = provenance[fieldKey];
    if (!fieldProvenance) continue;

    const ledger = next.fieldLedgers[fieldKey];
    next.fieldLedgers[fieldKey] = {
      current: currentFromProvenance(
        fieldKey,
        value,
        fieldProvenance,
        ledger?.current.sourceDocumentId,
      ),
      history: ledger?.history ?? [],
    };
  }

  return next;
}

export function activiteFieldStoreDraftPatch(
  store: ActiviteFieldStore,
  formValues: ActiviteFormValues,
  provenance: ActiviteFieldProvenanceMap,
): Partial<DeclarationDraft> {
  return {
    siren: formValues.siren?.trim(),
    siret: formValues.siret?.trim(),
    exploitantFirstName: formValues.firstName?.trim(),
    exploitantLastName: formValues.lastName?.trim(),
    exploitantEmail: formValues.email?.trim(),
    exploitantTelephone: formValues.telephone?.trim(),
    personalAddress: formValues.personalAddress?.trim(),
    personalCity: formValues.personalCity?.trim(),
    personalPostalCode: formValues.personalPostalCode?.trim(),
    establishmentAddress: formValues.establishmentAddress?.trim(),
    establishmentCity: formValues.establishmentCity?.trim(),
    establishmentPostalCode: formValues.establishmentPostalCode?.trim(),
    activiteFieldProvenance: provenance,
    activiteFieldStore: store,
  };
}
