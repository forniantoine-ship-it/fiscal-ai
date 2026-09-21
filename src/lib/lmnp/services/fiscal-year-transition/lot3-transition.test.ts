/**
 * Lot 3 — transition N→N+1 : prepare, commit, idempotence, cold restore, prior history, security.
 * Run: npx tsx --test src/lib/lmnp/services/fiscal-year-transition/lot3-transition.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createInMemoryFiscalYearTransitionStore,
  tryAutosaveSnapshot,
} from "./in-memory-store";
import { commitFiscalYearTransition } from "./commit-transition";
import { prepareFiscalYearTransitionCandidate } from "./prepare-transition";
import {
  handleFiscalYearTransitionRequest,
  createStoreBackedTransitionHandlerDeps,
} from "./transition-handler";
import { TransitionCommitError } from "./types";
import {
  pickTargetYear,
  resolveWorkspaceHydration,
  resolveClosedArchiveSnapshotAccess,
  type WorkspaceSnapshotRecord,
} from "@/lib/lmnp/store/workspace-snapshot-resolve";
import { resolvePriorHistoryEligibility } from "@/lib/lmnp/services/declaration/prior-history-eligibility";
import {
  serializeWorkspaceSnapshot,
  parseWorkspaceSnapshot,
  WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
} from "@/lib/lmnp/store/workspace-snapshot";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { DeclarationDraft, FiscalYear } from "@/lib/lmnp/types";
import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";

const NOW = "2026-09-01T00:00:00.000Z";
const DOSSIER_ID = "dossier-1";
const OWNER_ID = "user-owner";
const OTHER_USER = "user-other";
const FROM_YEAR = 2025;
const NEXT_YEAR = 2026;
const EXPECTED_REVISION = 3;

function baseFiscalYear(overrides: Partial<FiscalYear> = {}): FiscalYear {
  return {
    id: "fy-1",
    year: FROM_YEAR,
    status: "ready_to_close",
    regime: "reel",
    propertyIds: ["prop-1"],
    dossierId: DOSSIER_ID,
    declarationGeneratedAt: NOW,
    priorHistoryDeclaration: { status: "FIRST_REAL_YEAR", declaredAt: NOW },
    closures: [],
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Draft clôturable (Lot 1) : génération de référence valide et fraîche. */
function closableDeclarationDraft(): DeclarationDraft {
  const draft = {
    completedSteps: [],
    inpiConfirmedAt: NOW,
    logementConfirmedAt: NOW,
    logementAmortissement: {
      computedAt: NOW,
      prixRevient: 200000,
      valeurTerrain: 40000,
      valeurBati: 160000,
      baseAmortissableBati: 160000,
      montantMobilier: 0,
      dotationAnnuelle: 5333,
      dureeMoyenneAnnees: 30,
      plan: { lignes: [], totalAnnuelExercice: 0, totalBrut: 0 },
    },
    creditDeclaredNoneAt: NOW,
    revenusConfirmedAt: NOW,
    chargesConfirmedAt: NOW,
    amortissementConfirmedAt: NOW,
    siret: "12345678901234",
    siren: "123456789",
    exploitantFirstName: "Marie",
    exploitantLastName: "Dupont",
    exploitantEmail: "marie.dupont@example.com",
    exploitantTelephone: "0601020304",
    personalAddress: "10 rue des Lilas",
    personalCity: "Lyon",
    personalPostalCode: "69001",
    dateMiseEnService: "2020-01-01",
    revenusAssistant: { exerciceFiscal: FROM_YEAR, totalRecettes: 9000 },
    chargesAssistant: { exerciceFiscal: FROM_YEAR, totalDeductible: 2000, totalPreExploitation: 0 },
    amortissementAssistant: { exerciceFiscal: FROM_YEAR, totalDotations: 1500, status: "validated" },
  } as DeclarationDraft;
  const generation = runDeclarationGeneration(draft, FROM_YEAR);
  assert.equal(generation.status, "generated", "fixture d'orchestration doit produire une génération réelle");
  if (generation.status !== "generated") throw new Error("unreachable");
  return { ...draft, fiscalResult: generation.fiscalResult, rfs: generation.rfs } as DeclarationDraft;
}

function closableWorkspace(overrides: Partial<PersistedWorkspace> = {}): PersistedWorkspace {
  return {
    fiscalYear: baseFiscalYear(),
    properties: [
      { id: "prop-1", label: "Mon bien", address: "1 rue X", city: "Lyon", postalCode: "69000" },
    ],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: closableDeclarationDraft(),
    aiActivityFeed: [],
    ...overrides,
  };
}

