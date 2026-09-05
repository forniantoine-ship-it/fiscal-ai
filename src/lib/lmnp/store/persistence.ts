import type {
  DeclarationDraft,
  Extraction,
  FiscalYear,
  LedgerEntry,
  LmnpDocument,
  Property,
  ValidationItem,
} from "../types";
import type { AiActivityEvent } from "../types/ai-activity";
import type { FileRegistry } from "./reducer";
import { getBoundAuthUserId } from "@/lib/lmnp/auth/auth-boundary";
import {
  msSinceCreditRenderUnblockAnchor,
  traceCreditRenderUnblock,
} from "@/lib/lmnp/services/credit-render-unblock-trace";
import {
  deleteDocumentBlob,
  deleteWorkspaceRecord,
  getAllDocumentBlobs,
  getDocumentBlob,
  getLegacyWorkspaceRecord,
  getWorkspaceRecord,
  putDocumentBlob,
  putWorkspaceRecord,
  type DocumentBlobRecord,
} from "./db";
import {
  isRegressiveWorkspaceWrite,
  isStaleFiscalYearIdentityWrite,
  resolveFlushSnapshot,
} from "./workspace-flush-guard";
import {
  __testResetSerializedWorkspaceWrites,
  isStaleWorkspaceWrite,
  runSerializedWorkspaceWrite,
} from "./workspace-save-serializer";
import type { AutosaveStatus } from "./workspace-autosave-display";
export type { AutosaveDisplay, AutosaveStatus } from "./workspace-autosave-display";
export { resolveAutosaveDisplay } from "./workspace-autosave-display";

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
  /** Persistent AI Activity Feed — business narrative layer for the dossier. */
  aiActivityFeed?: AiActivityEvent[];
}

export interface HydratedLmnpStore {
  workspace: PersistedWorkspace | null;
  fileRegistry: FileRegistry;
}

let saveWorkspaceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingWorkspace: { userId: string; data: PersistedWorkspace } | null = null;

let autosaveStatus: AutosaveStatus = "idle";
const autosaveListeners = new Set<(status: AutosaveStatus) => void>();

function notifyAutosaveStatus(status: AutosaveStatus) {
  autosaveStatus = status;
  autosaveListeners.forEach((listener) => listener(status));
}

export function subscribeAutosaveStatus(listener: (status: AutosaveStatus) => void): () => void {
  autosaveListeners.add(listener);
  listener(autosaveStatus);
  return () => autosaveListeners.delete(listener);
}

export function markAutosaveSaved() {
  notifyAutosaveStatus("saved");
}

export function resetAutosaveStatus() {
  notifyAutosaveStatus("idle");
}

/** Resets in-memory save queue state (tests only). */
export function __testResetWorkspaceSaveChain(): void {
  __testResetSerializedWorkspaceWrites();
  if (saveWorkspaceTimer) {
    clearTimeout(saveWorkspaceTimer);
    saveWorkspaceTimer = null;
  }
  pendingWorkspace = null;
}

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

async function loadWorkspaceFromIndexedDb(userId: string): Promise<PersistedWorkspace | null> {
  const record = await getWorkspaceRecord(userId);
  if (!record?.data || !isValidWorkspace(record.data)) return null;
  return record.data;
}

