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
  DeclarationDraft,
  DocumentCategory,
  Extraction,
  FiscalYearStatus,
  LmnpDocument,
  PropertyBackgroundExtraction,
  PropertyType,
  ValidationItem,
  CreditFinancingData,
  AmortissementVentilationData,
  RevenusExtractionData,
  RevenueGptSession,
  ChargesExtractionData,
  ChargesAmortizationSuggestion,
} from "../types";
import {
  normalizeChargesExtraction,
  resolveChargesAmortizationDecisions,
} from "../services/charges-profile";
import {
  suggestionToAmortissementComponent,
  suggestionToFromChargesItem,
} from "../services/charges-amortization-intelligence";
import { processGovernedExtraction } from "../services/governed-field-prefill";
import { removeDocumentFromRevenueSession } from "../services/revenue-gpt-ui-prefill";
import type { FiscalTunnel } from "@/lib/documents/tunnel-field-ownership";
import type { GovernedFieldExtractedBy } from "@/lib/documents/types/governed-field";
import { recalculateVentilationSummary } from "../services/amortissement-profile";
import type { NormalizedValue } from "../types/values";
import { valuesEqual } from "../types/values";
import { FIELD_REGISTRY, getRequiredFieldKeys, type FieldKey } from "../types/field-keys";
import { HIGH_CONFIDENCE_THRESHOLD } from "../validation/display";
import { createDefaultWorkspace, type PersistedWorkspace } from "./persistence";
import type { AiActivityEvent, AiActivityResolutionState } from "../types/ai-activity";

export type FileRegistry = Map<string, File>;

export interface LmnpState extends PersistedWorkspace {
  fileRegistry: FileRegistry;
}

export type LmnpAction =
  | { type: "HYDRATE"; payload: PersistedWorkspace; files?: FileRegistry }
  | { type: "AUTH_SESSION_RESET" }
  | { type: "REGISTER_FILE"; documentId: string; file: File }
  | {
      type: "UPLOAD_DOCUMENTS";
      files: {
        file: File;
        category: DocumentCategory;
        documentId?: string;
        /**
         * True only when `documentId` is the real Supabase documents.id just
         * returned by uploadFilesForUser() — never inferred from `documentId`
         * being non-null, since a producer may legitimately pass a locally
         * generated id it needs synchronously (REGISTER_FILE, assistant state)
         * with no Supabase artifact behind it at all.
         */
        isSupabaseDocumentId?: boolean;
      }[];
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
    }
  | { type: "JOURNEY_MARK_DECLARATION_GENERATED" }
  | { type: "JOURNEY_MARK_PAID" }
  | { type: "JOURNEY_MARK_TRANSMITTED" }
  | { type: "DECLARATION_PATCH_DRAFT"; patch: Partial<DeclarationDraft> }
  | {
      type: "APPLY_GOVERNED_EXTRACTION";
      sourceTunnel: FiscalTunnel;
      documentId: string;
      sourceDocument: string;
      extractedBy: GovernedFieldExtractedBy;
      payload: Record<string, unknown>;
    }
  | { type: "DECLARATION_COMPLETE_STEP"; stepId: string }
  | { type: "CREATE_NEW_DECLARATION" }
  | {
      type: "CONFIRM_INPI_PROFILE";
      profile: {
        siren?: string;
        siret?: string;
        firstName?: string;
        lastName?: string;
        email?: string;
        telephone?: string;
        personalAddress?: string;
        personalCity?: string;
        personalPostalCode?: string;
        establishmentAddress?: string;
        establishmentCity?: string;
        establishmentPostalCode?: string;
      };
      documentId?: string;
    }
  | {
      type: "CONFIRM_LOGEMENT_PROFILE";
      profile: {
        label?: string;
        address?: string;
        addressLine2?: string;
        city?: string;
        postalCode?: string;
        propertyType?: PropertyType;
        coproperty?: boolean;
        surface?: number;
        acquisitionDate?: string;
        status?: string;
      };
      backgroundExtraction?: PropertyBackgroundExtraction;
      documentId?: string;
    }
  | {
      type: "CONFIRM_CREDIT_FINANCING";
      financing: CreditFinancingData;
      documentId?: string;
    }
  | {
      type: "CONFIRM_AMORTISSEMENT";
      ventilation: AmortissementVentilationData;
    }
  | {
      type: "CONFIRM_REVENUS";
      extraction: RevenusExtractionData;
      session?: RevenueGptSession;
      documentIds?: string[];
    }
  | {
      type: "CONFIRM_CHARGES";
      extraction: ChargesExtractionData;
      documentIds?: string[];
    }
  | {
      type: "TRANSFER_CHARGES_AMORTIZATION_SUGGESTION";
      suggestionId: string;
      suggestion?: ChargesAmortizationSuggestion;
    }
  | {
      type: "KEEP_CHARGES_AMORTIZATION_SUGGESTION";
      suggestionId: string;
      suggestion?: ChargesAmortizationSuggestion;
    }
  | { type: "DECLARE_NO_CREDIT" }
  | { type: "COMPLETE_DOCUMENT_JOURNEY_STEP"; stepId: string }
  | { type: "START_DOCUMENT_JOURNEY" }
  | { type: "ADD_AI_ACTIVITY_EVENT"; event: AiActivityEvent }
  | {
      type: "RESOLVE_AI_ACTIVITY_EVENT";
      eventId: string;
      resolutionState: AiActivityResolutionState;
    }
  | { type: "DISMISS_AI_ACTIVITY_EVENT"; eventId: string };