function nonReadyWorkspace(): PersistedWorkspace {
  return closableWorkspace({
    fiscalYear: baseFiscalYear({ status: "draft", declarationGeneratedAt: undefined }),
    declarationDraft: { completedSteps: [] },
  });
}

/** Minimal valid serialized envelope for commit-only seeds (not closable). */
function minimalEnvelope(year: number, fiscalYearId: string, extra?: Partial<PersistedWorkspace>) {
  const workspace: PersistedWorkspace = {
    fiscalYear: {
      id: fiscalYearId,
      year,
      status: "draft",
      regime: "reel",
      propertyIds: ["prop-1"],
      dossierId: DOSSIER_ID,
      closures: [],
      createdAt: NOW,
      updatedAt: NOW,
    },
    properties: [
      { id: "prop-1", label: "Bien", address: "1 rue X", city: "Lyon", postalCode: "69000" },
    ],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: { completedSteps: [] },
    ...extra,
  };
  const serialized = serializeWorkspaceSnapshot(workspace);
  assert.equal(serialized.ok, true);
  if (!serialized.ok) throw new Error("unreachable");
  return serialized.envelope;
}

function seedOpenStore(options?: {
  payload?: unknown;
  revision?: number;
  activeFiscalYear?: number | null;
  userId?: string;
}) {
  const payload = options?.payload ?? minimalEnvelope(FROM_YEAR, "fy-1");
  return createInMemoryFiscalYearTransitionStore({
    dossiers: [
      {
        id: DOSSIER_ID,
        userId: options?.userId ?? OWNER_ID,
        activeFiscalYear: options?.activeFiscalYear ?? FROM_YEAR,
      },
    ],
    snapshots: [
      {
        dossierId: DOSSIER_ID,
        fiscalYear: FROM_YEAR,
        schemaVersion: WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
        revision: options?.revision ?? EXPECTED_REVISION,
        payload,
        closedAt: null,
        successorFiscalYear: null,
        updatedAt: NOW,
      },
    ],
  });
}

function toSnapshotRecord(
  row: {
    dossierId: string;
    fiscalYear: number;
    schemaVersion: number;
    revision: number;
    payload: unknown;
    closedAt: string | null;
    successorFiscalYear: number | null;
    updatedAt: string;
  },
): WorkspaceSnapshotRecord {
  return {
    dossierId: row.dossierId,
    fiscalYear: row.fiscalYear,
    schemaVersion: row.schemaVersion,
    revision: row.revision,
    payload: row.payload,
    updatedAt: row.updatedAt,
    closedAt: row.closedAt,
    successorFiscalYear: row.successorFiscalYear,
  };
}

async function prepareAndCommit(options?: {
  workspace?: PersistedWorkspace;
  store?: ReturnType<typeof createInMemoryFiscalYearTransitionStore>;
  expectedRevision?: number;
  userId?: string;
  nextFiscalYearId?: string;
  now?: string;
}) {
  const workspace = options?.workspace ?? closableWorkspace();
  const prepared = prepareFiscalYearTransitionCandidate({
    workspace,
    dossierId: DOSSIER_ID,
    now: options?.now ?? NOW,
    nextFiscalYearId: options?.nextFiscalYearId ?? "fy-next",
  });
  assert.equal(prepared.ok, true, prepared.ok === false ? prepared.reason : undefined);
  if (!prepared.ok) throw new Error("unreachable");

  const store =
    options?.store ??
    seedOpenStore({
      payload: serializeWorkspaceSnapshot(workspace).ok
        ? (serializeWorkspaceSnapshot(workspace) as { ok: true; envelope: unknown }).envelope
        : minimalEnvelope(FROM_YEAR, "fy-1"),
      revision: options?.expectedRevision ?? EXPECTED_REVISION,
    });

  // Ensure open snapshot payload matches closable workspace when seeding from prepare.
  if (!options?.store) {
    const serialized = serializeWorkspaceSnapshot(workspace);
    assert.equal(serialized.ok, true);
    if (serialized.ok) {
      store.snapshots.set(`${DOSSIER_ID}:${FROM_YEAR}`, {
        dossierId: DOSSIER_ID,
        fiscalYear: FROM_YEAR,
        schemaVersion: WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
        revision: options?.expectedRevision ?? EXPECTED_REVISION,
        payload: serialized.envelope,
        closedAt: null,
        successorFiscalYear: null,
        updatedAt: NOW,
      });
    }
  }

  const result = await commitFiscalYearTransition(store, {
    dossierId: DOSSIER_ID,
    userId: options?.userId ?? OWNER_ID,
    fromYear: prepared.fromYear,
    nextYear: prepared.nextYear,
    expectedRevision: options?.expectedRevision ?? EXPECTED_REVISION,
    closedNPayload: prepared.closedNPayload,
    closedNSchemaVersion: prepared.closedNSchemaVersion,
    nextPayload: prepared.nextPayload,
    nextSchemaVersion: prepared.nextSchemaVersion,
    now: options?.now ?? NOW,
  });

  return { store, prepared, result };
}

