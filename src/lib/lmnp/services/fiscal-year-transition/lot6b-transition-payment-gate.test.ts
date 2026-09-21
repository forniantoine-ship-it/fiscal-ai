/**
 * Lot 6B — payment gate on POST /api/lmnp/fiscal-year/transition.
 *
 * Authority = lmnp_declaration_payments for (dossierId, fromYear) only.
 * Run: npx tsx --test src/lib/lmnp/services/fiscal-year-transition/lot6b-transition-payment-gate.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createFakePaymentEnv } from "@/lib/lmnp/services/payment/payment-fakes";
import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import { serializeWorkspaceSnapshot } from "@/lib/lmnp/store/workspace-snapshot";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { DeclarationDraft, FiscalYear } from "@/lib/lmnp/types/domain";
import { createInMemoryFiscalYearTransitionStore } from "./in-memory-store";
import { prepareFiscalYearTransitionCandidate } from "./prepare-transition";
import {
  createStoreBackedTransitionHandlerDeps,
  handleFiscalYearTransitionRequest,
  type TransitionHandlerDeps,
} from "./transition-handler";

const NOW = "2026-09-21T20:00:00.000Z";
const DOSSIER = "dossier-6b";
const OWNER = "user-owner";
const FROM_YEAR = 2025;
const NEXT_YEAR = 2026;
const EXPECTED_REVISION = 3;

function baseFiscalYear(overrides: Partial<FiscalYear> = {}): FiscalYear {
  return {
    id: "fy-n",
    year: FROM_YEAR,
    status: "ready_to_close",
    regime: "reel",
    propertyIds: ["prop-1"],
    dossierId: DOSSIER,
    declarationGeneratedAt: NOW,
    priorHistoryDeclaration: { status: "FIRST_REAL_YEAR", declaredAt: NOW },
    closures: [],
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: NOW,
    ...overrides,
  };
}

function closableDraft(): DeclarationDraft {
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
  assert.equal(generation.status, "generated");
  if (generation.status !== "generated") throw new Error("unreachable");
  return { ...draft, fiscalResult: generation.fiscalResult, rfs: generation.rfs } as DeclarationDraft;
}

function closableWorkspace(): PersistedWorkspace {
  return {
    fiscalYear: baseFiscalYear(),
    properties: [{ id: "prop-1", label: "Bien", address: "1 rue X", city: "Lyon", postalCode: "69000" }],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: closableDraft(),
    aiActivityFeed: [],
  };
}

async function setupTransitionRequest(options: {
  paymentStore: TransitionHandlerDeps["paymentStore"];
  wrapCommit?: (commit: TransitionHandlerDeps["commit"]) => TransitionHandlerDeps["commit"];
}) {
  const workspace = closableWorkspace();
  const prepared = prepareFiscalYearTransitionCandidate({
    workspace,
    dossierId: DOSSIER,
    now: NOW,
    nextFiscalYearId: "fy-n1",
  });
  assert.equal(prepared.ok, true);
  if (!prepared.ok) throw new Error("unreachable");

  const serialized = serializeWorkspaceSnapshot(workspace);
  assert.equal(serialized.ok, true);
  if (!serialized.ok) throw new Error("unreachable");

  const store = createInMemoryFiscalYearTransitionStore({
    dossiers: [{ id: DOSSIER, userId: OWNER, activeFiscalYear: FROM_YEAR }],
    snapshots: [
      {
        dossierId: DOSSIER,
        fiscalYear: FROM_YEAR,
        schemaVersion: 1,
        revision: EXPECTED_REVISION,
        payload: serialized.envelope,
        closedAt: null,
        successorFiscalYear: null,
        updatedAt: NOW,
      },
    ],
  });

  const baseDeps = createStoreBackedTransitionHandlerDeps(store, {
    paymentStore: options.paymentStore,
  });
  let commitCalls = 0;
  const trackedCommit: TransitionHandlerDeps["commit"] = async (input) => {
    commitCalls += 1;
    return baseDeps.commit(input);
  };
  const commit = options.wrapCommit ? options.wrapCommit(trackedCommit) : trackedCommit;
  const deps: TransitionHandlerDeps = { ...baseDeps, commit };

  const request = new Request("http://localhost/api/lmnp/fiscal-year/transition", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      authToken: "tok-owner",
      dossierId: DOSSIER,
      fromYear: prepared.fromYear,
      nextYear: prepared.nextYear,
      expectedRevision: EXPECTED_REVISION,
      closedNPayload: prepared.closedNPayload,
      closedNSchemaVersion: prepared.closedNSchemaVersion,
      nextPayload: prepared.nextPayload,
      nextSchemaVersion: prepared.nextSchemaVersion,
      now: NOW,
    }),
  });

  return {
    store,
    prepared,
    commitCalls: () => commitCalls,
    post: () => handleFiscalYearTransitionRequest(request.clone(), () => deps),
  };
}

describe("Lot 6B — transition payment gate (dossierId + fromYear)", () => {
  it("A — N unpaid → 402 payment_required, commit jamais appelé", async () => {
    const env = createFakePaymentEnv();
    env.addUser("tok-owner", OWNER);
    env.addDossier(DOSSIER, OWNER);
    // N absent / unpaid ; N+1 paid ne doit rien changer (voir C).
    await env.seedPaid(DOSSIER, NEXT_YEAR);

    const ctx = await setupTransitionRequest({ paymentStore: env.store });
    const response = await ctx.post();
    assert.equal(response.status, 402);
    const body = (await response.json()) as { code?: string };
    assert.equal(body.code, "payment_required");
    assert.equal(ctx.commitCalls(), 0);
    assert.equal((await ctx.store.getSnapshot(DOSSIER, FROM_YEAR))?.closedAt, null);
    assert.equal(await ctx.store.getSnapshot(DOSSIER, NEXT_YEAR), null);
  });

  it("B — N paid → commit autorisé", async () => {
    const env = createFakePaymentEnv();
    env.addUser("tok-owner", OWNER);
    env.addDossier(DOSSIER, OWNER);
    await env.seedPaid(DOSSIER, FROM_YEAR);

    const ctx = await setupTransitionRequest({ paymentStore: env.store });
    const response = await ctx.post();
    assert.equal(response.status, 200);
    const body = (await response.json()) as { ok?: boolean; nextYear?: number; activeFiscalYear?: number };
    assert.equal(body.ok, true);
    assert.equal(body.nextYear, NEXT_YEAR);
    assert.equal(body.activeFiscalYear, NEXT_YEAR);
    assert.equal(ctx.commitCalls(), 1);
    assert.ok((await ctx.store.getSnapshot(DOSSIER, FROM_YEAR))?.closedAt);
    assert.ok(await ctx.store.getSnapshot(DOSSIER, NEXT_YEAR));
  });

  it("C — N+1 paid mais N unpaid → transition N refusée", async () => {
    const env = createFakePaymentEnv();
    env.addUser("tok-owner", OWNER);
    env.addDossier(DOSSIER, OWNER);
    await env.seedPaid(DOSSIER, NEXT_YEAR);
    // Explicit: no N row / unpaid.
    const nRow = await env.store.getByDossierYear(DOSSIER, FROM_YEAR);
    assert.equal(nRow, null);

    const ctx = await setupTransitionRequest({ paymentStore: env.store });
    const response = await ctx.post();
    assert.equal(response.status, 402);
    assert.equal(((await response.json()) as { code?: string }).code, "payment_required");
    assert.equal(ctx.commitCalls(), 0);
  });

  it("D — N paid mais N+1 unpaid → transition N autorisée", async () => {
    const env = createFakePaymentEnv();
    env.addUser("tok-owner", OWNER);
    env.addDossier(DOSSIER, OWNER);
    await env.seedPaid(DOSSIER, FROM_YEAR);
    const n1 = await env.store.getByDossierYear(DOSSIER, NEXT_YEAR);
    assert.equal(n1, null, "N+1 unpaid / absent");

    const ctx = await setupTransitionRequest({ paymentStore: env.store });
    const response = await ctx.post();
    assert.equal(response.status, 200);
    assert.equal(ctx.commitCalls(), 1);
    assert.equal((await ctx.store.getDossier(DOSSIER))?.activeFiscalYear, NEXT_YEAR);
  });
});
