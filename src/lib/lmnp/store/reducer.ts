import { deriveWorkspace } from "../engine";
import type { DocumentAnalysisResult } from "../ocr/map-to-extractions";
import { createLedgerEntryFromValidation, voidLedgerEntry } from "../services/ledger";
import type {
  DocumentCategory,
  Extraction,
  FiscalYearStatus,
  LmnpDocument,
  ValidationItem,
} from "../types";
import type { NormalizedValue } from "../types/values";
import { FIELD_REGISTRY, getRequiredFieldKeys } from "../types/field-keys";
import type { PersistedWorkspace } from "./persistence";

export type FileRegistry = Map<string, File>;

export interface LmnpState extends PersistedWorkspace {
  fileRegistry: FileRegistry;
}

export type LmnpAction =
  | { type: "HYDRATE"; payload: PersistedWorkspace }
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
  | { type: "UPDATE_PROPERTY"; propertyId: string; patch: Partial<PersistedWorkspace["properties"][0]> };

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
): { ledgerEntries: PersistedWorkspace["ledgerEntries"]; item: ValidationItem } {
  const voided = state.ledgerEntries.map((e) =>
    e.fieldKey === item.fieldKey && e.status === "active" ? voidLedgerEntry(e) : e,
  );
  const entry = createLedgerEntryFromValidation(
    { ...item, finalValue: item.finalValue ?? item.proposedValue },
    state.fiscalYear.id,
  );
  return {
    ledgerEntries: [...voided, entry],
    item: { ...item, ledgerEntryId: entry.id },
  };
}

export function lmnpReducer(state: LmnpState, action: LmnpAction): LmnpState {
  switch (action.type) {
    case "HYDRATE":
      return { ...state, ...action.payload };

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

      return {
        ...state,
        fileRegistry,
        documents: [...state.documents, ...newDocs],
        fiscalYear: touchFiscalYear(state.fiscalYear, "collecting_documents"),
      };
    }

    case "REMOVE_DOCUMENT": {
      const fileRegistry = new Map(state.fileRegistry);
      fileRegistry.delete(action.documentId);
      return {
        ...state,
        fileRegistry,
        documents: state.documents.filter((d) => d.id !== action.documentId),
        extractions: state.extractions.filter((e) => e.documentId !== action.documentId),
        validationItems: state.validationItems.filter((v) => v.documentId !== action.documentId),
      };
    }

    case "DOCUMENT_SET_STATUS": {
      return {
        ...state,
        documents: state.documents.map((d) =>
          d.id === action.documentId ? { ...d, status: action.status } : d,
        ),
        fiscalYear:
          action.status === "processing"
            ? touchFiscalYear(state.fiscalYear, "analyzing")
            : state.fiscalYear,
      };
    }

    case "APPLY_DOCUMENT_ANALYSIS": {
      return {
        ...state,
        ...applyDocumentAnalysisToState(state, action.documentId, action.result),
      };
    }

    case "VALIDATION_APPROVE": {
      const item = state.validationItems.find((v) => v.id === action.validationItemId);
      if (!item) return state;

      const updated: ValidationItem = {
        ...item,
        status: "approved",
        finalValue: item.proposedValue,
        reviewedAt: nowIso(),
        updatedAt: nowIso(),
      };

      const { ledgerEntries, item: withLedger } = applyLedgerForValidation(state, updated);
      const validationItems = state.validationItems.map((v) =>
        v.id === item.id ? withLedger : v,
      );

      return {
        ...state,
        validationItems,
        ledgerEntries,
        extractions: linkExtractions(state.extractions, withLedger),
      };
    }

    case "VALIDATION_CORRECT": {
      const item = state.validationItems.find((v) => v.id === action.validationItemId);
      if (!item) return state;

      const updated: ValidationItem = {
        ...item,
        status: "corrected",
        finalValue: action.finalValue,
        correctionNote: action.note,
        reviewedAt: nowIso(),
        updatedAt: nowIso(),
      };

      const { ledgerEntries, item: withLedger } = applyLedgerForValidation(state, updated);
      const validationItems = state.validationItems.map((v) =>
        v.id === item.id ? withLedger : v,
      );

      return {
        ...state,
        validationItems,
        ledgerEntries,
        extractions: linkExtractions(state.extractions, withLedger),
      };
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
      return { ...state, validationItems, extractions };
    }

    case "VALIDATION_BULK_APPROVE_HIGH_CONFIDENCE": {
      let next = state;
      for (const item of state.validationItems) {
        if (item.status === "pending" && item.confidence >= 95) {
          next = lmnpReducer(next, {
            type: "VALIDATION_APPROVE",
            validationItemId: item.id,
          });
        }
      }
      return next;
    }

    case "CONFIRM_REGIME":
      return {
        ...state,
        fiscalYear: {
          ...touchFiscalYear(state.fiscalYear),
          regime: action.regime,
          regimeConfirmedAt: nowIso(),
        },
      };

    case "UPDATE_PROPERTY":
      return {
        ...state,
        properties: state.properties.map((p) =>
          p.id === action.propertyId ? { ...p, ...action.patch } : p,
        ),
      };

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