describe("Lot 3 TRANSITION", () => {
  it("1. N ready → close N + create N+1", async () => {
    const { store, prepared, result } = await prepareAndCommit();
    assert.equal(result.status, "committed");
    assert.equal(result.fromYear, FROM_YEAR);
    assert.equal(result.nextYear, NEXT_YEAR);
    assert.equal(prepared.fromYear, FROM_YEAR);
    assert.equal(prepared.nextYear, NEXT_YEAR);

    const closed = await store.getSnapshot(DOSSIER_ID, FROM_YEAR);
    const next = await store.getSnapshot(DOSSIER_ID, NEXT_YEAR);
    assert.ok(closed?.closedAt);
    assert.equal(closed?.successorFiscalYear, NEXT_YEAR);
    assert.ok(next);
    assert.equal(next?.closedAt, null);
  });

  it("2. N non-ready → refuse (prepare fails)", () => {
    const prepared = prepareFiscalYearTransitionCandidate({
      workspace: nonReadyWorkspace(),
      dossierId: DOSSIER_ID,
      now: NOW,
    });
    assert.equal(prepared.ok, false);
    if (prepared.ok) throw new Error("unreachable");
    assert.equal(prepared.code, "not_ready");
  });

  it("3. N stale / wrong expected revision → refuse", async () => {
    const workspace = closableWorkspace();
    const prepared = prepareFiscalYearTransitionCandidate({
      workspace,
      dossierId: DOSSIER_ID,
      now: NOW,
      nextFiscalYearId: "fy-next",
    });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) throw new Error("unreachable");

    const store = seedOpenStore({
      payload: (serializeWorkspaceSnapshot(workspace) as { ok: true; envelope: unknown }).envelope,
      revision: EXPECTED_REVISION,
    });

    await assert.rejects(
      () =>
        commitFiscalYearTransition(store, {
          dossierId: DOSSIER_ID,
          userId: OWNER_ID,
          fromYear: prepared.fromYear,
          nextYear: prepared.nextYear,
          expectedRevision: EXPECTED_REVISION - 1,
          closedNPayload: prepared.closedNPayload,
          closedNSchemaVersion: prepared.closedNSchemaVersion,
          nextPayload: prepared.nextPayload,
          nextSchemaVersion: prepared.nextSchemaVersion,
          now: NOW,
        }),
      (err: unknown) => {
        assert.ok(err instanceof TransitionCommitError);
        assert.equal(err.code, "revision_conflict");
        return true;
      },
    );

    const n = await store.getSnapshot(DOSSIER_ID, FROM_YEAR);
    assert.equal(n?.closedAt, null);
    assert.equal((await store.getDossier(DOSSIER_ID))?.activeFiscalYear, FROM_YEAR);
  });

  it("4. successful transition marks N closed", async () => {
    const { store, result } = await prepareAndCommit();
    assert.equal(result.status, "committed");
    const n = await store.getSnapshot(DOSSIER_ID, FROM_YEAR);
    assert.ok(n?.closedAt);
    assert.equal(n?.closedAt, NOW);
    assert.equal(n?.successorFiscalYear, NEXT_YEAR);
  });

  it("5. successful transition makes N+1 active", async () => {
    const { store, result } = await prepareAndCommit();
    assert.equal(result.activeFiscalYear, NEXT_YEAR);
    assert.equal((await store.getDossier(DOSSIER_ID))?.activeFiscalYear, NEXT_YEAR);
  });

  it("6. N+1 has previousFiscalYearId/sourceClosureId", async () => {
    const { prepared, result } = await prepareAndCommit({ nextFiscalYearId: "fy-2026" });
    assert.equal(prepared.nextWorkspace.fiscalYear.previousFiscalYearId, "fy-1");
    assert.ok(prepared.nextWorkspace.fiscalYear.stocksOuverture?.sourceClosureId);

    const parsed = parseWorkspaceSnapshot(result.nextPayload);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) throw new Error("unreachable");
    assert.equal(parsed.envelope.workspace.fiscalYear.previousFiscalYearId, "fy-1");
    assert.ok(parsed.envelope.workspace.fiscalYear.stocksOuverture?.sourceClosureId);
  });
});

