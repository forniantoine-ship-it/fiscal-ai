/** IndexedDB database for LMNP offline-first persistence. */

export const LMNP_DB_NAME = "fiscal-ai-lmnp";
/**
 * P3-SOCLE-CYCLE-FISCAL — P0-1 — v2 ajoute les stores `dossier`/`fiscalYears`
 * (cycle fiscal pluriannuel) sans toucher aux stores v1 existants
 * (`meta`/`workspace`/`document-blobs`), qui restent lus tels quels tant que
 * la migration (`dossier-db.ts`) n'a pas encore traité un utilisateur donné.
 */
export const LMNP_DB_VERSION = 2;

export const STORE_META = "meta";
export const STORE_WORKSPACE = "workspace";
export const STORE_DOCUMENT_BLOBS = "document-blobs";
export const STORE_DOSSIER = "dossier";
export const STORE_FISCAL_YEARS = "fiscalYears";
const INDEX_FISCAL_YEARS_DOSSIER_ID = "dossierId";

const LEGACY_WORKSPACE_KEY = "active";
const SCHEMA_META_KEY = "schema";

export function workspaceKeyForUser(userId: string): string {
  return `user:${userId}`;
}

export type WorkspaceScope = { userId: string; dossierId: string; fiscalYear: number };

export function workspaceKeyForScope(scope: WorkspaceScope): string {
  if (!scope.userId || !scope.dossierId || !Number.isInteger(scope.fiscalYear)) {
    throw new Error("Invalid workspace scope");
  }
  return `user:${scope.userId}:dossier:${scope.dossierId}:year:${scope.fiscalYear}`;
}

/**
 * P3-SOCLE-CYCLE-FISCAL — P0-1 — version applicative tenue en cohérence avec
 * LMNP_DB_VERSION : ce numéro monte exactement quand une migration
 * structurelle réelle a eu lieu (jamais un simple bump isolé).
 */
export const LMNP_SCHEMA_VERSION = 2;

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
        if (!db.objectStoreNames.contains(STORE_DOSSIER)) {
          db.createObjectStore(STORE_DOSSIER, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORE_FISCAL_YEARS)) {
          const fiscalYears = db.createObjectStore(STORE_FISCAL_YEARS, { keyPath: "id" });
          fiscalYears.createIndex(INDEX_FISCAL_YEARS_DOSSIER_ID, "dossierId", { unique: false });
        } else if (tx) {
          // Montée de version ultérieure sans recréation de store : l'index
          // n'existe que s'il a été créé à la création du store — vérifié
          // explicitement plutôt que supposé.
          const fiscalYears = tx.objectStore(STORE_FISCAL_YEARS);
          if (!fiscalYears.indexNames.contains(INDEX_FISCAL_YEARS_DOSSIER_ID)) {
            fiscalYears.createIndex(INDEX_FISCAL_YEARS_DOSSIER_ID, "dossierId", { unique: false });
          }
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
        let result: T;

        request.onsuccess = () => {
          result = request.result as T;
        };
        request.onerror = () =>
          reject(request.error ?? new Error("IndexedDB request failed"));

        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
        tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
      }),
  );
}

/**
 * P3-SOCLE-CYCLE-FISCAL — P0-1 — transaction atomique couvrant plusieurs
 * object stores dans UNE seule transaction IndexedDB (tout ou rien). Requis
 * dès qu'une opération doit écrire de façon cohérente sur `dossier` ET
 * `fiscalYears` (ex. création de N+1) — deux `idbPut()` séquentiels sur des
 * transactions indépendantes ne garantiraient pas cette cohérence en cas
 * d'interruption entre les deux (Mini-audit technique final §2).
 *
 * `run` reçoit aussi la transaction brute (`tx`) — nécessaire pour chaîner un
 * `get()` puis un `put()` conditionnel DANS la même transaction (relecture
 * anti-concurrence, P0 FINAL GATE — clôture N → N+1) et pour appeler
 * `tx.abort()` explicitement si cette relecture révèle qu'une autre
 * transaction a déjà écrit un état plus avancé. Paramètre optionnel côté
 * appelant : les usages existants qui n'en ont pas besoin restent inchangés.
 */
