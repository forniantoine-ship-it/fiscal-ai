/**
 * F013 v2.2.1 — sécurité snapshot v3 / anti-downgrade / clôture mono.
 * Run: npx tsx --test src/lib/lmnp/services/f013/v2/f013-v2-transition.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createNextDeclarationDraft, canCloseFiscalYear, canCreateNextFiscalYear } from "@/lib/lmnp/services/dossier/fiscal-year-cycle";
import { createInMemoryFiscalYearTransitionStore } from "@/lib/lmnp/services/fiscal-year-transition/in-memory-store";
import { prepareFiscalYearTransitionCandidate } from "@/lib/lmnp/services/fiscal-year-transition/prepare-transition";
import {
  createStoreBackedTransitionHandlerDeps,
  handleFiscalYearTransitionRequest,
  type TransitionHandlerDeps,
} from "@/lib/lmnp/services/fiscal-year-transition/transition-handler";
import type { TransitionCommitResult } from "@/lib/lmnp/services/fiscal-year-transition/types";
import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { lmnpReducer, type LmnpState } from "@/lib/lmnp/store/reducer";
import { parseWorkspaceSnapshot, serializeWorkspaceSnapshot } from "@/lib/lmnp/store/workspace-snapshot";
import { snapshotWriteRejection } from "@/lib/lmnp/store/workspace-snapshot-client";
import type { DeclarationDraft, FiscalYear } from "@/lib/lmnp/types";

import { answerBalance, answerCollections, answerCoverage, answerExceptions, type BalanceKey } from "./f013-v2-manual-flow";
import {
  confirmRentReconciliation,
  createRentReconciliationState,
  evaluateRentReconciliation,
  parseRentReconciliationState,
  type RentReconciliationV2State,
} from "./f013-v2-state";

const NOW = "2026-09-21T20:00:00.000Z";
const YEAR = 2025;
const DOSSIER = "dossier-1";
const OWNER = "user-owner";
const eur = (n: number) => Math.round(n * 100);
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  assert.equal(r.ok, true);
  return r as Extract<T, { ok: true }>;
};

function rentState(e: number, o: Partial<Record<BalanceKey, number>> = {}, propertyId = "prop-1"): RentReconciliationV2State {
  const scope = { propertyId, fiscalYear: YEAR };
  let s = createRentReconciliationState(scope);
  s = ok(answerCollections(s, eur(e))).state;
  s = answerCoverage(s, "all");
  for (const key of ["openingReceivables", "closingReceivables", "openingAdvances", "closingAdvances"] as BalanceKey[]) {
    const a = o[key];
    s = ok(answerBalance(s, key, a ? { answer: "some", amountCents: eur(a) } : { answer: "none" })).state;
  }
  s = ok(answerExceptions(s, { answer: "none" })).state;
  return ok(confirmRentReconciliation(s, scope, NOW)).state;
}

// --- Fixture mono clôturable (même forme que lot3-transition.test.ts) -----------------------------------------
function baseFiscalYear(): FiscalYear {
  return {
    id: "fy-1", year: YEAR, status: "ready_to_close", regime: "reel", propertyIds: ["prop-1"], dossierId: DOSSIER,
    declarationGeneratedAt: NOW, priorHistoryDeclaration: { status: "FIRST_REAL_YEAR", declaredAt: NOW },
    closures: [], createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-01T00:00:00.000Z",
  };
}
function closableDraft(): DeclarationDraft {
  const draft = {
    completedSteps: [], inpiConfirmedAt: NOW, logementConfirmedAt: NOW,
    logementAmortissement: {
      computedAt: NOW, prixRevient: 200000, valeurTerrain: 40000, valeurBati: 160000, baseAmortissableBati: 160000,
      montantMobilier: 0, dotationAnnuelle: 5333, dureeMoyenneAnnees: 30, plan: { lignes: [], totalAnnuelExercice: 0, totalBrut: 0 },
    },
    creditDeclaredNoneAt: NOW, revenusConfirmedAt: NOW, chargesConfirmedAt: NOW, amortissementConfirmedAt: NOW,
    siret: "12345678901234", siren: "123456789", exploitantFirstName: "Marie", exploitantLastName: "Dupont",
    exploitantEmail: "marie.dupont@example.com", exploitantTelephone: "0601020304", personalAddress: "10 rue des Lilas",
    personalCity: "Lyon", personalPostalCode: "69001", dateMiseEnService: "2020-01-01",
    revenusAssistant: { exerciceFiscal: YEAR, totalRecettes: 9000 },
    chargesAssistant: { exerciceFiscal: YEAR, totalDeductible: 2000, totalPreExploitation: 0 },
    amortissementAssistant: { exerciceFiscal: YEAR, totalDotations: 1500, status: "validated" },
  } as DeclarationDraft;
  const generation = runDeclarationGeneration(draft, YEAR);
  assert.equal(generation.status, "generated");
  if (generation.status !== "generated") throw new Error("unreachable");
  return { ...draft, fiscalResult: generation.fiscalResult, rfs: generation.rfs } as DeclarationDraft;
}
function closableWorkspace(rent?: RentReconciliationV2State): PersistedWorkspace {
  const draft = closableDraft();
  return {
    fiscalYear: baseFiscalYear(),
    properties: [{ id: "prop-1", label: "Mon bien", address: "1 rue X", city: "Lyon", postalCode: "69000" }],
    documents: [], extractions: [], validationItems: [], ledgerEntries: [],
    declarationDraft: rent ? { ...draft, rentReconciliationV2: rent } : draft,
    aiActivityFeed: [],
  };
}
const prepare = (workspace: PersistedWorkspace) =>
  prepareFiscalYearTransitionCandidate({ workspace, dossierId: DOSSIER, now: NOW, nextFiscalYearId: "fy-next" });
const precondition = (workspace: PersistedWorkspace) =>
  canCloseFiscalYear({ fiscalYear: workspace.fiscalYear, declarationDraft: workspace.declarationDraft, properties: workspace.properties });

describe("SNAP — anti-downgrade et conservation", () => {
  it("SNAP-01 v3 : lire → modifier une donnée sans rapport → sauvegarder → reste v3, F013 v2 intact", () => {
    const rent = rentState(11000, { closingReceivables: 1000 });
    const ws = closableWorkspace(rent);
    const env1 = ok(serializeWorkspaceSnapshot(ws)).envelope;
    assert.equal(env1.schemaVersion, 3);
    const read = parseWorkspaceSnapshot(JSON.parse(JSON.stringify(env1)));
    assert.equal(read.ok, true);
    const loaded = read.ok ? read.envelope.workspace : ws;
    const edited: PersistedWorkspace = { ...loaded, declarationDraft: { ...loaded.declarationDraft, siret: "99999999999999" } };
    const env2 = ok(serializeWorkspaceSnapshot(edited)).envelope;
    assert.equal(env2.schemaVersion, 3);
    assert.deepEqual(parseRentReconciliationState(env2.workspace.declarationDraft.rentReconciliationV2), rent);
  });
  it("SNAP-01b v3 par le reducer réel : édition sans rapport conserve F013 v2", () => {
    const rent = rentState(12000);
    const state = { ...(closableWorkspace(rent) as unknown as LmnpState), fileRegistry: new Map() } as LmnpState;
    const next = lmnpReducer(state, { type: "DECLARATION_PATCH_DRAFT", patch: { siret: "11111111111111" } });
    assert.deepEqual(next.declarationDraft?.rentReconciliationV2, rent);
    assert.equal(ok(serializeWorkspaceSnapshot(next)).envelope.schemaVersion, 3);
  });
  it("SNAP-02 payload F013 v2 sous version ≤ 2 : rejet explicite (plat et scopé)", () => {
    const env = ok(serializeWorkspaceSnapshot(closableWorkspace(rentState(12000)))).envelope;
    for (const v of [1, 2]) assert.equal(parseWorkspaceSnapshot({ ...env, schemaVersion: v }).ok, false);
    const scopedDraft = { completedSteps: [], biens: { "prop-1": { propertyId: "prop-1", completedSteps: [], rentReconciliationV2: rentState(1000) } } };
    const scoped = { ...env, workspace: { ...env.workspace, declarationDraft: scopedDraft } };
    assert.equal(parseWorkspaceSnapshot({ ...scoped, schemaVersion: 2 }).ok, false);
    assert.equal(parseWorkspaceSnapshot({ ...scoped, schemaVersion: 3 }).ok, true);
  });
  it("SNAP-03 version 4 : schéma futur refusé", () => {
    const env = ok(serializeWorkspaceSnapshot(closableWorkspace(rentState(12000)))).envelope;
    const r = parseWorkspaceSnapshot({ ...env, schemaVersion: 4 });
    assert.equal(r.ok === false && r.reason, "unsupported_schema_version");
    assert.ok(snapshotWriteRejection({ schema_version: 4 }, 3));
  });
  it("SNAP-04 v1/v2 historiques sans F013 v2 : inchangés", () => {
    const mono = ok(serializeWorkspaceSnapshot(closableWorkspace())).envelope;
    assert.equal(mono.schemaVersion, 1);
    assert.equal(parseWorkspaceSnapshot(JSON.parse(JSON.stringify(mono))).ok, true);
    assert.equal(parseWorkspaceSnapshot({ ...mono, schemaVersion: 2 }).ok, false);
    const scopedWs = { ...mono.workspace, declarationDraft: { completedSteps: [], biens: { "prop-1": { propertyId: "prop-1", completedSteps: [] } } } };
    const scoped = ok(serializeWorkspaceSnapshot(scopedWs as PersistedWorkspace)).envelope;
    assert.equal(scoped.schemaVersion, 2);
    assert.equal(parseWorkspaceSnapshot(JSON.parse(JSON.stringify(scoped))).ok, true);
  });
  it("garde client : v3 jamais réécrit en v1/v2", () => {
    assert.ok(snapshotWriteRejection({ schema_version: 3 }, 1));
    assert.ok(snapshotWriteRejection({ schema_version: 3 }, 2));
    assert.equal(snapshotWriteRejection({ schema_version: 3 }, 3), null);
  });
});

describe("CLOSE — clôture mono avec F013 v2 : fail-closed", () => {
  it("CLOSE-V1 mono sans F013 v2 : clôture historique inchangée", () => {
    const ws = closableWorkspace();
    assert.equal(precondition(ws).ok, true);
    const p = prepare(ws);
    assert.equal(p.ok, true);
  });
  it("CLOSE-01 mono v3 (E=11 000, CC=1 000 → 12 000 € confirmé) : clôture refusée, raison structurée", () => {
    const rent = rentState(11000, { closingReceivables: 1000 });
    const ev = evaluateRentReconciliation(rent, { propertyId: "prop-1", fiscalYear: YEAR });
    assert.equal(ev.result.status === "SUPPORTED" && ev.result.loyersAcquisCents, eur(12000));
    assert.equal(ev.confirmationFresh, true);
    const ws = closableWorkspace(rent);
    const pre = precondition(ws);
    assert.equal(pre.ok, false);
    assert.equal(!pre.ok && pre.code, "f013_v2_continuity_not_supported");
    const p = prepare(ws);
    assert.equal(p.ok, false);
    assert.equal(!p.ok && p.code, "f013_v2_continuity_not_supported");
    assert.match(!p.ok ? p.reason : "", /rapprochement des loyers/);
  });
  it("CLOSE-03 mono v3 avec soldes nuls : également refusée (aucune continuité v2 définie, pas de zéros transportés)", () => {
    const ws = closableWorkspace(rentState(12000));
    assert.equal(precondition(ws).ok, false);
    const p = prepare(ws);
    assert.equal(!p.ok && p.code, "f013_v2_continuity_not_supported");
  });
  it("exercice déjà clos portant F013 v2 : création de N+1 refusée aussi", () => {
    const ws = closableWorkspace(rentState(12000));
    const closed: PersistedWorkspace = {
      ...ws,
      fiscalYear: { ...ws.fiscalYear, status: "closed", closures: [{ id: "c1" } as never] },
    };
    const pre = canCreateNextFiscalYear(closed.fiscalYear, closed);
    assert.equal(!pre.ok && pre.code, "f013_v2_continuity_not_supported");
    const p = prepare(closed);
    assert.equal(!p.ok && p.code, "f013_v2_continuity_not_supported");
  });
  it("preuve de nécessité : le constructeur N+1 ne reporte jamais rentReconciliationV2 (sans garde, perte silencieuse)", () => {
    const next = createNextDeclarationDraft(closableWorkspace(rentState(11000, { closingReceivables: 1000 })).declarationDraft);
    assert.equal(next.rentReconciliationV2, undefined);
  });
  it("CLOSE-02 / RELOAD après refus : N intact, rien de partiel, F013 v2 et confirmation identiques", () => {
    const rent = rentState(11000, { closingReceivables: 1000 });
    const ws = closableWorkspace(rent);
    const before = JSON.stringify(ws);
    const p = prepare(ws);
    assert.equal(p.ok, false);
    assert.equal(JSON.stringify(ws), before, "workspace source non muté");
    assert.equal(ws.fiscalYear.status, "ready_to_close");
    assert.equal(ws.fiscalYear.closures?.length, 0);
    const env = ok(serializeWorkspaceSnapshot(ws)).envelope;
    const reloaded = parseWorkspaceSnapshot(JSON.parse(JSON.stringify(env)));
    assert.equal(reloaded.ok, true);
    const restored = parseRentReconciliationState(reloaded.ok ? reloaded.envelope.workspace.declarationDraft.rentReconciliationV2 : undefined);
    assert.deepEqual(restored, rent);
    assert.equal(evaluateRentReconciliation(restored!, { propertyId: "prop-1", fiscalYear: YEAR }).confirmationFresh, true);
  });
});

describe("CLOSE — barrière serveur (autorité) et multi", () => {
  const envelope = (ws: PersistedWorkspace) => ok(serializeWorkspaceSnapshot(ws)).envelope;
  function setup(storedWs: PersistedWorkspace, transmitted: { closed: unknown; next: unknown }) {
    const stored = envelope(storedWs);
    const store = createInMemoryFiscalYearTransitionStore({
      dossiers: [{ id: DOSSIER, userId: OWNER, activeFiscalYear: YEAR }],
      snapshots: [{ dossierId: DOSSIER, fiscalYear: YEAR, schemaVersion: stored.schemaVersion, revision: 3, payload: stored, closedAt: null, successorFiscalYear: null, updatedAt: NOW }],
    });
    const base = createStoreBackedTransitionHandlerDeps(store);
    const calls = { commit: 0, payment: 0 };
    const deps: TransitionHandlerDeps = {
      ...base,
      paymentStore: { getByDossierYear: async (...a) => { calls.payment += 1; return base.paymentStore.getByDossierYear(...a); } },
      commit: async () => { calls.commit += 1; return { status: "committed" } as unknown as TransitionCommitResult; },
    };
    const post = () => handleFiscalYearTransitionRequest(
      new Request("http://localhost/x", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authToken: "tok-owner", dossierId: DOSSIER, fromYear: YEAR, nextYear: YEAR + 1, expectedRevision: 3,
          closedNPayload: transmitted.closed, closedNSchemaVersion: 3, nextPayload: transmitted.next, nextSchemaVersion: 1, now: NOW,
        }),
      }), () => deps);
    return { calls, post };
  }
  const plain = () => envelope(closableWorkspace());

  it("serveur : snapshot source portant F013 v2 → 409 avant paiement et commit, même si le client transmet des payloads propres", async () => {
    const ctx = setup(closableWorkspace(rentState(12000)), { closed: plain(), next: plain() });
    const res = await ctx.post();
    assert.equal(res.status, 409);
    assert.equal(((await res.json()) as { code: string }).code, "f013_v2_continuity_not_supported");
    assert.deepEqual(ctx.calls, { commit: 0, payment: 0 });
  });
  it("serveur : payload transmis portant F013 v2 (source propre) → 409", async () => {
    const ctx = setup(closableWorkspace(), { closed: envelope(closableWorkspace(rentState(12000))), next: plain() });
    assert.equal((await ctx.post()).status, 409);
    assert.equal(ctx.calls.commit, 0);
  });
  it("CLOSE-V1 serveur : sans F013 v2, chemin historique (commit appelé)", async () => {
    const ctx = setup(closableWorkspace(), { closed: plain(), next: plain() });
    assert.equal((await ctx.post()).status, 200);
    assert.equal(ctx.calls.commit, 1);
  });
  it("MULTI-CLOSE : la barrière multi garde son code et sa priorité", async () => {
    const multi = (ids: string[]): PersistedWorkspace => ({
      ...closableWorkspace(),
      fiscalYear: { ...baseFiscalYear(), propertyIds: ids },
      properties: ids.map((id) => ({ id, label: id, address: "", city: "", postalCode: "" })),
      declarationDraft: { completedSteps: [], biens: Object.fromEntries(ids.map((id) => [id, { propertyId: id, completedSteps: [], rentReconciliationV2: rentState(1000, {}, id) }])) },
    });
    const ws = multi(["A", "B"]);
    const pre = canCloseFiscalYear({ fiscalYear: ws.fiscalYear, declarationDraft: ws.declarationDraft, properties: ws.properties });
    assert.equal(!pre.ok && pre.code, "multi_property_not_enabled");
    const p = prepare(ws);
    assert.equal(!p.ok && p.code, "multi_property_not_enabled");
    const ctx = setup(ws, { closed: envelope(ws), next: envelope(ws) });
    const res = await ctx.post();
    assert.equal(res.status, 409);
    assert.equal(((await res.json()) as { code: string }).code, "multi_property_not_enabled");
    assert.equal(ctx.calls.commit, 0);
  });
  it("capacités multi inchangées", async () => {
    const { MULTI_PROPERTY_CAPABILITIES } = await import("@/lib/lmnp/dossier/multi-property-activation");
    assert.deepEqual({ ...MULTI_PROPERTY_CAPABILITIES }, { edition: true, generation: true, payment: true, delivery: true, closing: false, nextYear: false });
  });
});