describe("Lot 3 IDEMPOTENCE", () => {
  it("7. same request twice → same N+1 (idempotent)", async () => {
    const first = await prepareAndCommit({ nextFiscalYearId: "fy-2026" });
    const second = await commitFiscalYearTransition(first.store, {
      dossierId: DOSSIER_ID,
      userId: OWNER_ID,
      fromYear: first.prepared.fromYear,
      nextYear: first.prepared.nextYear,
      expectedRevision: EXPECTED_REVISION,
      closedNPayload: first.prepared.closedNPayload,
      closedNSchemaVersion: first.prepared.closedNSchemaVersion,
      nextPayload: { schemaVersion: 1, workspace: { tampered: true } },
      nextSchemaVersion: first.prepared.nextSchemaVersion,
      now: "2026-09-02T00:00:00.000Z",
    });

    assert.equal(second.status, "idempotent");
    assert.equal(second.nextYear, first.result.nextYear);
    assert.deepEqual(second.nextPayload, first.result.nextPayload);
    assert.equal(second.nextRevision, first.result.nextRevision);
  });

  it("8. simulated concurrent requests → one successor (Promise.all)", async () => {
    const workspace = closableWorkspace();
    const prepared = prepareFiscalYearTransitionCandidate({
      workspace,
      dossierId: DOSSIER_ID,
      now: NOW,
      nextFiscalYearId: "fy-concurrent",
    });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) throw new Error("unreachable");

    const serialized = serializeWorkspaceSnapshot(workspace);
    assert.equal(serialized.ok, true);
    if (!serialized.ok) throw new Error("unreachable");

    const store = seedOpenStore({ payload: serialized.envelope });
    const input = {
      dossierId: DOSSIER_ID,
      userId: OWNER_ID,
      fromYear: prepared.fromYear,
      nextYear: prepared.nextYear,
      expectedRevision: EXPECTED_REVISION,
      closedNPayload: prepared.closedNPayload,
      closedNSchemaVersion: prepared.closedNSchemaVersion,
      nextPayload: prepared.nextPayload,
      nextSchemaVersion: prepared.nextSchemaVersion,
      now: NOW,
    };

    const results = await Promise.all([
      commitFiscalYearTransition(store, input),
      commitFiscalYearTransition(store, input),
      commitFiscalYearTransition(store, input),
    ]);

    const statuses = results.map((r) => r.status).sort();
    assert.ok(statuses.includes("committed"));
    assert.ok(statuses.filter((s) => s === "idempotent").length >= 1);
    assert.equal(
      [...store.snapshots.keys()].filter((k) => k.endsWith(`:${NEXT_YEAR}`)).length,
      1,
    );
    assert.equal((await store.getDossier(DOSSIER_ID))?.activeFiscalYear, NEXT_YEAR);
  });

  it("9. response lost then retry → same successor", async () => {
    const first = await prepareAndCommit({ nextFiscalYearId: "fy-retry" });
    // Client never saw the response — retries with same prepared payloads.
    const retry = await commitFiscalYearTransition(first.store, {
      dossierId: DOSSIER_ID,
      userId: OWNER_ID,
      fromYear: first.prepared.fromYear,
      nextYear: first.prepared.nextYear,
      expectedRevision: EXPECTED_REVISION,
      closedNPayload: first.prepared.closedNPayload,
      closedNSchemaVersion: first.prepared.closedNSchemaVersion,
      nextPayload: first.prepared.nextPayload,
      nextSchemaVersion: first.prepared.nextSchemaVersion,
      now: NOW,
    });
    assert.equal(retry.status, "idempotent");
    assert.equal(retry.nextYear, NEXT_YEAR);
    assert.deepEqual(retry.nextPayload, first.result.nextPayload);
  });

  it("10. existing modified N+1 → no reseed (mutate N+1 payload then retry)", async () => {
    const first = await prepareAndCommit({ nextFiscalYearId: "fy-reseed" });
    const mutated = { schemaVersion: 1, workspace: { mutated: true, note: "client edit" } };
    const existing = first.store.snapshots.get(`${DOSSIER_ID}:${NEXT_YEAR}`);
    assert.ok(existing);
    first.store.snapshots.set(`${DOSSIER_ID}:${NEXT_YEAR}`, {
      ...existing!,
      payload: mutated,
      revision: 7,
      updatedAt: "2026-09-03T00:00:00.000Z",
    });

    const retry = await commitFiscalYearTransition(first.store, {
      dossierId: DOSSIER_ID,
      userId: OWNER_ID,
      fromYear: first.prepared.fromYear,
      nextYear: first.prepared.nextYear,
      expectedRevision: EXPECTED_REVISION,
      closedNPayload: first.prepared.closedNPayload,
      closedNSchemaVersion: first.prepared.closedNSchemaVersion,
      nextPayload: first.prepared.nextPayload,
      nextSchemaVersion: first.prepared.nextSchemaVersion,
      now: NOW,
    });

    assert.equal(retry.status, "idempotent");
    assert.deepEqual(retry.nextPayload, mutated);
    assert.equal(retry.nextRevision, 7);
  });
});