export function withStores(
  storeNames: string[],
  mode: IDBTransactionMode,
  run: (stores: Record<string, IDBObjectStore>, tx: IDBTransaction) => void,
): Promise<void> {
  return openLmnpDatabase().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeNames, mode);
        const stores: Record<string, IDBObjectStore> = {};
        for (const name of storeNames) stores[name] = tx.objectStore(name);

        try {
          run(stores, tx);
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
          return;
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
        tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
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
  id: string;
  data: unknown;
  updatedAt: string;
  /**
   * Last server `revision` this local cache was hydrated from or saved as.
   * Absent on legacy IndexedDB rows. Local mutations must preserve this field;
   * only a successful server save (or a server-winning hydrate) updates it.
   */
  lastSyncedServerRevision?: number;
}

export function putWorkspaceRecord(
  userId: string,
  data: unknown,
  options?: { lastSyncedServerRevision?: number },
): Promise<void> {
  const write = (lastSyncedServerRevision: number | undefined) => {
    const record: WorkspaceRecord = {
      id: workspaceKeyForUser(userId),
      data,
      updatedAt: new Date().toISOString(),
      ...(lastSyncedServerRevision != null ? { lastSyncedServerRevision } : {}),
    };
    return idbPut(STORE_WORKSPACE, record).then(() => undefined);
  };
  if (options && "lastSyncedServerRevision" in options) {
    return write(options.lastSyncedServerRevision);
  }
  return getWorkspaceRecord(userId).then((existing) => write(existing?.lastSyncedServerRevision));
}

/** Stamp sync metadata without rewriting workspace payload. */
export function stampLocalWorkspaceSyncedRevision(
  userId: string,
  revision: number,
): Promise<void> {
  return getWorkspaceRecord(userId).then((existing) => {
    if (!existing) return;
    const record: WorkspaceRecord = {
      ...existing,
      lastSyncedServerRevision: revision,
      updatedAt: new Date().toISOString(),
    };
    return idbPut(STORE_WORKSPACE, record).then(() => undefined);
  });
}

export function getWorkspaceRecord(userId: string): Promise<WorkspaceRecord | undefined> {
  return idbGet<WorkspaceRecord>(STORE_WORKSPACE, workspaceKeyForUser(userId));
}

function workspaceMatchesScope(data: unknown, scope: WorkspaceScope): boolean {
  if (!data || typeof data !== "object") return false;
  const fiscalYear = (data as { fiscalYear?: { dossierId?: unknown; year?: unknown } }).fiscalYear;
  return fiscalYear?.dossierId === scope.dossierId && fiscalYear.year === scope.fiscalYear;
}

/** Keep the user-only row untouched. Copy it only if its embedded identity proves the scope. */
export async function peekScopedWorkspaceRecord(scope: WorkspaceScope): Promise<WorkspaceRecord | undefined> {
  const id = workspaceKeyForScope(scope);
  const existing = await idbGet<WorkspaceRecord>(STORE_WORKSPACE, id);
  if (existing) return workspaceMatchesScope(existing.data, scope) ? existing : undefined;
  const legacy = await getWorkspaceRecord(scope.userId);
  if (!legacy || !workspaceMatchesScope(legacy.data, scope)) return undefined;
  return { ...legacy, id };
}

export async function getScopedWorkspaceRecord(scope: WorkspaceScope): Promise<WorkspaceRecord | undefined> {
  const record = await peekScopedWorkspaceRecord(scope);
  if (!record) return undefined;
  const id = workspaceKeyForScope(scope);
  const current = await idbGet<WorkspaceRecord>(STORE_WORKSPACE, id);
  if (current) return workspaceMatchesScope(current.data, scope) ? current : undefined;
  await withStores([STORE_WORKSPACE], "readwrite", (stores) => {
    const store = stores[STORE_WORKSPACE];
    const request = store.get(id);
    request.onsuccess = () => {
      if (!request.result) store.put(record);
    };
  });
  return (await idbGet<WorkspaceRecord>(STORE_WORKSPACE, id)) ?? record;
}

