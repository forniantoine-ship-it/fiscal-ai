import { deriveWorkspace, resolveFiscalYearStatus } from "../engine";
import type { DocumentAnalysisResult } from "../ocr/map-to-extractions";
import {
  createLedgerEntryFromField,
  createLedgerEntryFromValidation,
  regimeToLedgerValue,
  shouldVoidLedgerEntryForValidation,
  updateLedgerEntryValue,
  voidLedgerEntry,
} from "../services/ledger";
import type {
  DocumentCategory,
  Extraction,
  FiscalYearStatus,
  LmnpDocument,
  ValidationItem,
} from "../types";
import type { NormalizedValue } from "../types/values";
import { valuesEqual } from "../types/values";
import { FIELD_REGISTRY, getRequiredFieldKeys, type FieldKey } from "../types/field-keys";
import { HIGH_CONFIDENCE_THRESHOLD } from "../validation/display";
import type { PersistedWorkspace } from "./persistence";

export type FileRegistry = Map<string, File>;

export interface LmnpState extends PersistedWorkspace {
  fileRegistry: FileRegistry;
}

export type LmnpAction =
  | { type: "HYDRATE"; payload: PersistedWorkspace; files?: FileRegistry }
  | { type: "REGISTER_FILE"; documentId: string; file: File }
  | {
      type: "UPLOAD_DOCUMENTS";
      files: { file: File; category: DocumentCategory }[];
    }
  | { type: "REMOVE_DOCUMENT"; documentId: string }
  | { type: "DOCUMENT_SET_STATUS"; documentId: string; status: LmnpDocument["status"] }
  | {
      type: "APPLY_DOCUMENT_ANALYSIS";
      documentId: string;
      result: DocumentAnalysisResult;
    }
  | {
      type: "VALIDATION_APPROVE";
      validationItemId: string;
    }
  | {
      type: "VALIDATION_CORRECT";
      validationItemId: string;
      finalValue: NormalizedValue;
      note?: string;
    }
  | { type: "VALIDATION_IGNORE"; validationItemId: string; note?: string }
  | { type: "VALIDATION_REJECT"; validationItemId: string; note?: string }
  | { type: "VALIDATION_BULK_APPROVE_HIGH_CONFIDENCE" }
  | { type: "CONFIRM_REGIME"; regime: "micro-bic" | "reel" }
  | { type: "UPDATE_PROPERTY"; propertyId: string; patch: Partial<PersistedWorkspace["properties"][0]> }
  | {
      type: "LEDGER_UPDATE_VALUE";
      ledgerEntryId: string;
      value: NormalizedValue;
      note?: string;
    }
  | {
      type: "ADD_MANUAL_EXTRACTION";
      documentId: string;
      fieldKey: FieldKey;
      value: NormalizedValue;
      label?: string;
    };

function nowIso(): string {
  return new Date().toISOString();
}

function touchFiscalYear(
  fy: PersistedWorkspace["fiscalYear"],
  status?: FiscalYearStatus,
): PersistedWorkspace["fiscalYear"] {
  return {
    ...fy,
    status: status ?? fy.status,
    updatedAt: nowIso(),
  };
}

function extractionLabel(extraction: Extraction): string {
  return extraction.displayLabel ?? FIELD_REGISTRY[extraction.fieldKey].label;
}

function upsertValidationFromExtraction(
  state: PersistedWorkspace,
  extraction: Extraction,
  doc: LmnpDocument,
): ValidationItem[] {
  const requiredKeys = getRequiredFieldKeys(state.fiscalYear.regime);
  const label = extractionLabel(extraction);
  const existing = state.validationItems.find(
    (v) =>
      v.fieldKey === extraction.fieldKey &&
      v.label === label &&
      v.documentId === doc.id &&
      v.status === "pending",
  );

  const item: ValidationItem = existing
    ? {
        ...existing,
        label,
        proposedValue: extraction.normalizedValue,
        confidence: Math.min(existing.confidence, extraction.confidence),
        extractionIds: [...new Set([...existing.extractionIds, extraction.id])],
        documentId: doc.id,
        documentFileName: doc.fileName,
        updatedAt: nowIso(),
      }
    : {
        id: crypto.randomUUID(),
        fiscalYearId: state.fiscalYear.id,
        propertyId: state.fiscalYear.propertyIds[0],
        fieldKey: extraction.fieldKey,
        label,
        proposedValue: extraction.normalizedValue,
        status: "pending",
        isRequired: requiredKeys.includes(extraction.fieldKey),
        extractionIds: [extraction.id],
        documentId: doc.id,
        documentFileName: doc.fileName,
        confidence: extraction.confidence,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };

  if (existing) {
    return state.validationItems.map((v) => (v.id === existing.id ? item : v));
  }
  return [...state.validationItems, item];
}

