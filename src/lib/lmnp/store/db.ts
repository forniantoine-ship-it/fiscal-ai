/** IndexedDB database for LMNP offline-first persistence. */

export const LMNP_DB_NAME = "fiscal-ai-lmnp";
export const LMNP_DB_VERSION = 1;

export const STORE_META = "meta";
export const STORE_WORKSPACE = "workspace";
export const STORE_DOCUMENT_BLOBS = "document-blobs";

const WORKSPACE_KEY = "active";
const SCHEMA_META_KEY = "schema";

export const LMNP_SCHEMA_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function resetDbConnection(): void {
  dbPromise = null;
}

export function openLmnpDatabase(): Promise<IDBDatabase> {
  if (!isBrowser()) {
    return Promise.reject(new Error("IndexedDB is only available in the browser"));
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(LMNP_DB_NAME, LMNP_DB_VERSION);

      request.onerror = () => {
        resetDbConnection();
        reject(request.error ?? new Error("Failed to open LMNP database"));
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          resetDbConnection();
        };
        db.onclose = () => resetDbConnection();
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const tx = (event.target as IDBOpenDBRequest).transaction;

        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(STORE_WORKSPACE)) {
          db.createObjectStore(STORE_WORKSPACE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORE_DOCUMENT_BLOBS)) {
          db.createObjectStore(STORE_DOCUMENT_BLOBS, { keyPath: "documentId" });
        }

        if (tx) {
          const meta = tx.objectStore(STORE_META);
          meta.put({ key: SCHEMA_META_KEY, version: LMNP_SCHEMA_VERSION });
        }
      };
    });
  }

  return dbPromise;
}

function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openLmnpDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const request = run(store);

        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
        tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
      }),
  );
}

export function idbGet<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  return withStore(storeName, "readonly", (store) => store.get(key));
}

export function idbPut<T>(storeName: string, value: T): Promise<IDBValidKey> {
  return withStore(storeName, "readwrite", (store) => store.put(value));
}

export function idbDelete(storeName: string, key: IDBValidKey): Promise<void> {
  return withStore(storeName, "readwrite", (store) => store.delete(key)).then(() => undefined);
}

export function idbGetAll<T>(storeName: string): Promise<T[]> {
  return withStore(storeName, "readonly", (store) => store.getAll());
}

export interface WorkspaceRecord {
  id: typeof WORKSPACE_KEY;
  data: unknown;
  updatedAt: string;
}

export function putWorkspaceRecord(data: unknown): Promise<void> {
  const record: WorkspaceRecord = {
    id: WORKSPACE_KEY,
    data,
    updatedAt: new Date().toISOString(),
  };
  return idbPut(STORE_WORKSPACE, record).then(() => undefined);
}

export function getWorkspaceRecord(): Promise<WorkspaceRecord | undefined> {
  return idbGet<WorkspaceRecord>(STORE_WORKSPACE, WORKSPACE_KEY);
}

export interface DocumentBlobRecord {
  documentId: string;
  fiscalYearId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  blob: Blob;
}

export function putDocumentBlob(record: DocumentBlobRecord): Promise<void> {
  return idbPut(STORE_DOCUMENT_BLOBS, record).then(() => undefined);
}

export function deleteDocumentBlob(documentId: string): Promise<void> {
  return idbDelete(STORE_DOCUMENT_BLOBS, documentId);
}

export function getAllDocumentBlobs(): Promise<DocumentBlobRecord[]> {
  return idbGetAll<DocumentBlobRecord>(STORE_DOCUMENT_BLOBS);
}