async function migrateLegacyWorkspaceIfNeeded(userId: string): Promise<PersistedWorkspace | null> {
  const fromIdb = await loadWorkspaceFromIndexedDb(userId);
  if (fromIdb) return fromIdb;

  const legacyRecord = await getLegacyWorkspaceRecord();
  if (legacyRecord?.data && isValidWorkspace(legacyRecord.data)) {
    await putWorkspaceRecord(userId, legacyRecord.data);
    await deleteWorkspaceRecord("active");
    clearLegacyWorkspace();
    return legacyRecord.data;
  }

  const legacy = loadLegacyWorkspace();
  if (!legacy) return null;

  await putWorkspaceRecord(userId, legacy);
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
  userId: string,
): Promise<FileRegistry> {
  const registry: FileRegistry = new Map();
  const docById = new Map(documents.map((d) => [d.id, d]));
  const blobs = await getAllDocumentBlobs();

  for (const record of blobs) {
    if (record.userId && record.userId !== userId) {
      continue;
    }

    const doc = docById.get(record.documentId);
    if (!doc) {
      if (!record.userId || record.userId === userId) {
        void deleteDocumentBlob(record.documentId);
      }
      continue;
    }

    const file = await recordToFile(record);
    if (!file) continue;
    registry.set(record.documentId, file);
    persistedBlobFingerprints.set(record.documentId, blobFingerprint(file, doc));
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
export async function loadWorkspace(userId: string): Promise<PersistedWorkspace | null> {
  if (typeof window === "undefined") return null;
  try {
    return await migrateLegacyWorkspaceIfNeeded(userId);
  } catch (error) {
    console.error("[lmnp] loadWorkspace failed", { userId, error });
    return loadLegacyWorkspace();
  }
}

/** Offline-first hydration: workspace metadata + document blobs for one auth user. */
export async function hydrateLmnpStore(userId: string | null): Promise<HydratedLmnpStore> {
  if (typeof window === "undefined") {
    return { workspace: null, fileRegistry: new Map() };
  }

  if (!userId) {
    return { workspace: null, fileRegistry: new Map() };
  }

  try {
    const workspace = await loadWorkspace(userId);
    if (!workspace) return { workspace: null, fileRegistry: new Map() };

    const loaded = await loadFileRegistry(workspace.documents, userId);
    const fileRegistry = await ensureDocumentFilesLoaded(workspace.documents, loaded);
    return { workspace, fileRegistry };
  } catch (error) {
    console.error("[lmnp] IndexedDB hydration failed, using defaults", { userId, error });
    return { workspace: null, fileRegistry: new Map() };
  }
}

async function writeWorkspaceToDisk(
  userId: string,
  data: PersistedWorkspace,
  generation: number,
): Promise<void> {
  if (typeof window === "undefined") return;
  if (isStaleWorkspaceWrite(generation)) return;
  try {
    const existing = await getWorkspaceRecord(userId);
    if (isStaleWorkspaceWrite(generation)) return;
    const existingData =
      existing?.data && isValidWorkspace(existing.data) ? existing.data : null;
    if (existingData && isRegressiveWorkspaceWrite(data, existingData)) {
      console.warn("[lmnp] skipped regressive workspace write", { userId });
      return;
    }
    // P0 FINAL GATE (workspace debounce vs clôture N → N+1) — protection
    // complémentaire, pas un remplacement de isRegressiveWorkspaceWrite : celle-ci
    // protège deux timestamps de parcours sur un MÊME exercice, celle-ci protège
    // l'identité de l'exercice lui-même (une écriture stale de N alors que le
    // disque porte déjà N+1).
    if (existingData && isStaleFiscalYearIdentityWrite(data, existingData)) {
      console.warn("[lmnp] skipped stale fiscal year identity write", { userId });
      return;
    }
    if (isStaleWorkspaceWrite(generation)) return;
    await putWorkspaceRecord(userId, data);
    if (isStaleWorkspaceWrite(generation)) return;
    console.log("[ai-event-persisted]", {
      feedSize: data.aiActivityFeed?.length ?? 0,
      eventIds: data.aiActivityFeed?.map((e) => e.id) ?? [],
    });
    notifyAutosaveStatus("saved");
  } catch (error) {
    if (isStaleWorkspaceWrite(generation)) return;
    console.error("[lmnp] Failed to persist workspace", { userId, error });
    notifyAutosaveStatus("error");
  }
}

/** Serialized workspace write — newer snapshots cannot be overwritten by slower older writes. */
export async function saveWorkspace(userId: string, data: PersistedWorkspace): Promise<void> {
  if (typeof window === "undefined") return;
  await runSerializedWorkspaceWrite(async (generation) => {
    await writeWorkspaceToDisk(userId, data, generation);
  });
}

/** Debounced workspace write — keeps UI instant while batching disk I/O. */
export function scheduleSaveWorkspace(data: PersistedWorkspace, userId: string | null): void {
  if (!userId) return;

  const msSinceAnchor = msSinceCreditRenderUnblockAnchor();
  if (msSinceAnchor != null) {
    traceCreditRenderUnblock("scheduleSaveWorkspace_called", {
      debounceMs: 350,
      feedSize: data.aiActivityFeed?.length ?? 0,
    });
  }

  pendingWorkspace = { userId, data };
  notifyAutosaveStatus("saving");
  if (saveWorkspaceTimer) clearTimeout(saveWorkspaceTimer);
  saveWorkspaceTimer = setTimeout(() => {
    saveWorkspaceTimer = null;
    const snapshot = pendingWorkspace;
    pendingWorkspace = null;
    if (snapshot) {
      const saveStartedAt = performance.now();
      if (msSinceCreditRenderUnblockAnchor() != null) {
        traceCreditRenderUnblock("saveWorkspace_started", {
          msSinceDebounceScheduled: msSinceAnchor,
        });
      }
      void saveWorkspace(snapshot.userId, snapshot.data).then(() => {
        if (msSinceCreditRenderUnblockAnchor() != null) {
          traceCreditRenderUnblock("saveWorkspace_finished", {
            saveDurationMs: Math.round((performance.now() - saveStartedAt) * 100) / 100,
          });
        }
      });
    }
  }, 350);
}

/** Flush pending workspace write (tab close / hide / auth switch). */
export async function flushWorkspaceSave(
  userId: string | null,
  data?: PersistedWorkspace,
): Promise<void> {
  if (saveWorkspaceTimer) {
    clearTimeout(saveWorkspaceTimer);
    saveWorkspaceTimer = null;
  }

  const snapshot = resolveFlushSnapshot(pendingWorkspace, userId, data);
  pendingWorkspace = null;
  if (snapshot) {
    await saveWorkspace(snapshot.userId, snapshot.data);
  }
}

export async function persistDocumentFile(
  document: LmnpDocument,
  file: File,
  userId?: string | null,
): Promise<void> {
  if (typeof window === "undefined") return;
  const ownerUserId = userId ?? getBoundAuthUserId();
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
      userId: ownerUserId ?? undefined,
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
  userId?: string | null,
): Promise<void> {
  if (typeof window === "undefined") return;

  const ownerUserId = userId ?? getBoundAuthUserId();
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
      await persistDocumentFile(doc, file, ownerUserId);
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
        .filter((record) => {
          if (ownerUserId && record.userId && record.userId !== ownerUserId) {
            return false;
          }
          return !activeIds.has(record.documentId);
        })
        .map((record) => deleteDocumentBlob(record.documentId)),
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