describe("Lot 3 OLD TAB", () => {
  it("11. save to closed N rejected (tryAutosaveSnapshot)", async () => {
    const { store } = await prepareAndCommit();
    const result = tryAutosaveSnapshot(store, {
      dossierId: DOSSIER_ID,
      fiscalYear: FROM_YEAR,
      payload: { schemaVersion: 1, workspace: { stale: true } },
      now: "2026-09-04T00:00:00.000Z",
    });
    assert.equal(result.status, "rejected");
    if (result.status !== "rejected") throw new Error("unreachable");
    assert.equal(result.code, "snapshot_closed");
  });

  it("12. autosave path conceptually handles rejection (status rejected)", async () => {
    const { store } = await prepareAndCommit();
    const result = tryAutosaveSnapshot(store, {
      dossierId: DOSSIER_ID,
      fiscalYear: FROM_YEAR,
      payload: minimalEnvelope(FROM_YEAR, "fy-1"),
      now: NOW,
    });
    assert.equal(result.status, "rejected");
    // Open year still accepts autosave.
    const openOk = tryAutosaveSnapshot(store, {
      dossierId: DOSSIER_ID,
      fiscalYear: NEXT_YEAR,
      payload: minimalEnvelope(NEXT_YEAR, "fy-next"),
      now: NOW,
    });
    assert.equal(openOk.status, "ok");
  });
});

describe("Lot 3 COLD RESTORE", () => {
  it("13. empty local + server active year selects N+1 (pickTargetYear / resolveWorkspaceHydration)", async () => {
    const { store } = await prepareAndCommit({ nextFiscalYearId: "fy-cold" });
    const snapshots = [...store.snapshots.values()].map(toSnapshotRecord);
    const dossier = await store.getDossier(DOSSIER_ID);
    assert.equal(pickTargetYear(null, snapshots, FROM_YEAR, dossier?.activeFiscalYear), NEXT_YEAR);

    const decision = resolveWorkspaceHydration({
      local: null,
      snapshots,
      fallbackYear: FROM_YEAR,
      activeFiscalYear: dossier?.activeFiscalYear,
    });
    assert.equal(decision.source, "server");
    if (decision.source !== "server") throw new Error("unreachable");
    assert.equal(decision.workspace.fiscalYear.year, NEXT_YEAR);
    assert.equal(decision.blockWrites, false);
  });

  it("14. N+1 snapshot restored", async () => {
    const { store, prepared } = await prepareAndCommit({ nextFiscalYearId: "fy-restore" });
    const snapshots = [...store.snapshots.values()].map(toSnapshotRecord);
    const decision = resolveWorkspaceHydration({
      local: null,
      snapshots,
      fallbackYear: FROM_YEAR,
      activeFiscalYear: NEXT_YEAR,
    });
    assert.equal(decision.source, "server");
    if (decision.source !== "server") throw new Error("unreachable");
    assert.equal(decision.workspace.fiscalYear.id, prepared.nextWorkspace.fiscalYear.id);
    assert.equal(decision.workspace.fiscalYear.year, NEXT_YEAR);
  });

  it("15. N available as archive (resolveClosedArchiveSnapshotAccess)", async () => {
    const { store } = await prepareAndCommit();
    const n = store.snapshots.get(`${DOSSIER_ID}:${FROM_YEAR}`);
    assert.ok(n);
    const access = resolveClosedArchiveSnapshotAccess(toSnapshotRecord(n!));
    assert.equal(access.ok, true);
  });

  it("16. archive load blockWrites true", async () => {
    const { store } = await prepareAndCommit();
    const snapshots = [...store.snapshots.values()].map(toSnapshotRecord);
    const decision = resolveWorkspaceHydration({
      local: null,
      snapshots,
      fallbackYear: FROM_YEAR,
      // Force target to closed N (no active pointer — local null, fallbackYear = N).
      activeFiscalYear: null,
    });
    // With active absent and fallbackYear = N, we hydrate closed N as archive.
    assert.equal(decision.source, "server");
    if (decision.source !== "server") throw new Error("unreachable");
    assert.equal(decision.workspace.fiscalYear.year, FROM_YEAR);
    assert.equal(decision.blockWrites, true);
  });

  it("17. fallback old behavior only when active pointer absent", () => {
    const nPayload = minimalEnvelope(FROM_YEAR, "fy-1");
    const nextPayload = minimalEnvelope(NEXT_YEAR, "fy-2");
    const snapshots: WorkspaceSnapshotRecord[] = [
      {
        dossierId: DOSSIER_ID,
        fiscalYear: FROM_YEAR,
        schemaVersion: 1,
        revision: 1,
        payload: nPayload,
        updatedAt: "2026-01-01T00:00:00.000Z",
        closedAt: NOW,
        successorFiscalYear: NEXT_YEAR,
      },
      {
        dossierId: DOSSIER_ID,
        fiscalYear: NEXT_YEAR,
        schemaVersion: 1,
        revision: 1,
        payload: nextPayload,
        updatedAt: "2026-01-02T00:00:00.000Z",
        closedAt: null,
        successorFiscalYear: null,
      },
    ];

    assert.equal(pickTargetYear(null, snapshots, FROM_YEAR, NEXT_YEAR), NEXT_YEAR);
    // Absent active → legacy: fallbackYear if present.
    assert.equal(pickTargetYear(null, snapshots, FROM_YEAR, null), FROM_YEAR);
    assert.equal(pickTargetYear(null, snapshots, FROM_YEAR, undefined), FROM_YEAR);
    // Absent active + no fallback match → most recently updated.
    assert.equal(pickTargetYear(null, snapshots, 2099, null), NEXT_YEAR);
  });
});

