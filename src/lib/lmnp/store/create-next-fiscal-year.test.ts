/**
 * Lot 3 — create-next converge sur la même commande serveur (idempotente).
 * Run: npx tsx --test src/lib/lmnp/store/create-next-fiscal-year.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  runCreateNextFiscalYear,
  __testResetCreateNextFiscalYearGuard,
} from "./create-next-fiscal-year";
import type { PersistedWorkspace } from "./persistence";
import type { FiscalYear, Property } from "../types";
import type { FiscalYearClosure } from "../types/dossier";
import { serializeWorkspaceSnapshot } from "./workspace-snapshot";
import type { TransitionCommitResult } from "@/lib/lmnp/services/fiscal-year-transition/types";

const NOW = "2026-01-01T00:00:00.000Z";

function closure(overrides: Partial<FiscalYearClosure> = {}): FiscalYearClosure {
  return {
    id: "closure-1",
    fiscalYearId: "fy-1",
    dossierId: "dossier-1",
    stocks: { deficits: [], amortissementsReportes: 0 },
    computedAt: NOW,
    closedAt: NOW,
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
    updatedAt: NOW,
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

function nextWorkspace(properties?: Property[]): PersistedWorkspace {
  return {
    fiscalYear: baseFiscalYear({
      id: "fy-2",
      year: 2026,
      status: "draft",
      previousFiscalYearId: "fy-1",
      closures: [],
      stocksOuverture: {
        sourceClosureId: "closure-1",
        stocks: { deficits: [], amortissementsReportes: 0 },
      },
    }),
    properties: properties ?? [
      { id: "prop-1", label: "Mon bien", address: "1 rue X", city: "Lyon", postalCode: "69000" },
    ],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: { completedSteps: [] },
  };
}

function stubCommit(ws: PersistedWorkspace) {
  const serialized = serializeWorkspaceSnapshot(ws);
  assert.equal(serialized.ok, true);
  if (!serialized.ok) throw new Error("unreachable");
  return async (): Promise<TransitionCommitResult> => ({
    status: "idempotent",
    fromYear: 2025,
    nextYear: 2026,
    closedRevision: 4,
    nextRevision: 2,
    closedAt: NOW,
    activeFiscalYear: 2026,
    nextPayload: serialized.envelope,
    nextSchemaVersion: 1,
  });
}

describe("runCreateNextFiscalYear — Lot 3 server path", () => {
  it("chemin nominal : commit serveur → dispatch FiscalYear + properties exacts", async () => {
    __testResetCreateNextFiscalYearGuard();
    const props: Property[] = [
      {
        id: "prop-1",
        label: "Mon bien",
        address: "1 rue X",
        city: "Lyon",
        postalCode: "69000",
        amortissementBase: {
          composants: [
            {
              id: "travaux-1",
              label: "Extension",
              montant: 12000,
              dureeAnnees: 18,
              origin: "f012_travaux",
              dateDebut: "2025-06-01",
            },
          ],
        },
      },
    ];
    const ws = nextWorkspace(props);
    let dispatchedFy: FiscalYear | null = null;
    let dispatchedProps: Property[] | null = null;
    let error: string | null = "untouched";

    await runCreateNextFiscalYear({
      dossierId: "dossier-1",
      userId: "user-1",
      workspace: baseWorkspace(),
      flushForTransition: async () => ({ status: "ok", revision: 3 }),
      commitOnServer: stubCommit(ws),
      getAuthToken: async () => "tok",
      mirrorLocalAfterCommit: async () => {},
      dispatchCreateNextFiscalYear: (fy, properties) => {
        dispatchedFy = fy;
        dispatchedProps = properties;
      },
      onError: (m) => {
        error = m;
      },
    });

    assert.equal(dispatchedFy?.id, "fy-2");
    assert.equal(dispatchedFy?.previousFiscalYearId, "fy-1");
    assert.equal(dispatchedProps?.[0]?.amortissementBase?.composants[0]?.id, "travaux-1");
    assert.equal(error, null);
  });

  it("N non clos → refus, aucun commit", async () => {
    __testResetCreateNextFiscalYearGuard();
    let commitCalls = 0;
    let error: string | null = null;
    await runCreateNextFiscalYear({
      dossierId: "dossier-1",
      userId: "user-1",
      workspace: baseWorkspace({ fiscalYear: baseFiscalYear({ status: "draft", closures: [] }) }),
      flushForTransition: async () => ({ status: "ok", revision: 3 }),
      commitOnServer: async () => {
        commitCalls += 1;
        throw new Error("no");
      },
      getAuthToken: async () => "tok",
      dispatchCreateNextFiscalYear: () => {},
      onError: (m) => {
        error = m;
      },
    });
    assert.equal(commitCalls, 0);
    assert.ok(error);
  });

  it("dossierId null → refus", async () => {
    __testResetCreateNextFiscalYearGuard();
    let error: string | null = null;
    await runCreateNextFiscalYear({
      dossierId: null,
      userId: "user-1",
      workspace: baseWorkspace(),
      flushForTransition: async () => ({ status: "ok", revision: 3 }),
      commitOnServer: async () => {
        throw new Error("no");
      },
      getAuthToken: async () => "tok",
      dispatchCreateNextFiscalYear: () => {},
      onError: (m) => {
        error = m;
      },
    });
    assert.ok(error);
  });

  it("double appel : un seul commit", async () => {
    __testResetCreateNextFiscalYearGuard();
    const ws = nextWorkspace();
    let resolveFirst: (() => void) | undefined;
    const gate = new Promise<void>((r) => {
      resolveFirst = r;
    });
    let commitCalls = 0;
    const slow = async (): Promise<TransitionCommitResult> => {
      commitCalls += 1;
      await gate;
      return stubCommit(ws)();
    };
    const dispatches: FiscalYear[] = [];
    const errors: (string | null)[] = [];
    const a = runCreateNextFiscalYear({
      dossierId: "dossier-1",
      userId: "user-1",
      workspace: baseWorkspace(),
      flushForTransition: async () => ({ status: "ok", revision: 3 }),
      commitOnServer: slow,
      getAuthToken: async () => "tok",
      mirrorLocalAfterCommit: async () => {},
      dispatchCreateNextFiscalYear: (fy) => dispatches.push(fy),
      onError: (m) => errors.push(m),
    });
    const b = runCreateNextFiscalYear({
      dossierId: "dossier-1",
      userId: "user-1",
      workspace: baseWorkspace(),
      flushForTransition: async () => ({ status: "ok", revision: 3 }),
      commitOnServer: slow,
      getAuthToken: async () => "tok",
      mirrorLocalAfterCommit: async () => {},
      dispatchCreateNextFiscalYear: (fy) => dispatches.push(fy),
      onError: (m) => errors.push(m),
    });
    resolveFirst?.();
    await Promise.all([a, b]);
    assert.equal(commitCalls, 1);
    assert.equal(dispatches.length, 1);
    assert.ok(errors.some((e) => e && e.length > 0));
  });
});
