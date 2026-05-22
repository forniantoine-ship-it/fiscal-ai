import type {
  DeclarationDraft,
  Extraction,
  FiscalYear,
  LedgerEntry,
  LmnpDocument,
  Property,
  ValidationItem,
} from "../types";
import type { FileRegistry } from "./reducer";
import {
  deleteDocumentBlob,
  getAllDocumentBlobs,
  getDocumentBlob,
  getWorkspaceRecord,
  putDocumentBlob,
  putWorkspaceRecord,
  type DocumentBlobRecord,
} from "./db";

/** @deprecated Legacy localStorage key — migrated once to IndexedDB. */
const LEGACY_STORAGE_KEY = "fiscal-ai-lmnp-workspace-v1";

export interface PersistedWorkspace {
  fiscalYear: FiscalYear;
  properties: Property[];
  documents: LmnpDocument[];
  extractions: Extraction[];
  validationItems: ValidationItem[];
  ledgerEntries: LedgerEntry[];
  declarationDraft?: DeclarationDraft;
}

export interface HydratedLmnpStore {
  workspace: PersistedWorkspace | null;
  fileRegistry: FileRegistry;
}

let saveWorkspaceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingWorkspace: PersistedWorkspace | null = null;

function isValidWorkspace(data: unknown): data is PersistedWorkspace {
  if (!data || typeof data !== "object") return false;
  const w = data as PersistedWorkspace;
  return (
    Boolean(w.fiscalYear?.id) &&
    Array.isArray(w.properties) &&
    Array.isArray(w.documents) &&
    Array.isArray(w.extractions) &&
    Array.isArray(w.validationItems) &&
    Array.isArray(w.ledgerEntries)
  );
}

function loadLegacyWorkspace(): PersistedWorkspace | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isValidWorkspace(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function clearLegacyWorkspace(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

async function loadWorkspaceFromIndexedDb(): Promise<PersistedWorkspace | null> {
  const record = await getWorkspaceRecord();
  if (!record?.data || !isValidWorkspace(record.data)) return null;
  return record.data;
}

async function migrateLegacyWorkspaceIfNeeded(): Promise<PersistedWorkspace | null> {
  const fromIdb = await loadWorkspaceFromIndexedDb();
  if (fromIdb) return fromIdb;

  const legacy = loadLegacyWorkspace();
  if (!legacy) return null;

  await putWorkspaceRecord(legacy);
  clearLegacyWorkspace();
  return legacy;
}

function resolveDocumentMimeType(fileName: string, mimeType?: string): string {
  if (mimeType && mimeType !== "application/octet-stream") return mimeType;
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (/\.jpe?g$/i.test(lower)) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return mimeType || "application/octet-stream";
}

async function recordToFile(record: DocumentBlobRecord): Promise<File | null> {
  let buffer: ArrayBuffer | undefined = record.data;

  if (!buffer && record.blob) {
    try {
      buffer = await record.blob.arrayBuffer();
    } catch {
      buffer = undefined;
    }
  }

  if (!buffer || buffer.byteLength === 0) return null;

  const mimeType = resolveDocumentMimeType(record.fileName, record.mimeType);
  return new File([buffer], record.fileName, {
    type: mimeType,
    lastModified: Date.parse(record.uploadedAt) || Date.now(),
  });
}

async function loadFileRegistry(
  documents: LmnpDocument[],
): Promise<FileRegistry> {
  const registry: FileRegistry = new Map();
  const docById = new Map(documents.map((d) => [d.id, d]));
  const blobs = await getAllDocumentBlobs();

  for (const record of blobs) {
    const doc = docById.get(record.documentId);
    if (!doc) {
      void deleteDocumentBlob(record.documentId);
      continue;
    }
    const file = await recordToFile(record);
    if (!file) continue;
    registry.set(record.documentId, file);
    if (doc) {
      persistedBlobFingerprints.set(record.documentId, blobFingerprint(file, doc));
    }
  }

  return registry;
}

/** Loads a single document file from IndexedDB (lazy fallback). */
export async function loadDocumentFile(documentId: string): Promise<File | null> {
  if (typeof window === "undefined") return null;
  try {
    const record = await getDocumentBlob(documentId);
    if (!record) return null;
    return recordToFile(record);
  } catch (error) {
    console.error("[lmnp] loadDocumentFile failed", documentId, error);
    return null;
  }
}

/** Loads workspace metadata from IndexedDB (migrates legacy localStorage once). */
export async function loadWorkspace(): Promise<PersistedWorkspace | null> {
  if (typeof window === "undefined") return null;
  try {
    return await migrateLegacyWorkspaceIfNeeded();
  } catch (error) {
    console.error("[lmnp] loadWorkspace failed", error);
    return loadLegacyWorkspace();
  }
}

/** Offline-first hydration: workspace metadata + document blobs. */
export async function hydrateLmnpStore(): Promise<HydratedLmnpStore> {
  if (typeof window === "undefined") {
    return { workspace: null, fileRegistry: new Map() };
  }

  try {
    const workspace = await loadWorkspace();
    if (!workspace) return { workspace: null, fileRegistry: new Map() };

    const loaded = await loadFileRegistry(workspace.documents);
    const fileRegistry = await ensureDocumentFilesLoaded(workspace.documents, loaded);
    return { workspace, fileRegistry };
  } catch (error) {
    console.error("[lmnp] IndexedDB hydration failed, using defaults", error);
    const legacy = loadLegacyWorkspace();
    return { workspace: legacy, fileRegistry: new Map() };
  }
}

export async function saveWorkspace(data: PersistedWorkspace): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await putWorkspaceRecord(data);
  } catch (error) {
    console.error("[lmnp] Failed to persist workspace", error);
  }
}

