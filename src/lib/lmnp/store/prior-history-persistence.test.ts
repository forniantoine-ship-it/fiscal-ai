/**
 * P0 launch safety — antériorité LMNP au réel non reprise : réponse persistée,
 * rechargée, et continuité native réelle (IndexedDB, `fake-indexeddb`).
 *
 * Les imports touchant Supabase (transitivement, via dossier-db/persistence)
 * sont dynamiques : les variables d'environnement factices sont posées AVANT
 * leur évaluation, sans jamais lire `.env.local`.
 *
 * Run: npx tsx --test src/lib/lmnp/store/prior-history-persistence.test.ts
 */
import "fake-indexeddb/auto";
(globalThis as unknown as { window: unknown }).window = globalThis;
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";

import { before, describe, it } from "node:test";
import assert from "node:assert/strict";

import type { FiscalEngineOutput, FiscalYear, Property } from "../types";
import type { PersistedWorkspace } from "./persistence";
import type { LmnpState } from "./reducer";

type Mods = {
  reducer: typeof import("./reducer");
  persistence: typeof import("./persistence");
  dossierDb: typeof import("./dossier-db");
  db: typeof import("./db");
  eligibility: typeof import("../services/declaration/prior-history-eligibility");
  closeAndCreate: typeof import("./close-and-create-next-fiscal-year");
};
let m: Mods;

before(async () => {
  m = {
    reducer: await import("./reducer"),
    persistence: await import("./persistence"),
    dossierDb: await import("./dossier-db"),
    db: await import("./db"),
    eligibility: await import("../services/declaration/prior-history-eligibility"),
    closeAndCreate: await import("./close-and-create-next-fiscal-year"),
  };
});

const NOW = "2026-09-04T00:00:00.000Z";
let counter = 0;
const uid = (p: string) => `${p}-${++counter}`;

