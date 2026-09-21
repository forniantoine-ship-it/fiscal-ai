/**
 * Lot 3 — atomic N→N+1 commit (DB invariants). Fiscal content is prepared in TS.
 *
 * Mirrors `lmnp_commit_fiscal_year_transition` SQL semantics so unit tests can
 * prove idempotency / concurrency without a live Postgres.
 */
import {
  TransitionCommitError,
  type FiscalYearTransitionStore,
  type TransitionCommitInput,
  type TransitionCommitResult,
  type TransitionSnapshotRow,
} from "./types";

function assertValidInput(input: TransitionCommitInput): void {
  const {
    fromYear,
    nextYear,
    expectedRevision,
    closedNPayload,
    nextPayload,
    closedNSchemaVersion,
    nextSchemaVersion,
  } = input;
  if (
    !Number.isInteger(fromYear) ||
    !Number.isInteger(nextYear) ||
    fromYear < 2000 ||
    fromYear > 2100 ||
    nextYear < 2000 ||
    nextYear > 2100 ||
    nextYear !== fromYear + 1
  ) {
    throw new TransitionCommitError("invalid_years");
  }
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
    throw new TransitionCommitError("invalid_revision");
  }
  if (closedNPayload == null || nextPayload == null) {
    throw new TransitionCommitError("invalid_payload");
  }
  if (
    !Number.isInteger(closedNSchemaVersion) ||
    closedNSchemaVersion < 1 ||
    !Number.isInteger(nextSchemaVersion) ||
    nextSchemaVersion < 1
  ) {
    throw new TransitionCommitError("invalid_schema");
  }
}

export async function commitFiscalYearTransition(
  store: FiscalYearTransitionStore,
  input: TransitionCommitInput,
): Promise<TransitionCommitResult> {
  assertValidInput(input);

  return store.withDossierLock(input.dossierId, async () => {
    const dossier = await store.getDossier(input.dossierId);
    if (!dossier) throw new TransitionCommitError("dossier_not_found");
    if (dossier.userId !== input.userId) throw new TransitionCommitError("not_owner");

    const source = await store.getSnapshot(input.dossierId, input.fromYear);
    if (!source) throw new TransitionCommitError("source_missing");

    if (source.closedAt != null) {
      if (
        source.successorFiscalYear == null ||
        source.successorFiscalYear !== input.nextYear
      ) {
        throw new TransitionCommitError("closed_without_successor");
      }
      const existingNext = await store.getSnapshot(input.dossierId, source.successorFiscalYear);
      if (!existingNext) throw new TransitionCommitError("successor_missing");
      // N2 — never regress active year on stale idempotent retry.
      const activeFiscalYear = await store.setActiveFiscalYear(
        input.dossierId,
        source.successorFiscalYear,
      );
      return {
        status: "idempotent",
        fromYear: input.fromYear,
        nextYear: source.successorFiscalYear,
        closedRevision: source.revision,
        nextRevision: existingNext.revision,
        closedAt: source.closedAt,
        activeFiscalYear,
        nextPayload: existingNext.payload,
        nextSchemaVersion: existingNext.schemaVersion,
      };
    }

    if (source.revision !== input.expectedRevision) {
      throw new TransitionCommitError("revision_conflict");
    }

    const closedRevision = source.revision + 1;
    const closedRow: TransitionSnapshotRow = {
      ...source,
      payload: input.closedNPayload,
      schemaVersion: input.closedNSchemaVersion,
      revision: closedRevision,
      closedAt: input.now,
      successorFiscalYear: input.nextYear,
      updatedAt: input.now,
    };
    await store.updateSnapshot(closedRow);

    const nextCandidate: TransitionSnapshotRow = {
      dossierId: input.dossierId,
      fiscalYear: input.nextYear,
      schemaVersion: input.nextSchemaVersion,
      revision: 1,
      payload: input.nextPayload,
      closedAt: null,
      successorFiscalYear: null,
      updatedAt: input.now,
    };
    const insertResult = await store.insertSnapshot(nextCandidate);
    const nextRow =
      insertResult === "inserted"
        ? nextCandidate
        : await store.getSnapshot(input.dossierId, input.nextYear);
    if (!nextRow) throw new TransitionCommitError("successor_insert_failed");

    const activeFiscalYear = await store.setActiveFiscalYear(input.dossierId, input.nextYear);

    return {
      status: insertResult === "inserted" ? "committed" : "committed",
      fromYear: input.fromYear,
      nextYear: input.nextYear,
      closedRevision,
      nextRevision: nextRow.revision,
      closedAt: input.now,
      activeFiscalYear,
      // Never reseed: if row already existed, return ITS payload.
      nextPayload: nextRow.payload,
      nextSchemaVersion: nextRow.schemaVersion,
    };
  });
}

/** Server-side guard used by snapshot save path (and tests). */
export function assertSnapshotWritableForAutosave(row: {
  closedAt: string | null;
} | null): void {
  if (row?.closedAt != null) {
    throw new TransitionCommitError("snapshot_closed", "snapshot is closed — autosave forbidden");
  }
}