function nowIso(): string {
  return new Date().toISOString();
}

/** Merges a partial background-extraction patch onto the existing one — never drops a key the patch omits or leaves `undefined`. */
function mergePropertyBackgroundExtraction(
  existing: PropertyBackgroundExtraction | undefined,
  patch: PropertyBackgroundExtraction | undefined,
): PropertyBackgroundExtraction | undefined {
  if (!patch) return existing;
  const definedEntries = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (definedEntries.length === 0) return existing;
  return { ...existing, ...Object.fromEntries(definedEntries) };
}

function findChargesAmortizationSuggestion(
  draft: DeclarationDraft,
  suggestionId: string,
): ChargesAmortizationSuggestion | undefined {
  return (
    draft.chargesAmortizationDecisions?.find((item) => item.id === suggestionId) ??
    draft.chargesExtraction?.amortizationSuggestions?.find((item) => item.id === suggestionId)
  );
}

function upsertChargesAmortizationDecision(
  draft: DeclarationDraft,
  updated: ChargesAmortizationSuggestion,
): ChargesAmortizationSuggestion[] {
  const existing = draft.chargesAmortizationDecisions ?? [];
  const index = existing.findIndex((item) => item.id === updated.id);
  if (index < 0) return [...existing, updated];
  const next = [...existing];
  next[index] = updated;
  return next;
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
    ocrMeta: result.ocrMeta,
    chargeParserCorpus: result.chargeParserCorpus,
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
    state.extractions,
    state.declarationDraft,
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
    case "HYDRATE": {
      console.log("[hydration-restore-only]", { scope: "workspace", action: "HYDRATE" });
      // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
      console.log("[documents-hydrate-stage]", {
        reducer: "lmnpReducer",
        action: "HYDRATE",
        incomingDocCount: action.payload.documents.length,
        incomingDocs: action.payload.documents.map((doc) => ({
          id: doc.id,
          fileName: doc.fileName,
          status: doc.status,
          category: doc.category,
          documentType: doc.documentType,
        })),
        currentStoreDocs: state.documents.map((doc) => ({
          id: doc.id,
          fileName: doc.fileName,
          status: doc.status,
        })),
        incomingExtractionCount: action.payload.extractions.length,
        extractedDocIds: [...new Set(action.payload.extractions.map((e) => e.documentId))],
      });
      // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
      const chargesDocsInHydrate = action.payload.documents.filter(
        (d) => d.category === "charges",
      );
      chargesDocsInHydrate.forEach((d) => {
        const prev = state.documents.find((s) => s.id === d.id);
        console.log("[charges-status-transition]", {
          action: "HYDRATE",
          id: d.id,
          fileName: d.fileName,
          previousStatus: prev?.status ?? "not-in-store",
          nextStatus: d.status,
        });
      });
      if (chargesDocsInHydrate.length === 0) {
        const prevChargesDocs = state.documents.filter((d) => d.category === "charges");
        if (prevChargesDocs.length > 0) {
          console.log("[charges-status-transition] HYDRATE replaced all charges docs", {
            action: "HYDRATE",
            removedDocs: prevChargesDocs.map((d) => ({ id: d.id, fileName: d.fileName, status: d.status })),
            incomingChargesCount: 0,
          });
        }
      }
      return finalizeState({
        ...state,
        ...action.payload,
        fileRegistry: action.files ?? state.fileRegistry,
      });
    }

    case "AUTH_SESSION_RESET":
      return finalizeState({
        ...createDefaultWorkspace(),
        fileRegistry: new Map(),
      });

    case "REGISTER_FILE": {
      const fileRegistry = new Map(state.fileRegistry);
      fileRegistry.set(action.documentId, action.file);
      return { ...state, fileRegistry };
    }

    case "UPLOAD_DOCUMENTS": {
      const now = nowIso();
      const newDocs: LmnpDocument[] = action.files.map(
        ({ file, category, documentId, isSupabaseDocumentId }) => ({
          id: documentId ?? crypto.randomUUID(),
          fiscalYearId: state.fiscalYear.id,
          propertyId: state.fiscalYear.propertyIds[0],
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          category,
          documentType: "unknown",
          status: "uploaded",
          uploadedAt: now,
          hasSupabaseArtifacts: Boolean(isSupabaseDocumentId),
        }),
      );
      // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
      newDocs.filter((d) => d.category === "charges").forEach((d, i) => {
        const supabaseDocumentId = action.files[i].documentId;
        const localDocumentId = d.id;
        console.log("[charges-document-id]", {
          localDocumentId,
          supabaseDocumentId: supabaseDocumentId ?? "(not provided)",
          matched: localDocumentId === supabaseDocumentId,
        });
        console.log("[charges-status-transition]", {
          action: "UPLOAD_DOCUMENTS",
          id: d.id,
          fileName: d.fileName,
          previousStatus: "none",
          nextStatus: "uploaded",
        });
      });

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

      const removedDocument = state.documents.find((d) => d.id === action.documentId);
      let declarationDraft = state.declarationDraft;

      // Cycle 15B — Test G : la suppression explicite d'un document revenus retire
      // sa contribution du calcul. Jamais déduit d'un montant/date qui se ressemble
      // — uniquement de cette action utilisateur identifiable (bouton "supprimer").
      if (removedDocument?.category === "revenus" && declarationDraft?.revenueGptSession) {
        const nextSession = removeDocumentFromRevenueSession(
          declarationDraft.revenueGptSession,
          action.documentId,
          state.fiscalYear.year,
        );
        declarationDraft = {
          ...declarationDraft,
          revenueGptSession: nextSession,
          // Un total déjà confirmé reflétait ce document — désormais faux : on
          // l'invalide pour rouvrir l'upload/l'assistant plutôt que de laisser
          // l'utilisateur bloqué par le verrouillage réciproque du Cycle 15A sur
          // un chiffre qui n'est plus le bon.
          revenusAssistant: undefined,
          revenusConfirmedAt: undefined,
        };
      }

      return finalizeState({
        ...state,
        fileRegistry,
        documents: state.documents.filter((d) => d.id !== action.documentId),
        extractions: state.extractions.filter((e) => e.documentId !== action.documentId),
        validationItems: state.validationItems.filter((v) => v.documentId !== action.documentId),
        declarationDraft,
      });
    }

    case "DOCUMENT_SET_STATUS": {
      const _docForLifecycle = state.documents.find((d) => d.id === action.documentId);
      if (_docForLifecycle) {
        console.log("[charges-doc-lifecycle]", {
          id: _docForLifecycle.id,
          fileName: _docForLifecycle.fileName,
          previousStatus: _docForLifecycle.status,
          nextStatus: action.status,
          documentType: _docForLifecycle.documentType,
          category: _docForLifecycle.category,
        });
      }
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
      const _docForOcr = state.documents.find((d) => d.id === action.documentId);
      console.log("[charges-ocr-complete]", {
        id: action.documentId,
        fileName: _docForOcr?.fileName ?? "unknown",
        previousStatus: _docForOcr?.status ?? "unknown",
        resolvedDocumentType: action.result.documentType,
        resolvedCategory: action.result.category,
        extractionCount: action.result.extractions.length,
        extractionFieldKeys: action.result.extractions.map((e) => e.fieldKey),
        hasMoneyExtraction: action.result.extractions.some((e) => e.normalizedValue.type === "money"),
        moneyExtractions: action.result.extractions
          .filter((e) => e.normalizedValue.type === "money")
          .map((e) => ({ fieldKey: e.fieldKey, rawValue: e.rawValue })),
        chargeParserCorpusLength: action.result.chargeParserCorpus?.length ?? 0,
      });
      // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
      console.log("[charges-analysis-applied]", {
        id: action.documentId,
        previousStatus: _docForOcr?.status ?? "unknown",
        nextStatus: "analyzed",
        hasAnalysis: true,
      });
      console.log("[charges-status-transition]", {
        action: "APPLY_DOCUMENT_ANALYSIS",
        id: action.documentId,
        fileName: _docForOcr?.fileName ?? "unknown",
        previousStatus: _docForOcr?.status ?? "unknown",
        nextStatus: "analyzed",
      });
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

    case "JOURNEY_MARK_DECLARATION_GENERATED":
      return finalizeState({
        ...state,
        fiscalYear: {
          ...touchFiscalYear(state.fiscalYear, "ready_to_close"),
          declarationGeneratedAt: nowIso(),
        },
      });

    case "JOURNEY_MARK_PAID":
      return finalizeState({
        ...state,
        fiscalYear: {
          ...touchFiscalYear(state.fiscalYear),
          paidAt: nowIso(),
        },
      });

    case "JOURNEY_MARK_TRANSMITTED":
      return finalizeState({
        ...state,
        fiscalYear: {
          ...touchFiscalYear(state.fiscalYear, "closed"),
          transmittedAt: nowIso(),
        },
      });

    case "DECLARATION_PATCH_DRAFT": {
      const draft = state.declarationDraft ?? { completedSteps: [] };
      return finalizeState({
        ...state,
        declarationDraft: { ...draft, ...action.patch },
      });
    }

    case "APPLY_GOVERNED_EXTRACTION": {
      const draft = state.declarationDraft ?? { completedSteps: [] };
      const result = processGovernedExtraction({
        draft,
        sourceTunnel: action.sourceTunnel,
        documentId: action.documentId,
        sourceDocument: action.sourceDocument,
        extractedBy: action.extractedBy,
        payload: action.payload,
        revenueYear: state.fiscalYear.year - 1,
      });

      console.log("[execution-event]", {
        action: "governed_extraction",
        sourceTunnel: action.sourceTunnel,
        appliedFields: result.appliedFields,
      });

      return finalizeState({
        ...state,
        declarationDraft: {
          ...draft,
          governedFields: result.governedFields,
          ...(result.creditFormPatch ? { creditWorkspaceForm: result.creditFormPatch } : {}),
          ...(result.logementFormPatch ? { logementWorkspaceForm: result.logementFormPatch } : {}),
        },
      });
    }

    case "DECLARATION_COMPLETE_STEP": {
      const draft = state.declarationDraft ?? { completedSteps: [] };
      const completed = new Set(draft.completedSteps);
      completed.add(action.stepId);
      return finalizeState({
        ...state,
        declarationDraft: {
          ...draft,
          completedSteps: [...completed],
        },
      });
    }

    case "START_DOCUMENT_JOURNEY": {
      const draft = state.declarationDraft ?? { completedSteps: [] };
      return finalizeState({
        ...state,
        declarationDraft: {
          ...draft,
          journeyStartedAt: draft.journeyStartedAt ?? nowIso(),
        },
      });
    }

    case "CREATE_NEW_DECLARATION": {
      const fresh = createDefaultWorkspace();
      return finalizeState({
        ...fresh,
        fileRegistry: new Map(),
      });
    }

    case "CONFIRM_INPI_PROFILE": {
      const draft = state.declarationDraft ?? { completedSteps: [] };
      const completed = new Set(draft.documentStepsCompleted ?? []);
      completed.add("inpi");
      return finalizeState({
        ...state,
        declarationDraft: {
          ...draft,
          siren: action.profile.siren?.trim() ?? draft.siren,
          siret: action.profile.siret?.trim() ?? draft.siret,
          exploitantFirstName: action.profile.firstName?.trim() ?? draft.exploitantFirstName,
          exploitantLastName: action.profile.lastName?.trim() ?? draft.exploitantLastName,
          exploitantEmail: action.profile.email?.trim() ?? draft.exploitantEmail,
          exploitantTelephone: action.profile.telephone?.trim() ?? draft.exploitantTelephone,
          personalAddress: action.profile.personalAddress?.trim() ?? draft.personalAddress,
          personalCity: action.profile.personalCity?.trim() ?? draft.personalCity,
          personalPostalCode:
            action.profile.personalPostalCode?.trim() ?? draft.personalPostalCode,
          establishmentAddress:
            action.profile.establishmentAddress?.trim() ?? draft.establishmentAddress,
          establishmentCity: action.profile.establishmentCity?.trim() ?? draft.establishmentCity,
          establishmentPostalCode:
            action.profile.establishmentPostalCode?.trim() ?? draft.establishmentPostalCode,
          activityType: "LMNP",
          inpiDocumentId: action.documentId ?? draft.inpiDocumentId,
          inpiGptPrefillAppliedAt: draft.inpiGptPrefillAppliedAt ?? nowIso(),
          inpiConfirmedAt: nowIso(),
          documentStepsCompleted: [...completed],
          completedSteps: [...new Set([...draft.completedSteps, "siren", "exploitant"])],
        },
      });
    }

    case "CONFIRM_LOGEMENT_PROFILE": {
      const draft = state.declarationDraft ?? { completedSteps: [] };
      const propertyId = state.fiscalYear.propertyIds[0];
      const properties = state.properties.map((p) =>
        p.id === propertyId
          ? {
              ...p,
              label: action.profile.label?.trim() || p.label,
              address: action.profile.address?.trim() ?? p.address,
              addressLine2: action.profile.addressLine2?.trim() ?? p.addressLine2,
              city: action.profile.city?.trim() ?? p.city,
              postalCode: action.profile.postalCode?.trim() ?? p.postalCode,
              propertyType: action.profile.propertyType ?? p.propertyType,
              coproperty: action.profile.coproperty ?? p.coproperty,
              surface: action.profile.surface ?? p.surface,
              acquisitionDate: action.profile.acquisitionDate?.trim() ?? p.acquisitionDate,
              status: action.profile.status?.trim() ?? p.status,
              notaryDocumentId: action.documentId ?? p.notaryDocumentId,
            }
          : p,
      );
      const completed = new Set(draft.documentStepsCompleted ?? []);
      completed.add("logement");
      return finalizeState({
        ...state,
        properties,
        declarationDraft: {
          ...draft,
          logementDocumentId: action.documentId ?? draft.logementDocumentId,
          logementConfirmedAt: nowIso(),
          propertyBackgroundExtraction: mergePropertyBackgroundExtraction(
            draft.propertyBackgroundExtraction,
            action.backgroundExtraction,
          ),
          documentStepsCompleted: [...completed],
          completedSteps: [...new Set([...draft.completedSteps, "logement"])],
        },
      });
    }

    case "CONFIRM_CREDIT_FINANCING": {
      const draft = state.declarationDraft ?? { completedSteps: [] };
      const completed = new Set(draft.documentStepsCompleted ?? []);
      completed.add("credit-immobilier");
      return finalizeState({
        ...state,
        declarationDraft: {
          ...draft,
          creditDocumentId: action.documentId ?? draft.creditDocumentId,
          creditConfirmedAt: nowIso(),
          creditDeclaredNoneAt: undefined,
          creditFinancing: action.financing,
          documentStepsCompleted: [...completed],
          completedSteps: [...new Set([...draft.completedSteps, "credit"])],
        },
      });
    }

    case "DECLARE_NO_CREDIT": {
      const draft = state.declarationDraft ?? { completedSteps: [] };
      return finalizeState({
        ...state,
        declarationDraft: {
          ...draft,
          creditDeclaredNoneAt: nowIso(),
          creditConfirmedAt: undefined,
        },
      });
    }

    case "CONFIRM_AMORTISSEMENT": {
      const draft = state.declarationDraft ?? { completedSteps: [] };
      const completed = new Set(draft.documentStepsCompleted ?? []);
      completed.add("amortissements");
      return finalizeState({
        ...state,
        declarationDraft: {
          ...draft,
          amortissementConfirmedAt: nowIso(),
          amortissementVentilation: action.ventilation,
          documentStepsCompleted: [...completed],
          completedSteps: [...new Set([...draft.completedSteps, "amortissement"])],
        },
      });
    }

    case "CONFIRM_REVENUS": {
      const draft = state.declarationDraft ?? { completedSteps: [] };
      const completed = new Set(draft.documentStepsCompleted ?? []);
      completed.add("revenus");
      return finalizeState({
        ...state,
        declarationDraft: {
          ...draft,
          revenusDocumentIds: action.documentIds ?? draft.revenusDocumentIds,
          revenusConfirmedAt: nowIso(),
          revenusExtraction: action.extraction,
          revenueGptSession: action.session ?? draft.revenueGptSession,
          documentStepsCompleted: [...completed],
          completedSteps: [...new Set([...draft.completedSteps, "revenus"])],
        },
      });
    }

    case "CONFIRM_CHARGES": {
      const draft = state.declarationDraft ?? { completedSteps: [] };
      const completed = new Set(draft.documentStepsCompleted ?? []);
      completed.add("charges");
      const chargesExtraction = normalizeChargesExtraction(action.extraction);
      const chargesAmortizationDecisions = resolveChargesAmortizationDecisions(
        chargesExtraction,
        draft,
      );
      return finalizeState({
        ...state,
        declarationDraft: {
          ...draft,
          chargesDocumentIds: action.documentIds ?? draft.chargesDocumentIds,
          chargesConfirmedAt: nowIso(),
          chargesExtraction: {
            ...chargesExtraction,
            amortizationSuggestions: chargesAmortizationDecisions,
          },
          chargesAmortizationDecisions,
          documentStepsCompleted: [...completed],
          completedSteps: [...new Set([...draft.completedSteps, "charges"])],
        },
      });
    }

    case "TRANSFER_CHARGES_AMORTIZATION_SUGGESTION": {
      const draft = state.declarationDraft ?? { completedSteps: [] };
      const suggestion =
        action.suggestion ?? findChargesAmortizationSuggestion(draft, action.suggestionId);
      if (!suggestion) return state;

      const at = nowIso();
      const updated: ChargesAmortizationSuggestion = {
        ...suggestion,
        status: "transferred",
        decidedAt: at,
        transferredAt: at,
      };
      const fromChargesItem = suggestionToFromChargesItem(updated, at);
      const existingFromCharges = draft.amortissementFromCharges ?? [];
      const fromCharges = [
        ...existingFromCharges.filter((item) => item.suggestionId !== updated.id),
        fromChargesItem,
      ];

      const component = suggestionToAmortissementComponent(updated);
      const ventilation = draft.amortissementVentilation;
      const ventilationComponents = ventilation?.components ?? [];
      const nextVentilation = ventilation
        ? {
            ...ventilation,
            components: [
              ...ventilationComponents.filter((row) => row.id !== component.id),
              component,
            ],
          }
        : undefined;
      const amortissementVentilation = nextVentilation
        ? {
            ...nextVentilation,
            summary: recalculateVentilationSummary(nextVentilation.components),
          }
        : undefined;

      const chargesAmortizationDecisions = upsertChargesAmortizationDecision(draft, updated);
      const chargesExtraction = {
        ...normalizeChargesExtraction(
          draft.chargesExtraction ?? {
            categories: [],
            recoveredFromOtherSteps: 0,
            amortizationSuggestions: [],
            summary: {
              totalCharges: updated.amount,
              categoryCount: 0,
              recoverableTotal: updated.amount,
              nonRecoverableTotal: 0,
            },
          },
        ),
        amortizationSuggestions: chargesAmortizationDecisions,
      };

      return finalizeState({
        ...state,
        declarationDraft: {
          ...draft,
          chargesAmortizationDecisions,
          chargesExtraction,
          amortissementFromCharges: fromCharges,
          amortissementVentilation,
        },
      });
    }

    case "KEEP_CHARGES_AMORTIZATION_SUGGESTION": {
      const draft = state.declarationDraft ?? { completedSteps: [] };
      const suggestion =
        action.suggestion ?? findChargesAmortizationSuggestion(draft, action.suggestionId);
      if (!suggestion) return state;

      const updated: ChargesAmortizationSuggestion = {
        ...suggestion,
        status: "kept_as_charge",
        decidedAt: nowIso(),
      };

      const chargesAmortizationDecisions = upsertChargesAmortizationDecision(draft, updated);
      const chargesExtraction = {
        ...normalizeChargesExtraction(
          draft.chargesExtraction ?? {
            categories: [],
            recoveredFromOtherSteps: 0,
            amortizationSuggestions: [],
            summary: {
              totalCharges: updated.amount,
              categoryCount: 0,
              recoverableTotal: updated.amount,
              nonRecoverableTotal: 0,
            },
          },
        ),
        amortizationSuggestions: chargesAmortizationDecisions,
      };

      return finalizeState({
        ...state,
        declarationDraft: {
          ...draft,
          chargesAmortizationDecisions,
          chargesExtraction,
        },
      });
    }

    case "COMPLETE_DOCUMENT_JOURNEY_STEP": {
      const draft = state.declarationDraft ?? { completedSteps: [] };
      const completed = new Set(draft.documentStepsCompleted ?? []);
      completed.add(action.stepId);
      return finalizeState({
        ...state,
        declarationDraft: {
          ...draft,
          documentStepsCompleted: [...completed],
        },
      });
    }

    case "ADD_AI_ACTIVITY_EVENT": {
      const feed = state.aiActivityFeed ?? [];
      console.log("[ai-event-dispatched]", {
        id: action.event.id,
        type: action.event.type,
        step: action.event.step,
        entityId: action.event.entityId,
        feedSizeBefore: feed.length,
      });
      return finalizeState({
        ...state,
        aiActivityFeed: [...feed, action.event],
      });
    }

    case "RESOLVE_AI_ACTIVITY_EVENT": {
      const feed = state.aiActivityFeed ?? [];
      return finalizeState({
        ...state,
        aiActivityFeed: feed.map((ev) =>
          ev.id === action.eventId
            ? { ...ev, resolutionState: action.resolutionState, resolvedAt: new Date().toISOString() }
            : ev,
        ),
      });
    }

    case "DISMISS_AI_ACTIVITY_EVENT": {
      const feed = state.aiActivityFeed ?? [];
      return finalizeState({
        ...state,
        aiActivityFeed: feed.map((ev) =>
          ev.id === action.eventId
            ? { ...ev, resolutionState: "dismissed" as const, resolvedAt: new Date().toISOString() }
            : ev,
        ),
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
    state.extractions,
    state.declarationDraft,
  );

  return {
    fiscalYear: state.fiscalYear,
    properties: state.properties,
    documents: state.documents,
    extractions: state.extractions,
    validationItems: state.validationItems,
    ledgerEntries: state.ledgerEntries.filter((e) => e.status === "active"),
    declarationDraft: state.declarationDraft ?? { completedSteps: [] },
    aiActivityFeed: state.aiActivityFeed ?? [],
    ...derived,
  };
}