function fiscalYear(overrides: Partial<FiscalYear> = {}): FiscalYear {
  return {
    id: uid("fy"),
    year: 2025,
    status: "ready_to_close",
    regime: "reel",
    propertyIds: ["prop-1"],
    declarationGeneratedAt: NOW,
    closures: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const PROPERTY: Property = { id: "prop-1", label: "Mon bien", address: "1 rue X", city: "Lyon", postalCode: "69000" };

function fiscalResult(): FiscalEngineOutput {
  return {
    exercice: 2025,
    resultatFiscal: 5500,
    resultatAvantAmort: 7000,
    totalRecettes: 9000,
    totalCharges: 2000,
    amortDeduct: 1500,
    amortReporte: 0,
    deficitNouveau: 0,
    stocks: { deficits: [{ millesime: 2025, montant: 800 }], amortissementsReportes: 500 },
    trace: { ksArtifacts: [], computedAt: NOW, journal: [] },
    computedAt: NOW,
  };
}

function workspace(fy: FiscalYear): PersistedWorkspace {
  return {
    fiscalYear: fy,
    properties: [PROPERTY],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: { completedSteps: [], siren: "123456789", fiscalResult: fiscalResult() },
  };
}

function state(fy: FiscalYear): LmnpState {
  return { ...workspace(fy), fileRegistry: new Map() };
}

describe("réducteur — DECLARE_PRIOR_HISTORY", () => {
  it("enregistre la réponse avec l'exercice sans toucher au paiement ni à la génération", () => {
    const before = state(fiscalYear({ paidAt: NOW, declarationGeneratedAt: NOW }));
    const after = m.reducer.lmnpReducer(before, { type: "DECLARE_PRIOR_HISTORY", status: "FIRST_REAL_YEAR" });
    assert.equal(after.fiscalYear.priorHistoryDeclaration?.status, "FIRST_REAL_YEAR");
    assert.ok(after.fiscalYear.priorHistoryDeclaration?.declaredAt);
    assert.equal(after.fiscalYear.paidAt, NOW);
    assert.equal(after.fiscalYear.declarationGeneratedAt, NOW);
    assert.equal(after.fiscalYear.id, before.fiscalYear.id);
  });

  it("6 — changer la réponse recalcule l'éligibilité, y compris après paiement et génération", () => {
    let s = state(fiscalYear({ paidAt: NOW, declarationGeneratedAt: NOW }));
    s = m.reducer.lmnpReducer(s, { type: "DECLARE_PRIOR_HISTORY", status: "FIRST_REAL_YEAR" });
    assert.equal(m.eligibility.resolvePriorHistoryEligibility(s.fiscalYear).eligible, true);
    s = m.reducer.lmnpReducer(s, { type: "DECLARE_PRIOR_HISTORY", status: "EXTERNAL_HISTORY" });
    assert.equal(m.eligibility.resolvePriorHistoryEligibility(s.fiscalYear).eligible, false, "changement vers historique externe");
    s = m.reducer.lmnpReducer(s, { type: "DECLARE_PRIOR_HISTORY", status: "FISCAL_AI_PREVIOUS" });
    assert.equal(m.eligibility.resolvePriorHistoryEligibility(s.fiscalYear).eligible, false, "« Fiscal AI » sans continuité réelle");
    s = m.reducer.lmnpReducer(s, { type: "DECLARE_PRIOR_HISTORY", status: "FIRST_REAL_YEAR" });
    assert.equal(m.eligibility.resolvePriorHistoryEligibility(s.fiscalYear).eligible, true);
  });
});

describe("6 — persistance : un rechargement ne redemande pas et ne perd pas la réponse", () => {
  it("la réponse survit à un aller-retour IndexedDB (saveWorkspace → loadWorkspace)", async () => {
    const userId = uid("user");
    const s = m.reducer.lmnpReducer(state(fiscalYear()), { type: "DECLARE_PRIOR_HISTORY", status: "FIRST_REAL_YEAR" });
    await m.persistence.saveWorkspace(userId, {
      fiscalYear: s.fiscalYear,
      properties: s.properties,
      documents: s.documents,
      extractions: s.extractions,
      validationItems: s.validationItems,
      ledgerEntries: s.ledgerEntries,
      declarationDraft: s.declarationDraft,
    });
    const reloaded = await m.persistence.loadWorkspace(userId);
    assert.ok(reloaded);
    assert.equal(reloaded?.fiscalYear.priorHistoryDeclaration?.status, "FIRST_REAL_YEAR");
    assert.equal(m.eligibility.resolvePriorHistoryEligibility(reloaded!.fiscalYear).eligible, true);
  });

  it("un historique externe déclaré reste bloqué après rechargement", async () => {
    const userId = uid("user");
    const s = m.reducer.lmnpReducer(state(fiscalYear()), { type: "DECLARE_PRIOR_HISTORY", status: "EXTERNAL_HISTORY" });
    await m.persistence.saveWorkspace(userId, {
      fiscalYear: s.fiscalYear,
      properties: s.properties,
      documents: [],
      extractions: [],
      validationItems: [],
      ledgerEntries: [],
      declarationDraft: s.declarationDraft,
    });
    const reloaded = await m.persistence.loadWorkspace(userId);
    assert.equal(m.eligibility.resolvePriorHistoryEligibility(reloaded!.fiscalYear).eligible, false);
  });
});

describe("4 — continuité native RÉELLE : clôture IndexedDB → N+1 éligible sans nouvelle question", () => {
  it("N clôturé (réponse « première année ») → N+1 éligible par les données, sans réponse héritée, y compris après relecture et rechargement du workspace", async () => {
    const dossierId = uid("dossier");
    const userId = uid("user");
    const n = fiscalYear({ priorHistoryDeclaration: { status: "FIRST_REAL_YEAR", declaredAt: NOW } });

    const result = await m.dossierDb.persistFiscalYearClosureAndTransition({
      dossierId,
      userId,
      workspace: workspace(n),
      now: NOW,
    });

    const next = result.nextFiscalYear;
    assert.equal(next.priorHistoryDeclaration, undefined, "la réponse de N n'est jamais reportée");
    assert.deepEqual(m.eligibility.resolvePriorHistoryEligibility(next), {
      eligible: true,
      status: "NATIVE_CONTINUITY",
      basis: "proven_by_data",
    });
    assert.deepEqual(next.stocksOuverture?.stocks, { deficits: [{ millesime: 2025, montant: 800 }], amortissementsReportes: 500 });

    const reread = await m.db.getFiscalYearRecord<FiscalYear>(next.id);
    assert.equal(m.eligibility.resolvePriorHistoryEligibility(reread!).eligible, true, "relecture de l'archive IndexedDB");

    const reloaded = await m.persistence.loadWorkspace(userId);
    assert.equal(reloaded?.fiscalYear.id, next.id);
    assert.equal(m.eligibility.resolvePriorHistoryEligibility(reloaded!.fiscalYear).eligible, true, "rechargement du workspace actif");
  });
});

describe("contournement — l'orchestration de clôture refuse un exercice dont l'antériorité n'est pas établie", () => {
  async function tryClose(fy: FiscalYear): Promise<{ persisted: boolean; error: string | null }> {
    m.closeAndCreate.__testResetCloseAndCreateNextFiscalYearGuard();
    let persisted = false;
    let error: string | null = null;
    await m.closeAndCreate.runCloseAndCreateNextFiscalYear({
      dossierId: "dossier-x",
      userId: "user-x",
      workspace: { ...workspace({ ...fy, dossierId: "dossier-x" }) },
      // Lot 3 — flush succeeds so prepare can refuse on prior-history; commit must never run.
      flushForTransition: async () => ({ status: "ok", revision: 3 }),
      commitOnServer: async () => {
        persisted = true;
        throw new Error("ne doit jamais être appelée");
      },
      getAuthToken: async () => "tok",
      mirrorLocalAfterCommit: async () => {
        persisted = true;
      },
      dispatchCloseAndCreateNext: () => undefined,
      onError: (message) => {
        error = message;
      },
    });
    return { persisted, error };
  }

  it("historique externe déclaré (changé après génération) → aucune clôture, aucune persistance", async () => {
    const outcome = await tryClose(fiscalYear({ priorHistoryDeclaration: { status: "EXTERNAL_HISTORY", declaredAt: NOW } }));
    assert.equal(outcome.persisted, false);
    assert.match(outcome.error ?? "", /antériorité/);
  });

  it("aucune réponse → aucune clôture", async () => {
    const outcome = await tryClose(fiscalYear());
    assert.equal(outcome.persisted, false);
    assert.match(outcome.error ?? "", /antériorité/);
  });

  it("« Fiscal AI l'an dernier » sans continuité réelle → aucune clôture", async () => {
    const outcome = await tryClose(fiscalYear({ priorHistoryDeclaration: { status: "FISCAL_AI_PREVIOUS", declaredAt: NOW } }));
    assert.equal(outcome.persisted, false);
  });
});