describe("Lot 3 PRIOR HISTORY", () => {
  it("18. cold-restored N+1 recognized NATIVE_CONTINUITY", async () => {
    const { store } = await prepareAndCommit({ nextFiscalYearId: "fy-ph" });
    const next = store.snapshots.get(`${DOSSIER_ID}:${NEXT_YEAR}`);
    assert.ok(next);
    const parsed = parseWorkspaceSnapshot(next!.payload);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) throw new Error("unreachable");

    const eligibility = resolvePriorHistoryEligibility(parsed.envelope.workspace.fiscalYear);
    assert.equal(eligibility.eligible, true);
    assert.equal(eligibility.status, "NATIVE_CONTINUITY");
    if (eligibility.eligible) {
      assert.equal(eligibility.basis, "proven_by_data");
    }
  });

  it("19. invalid/missing source closure still fail-closed", () => {
    const missing = resolvePriorHistoryEligibility({
      previousFiscalYearId: "fy-1",
      stocksOuverture: undefined,
    });
    assert.equal(missing.eligible, false);
    assert.equal(missing.eligible === false && missing.reason, "NATIVE_CONTINUITY_MISSING");

    const invalid = resolvePriorHistoryEligibility({
      previousFiscalYearId: "fy-1",
      stocksOuverture: {
        sourceClosureId: "",
        stocks: { deficits: [], amortissementsReportes: 0 },
      },
    });
    assert.equal(invalid.eligible, false);
    assert.equal(invalid.eligible === false && invalid.reason, "NATIVE_CONTINUITY_MISSING");
  });
});

describe("Lot 3 DOCUMENTS (lightweight structural)", () => {
  it("20. cold-restored N+1 workspace has empty documents array (no annual N injected by transition)", async () => {
    const workspace = closableWorkspace({
      documents: [
        {
          id: "doc-annual-n",
          fiscalYearId: "fy-1",
          fileName: "liasse-n.pdf",
          mimeType: "application/pdf",
          sizeBytes: 100,
          category: "autre",
          documentType: "unknown",
          status: "uploaded",
          uploadedAt: NOW,
          documentRole: "annual_evidence",
        },
      ],
    });
    const { store, prepared } = await prepareAndCommit({
      workspace,
      nextFiscalYearId: "fy-docs",
    });
    assert.deepEqual(prepared.nextWorkspace.documents, []);

    const next = store.snapshots.get(`${DOSSIER_ID}:${NEXT_YEAR}`);
    const parsed = parseWorkspaceSnapshot(next!.payload);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) throw new Error("unreachable");
    assert.deepEqual(parsed.envelope.workspace.documents, []);
  });

  it("21. archive N payload can still hold its documents if present in closed payload", async () => {
    const docs: PersistedWorkspace["documents"] = [
      {
        id: "doc-n",
        fiscalYearId: "fy-1",
        fileName: "piece-n.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
        category: "autre",
        documentType: "unknown",
        status: "uploaded",
        uploadedAt: NOW,
        documentRole: "annual_evidence",
      },
    ];
    const workspace = closableWorkspace({ documents: docs });
    const { store } = await prepareAndCommit({ workspace, nextFiscalYearId: "fy-docs-n" });
    const closed = store.snapshots.get(`${DOSSIER_ID}:${FROM_YEAR}`);
    const parsed = parseWorkspaceSnapshot(closed!.payload);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) throw new Error("unreachable");
    assert.equal(parsed.envelope.workspace.documents.length, 1);
    assert.equal(parsed.envelope.workspace.documents[0]?.id, "doc-n");
  });
});