/** Debounced workspace write — keeps UI instant while batching disk I/O. */
export function scheduleSaveWorkspace(data: PersistedWorkspace): void {
  pendingWorkspace = data;
  if (saveWorkspaceTimer) clearTimeout(saveWorkspaceTimer);
  saveWorkspaceTimer = setTimeout(() => {
    saveWorkspaceTimer = null;
    const snapshot = pendingWorkspace;
    pendingWorkspace = null;
    if (snapshot) void saveWorkspace(snapshot);
  }, 350);
}

/** Flush pending workspace write (tab close / hide). */
export async function flushWorkspaceSave(): Promise<void> {
  if (saveWorkspaceTimer) {
    clearTimeout(saveWorkspaceTimer);
    saveWorkspaceTimer = null;
  }
  if (pendingWorkspace) {
    const snapshot = pendingWorkspace;
    pendingWorkspace = null;
    await saveWorkspace(snapshot);
  }
}

export async function persistDocumentFile(
  document: LmnpDocument,
  file: File,
): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const data = await file.arrayBuffer();
    const mimeType = resolveDocumentMimeType(document.fileName, file.type || document.mimeType);
    await putDocumentBlob({
      documentId: document.id,
      fiscalYearId: document.fiscalYearId,
      fileName: document.fileName,
      mimeType,
      sizeBytes: data.byteLength,
      uploadedAt: document.uploadedAt,
      data,
    });
  } catch (error) {
    console.error("[lmnp] Failed to persist document blob", document.id, error);
  }
}

export async function removePersistedDocument(documentId: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await deleteDocumentBlob(documentId);
  } catch (error) {
    console.error("[lmnp] Failed to delete document blob", documentId, error);
  }
}

const blobSyncInFlight = new Set<string>();
const persistedBlobFingerprints = new Map<string, string>();

function blobFingerprint(file: File, doc: LmnpDocument): string {
  return `${doc.id}:${file.size}:${file.name}:${doc.uploadedAt}`;
}

/** Sync in-memory files to IndexedDB (uploads / re-hydration safety). */
export async function syncDocumentBlobs(
  documents: LmnpDocument[],
  fileRegistry: FileRegistry,
): Promise<void> {
  if (typeof window === "undefined") return;

  const activeIds = new Set(documents.map((d) => d.id));
  const docById = new Map(documents.map((d) => [d.id, d]));

  for (const documentId of activeIds) {
    const file = fileRegistry.get(documentId);
    const doc = docById.get(documentId);
    if (!file || !doc || blobSyncInFlight.has(documentId)) continue;

    const fingerprint = blobFingerprint(file, doc);
    if (persistedBlobFingerprints.get(documentId) === fingerprint) continue;

    blobSyncInFlight.add(documentId);
    try {
      await persistDocumentFile(doc, file);
      persistedBlobFingerprints.set(documentId, fingerprint);
    } finally {
      blobSyncInFlight.delete(documentId);
    }
  }

  for (const id of [...persistedBlobFingerprints.keys()]) {
    if (!activeIds.has(id)) persistedBlobFingerprints.delete(id);
  }

  try {
    const stored = await getAllDocumentBlobs();
    await Promise.all(
      stored
        .filter((r) => !activeIds.has(r.documentId))
        .map((r) => deleteDocumentBlob(r.documentId)),
    );
  } catch (error) {
    console.error("[lmnp] Failed to prune orphan document blobs", error);
  }
}

/** Ensures every known document has its file in memory (post-hydration). */
export async function ensureDocumentFilesLoaded(
  documents: LmnpDocument[],
  fileRegistry: FileRegistry,
): Promise<FileRegistry> {
  const next = new Map(fileRegistry);

  await Promise.all(
    documents.map(async (doc) => {
      if (next.has(doc.id)) return;
      const file = await loadDocumentFile(doc.id);
      if (file) next.set(doc.id, file);
    }),
  );

  return next;
}

export function createDefaultWorkspace(): PersistedWorkspace {
  const now = new Date().toISOString();
  const propertyId = crypto.randomUUID();
  const fiscalYearId = crypto.randomUUID();

  return {
    fiscalYear: {
      id: fiscalYearId,
      year: new Date().getFullYear(),
      status: "draft",
      regime: "reel",
      propertyIds: [propertyId],
      createdAt: now,
      updatedAt: now,
    },
    properties: [
      {
        id: propertyId,
        label: "Mon bien locatif",
        address: "",
        city: "",
        postalCode: "",
      },
    ],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: { completedSteps: [] },
  };
}
