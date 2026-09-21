/**
 * Lot 3 — store contract for atomic N→N+1 commit.
 * In-memory for tests; Supabase RPC for production.
 */
export type TransitionSnapshotRow = {
  dossierId: string;
  fiscalYear: number;
  schemaVersion: number;
  revision: number;
  payload: unknown;
  closedAt: string | null;
  successorFiscalYear: number | null;
  updatedAt: string;
};

export type TransitionDossierRow = {
  id: string;
  userId: string;
  activeFiscalYear: number | null;
};

export type TransitionCommitInput = {
  dossierId: string;
  userId: string;
  fromYear: number;
  expectedRevision: number;
  closedNPayload: unknown;
  closedNSchemaVersion: number;
  nextYear: number;
  nextPayload: unknown;
  nextSchemaVersion: number;
  now: string;
};

export type TransitionCommitResult =
  | {
      status: "committed" | "idempotent";
      fromYear: number;
      nextYear: number;
      closedRevision: number;
      nextRevision: number;
      closedAt: string;
      activeFiscalYear: number;
      nextPayload: unknown;
      nextSchemaVersion: number;
    };

export type TransitionCommitErrorCode =
  | "dossier_not_found"
  | "not_owner"
  | "source_missing"
  | "invalid_years"
  | "invalid_revision"
  | "invalid_payload"
  | "invalid_schema"
  | "revision_conflict"
  | "closed_without_successor"
  | "successor_missing"
  | "successor_insert_failed"
  | "snapshot_closed";

export class TransitionCommitError extends Error {
  readonly code: TransitionCommitErrorCode;
  constructor(code: TransitionCommitErrorCode, message?: string) {
    super(message ?? code);
    this.name = "TransitionCommitError";
    this.code = code;
  }
}

export type FiscalYearTransitionStore = {
  /**
   * Runs `fn` under an exclusive lock for the dossier (serializes concurrent
   * transitions). Implementations must provide true mutual exclusion.
   */
  withDossierLock<T>(dossierId: string, fn: () => Promise<T>): Promise<T>;
  getDossier(dossierId: string): Promise<TransitionDossierRow | null>;
  getSnapshot(dossierId: string, fiscalYear: number): Promise<TransitionSnapshotRow | null>;
  updateSnapshot(row: TransitionSnapshotRow): Promise<void>;
  insertSnapshot(row: TransitionSnapshotRow): Promise<"inserted" | "exists">;
  /**
   * Advances active fiscal year monotonically (never regresses).
   * Returns the active year after the write.
   */
  setActiveFiscalYear(dossierId: string, fiscalYear: number): Promise<number>;
};