describe("Lot 3 SECURITY", () => {
  it("22. cross-user transition rejected (not_owner)", async () => {
    const workspace = closableWorkspace();
    const prepared = prepareFiscalYearTransitionCandidate({
      workspace,
      dossierId: DOSSIER_ID,
      now: NOW,
      nextFiscalYearId: "fy-sec",
    });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) throw new Error("unreachable");

    const serialized = serializeWorkspaceSnapshot(workspace);
    assert.equal(serialized.ok, true);
    if (!serialized.ok) throw new Error("unreachable");
    const store = seedOpenStore({ payload: serialized.envelope });

    await assert.rejects(
      () =>
        commitFiscalYearTransition(store, {
          dossierId: DOSSIER_ID,
          userId: OTHER_USER,
          fromYear: prepared.fromYear,
          nextYear: prepared.nextYear,
          expectedRevision: EXPECTED_REVISION,
          closedNPayload: prepared.closedNPayload,
          closedNSchemaVersion: prepared.closedNSchemaVersion,
          nextPayload: prepared.nextPayload,
          nextSchemaVersion: prepared.nextSchemaVersion,
          now: NOW,
        }),
      (err: unknown) => {
        assert.ok(err instanceof TransitionCommitError);
        assert.equal(err.code, "not_owner");
        return true;
      },
    );
  });

  it("23. handler returns 403 for other user", async () => {
    const workspace = closableWorkspace();
    const prepared = prepareFiscalYearTransitionCandidate({
      workspace,
      dossierId: DOSSIER_ID,
      now: NOW,
      nextFiscalYearId: "fy-h403",
    });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) throw new Error("unreachable");
    const serialized = serializeWorkspaceSnapshot(workspace);
    assert.equal(serialized.ok, true);
    if (!serialized.ok) throw new Error("unreachable");
    const store = seedOpenStore({ payload: serialized.envelope });

    const deps = createStoreBackedTransitionHandlerDeps(store, {
      userIdByToken: { "tok-other": OTHER_USER, "tok-owner": OWNER_ID },
    });
    const response = await handleFiscalYearTransitionRequest(
      new Request("http://localhost/api/lmnp/fiscal-year/transition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authToken: "tok-other",
          dossierId: DOSSIER_ID,
          fromYear: prepared.fromYear,
          nextYear: prepared.nextYear,
          expectedRevision: EXPECTED_REVISION,
          closedNPayload: prepared.closedNPayload,
          closedNSchemaVersion: prepared.closedNSchemaVersion,
          nextPayload: prepared.nextPayload,
          nextSchemaVersion: prepared.nextSchemaVersion,
          now: NOW,
        }),
      }),
      () => deps,
    );
    assert.equal(response.status, 403);
    const body = (await response.json()) as { code?: string };
    assert.equal(body.code, "not_owner");
  });

  it("24. closed snapshot cannot be reopened via updateSnapshot immutability", async () => {
    const { store } = await prepareAndCommit();
    const closed = await store.getSnapshot(DOSSIER_ID, FROM_YEAR);
    assert.ok(closed?.closedAt);

    await assert.rejects(
      () =>
        store.updateSnapshot({
          ...closed!,
          closedAt: null,
          successorFiscalYear: null,
        }),
      (err: unknown) => {
        assert.ok(err instanceof TransitionCommitError);
        assert.equal(err.code, "snapshot_closed");
        return true;
      },
    );

    await assert.rejects(
      () =>
        store.updateSnapshot({
          ...closed!,
          payload: { schemaVersion: 1, workspace: { hacked: true } },
        }),
      (err: unknown) => {
        assert.ok(err instanceof TransitionCommitError);
        assert.equal(err.code, "snapshot_closed");
        return true;
      },
    );

    const still = await store.getSnapshot(DOSSIER_ID, FROM_YEAR);
    assert.ok(still?.closedAt);
    assert.equal(still?.successorFiscalYear, NEXT_YEAR);
  });
});