export async function listScopedWorkspaceRecords(userId: string, dossierId: string): Promise<WorkspaceRecord[]> {
  const prefix = `user:${userId}:dossier:${dossierId}:year:`;
  const records = await idbGetAll<WorkspaceRecord>(STORE_WORKSPACE);
  return records.filter(record => record.id.startsWith(prefix) &&
    workspaceMatchesScope(record.data, { userId, dossierId, fiscalYear: Number(record.id.slice(prefix.length)) }));
}

export async function putScopedWorkspaceRecord(
  scope: WorkspaceScope,
  data: unknown,
  options?: { lastSyncedServerRevision?: number },
): Promise<void> {
  if (!workspaceMatchesScope(data, scope)) throw new Error("Workspace scope mismatch");
  const existing = options && "lastSyncedServerRevision" in options
    ? undefined : await getScopedWorkspaceRecord(scope);
  const revision = options && "lastSyncedServerRevision" in options
    ? options.lastSyncedServerRevision : existing?.lastSyncedServerRevision;
  await idbPut(STORE_WORKSPACE, {
    id: workspaceKeyForScope(scope), data, updatedAt: new Date().toISOString(),
    ...(revision != null ? { lastSyncedServerRevision: revision } : {}),
  } satisfies WorkspaceRecord);
}

export async function stampScopedWorkspaceSyncedRevision(scope: WorkspaceScope, revision: number): Promise<void> {
  const existing = await getScopedWorkspaceRecord(scope);
  if (!existing) return;
  await idbPut(STORE_WORKSPACE, {
    ...existing, lastSyncedServerRevision: revision, updatedAt: new Date().toISOString(),
  } satisfies WorkspaceRecord);
}

export function getLegacyWorkspaceRecord(): Promise<WorkspaceRecord | undefined> {
  return idbGet<WorkspaceRecord>(STORE_WORKSPACE, LEGACY_WORKSPACE_KEY);
}

export function deleteWorkspaceRecord(id: string): Promise<void> {
  return idbDelete(STORE_WORKSPACE, id);
}

export interface DocumentBlobRecord {
  documentId: string;
  fiscalYearId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  userId?: string;
  /** Binary payload (preferred). */
  data?: ArrayBuffer;
  /** Legacy records written before ArrayBuffer storage. */
  blob?: Blob;
}

export function getDocumentBlob(documentId: string): Promise<DocumentBlobRecord | undefined> {
  return idbGet<DocumentBlobRecord>(STORE_DOCUMENT_BLOBS, documentId);
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

// ---------------------------------------------------------------------------
// P3-SOCLE-CYCLE-FISCAL — P0-1 — Dossier / FiscalYear (cycle pluriannuel).
// ---------------------------------------------------------------------------

export function getDossierRecord<T>(dossierId: string): Promise<T | undefined> {
  return idbGet<T>(STORE_DOSSIER, dossierId);
}

export function putDossierRecord<T extends { id: string }>(record: T): Promise<void> {
  return idbPut(STORE_DOSSIER, record).then(() => undefined);
}

export function getFiscalYearRecord<T>(fiscalYearId: string): Promise<T | undefined> {
  return idbGet<T>(STORE_FISCAL_YEARS, fiscalYearId);
}

export function putFiscalYearRecord<T extends { id: string }>(record: T): Promise<void> {
  return idbPut(STORE_FISCAL_YEARS, record).then(() => undefined);
}

/** Utilise l'index `dossierId` — jamais un scan complet du store. */
export function listFiscalYearsForDossier<T>(dossierId: string): Promise<T[]> {
  return openLmnpDatabase().then(
    (db) =>
      new Promise<T[]>((resolve, reject) => {
        const tx = db.transaction(STORE_FISCAL_YEARS, "readonly");
        const index = tx.objectStore(STORE_FISCAL_YEARS).index(INDEX_FISCAL_YEARS_DOSSIER_ID);
        const request = index.getAll(dossierId);
        let result: T[] = [];

        request.onsuccess = () => {
          result = request.result as T[];
        };
        request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));

        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
        tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
      }),
  );
}