function applyDocumentAnalysisToState(
  state: PersistedWorkspace,
  documentId: string,
  result: DocumentAnalysisResult,
): PersistedWorkspace {
  const docIndex = state.documents.findIndex((d) => d.id === documentId);
  if (docIndex < 0) return state;

  const doc = state.documents[docIndex];
  const analyzed: LmnpDocument = {
    ...doc,
    status: "analyzed",
    documentType: result.documentType,
    category: result.category,
  };

  const documents = [...state.documents];
  documents[docIndex] = analyzed;

  const extractions: Extraction[] = result.extractions.map((e) => ({
    ...e,
    id: e.id,
  }));

  let newExtractions = [
    ...state.extractions.filter((e) => e.documentId !== documentId),
    ...extractions,
  ];

  let validationItems = state.validationItems;
  for (const extraction of extractions) {
    validationItems = upsertValidationFromExtraction(
      { ...state, validationItems, documents },
      extraction,
      analyzed,
    );
  }

  return {
    ...state,
    documents,
    extractions: newExtractions,
    validationItems,
    fiscalYear: touchFiscalYear(state.fiscalYear, "pending_validation"),
  };
}

function linkExtractions(
  extractions: Extraction[],
  item: ValidationItem,
): Extraction[] {
  return extractions.map((e) =>
    item.extractionIds.includes(e.id)
      ? { ...e, status: "linked" as const, validationItemId: item.id }
      : e,
  );
}

function applyLedgerForValidation(
  state: PersistedWorkspace,
  item: ValidationItem,
  options?: { autoSynced?: boolean },
): { ledgerEntries: PersistedWorkspace["ledgerEntries"]; item: ValidationItem } {
  const voided = state.ledgerEntries.map((e) =>
    shouldVoidLedgerEntryForValidation(e, item) ? voidLedgerEntry(e) : e,
  );
  const sourceDoc = item.documentId
    ? state.documents.find((d) => d.id === item.documentId)
    : undefined;
  const entry = createLedgerEntryFromValidation(
    { ...item, finalValue: item.finalValue ?? item.proposedValue },
    state.fiscalYear.id,
    { autoSynced: options?.autoSynced, sourceDocumentType: sourceDoc?.documentType },
  );
  return {
    ledgerEntries: [...voided, entry],
    item: { ...item, ledgerEntryId: entry.id },
  };
}

function approveValidationItem(
  state: PersistedWorkspace,
  item: ValidationItem,
  finalValue?: NormalizedValue,
  statusOverride?: ValidationItem["status"],
  options?: { autoSynced?: boolean },
): PersistedWorkspace {
  const resolvedValue = finalValue ?? item.proposedValue;
  const updated: ValidationItem = {
    ...item,
    status:
      statusOverride ??
      (finalValue && !valuesMatch(item.proposedValue, finalValue) ? "corrected" : "approved"),
    finalValue: resolvedValue,
    reviewedAt: nowIso(),
    updatedAt: nowIso(),
  };

  const { ledgerEntries, item: withLedger } = applyLedgerForValidation(state, updated, options);
  return {
    ...state,
    validationItems: state.validationItems.map((v) => (v.id === item.id ? withLedger : v)),
    ledgerEntries,
    extractions: linkExtractions(state.extractions, withLedger),
  };
}

function valuesMatch(a: NormalizedValue, b: NormalizedValue): boolean {
  return valuesEqual(a, b);
}

function autoSyncDocumentToLedger(
  state: PersistedWorkspace,
  documentId: string,
): PersistedWorkspace {
  let next = state;
  const pendingFromDoc = state.validationItems.filter(
    (v) => v.documentId === documentId && v.status === "pending",
  );

  for (const item of pendingFromDoc) {
    if (item.confidence >= HIGH_CONFIDENCE_THRESHOLD) {
      next = approveValidationItem(next, item, undefined, undefined, { autoSynced: true });
    }
  }

  return next;
}