describe("Lot 3 PERSISTENCE FAILURE", () => {
  it("25. wrong revision → no transition (N remains open, active unchanged)", async () => {
    const workspace = closableWorkspace();
    const prepared = prepareFiscalYearTransitionCandidate({
      workspace,
      dossierId: DOSSIER_ID,
      now: NOW,
      nextFiscalYearId: "fy-rev",
    });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) throw new Error("unreachable");
    const serialized = serializeWorkspaceSnapshot(workspace);
    assert.equal(serialized.ok, true);
    if (!serialized.ok) throw new Error("unreachable");
    const store = seedOpenStore({ payload: serialized.envelope, activeFiscalYear: FROM_YEAR });

    await assert.rejects(() =>
      commitFiscalYearTransition(store, {
        dossierId: DOSSIER_ID,
        userId: OWNER_ID,
        fromYear: prepared.fromYear,
        nextYear: prepared.nextYear,
        expectedRevision: 999,
        closedNPayload: prepared.closedNPayload,
        closedNSchemaVersion: prepared.closedNSchemaVersion,
        nextPayload: prepared.nextPayload,
        nextSchemaVersion: prepared.nextSchemaVersion,
        now: NOW,
      }),
    );

    assert.equal((await store.getSnapshot(DOSSIER_ID, FROM_YEAR))?.closedAt, null);
    assert.equal(await store.getSnapshot(DOSSIER_ID, NEXT_YEAR), null);
    assert.equal((await store.getDossier(DOSSIER_ID))?.activeFiscalYear, FROM_YEAR);
  });

  it("26. if commit never called / aborted → N remains active conceptually", () => {
    const workspace = closableWorkspace();
    const prepared = prepareFiscalYearTransitionCandidate({
      workspace,
      dossierId: DOSSIER_ID,
      now: NOW,
      nextFiscalYearId: "fy-abort",
    });
    assert.equal(prepared.ok, true);

    const store = seedOpenStore({
      payload: (serializeWorkspaceSnapshot(workspace) as { ok: true; envelope: unknown }).envelope,
      activeFiscalYear: FROM_YEAR,
    });

    // Prepare alone must not mutate store — commit aborted / never called.
    assert.equal(store.snapshots.get(`${DOSSIER_ID}:${FROM_YEAR}`)?.closedAt, null);
    assert.equal(store.dossiers.get(DOSSIER_ID)?.activeFiscalYear, FROM_YEAR);
    assert.equal(store.snapshots.has(`${DOSSIER_ID}:${NEXT_YEAR}`), false);
  });
});

describe("Lot 3 handler happy path", () => {
  it("handleFiscalYearTransitionRequest commits via createStoreBackedTransitionHandlerDeps", async () => {
    const workspace = closableWorkspace();
    const prepared = prepareFiscalYearTransitionCandidate({
      workspace,
      dossierId: DOSSIER_ID,
      now: NOW,
      nextFiscalYearId: "fy-handler",
    });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) throw new Error("unreachable");
    const serialized = serializeWorkspaceSnapshot(workspace);
    assert.equal(serialized.ok, true);
    if (!serialized.ok) throw new Error("unreachable");
    const store = seedOpenStore({ payload: serialized.envelope });

    const deps = createStoreBackedTransitionHandlerDeps(store);
    const response = await handleFiscalYearTransitionRequest(
      new Request("http://localhost/api/lmnp/fiscal-year/transition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authToken: "tok-owner",
          dossierId: DOSSIER_ID,
          fromYear: prepared.fromYear,
          nextYear: prepared.nextYear,
          expectedRevision: EXPECTED_REVISION,
          closedNPayload: prepared.closedNPayload,
          closedNSchemaVersion: prepared.closedNSchemaVersion,
          nextPayload: prepared.nextPayload,
          nextSchemaVersion: prepared.nextSchemaVersion,
          now: NOW,
        }),
      }),
      () => deps,
    );

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      ok?: boolean;
      status?: string;
      nextYear?: number;
      activeFiscalYear?: number;
    };
    assert.equal(body.ok, true);
    assert.equal(body.status, "committed");
    assert.equal(body.nextYear, NEXT_YEAR);
    assert.equal(body.activeFiscalYear, NEXT_YEAR);
    assert.equal((await store.getDossier(DOSSIER_ID))?.activeFiscalYear, NEXT_YEAR);
  });
});
