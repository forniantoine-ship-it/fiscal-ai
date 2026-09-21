/**
 * Lot 3 — in-memory transition store for concurrency / idempotency tests.
 */
import type {
  FiscalYearTransitionStore,
  TransitionDossierRow,
  TransitionSnapshotRow,
} from "./types";
import { TransitionCommitError } from "./types";
import { assertSnapshotWritableForAutosave } from "./commit-transition";

export function createInMemoryFiscalYearTransitionStore(seed?: {
  dossiers?: TransitionDossierRow[];
  snapshots?: TransitionSnapshotRow[];
}): FiscalYearTransitionStore & {
  dossiers: Map<string, TransitionDossierRow>;
  snapshots: Map<string, TransitionSnapshotRow>;
} {
  const dossiers = new Map<string, TransitionDossierRow>(
    (seed?.dossiers ?? []).map((d) => [d.id, { ...d }]),
  );
  const snapshots = new Map<string, TransitionSnapshotRow>(
    (seed?.snapshots ?? []).map((s) => [`${s.dossierId}:${s.fiscalYear}`, { ...s }]),
  );
  const locks = new Map<string, Promise<void>>();

  function key(dossierId: string, fiscalYear: number): string {
    return `${dossierId}:${fiscalYear}`;
  }

  const store: FiscalYearTransitionStore & {
    dossiers: Map<string, TransitionDossierRow>;
    snapshots: Map<string, TransitionSnapshotRow>;
  } = {
    dossiers,
    snapshots,
    async withDossierLock<T>(dossierId: string, fn: () => Promise<T>): Promise<T> {
      const prev = locks.get(dossierId) ?? Promise.resolve();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      locks.set(
        dossierId,
        prev.then(() => gate),
      );
      await prev;
      try {
        return await fn();
      } finally {
        release();
      }
    },
    async getDossier(dossierId) {
      const row = dossiers.get(dossierId);
      return row ? { ...row } : null;
    },
    async getSnapshot(dossierId, fiscalYear) {
      const row = snapshots.get(key(dossierId, fiscalYear));
      return row ? { ...row } : null;
    },
    async updateSnapshot(row) {
      const existing = snapshots.get(key(row.dossierId, row.fiscalYear));
      if (!existing) throw new TransitionCommitError("source_missing");
      if (existing.closedAt != null) {
        // Mirror SQL trigger immutability for closed rows.
        if (
          row.closedAt == null ||
          row.payload !== existing.payload ||
          row.revision !== existing.revision ||
          row.successorFiscalYear !== existing.successorFiscalYear
        ) {
          // Allow the closing write (existing.closedAt null) only — already handled.
          throw new TransitionCommitError("snapshot_closed");
        }
      }
      snapshots.set(key(row.dossierId, row.fiscalYear), { ...row });
    },
    async insertSnapshot(row) {
      const k = key(row.dossierId, row.fiscalYear);
      if (snapshots.has(k)) return "exists";
      snapshots.set(k, { ...row });
      return "inserted";
    },
    async setActiveFiscalYear(dossierId, fiscalYear) {
      const dossier = dossiers.get(dossierId);
      if (!dossier) throw new TransitionCommitError("dossier_not_found");
      // N2 — monotonic: never regress below an already-advanced active year.
      const next = Math.max(dossier.activeFiscalYear ?? fiscalYear, fiscalYear);
      dossiers.set(dossierId, { ...dossier, activeFiscalYear: next });
      return next;
    },
  };

  return store;
}

/** Simulates authenticated client autosave against closed protection. */
export function tryAutosaveSnapshot(
  store: ReturnType<typeof createInMemoryFiscalYearTransitionStore>,
  input: { dossierId: string; fiscalYear: number; payload: unknown; now: string },
): { status: "ok"; revision: number } | { status: "rejected"; code: string } {
  const row = store.snapshots.get(`${input.dossierId}:${input.fiscalYear}`);
  try {
    assertSnapshotWritableForAutosave(row ?? null);
  } catch (error) {
    if (error instanceof TransitionCommitError) {
      return { status: "rejected", code: error.code };
    }
    throw error;
  }
  if (!row) {
    store.snapshots.set(`${input.dossierId}:${input.fiscalYear}`, {
      dossierId: input.dossierId,
      fiscalYear: input.fiscalYear,
      schemaVersion: 1,
      revision: 1,
      payload: input.payload,
      closedAt: null,
      successorFiscalYear: null,
      updatedAt: input.now,
    });
    return { status: "ok", revision: 1 };
  }
  const next = { ...row, payload: input.payload, revision: row.revision + 1, updatedAt: input.now };
  store.snapshots.set(`${input.dossierId}:${input.fiscalYear}`, next);
  return { status: "ok", revision: next.revision };
}
