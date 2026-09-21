/**
 * Lot 3 — orchestration close+create converge sur runServerFiscalYearTransition.
 * Run: npx tsx --test src/lib/lmnp/store/close-and-create-next-fiscal-year.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  runCloseAndCreateNextFiscalYear,
  __testResetCloseAndCreateNextFiscalYearGuard,
} from "./close-and-create-next-fiscal-year";
import type { PersistedWorkspace } from "./persistence";
import type { DeclarationDraft, FiscalYear } from "../types";
import { runDeclarationGeneration } from "../services/declaration/run-declaration-generation";
import { serializeWorkspaceSnapshot } from "./workspace-snapshot";
import type { TransitionCommitResult } from "@/lib/lmnp/services/fiscal-year-transition/types";

const NOW = "2026-09-01T00:00:00.000Z";

function baseFiscalYear(overrides: Partial<FiscalYear> = {}): FiscalYear {
  return {
    id: "fy-1",
    year: 2025,
    status: "ready_to_close",
    regime: "reel",
    propertyIds: ["prop-1"],
    dossierId: "dossier-1",
    declarationGeneratedAt: NOW,
    priorHistoryDeclaration: { status: "FIRST_REAL_YEAR", declaredAt: NOW },
    closures: [],
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

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
    revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
    chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
    amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1500, status: "validated" },
  } as DeclarationDraft;
  const generation = runDeclarationGeneration(draft, 2025);
  assert.equal(generation.status, "generated");
  if (generation.status !== "generated") throw new Error("unreachable");
  return { ...draft, fiscalResult: generation.fiscalResult, rfs: generation.rfs } as DeclarationDraft;
}

function baseWorkspace(overrides: Partial<PersistedWorkspace> = {}): PersistedWorkspace {
  return {
    fiscalYear: baseFiscalYear(),
    properties: [{ id: "prop-1", label: "Mon bien", address: "1 rue X", city: "Lyon", postalCode: "69000" }],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: closableDeclarationDraft(),
    ...overrides,
  };
}

function nextWorkspaceFor(current: PersistedWorkspace): PersistedWorkspace {
  return {
    fiscalYear: {
      id: "fy-2",
      year: current.fiscalYear.year + 1,
      status: "draft",
      regime: "reel",
      propertyIds: current.fiscalYear.propertyIds,
      dossierId: current.fiscalYear.dossierId,
      previousFiscalYearId: current.fiscalYear.id,
      closures: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    properties: current.properties,
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: { completedSteps: [] },
    aiActivityFeed: [],
  };
}

function stubServerCommit(nextWorkspace: PersistedWorkspace) {
  const calls: unknown[] = [];
  const serialized = serializeWorkspaceSnapshot(nextWorkspace);
  assert.equal(serialized.ok, true);
  if (!serialized.ok) throw new Error("unreachable");
  const fn = async (): Promise<TransitionCommitResult> => {
    calls.push(true);
    return {
      status: "committed",
      fromYear: 2025,
      nextYear: 2026,
      closedRevision: 4,
      nextRevision: 1,
      closedAt: NOW,
      activeFiscalYear: 2026,
      nextPayload: serialized.envelope,
      nextSchemaVersion: 1,
    };
  };
  return { fn, calls };
}

function stubFlushOk() {
  const calls: unknown[] = [];
  const fn = async () => {
    calls.push(true);
    return { status: "ok" as const, revision: 3 };
  };
  return { fn, calls };
}

describe("runCloseAndCreateNextFiscalYear — Lot 3 server path", () => {
  it("chemin nominal : flush strict → commit serveur → dispatch workspace serveur", async () => {
    __testResetCloseAndCreateNextFiscalYearGuard();
    const workspace = baseWorkspace();
    const nextWorkspace = nextWorkspaceFor(workspace);
    const commit = stubServerCommit(nextWorkspace);
    const flush = stubFlushOk();
    let dispatched: PersistedWorkspace | null = null;
    let error: string | null = "untouched";

    await runCloseAndCreateNextFiscalYear({
      dossierId: "dossier-1",
      userId: "user-1",
      workspace,
      flushForTransition: flush.fn,
      commitOnServer: commit.fn,
      getAuthToken: async () => "tok",
      mirrorLocalAfterCommit: async () => {},
      dispatchCloseAndCreateNext: (ws) => {
        dispatched = ws;
      },
      onError: (message) => {
        error = message;
      },
    });

    assert.equal(flush.calls.length, 1);
    assert.equal(commit.calls.length, 1);
    assert.equal(dispatched?.fiscalYear.year, 2026);
    assert.equal(error, null);
  });

  it("ordre exact : flush avant commit serveur", async () => {
    __testResetCloseAndCreateNextFiscalYearGuard();
    const workspace = baseWorkspace();
    const order: string[] = [];
    await runCloseAndCreateNextFiscalYear({
      dossierId: "dossier-1",
      userId: "user-1",
      workspace,
      flushForTransition: async () => {
        order.push("flush");
        return { status: "ok", revision: 3 };
      },
      commitOnServer: async () => {
        order.push("commit");
        return stubServerCommit(nextWorkspaceFor(workspace)).fn();
      },
      getAuthToken: async () => "tok",
      mirrorLocalAfterCommit: async () => {},
      dispatchCloseAndCreateNext: () => {},
      onError: () => {},
    });
    assert.deepEqual(order, ["flush", "commit"]);
  });

  it("flush échoué → aucun commit, aucun dispatch, N reste actif", async () => {
    __testResetCloseAndCreateNextFiscalYearGuard();
    let commitCalls = 0;
    let dispatched = false;
    let error: string | null = null;
    await runCloseAndCreateNextFiscalYear({
      dossierId: "dossier-1",
      userId: "user-1",
      workspace: baseWorkspace(),
      flushForTransition: async () => ({ status: "failed", reason: "server_unavailable" }),
      commitOnServer: async () => {
        commitCalls += 1;
        throw new Error("should not commit");
      },
      getAuthToken: async () => "tok",
      dispatchCloseAndCreateNext: () => {
        dispatched = true;
      },
      onError: (m) => {
        error = m;
      },
    });
    assert.equal(commitCalls, 0);
    assert.equal(dispatched, false);
    assert.ok(error);
  });

  it("précondition non prête → refus après flush, aucun commit", async () => {
    __testResetCloseAndCreateNextFiscalYearGuard();
    const workspace = baseWorkspace({ fiscalYear: baseFiscalYear({ status: "pending_validation" }) });
    let commitCalls = 0;
    let dispatched = false;
    let error: string | null = null;
    await runCloseAndCreateNextFiscalYear({
      dossierId: "dossier-1",
      userId: "user-1",
      workspace,
      flushForTransition: async () => ({ status: "ok", revision: 3 }),
      commitOnServer: async () => {
        commitCalls += 1;
        throw new Error("no");
      },
      getAuthToken: async () => "tok",
      dispatchCloseAndCreateNext: () => {
        dispatched = true;
      },
      onError: (m) => {
        error = m;
      },
    });
    assert.equal(commitCalls, 0);
    assert.equal(dispatched, false);
    assert.ok(error);
  });

  it("dossierId null → aucune transition", async () => {
    __testResetCloseAndCreateNextFiscalYearGuard();
    let commitCalls = 0;
    let error: string | null = null;
    await runCloseAndCreateNextFiscalYear({
      dossierId: null,
      userId: "user-1",
      workspace: baseWorkspace(),
      flushForTransition: async () => ({ status: "ok", revision: 3 }),
      commitOnServer: async () => {
        commitCalls += 1;
        throw new Error("no");
      },
      getAuthToken: async () => "tok",
      dispatchCloseAndCreateNext: () => {},
      onError: (m) => {
        error = m;
      },
    });
    assert.equal(commitCalls, 0);
    assert.ok(error);
  });

  it("userId null → aucune transition", async () => {
    __testResetCloseAndCreateNextFiscalYearGuard();
    let commitCalls = 0;
    let error: string | null = null;
    await runCloseAndCreateNextFiscalYear({
      dossierId: "dossier-1",
      userId: null,
      workspace: baseWorkspace(),
      flushForTransition: async () => ({ status: "ok", revision: 3 }),
      commitOnServer: async () => {
        commitCalls += 1;
        throw new Error("no");
      },
      getAuthToken: async () => "tok",
      dispatchCloseAndCreateNext: () => {},
      onError: (m) => {
        error = m;
      },
    });
    assert.equal(commitCalls, 0);
    assert.ok(error);
  });

  it("échec commit serveur → aucun dispatch", async () => {
    __testResetCloseAndCreateNextFiscalYearGuard();
    let dispatched = false;
    let error: string | null = null;
    await runCloseAndCreateNextFiscalYear({
      dossierId: "dossier-1",
      userId: "user-1",
      workspace: baseWorkspace(),
      flushForTransition: async () => ({ status: "ok", revision: 3 }),
      commitOnServer: async () => {
        throw new Error("réseau perdu");
      },
      getAuthToken: async () => "tok",
      dispatchCloseAndCreateNext: () => {
        dispatched = true;
      },
      onError: (m) => {
        error = m;
      },
    });
    assert.equal(dispatched, false);
    assert.equal(error, "réseau perdu");
  });

  it("échec mirror local APRÈS commit → PAS de dispatch éditable (F1 fail-safe)", async () => {
    __testResetCloseAndCreateNextFiscalYearGuard();
    const workspace = baseWorkspace();
    const nextWorkspace = nextWorkspaceFor(workspace);
    let dispatched = false;
    let error: string | null = null;
    await runCloseAndCreateNextFiscalYear({
      dossierId: "dossier-1",
      userId: "user-1",
      workspace,
      flushForTransition: async () => ({ status: "ok", revision: 3 }),
      commitOnServer: stubServerCommit(nextWorkspace).fn,
      getAuthToken: async () => "tok",
      mirrorLocalAfterCommit: async () => {
        throw new Error("IndexedDB full");
      },
      dispatchCloseAndCreateNext: () => {
        dispatched = true;
      },
      onError: (m) => {
        error = m;
      },
    });
    assert.equal(dispatched, false, "ne pas continuer en session N+1 éditable");
    assert.match(error ?? "", /Rechargez/);
  });

  it("double appel rapide : un seul commit", async () => {
    __testResetCloseAndCreateNextFiscalYearGuard();
    const workspace = baseWorkspace();
    const nextWorkspace = nextWorkspaceFor(workspace);
    let resolveFirst: (() => void) | undefined;
    const firstPending = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    let commitCalls = 0;
    const slowCommit = async (): Promise<TransitionCommitResult> => {
      commitCalls += 1;
      await firstPending;
      return stubServerCommit(nextWorkspace).fn();
    };
    const dispatches: PersistedWorkspace[] = [];
    const errors: (string | null)[] = [];

    const firstCall = runCloseAndCreateNextFiscalYear({
      dossierId: "dossier-1",
      userId: "user-1",
      workspace,
      flushForTransition: async () => ({ status: "ok", revision: 3 }),
      commitOnServer: slowCommit,
      getAuthToken: async () => "tok",
      mirrorLocalAfterCommit: async () => {},
      dispatchCloseAndCreateNext: (ws) => dispatches.push(ws),
      onError: (m) => errors.push(m),
    });
    const secondCall = runCloseAndCreateNextFiscalYear({
      dossierId: "dossier-1",
      userId: "user-1",
      workspace,
      flushForTransition: async () => ({ status: "ok", revision: 3 }),
      commitOnServer: slowCommit,
      getAuthToken: async () => "tok",
      mirrorLocalAfterCommit: async () => {},
      dispatchCloseAndCreateNext: (ws) => dispatches.push(ws),
      onError: (m) => errors.push(m),
    });
    resolveFirst?.();
    await Promise.all([firstCall, secondCall]);
    assert.equal(commitCalls, 1);
    assert.equal(dispatches.length, 1);
    assert.ok(errors.some((e) => e && e.length > 0));
  });
});
