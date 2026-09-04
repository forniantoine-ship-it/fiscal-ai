/**
 * P3-SOCLE-CYCLE-FISCAL — P0-1 v2 — tests de runCreateNextFiscalYear().
 * `persistTransition` est injecté (même pattern que `deleteOnServer` dans
 * document-deletion-plan.test.ts) — ces tests exercent le comportement RÉEL
 * de l'orchestration (préconditions, ordre, garde de réentrance), pas une
 * fonction pure isolée.
 * Run: npx tsx --test src/lib/lmnp/store/create-next-fiscal-year.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  runCreateNextFiscalYear,
  __testResetCreateNextFiscalYearGuard,
} from "./create-next-fiscal-year";
import type { PersistedWorkspace } from "./persistence";
import type { FiscalYear } from "../types";
import type { FiscalYearClosure } from "../types/dossier";
import type { PersistFiscalYearTransitionResult } from "./dossier-db";

function closure(overrides: Partial<FiscalYearClosure> = {}): FiscalYearClosure {
  return {
    id: "closure-1",
    fiscalYearId: "fy-1",
    dossierId: "dossier-1",
    stocks: { deficits: [], amortissementsReportes: 0 },
    computedAt: "2026-01-01T00:00:00.000Z",
    closedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function baseFiscalYear(overrides: Partial<FiscalYear> = {}): FiscalYear {
  return {
    id: "fy-1",
    year: 2025,
    status: "closed",
    regime: "reel",
    propertyIds: ["prop-1"],
    dossierId: "dossier-1",
    closures: [closure()],
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
    declarationDraft: { completedSteps: [] },
    ...overrides,
  };
}

function stubPersistTransition(nextFiscalYear: FiscalYear) {
  const calls: unknown[] = [];
  const fn = async (params: { dossierId: string; workspace: PersistedWorkspace; now: string }) => {
    calls.push(params);
    const result: PersistFiscalYearTransitionResult = {
      dossier: { id: params.dossierId, properties: [], financements: [], fiscalYearIds: [], createdAt: params.now, updatedAt: params.now },
      closedFiscalYear: { ...params.workspace.fiscalYear, dossierId: params.dossierId, documents: [], extractions: [], validationItems: [], ledgerEntries: [] },
      nextFiscalYear,
    };
    return result;
  };
  return { fn, calls };
}

describe("runCreateNextFiscalYear — préconditions (P0-1 v2)", () => {
  it("T-P0-1/T-P0-7/T-P0-8 — chemin nominal : persiste puis dispatche exactement le FiscalYear renvoyé", async () => {
    __testResetCreateNextFiscalYearGuard();
    const nextFiscalYear = baseFiscalYear({ id: "fy-2", year: 2026, status: "draft", previousFiscalYearId: "fy-1", closures: [] });
    const stub = stubPersistTransition(nextFiscalYear);
    let dispatched: FiscalYear | null = null;
    let error: string | null = "untouched";

    await runCreateNextFiscalYear({
      dossierId: "dossier-1",
      workspace: baseWorkspace(),
      persistTransition: stub.fn,
      dispatchCreateNextFiscalYear: (fy) => {
        dispatched = fy;
      },
      onError: (message) => {
        error = message;
      },
    });

    assert.equal(stub.calls.length, 1);
    assert.deepEqual(dispatched, nextFiscalYear, "le FiscalYear dispatché est EXACTEMENT celui renvoyé par la persistance, jamais recalculé");
    assert.equal(error, null);
  });

  it("T-P0-9 — les documents de N sont transmis tels quels à la persistance, jamais supprimés ni altérés par cette orchestration", async () => {
    __testResetCreateNextFiscalYearGuard();
    const documents = [
      { id: "doc-1", fiscalYearId: "fy-1", propertyId: "prop-1", fileName: "bail.pdf", mimeType: "application/pdf", sizeBytes: 100, category: "bail" as const, documentType: "lease_contract" as const, status: "analyzed" as const, uploadedAt: "2025-01-01T00:00:00.000Z", hasSupabaseArtifacts: true },
    ];
    const stub = stubPersistTransition(baseFiscalYear({ id: "fy-2" }));

    await runCreateNextFiscalYear({
      dossierId: "dossier-1",
      workspace: baseWorkspace({ documents }),
      persistTransition: stub.fn,
      dispatchCreateNextFiscalYear: () => {},
      onError: () => {},
    });

    assert.equal(stub.calls.length, 1);
    const passedWorkspace = (stub.calls[0] as { workspace: PersistedWorkspace }).workspace;
    assert.deepEqual(passedWorkspace.documents, documents, "les documents de N sont transmis intacts — aucune suppression, aucune purge Supabase dans ce flux");
  });

  it("T-P0-3 — dossierId === null → aucun appel de persistance, aucun dispatch, erreur explicite", async () => {
    __testResetCreateNextFiscalYearGuard();
    const stub = stubPersistTransition(baseFiscalYear({ id: "fy-2" }));
    let dispatched = false;
    let error: string | null = null;

    await runCreateNextFiscalYear({
      dossierId: null,
      workspace: baseWorkspace(),
      persistTransition: stub.fn,
      dispatchCreateNextFiscalYear: () => {
        dispatched = true;
      },
      onError: (message) => {
        error = message;
      },
    });

    assert.equal(stub.calls.length, 0, "aucune tentative de persistance sans dossierId");
    assert.equal(dispatched, false);
    assert.ok(error, "une erreur explicite doit être renvoyée");
  });

  it("T-P0-4 — N non clôturé → STOP, aucun appel de persistance, aucun dispatch", async () => {
    __testResetCreateNextFiscalYearGuard();
    const stub = stubPersistTransition(baseFiscalYear({ id: "fy-2" }));
    let dispatched = false;
    let error: string | null = null;

    await runCreateNextFiscalYear({
      dossierId: "dossier-1",
      workspace: baseWorkspace({ fiscalYear: baseFiscalYear({ status: "ready_to_close" }) }),
      persistTransition: stub.fn,
      dispatchCreateNextFiscalYear: () => {
        dispatched = true;
      },
      onError: (message) => {
        error = message;
      },
    });

    assert.equal(stub.calls.length, 0);
    assert.equal(dispatched, false);
    assert.ok(error);
  });

  it("T-P0-5 — closure absente → STOP, aucun appel de persistance, aucun dispatch", async () => {
    __testResetCreateNextFiscalYearGuard();
    const stub = stubPersistTransition(baseFiscalYear({ id: "fy-2" }));
    let dispatched = false;
    let error: string | null = null;

    await runCreateNextFiscalYear({
      dossierId: "dossier-1",
      workspace: baseWorkspace({ fiscalYear: baseFiscalYear({ closures: [] }) }),
      persistTransition: stub.fn,
      dispatchCreateNextFiscalYear: () => {
        dispatched = true;
      },
      onError: (message) => {
        error = message;
      },
    });

    assert.equal(stub.calls.length, 0);
    assert.equal(dispatched, false);
    assert.ok(error);
  });

  it("T-P0-10 — échec de persistance → aucun dispatch, aucune donnée locale modifiée (rien à annuler : aucune suppression n'a jamais eu lieu)", async () => {
    __testResetCreateNextFiscalYearGuard();
    let dispatched = false;
    let error: string | null = null;

    await runCreateNextFiscalYear({
      dossierId: "dossier-1",
      workspace: baseWorkspace(),
      persistTransition: async () => {
        throw new Error("écriture IndexedDB atomique échouée");
      },
      dispatchCreateNextFiscalYear: () => {
        dispatched = true;
      },
      onError: (message) => {
        error = message;
      },
    });

    assert.equal(dispatched, false);
    assert.equal(error, "écriture IndexedDB atomique échouée");
  });

  it("T-P0-11 — double appel rapide ne crée pas deux N+1 : le second est rejeté pendant que le premier est en cours", async () => {
    __testResetCreateNextFiscalYearGuard();
    let resolveFirst: (() => void) | undefined;
    const firstPending = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const nextFiscalYear = baseFiscalYear({ id: "fy-2" });

    const slowStub = {
      fn: async (p: { dossierId: string; workspace: PersistedWorkspace; now: string }) => {
        await firstPending;
        return {
          dossier: { id: p.dossierId, properties: [], financements: [], fiscalYearIds: [], createdAt: p.now, updatedAt: p.now },
          closedFiscalYear: { ...p.workspace.fiscalYear, dossierId: p.dossierId, documents: [], extractions: [], validationItems: [], ledgerEntries: [] },
          nextFiscalYear,
        } satisfies PersistFiscalYearTransitionResult;
      },
    };

    const dispatches: FiscalYear[] = [];
    const errors: (string | null)[] = [];

    const firstCall = runCreateNextFiscalYear({
      dossierId: "dossier-1",
      workspace: baseWorkspace(),
      persistTransition: slowStub.fn,
      dispatchCreateNextFiscalYear: (fy) => dispatches.push(fy),
      onError: (m) => errors.push(m),
    });

    // Le second appel démarre PENDANT que le premier est encore en vol.
    const secondCall = runCreateNextFiscalYear({
      dossierId: "dossier-1",
      workspace: baseWorkspace(),
      persistTransition: slowStub.fn,
      dispatchCreateNextFiscalYear: (fy) => dispatches.push(fy),
      onError: (m) => errors.push(m),
    });

    resolveFirst?.();
    await Promise.all([firstCall, secondCall]);

    assert.equal(dispatches.length, 1, "un seul N+1 doit avoir été dispatché malgré le double appel");
    assert.ok(errors.some((e) => e && e.length > 0), "le second appel doit recevoir une erreur explicite, pas un silence");
  });
});