function applyWorkspaceProgress(state: PersistedWorkspace): PersistedWorkspace {
  const derived = deriveWorkspace(
    state.fiscalYear,
    state.properties,
    state.documents,
    state.validationItems,
    state.ledgerEntries,
  );

  const status = resolveFiscalYearStatus(
    state.fiscalYear,
    state.documents,
    derived.pendingValidationCount,
    derived.canClose,
  );

  return {
    ...state,
    fiscalYear: touchFiscalYear(state.fiscalYear, status),
  };
}

function finalizeState(state: LmnpState): LmnpState {
  return { ...state, ...applyWorkspaceProgress(state) };
}

export function lmnpReducer(state: LmnpState, action: LmnpAction): LmnpState {
  switch (action.type) {
    case "HYDRATE":
      return finalizeState({
        ...state,
        ...action.payload,
        fileRegistry: action.files ?? state.fileRegistry,
      });

    case "REGISTER_FILE": {
      const fileRegistry = new Map(state.fileRegistry);
      fileRegistry.set(action.documentId, action.file);
      return { ...state, fileRegistry };
    }

    case "UPLOAD_DOCUMENTS": {
      const newDocs: LmnpDocument[] = action.files.map(({ file, category }) => ({
        id: crypto.randomUUID(),
        fiscalYearId: state.fiscalYear.id,
        propertyId: state.fiscalYear.propertyIds[0],
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        category,
        documentType: "unknown",
        status: "uploaded",
        uploadedAt: nowIso(),
      }));

      const fileRegistry = new Map(state.fileRegistry);
      action.files.forEach(({ file }, i) => {
        fileRegistry.set(newDocs[i].id, file);
      });

      return finalizeState({
        ...state,
        fileRegistry,
        documents: [...state.documents, ...newDocs],
        fiscalYear: touchFiscalYear(state.fiscalYear, "collecting_documents"),
      });
    }

    case "REMOVE_DOCUMENT": {
      const fileRegistry = new Map(state.fileRegistry);
      fileRegistry.delete(action.documentId);
      return finalizeState({
        ...state,
        fileRegistry,
        documents: state.documents.filter((d) => d.id !== action.documentId),
        extractions: state.extractions.filter((e) => e.documentId !== action.documentId),
        validationItems: state.validationItems.filter((v) => v.documentId !== action.documentId),
      });
    }

    case "DOCUMENT_SET_STATUS": {
      return finalizeState({
        ...state,
        documents: state.documents.map((d) =>
          d.id === action.documentId ? { ...d, status: action.status } : d,
        ),
        fiscalYear:
          action.status === "processing"
            ? touchFiscalYear(state.fiscalYear, "analyzing")
            : state.fiscalYear,
      });
    }

    case "APPLY_DOCUMENT_ANALYSIS": {
      const analyzed = applyDocumentAnalysisToState(state, action.documentId, action.result);
      return finalizeState({
        ...state,
        ...autoSyncDocumentToLedger(analyzed, action.documentId),
      });
    }

    case "VALIDATION_APPROVE": {
      const item = state.validationItems.find((v) => v.id === action.validationItemId);
      if (!item) return state;
      return finalizeState({ ...state, ...approveValidationItem(state, item) });
    }

    case "VALIDATION_CORRECT": {
      const item = state.validationItems.find((v) => v.id === action.validationItemId);
      if (!item) return state;
      const corrected = approveValidationItem(state, item, action.finalValue, "corrected");
      const validationItems = corrected.validationItems.map((v) =>
        v.id === item.id ? { ...v, correctionNote: action.note } : v,
      );
      return finalizeState({ ...state, ...corrected, validationItems });
    }

    case "VALIDATION_IGNORE":
    case "VALIDATION_REJECT": {
      const validationItems = state.validationItems.map((v) =>
        v.id === action.validationItemId
          ? {
              ...v,
              status: "ignored" as const,
              correctionNote: action.note,
              reviewedAt: nowIso(),
              updatedAt: nowIso(),
            }
          : v,
      );
      const item = validationItems.find((v) => v.id === action.validationItemId);
      const extractions = item
        ? state.extractions.map((e) =>
            item.extractionIds.includes(e.id)
              ? { ...e, status: "discarded" as const }
              : e,
          )
        : state.extractions;
      return finalizeState({ ...state, validationItems, extractions });
    }

    case "VALIDATION_BULK_APPROVE_HIGH_CONFIDENCE": {
      let next = state;
      for (const item of state.validationItems) {
        if (item.status === "pending" && item.confidence >= HIGH_CONFIDENCE_THRESHOLD) {
          next = lmnpReducer(next, {
            type: "VALIDATION_APPROVE",
            validationItemId: item.id,
          });
        }
      }
      return next;
    }

    case "ADD_MANUAL_EXTRACTION": {
      const doc = state.documents.find((d) => d.id === action.documentId);
      if (!doc) return state;

      const extraction: Extraction = {
        id: crypto.randomUUID(),
        documentId: doc.id,
        fiscalYearId: state.fiscalYear.id,
        fieldKey: action.fieldKey,
        displayLabel: action.label ?? FIELD_REGISTRY[action.fieldKey].label,
        rawValue:
          action.value.type === "money"
            ? String(action.value.amountCents / 100)
            : action.value.type === "text"
              ? action.value.text
              : "",
        normalizedValue: action.value,
        confidence: 100,
        status: "pending_validation",
      };

      const extractions = [...state.extractions, extraction];
      const validationItems = upsertValidationFromExtraction(
        { ...state, extractions },
        extraction,
        doc,
      );

      return finalizeState({
        ...state,
        extractions,
        validationItems,
        fiscalYear: touchFiscalYear(state.fiscalYear, "pending_validation"),
      });
    }

    case "CONFIRM_REGIME": {
      const voidedRegime = state.ledgerEntries.map((e) =>
        e.fieldKey === "fiscal.regime" && e.status === "active" ? voidLedgerEntry(e) : e,
      );
      const regimeEntry = createLedgerEntryFromField({
        fiscalYearId: state.fiscalYear.id,
        propertyId: state.fiscalYear.propertyIds[0],
        fieldKey: "fiscal.regime",
        value: regimeToLedgerValue(action.regime),
        origin: "manual",
      });

      return finalizeState({
        ...state,
        fiscalYear: {
          ...touchFiscalYear(state.fiscalYear),
          regime: action.regime,
          regimeConfirmedAt: nowIso(),
        },
        ledgerEntries: [...voidedRegime, regimeEntry],
      });
    }

    case "UPDATE_PROPERTY":
      return {
        ...state,
        properties: state.properties.map((p) =>
          p.id === action.propertyId ? { ...p, ...action.patch } : p,
        ),
      };

    case "LEDGER_UPDATE_VALUE": {
      const entry = state.ledgerEntries.find(
        (e) => e.id === action.ledgerEntryId && e.status === "active",
      );
      if (!entry) return state;

      const voided = state.ledgerEntries.map((e) =>
        e.id === entry.id ? voidLedgerEntry(e) : e,
      );
      const updatedEntry = updateLedgerEntryValue(entry, action.value, action.note);

      let validationItems = state.validationItems;
      if (entry.validationItemId && entry.validationItemId !== "system") {
        validationItems = validationItems.map((v) =>
          v.id === entry.validationItemId
            ? {
                ...v,
                status: "corrected" as const,
                finalValue: action.value,
                correctionNote: action.note ?? v.correctionNote,
                reviewedAt: nowIso(),
                updatedAt: nowIso(),
                ledgerEntryId: updatedEntry.id,
              }
            : v,
        );
      }

      return finalizeState({
        ...state,
        validationItems,
        ledgerEntries: [...voided, updatedEntry],
      });
    }

    default:
      return state;
  }
}

export function selectWorkspace(state: LmnpState) {
  const derived = deriveWorkspace(
    state.fiscalYear,
    state.properties,
    state.documents,
    state.validationItems,
    state.ledgerEntries,
  );

  return {
    fiscalYear: state.fiscalYear,
    properties: state.properties,
    documents: state.documents,
    extractions: state.extractions,
    validationItems: state.validationItems,
    ledgerEntries: state.ledgerEntries.filter((e) => e.status === "active"),
    ...derived,
  };
}
