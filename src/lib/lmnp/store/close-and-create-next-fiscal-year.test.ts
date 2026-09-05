/**
 * Design Gate "Clôture N → N+1", Décision 1 — tests de
 * runCloseAndCreateNextFiscalYear(). `persistClosureAndTransition` et
 * `flushPendingWorkspace` sont injectés (même pattern que `persistTransition`
 * dans create-next-fiscal-year.test.ts) — ces tests exercent le comportement
 * RÉEL de l'orchestration (ordre, préconditions, garde de réentrance), pas
 * une fonction pure isolée. La persistance IndexedDB réelle est testée
 * séparément dans dossier-db.test.ts.
 * Run: npx tsx --test src/lib/lmnp/store/close-and-create-next-fiscal-year.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  runCloseAndCreateNextFiscalYear,
  __testResetCloseAndCreateNextFiscalYearGuard,
} from "./close-and-create-next-fiscal-year";
import { FiscalYearAlreadyClosedError } from "./dossier-db";
import type { PersistedWorkspace } from "./persistence";
import type { FiscalYear } from "../types";
import type { PersistFiscalYearClosureAndTransitionResult } from "./dossier-db";

function baseFiscalYear(overrides: Partial<FiscalYear> = {}): FiscalYear {
  return {
    id: "fy-1",
    year: 2025,
    status: "ready_to_close",
    regime: "reel",
    propertyIds: ["prop-1"],
    dossierId: "dossier-1",
    declarationGeneratedAt: "2026-09-01T00:00:00.000Z",
    closures: [],
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function baseWorkspace(overrides: Partial<PersistedWorkspace> = {}): PersistedWorkspace {
  return {
    fiscalYear: baseFiscalYear(),
    properties: [{ id: "prop-1", label: "Mon bien", address: "1 rue X", city: "Lyon", postalCode: "69000" }],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: { completedSteps: [], fiscalResult: undefined },
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

function stubPersist(nextWorkspace: PersistedWorkspace) {
  const calls: unknown[] = [];
  const fn = async (params: { dossierId: string; userId: string; workspace: PersistedWorkspace; now: string }) => {
    calls.push(params);
    const result: PersistFiscalYearClosureAndTransitionResult = {
      dossier: { id: params.dossierId, properties: [], financements: [], fiscalYearIds: [], createdAt: params.now, updatedAt: params.now },
      closedFiscalYear: { ...params.workspace.fiscalYear, dossierId: params.dossierId, status: "closed", documents: [], extractions: [], validationItems: [], ledgerEntries: [] },
      nextFiscalYear: nextWorkspace.fiscalYear,
      nextWorkspace,
    };
    return result;
  };
  return { fn, calls };
}

function stubFlush() {
  const calls: (string | null)[] = [];
  const fn = async (userId: string | null) => {
    calls.push(userId);
  };
  return { fn, calls };
}

describe("runCloseAndCreateNextFiscalYear — orchestration (Design Gate, Décision 1)", () => {
  it("chemin nominal : persiste puis dispatche exactement le workspace renvoyé", async () => {
    __testResetCloseAndCreateNextFiscalYearGuard();
    const workspace = baseWorkspace();
    const nextWorkspace = nextWorkspaceFor(workspace);
    const persist = stubPersist(nextWorkspace);
    const flush = stubFlush();
    let dispatched: PersistedWorkspace | null = null;
    let error: string | null = "untouched";

    await runCloseAndCreateNextFiscalYear({
      dossierId: "dossier-1",
      userId: "user-1",
      workspace,
      persistClosureAndTransition: persist.fn,
      flushPendingWorkspace: flush.fn,
      dispatchCloseAndCreateNext: (ws) => {
        dispatched = ws;
      },
      onError: (message) => {
        error = message;
      },
    });

    assert.equal(persist.calls.length, 1);
    assert.deepEqual(dispatched, nextWorkspace, "le workspace dispatché est EXACTEMENT celui renvoyé par la persistance, jamais recalculé");
    assert.equal(error, null);
  });

  it("ordre exact : flushPendingWorkspace est appelé AVANT persistClosureAndTransition (P0 FINAL GATE)", async () => {
    __testResetCloseAndCreateNextFiscalYearGuard();
    const workspace = baseWorkspace();
    const nextWorkspace = nextWorkspaceFor(workspace);
    const order: string[] = [];
    const persist = async (params: { dossierId: string; userId: string; workspace: PersistedWorkspace; now: string }) => {
      order.push("persist");
      return {
        dossier: { id: params.dossierId, properties: [], financements: [], fiscalYearIds: [], createdAt: params.now, updatedAt: params.now },
        closedFiscalYear: { ...params.workspace.fiscalYear, status: "closed" as const, documents: [], extractions: [], validationItems: [], ledgerEntries: [] },
        nextFiscalYear: nextWorkspace.fiscalYear,
        nextWorkspace,
      } satisfies PersistFiscalYearClosureAndTransitionResult;
    };
    const flush = async () => {
      order.push("flush");
    };

    await runCloseAndCreateNextFiscalYear({
      dossierId: "dossier-1",
      userId: "user-1",
      workspace,
      persistClosureAndTransition: persist,
      flushPendingWorkspace: flush,
      dispatchCloseAndCreateNext: () => {},
      onError: () => {},
    });

    assert.deepEqual(order, ["flush", "persist"], "le flush doit précéder la persistance, sans exception");
  });

  it("précondition n'est plus vraie (status !== ready_to_close) → refus explicite, aucune persistance, aucun dispatch, flush quand même exécuté", async () => {
    __testResetCloseAndCreateNextFiscalYearGuard();
    const workspace = baseWorkspace({ fiscalYear: baseFiscalYear({ status: "pending_validation" }) });
    const persist = stubPersist(nextWorkspaceFor(workspace));
    const flush = stubFlush();
    let dispatched = false;
    let error: string | null = null;

    await runCloseAndCreateNextFiscalYear({
      dossierId: "dossier-1",
      userId: "user-1",
      workspace,
      persistClosureAndTransition: persist.fn,
      flushPendingWorkspace: flush.fn,
      dispatchCloseAndCreateNext: () => {
        dispatched = true;
      },
      onError: (message) => {
        error = message;
      },
    });

    assert.equal(flush.calls.length, 1, "le flush a lieu même si la précondition métier échoue ensuite (annulation du debounce avant toute revalidation)");
    assert.equal(persist.calls.length, 0);
    assert.equal(dispatched, false);
    assert.ok(error);
  });

  it("declarationGeneratedAt absent malgré status ready_to_close → refus explicite", async () => {
    __testResetCloseAndCreateNextFiscalYearGuard();
    const workspace = baseWorkspace({
      fiscalYear: baseFiscalYear({ status: "ready_to_close", declarationGeneratedAt: undefined }),
    });
    const persist = stubPersist(nextWorkspaceFor(workspace));
    let dispatched = false;
    let error: string | null = null;

    await runCloseAndCreateNextFiscalYear({
      dossierId: "dossier-1",
      userId: "user-1",
      workspace,
      persistClosureAndTransition: persist.fn,
      flushPendingWorkspace: stubFlush().fn,
      dispatchCloseAndCreateNext: () => {
        dispatched = true;
      },
      onError: (message) => {
        error = message;
      },
    });

    assert.equal(persist.calls.length, 0);
    assert.equal(dispatched, false);
    assert.ok(error);
  });

  it("dossierId === null → aucune persistance, aucun dispatch, erreur explicite", async () => {
    __testResetCloseAndCreateNextFiscalYearGuard();
    const workspace = baseWorkspace();
    const persist = stubPersist(nextWorkspaceFor(workspace));
    let dispatched = false;
    let error: string | null = null;

    await runCloseAndCreateNextFiscalYear({
      dossierId: null,
      userId: "user-1",
      workspace,
      persistClosureAndTransition: persist.fn,
      flushPendingWorkspace: stubFlush().fn,
      dispatchCloseAndCreateNext: () => {
        dispatched = true;
      },
      onError: (message) => {
        error = message;
      },
    });

    assert.equal(persist.calls.length, 0);
    assert.equal(dispatched, false);
    assert.ok(error);
  });

  it("userId === null → aucune persistance, aucun dispatch, erreur explicite", async () => {
    __testResetCloseAndCreateNextFiscalYearGuard();
    const workspace = baseWorkspace();
    const persist = stubPersist(nextWorkspaceFor(workspace));
    let dispatched = false;
    let error: string | null = null;

    await runCloseAndCreateNextFiscalYear({
      dossierId: "dossier-1",
      userId: null,
      workspace,
      persistClosureAndTransition: persist.fn,
      flushPendingWorkspace: stubFlush().fn,
      dispatchCloseAndCreateNext: () => {
        dispatched = true;
      },
      onError: (message) => {
        error = message;
      },
    });

    assert.equal(persist.calls.length, 0);
    assert.equal(dispatched, false);
    assert.ok(error);
  });

  it("échec de persistance générique → aucun dispatch, message d'erreur propagé", async () => {
    __testResetCloseAndCreateNextFiscalYearGuard();
    let dispatched = false;
    let error: string | null = null;

    await runCloseAndCreateNextFiscalYear({
      dossierId: "dossier-1",
      userId: "user-1",
      workspace: baseWorkspace(),
      persistClosureAndTransition: async () => {
        throw new Error("écriture IndexedDB atomique échouée");
      },
      flushPendingWorkspace: stubFlush().fn,
      dispatchCloseAndCreateNext: () => {
        dispatched = true;
      },
      onError: (message) => {
        error = message;
      },
    });

    assert.equal(dispatched, false);
    assert.equal(error, "écriture IndexedDB atomique échouée");
  });

  it("FiscalYearAlreadyClosedError (conflit multi-onglet détecté par la persistance) → message explicite dédié, aucun dispatch", async () => {
    __testResetCloseAndCreateNextFiscalYearGuard();
    let dispatched = false;
    let error: string | null = null;

    await runCloseAndCreateNextFiscalYear({
      dossierId: "dossier-1",
      userId: "user-1",
      workspace: baseWorkspace(),
      persistClosureAndTransition: async () => {
        throw new FiscalYearAlreadyClosedError("fy-1");
      },
      flushPendingWorkspace: stubFlush().fn,
      dispatchCloseAndCreateNext: () => {
        dispatched = true;
      },
      onError: (message) => {
        error = message;
      },
    });

    assert.equal(dispatched, false);
    assert.ok(error?.includes("fy-1"));
  });

  it("double appel rapide (double-clic) ne déclenche pas deux transitions : le second est rejeté pendant que le premier est en cours", async () => {
    __testResetCloseAndCreateNextFiscalYearGuard();
    const workspace = baseWorkspace();
    const nextWorkspace = nextWorkspaceFor(workspace);
    let resolveFirst: (() => void) | undefined;
    const firstPending = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });

    const slowPersist = async (params: { dossierId: string; userId: string; workspace: PersistedWorkspace; now: string }) => {
      await firstPending;
      return {
        dossier: { id: params.dossierId, properties: [], financements: [], fiscalYearIds: [], createdAt: params.now, updatedAt: params.now },
        closedFiscalYear: { ...params.workspace.fiscalYear, status: "closed" as const, documents: [], extractions: [], validationItems: [], ledgerEntries: [] },
        nextFiscalYear: nextWorkspace.fiscalYear,
        nextWorkspace,
      } satisfies PersistFiscalYearClosureAndTransitionResult;
    };

    const dispatches: PersistedWorkspace[] = [];
    const errors: (string | null)[] = [];

    const firstCall = runCloseAndCreateNextFiscalYear({
      dossierId: "dossier-1",
      userId: "user-1",
      workspace,
      persistClosureAndTransition: slowPersist,
      flushPendingWorkspace: stubFlush().fn,
      dispatchCloseAndCreateNext: (ws) => dispatches.push(ws),
      onError: (m) => errors.push(m),
    });

    // Le second appel démarre PENDANT que le premier est encore en vol.
    const secondCall = runCloseAndCreateNextFiscalYear({
      dossierId: "dossier-1",
      userId: "user-1",
      workspace,
      persistClosureAndTransition: slowPersist,
      flushPendingWorkspace: stubFlush().fn,
      dispatchCloseAndCreateNext: (ws) => dispatches.push(ws),
      onError: (m) => errors.push(m),
    });

    resolveFirst?.();
    await Promise.all([firstCall, secondCall]);

    assert.equal(dispatches.length, 1, "un seul dispatch malgré le double appel");
    assert.ok(errors.some((e) => e && e.length > 0), "le second appel doit recevoir une erreur explicite, pas un silence");
  });
});
