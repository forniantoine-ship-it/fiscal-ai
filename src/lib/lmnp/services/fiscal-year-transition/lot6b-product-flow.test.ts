/**
 * Lot 6B — preuve d'intégration transversale du parcours produit N→N+1.
 *
 * Chaîne prouvée (fonctions de production + fakes in-memory) :
 *   N READY + PAID → TRANSITION → N CLOSED → N+1 ACTIVE
 *   → COLD RESTORE N+1 → HISTORY CONTAINS N → ARCHIVED N LOADS
 *   → ACTIVE REMAINS N+1 → PAYMENT N ≠ N+1 (+ delivery N ok / N+1 402)
 *
 * Run: npx tsx --test src/lib/lmnp/services/fiscal-year-transition/lot6b-product-flow.test.ts
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

import { createFakePaymentEnv } from "@/lib/lmnp/services/payment/payment-fakes";
import { resolveDeliveryAccess } from "@/lib/lmnp/services/payment/delivery-access";
import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import {
  listClosedFiscalYearArchives,
  loadArchivedWorkspaceFromServer,
} from "@/lib/lmnp/store/fiscal-year-archive";
import {
  __resetWorkspaceSnapshotSyncForTests,
  __setWorkspaceSnapshotStoreForTests,
  type WorkspaceSnapshotStore,
} from "@/lib/lmnp/store/workspace-snapshot-client";
import { serializeWorkspaceSnapshot, parseWorkspaceSnapshot } from "@/lib/lmnp/store/workspace-snapshot";
import { resolveWorkspaceHydration } from "@/lib/lmnp/store/workspace-snapshot-resolve";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { DeclarationDraft, FiscalYear } from "@/lib/lmnp/types/domain";
import { createInMemoryFiscalYearTransitionStore } from "./in-memory-store";
import { prepareFiscalYearTransitionCandidate } from "./prepare-transition";
import {
  createStoreBackedTransitionHandlerDeps,
  handleFiscalYearTransitionRequest,
} from "./transition-handler";

const NOW = "2026-09-21T20:30:00.000Z";
const DOSSIER = "dossier-6b-flow";
const OWNER = "user-owner";
const FROM_YEAR = 2025;
const NEXT_YEAR = 2026;
const EXPECTED_REVISION = 2;

function baseFiscalYear(overrides: Partial<FiscalYear> = {}): FiscalYear {
  return {
    id: "fy-n-flow",
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
    declaration: { currentVersionId: "ver-n-2025", versions: [] },
    revenusAssistant: { exerciceFiscal: FROM_YEAR, totalRecettes: 9000 },
    chargesAssistant: { exerciceFiscal: FROM_YEAR, totalDeductible: 2000, totalPreExploitation: 0 },
    amortissementAssistant: { exerciceFiscal: FROM_YEAR, totalDotations: 1500, status: "validated" },
  } as DeclarationDraft;
  const generation = runDeclarationGeneration(draft, FROM_YEAR);
  assert.equal(generation.status, "generated");
  if (generation.status !== "generated") throw new Error("unreachable");
  return {
    ...draft,
    fiscalResult: generation.fiscalResult,
    rfs: generation.rfs,
    liasseResult: generation.liasseResult,
    liasseRfs: generation.liasseRfs,
  } as DeclarationDraft;
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

/** Bridge transition in-memory store → WorkspaceSnapshotStore for history helpers. */
function snapshotStoreFromTransition(
  transition: ReturnType<typeof createInMemoryFiscalYearTransitionStore>,
): WorkspaceSnapshotStore {
  return {
    listByDossier: async (dossierId) => {
      const rows = [...transition.snapshots.values()].filter((s) => s.dossierId === dossierId);
      return rows.map((s) => ({
        dossierId: s.dossierId,
        fiscalYear: s.fiscalYear,
        schemaVersion: s.schemaVersion,
        revision: s.revision,
        payload: s.payload,
        updatedAt: s.updatedAt,
        closedAt: s.closedAt,
        successorFiscalYear: s.successorFiscalYear,
      }));
    },
    upsert: async () => {
      throw new Error("product-flow test must never upsert via archive path");
    },
  };
}

describe("Lot 6B — product flow transversal N→N+1", () => {
  afterEach(() => {
    __resetWorkspaceSnapshotSyncForTests();
  });

  it("N READY+PAID → transition → cold restore N+1 → history N → payments séparés", async () => {
    const workspace = closableWorkspace();
    const nFiscalResultExercice = workspace.declarationDraft?.fiscalResult?.exercice;
    assert.equal(nFiscalResultExercice, FROM_YEAR);

    const paymentEnv = createFakePaymentEnv();
    paymentEnv.addUser("tok-owner", OWNER);
    paymentEnv.addDossier(DOSSIER, OWNER);
    await paymentEnv.seedPaid(DOSSIER, FROM_YEAR);
    assert.equal((await paymentEnv.store.getByDossierYear(DOSSIER, NEXT_YEAR))?.status, undefined);

    const prepared = prepareFiscalYearTransitionCandidate({
      workspace,
      dossierId: DOSSIER,
      now: NOW,
      nextFiscalYearId: "fy-n1-flow",
    });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) throw new Error("unreachable");

    const openSerialized = serializeWorkspaceSnapshot(workspace);
    assert.equal(openSerialized.ok, true);
    if (!openSerialized.ok) throw new Error("unreachable");

    const transitionStore = createInMemoryFiscalYearTransitionStore({
      dossiers: [{ id: DOSSIER, userId: OWNER, activeFiscalYear: FROM_YEAR }],
      snapshots: [
        {
          dossierId: DOSSIER,
          fiscalYear: FROM_YEAR,
          schemaVersion: 1,
          revision: EXPECTED_REVISION,
          payload: openSerialized.envelope,
          closedAt: null,
          successorFiscalYear: null,
          updatedAt: NOW,
        },
      ],
    });

    const deps = createStoreBackedTransitionHandlerDeps(transitionStore, {
      paymentStore: paymentEnv.store,
    });

    const response = await handleFiscalYearTransitionRequest(
      new Request("http://localhost/api/lmnp/fiscal-year/transition", {
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
      }),
      () => deps,
    );
    assert.equal(response.status, 200);
    const commitBody = (await response.json()) as {
      ok?: boolean;
      nextYear?: number;
      activeFiscalYear?: number;
      status?: string;
    };
    assert.equal(commitBody.ok, true);
    assert.equal(commitBody.nextYear, NEXT_YEAR);
    assert.equal(commitBody.activeFiscalYear, NEXT_YEAR);

    const closedN = await transitionStore.getSnapshot(DOSSIER, FROM_YEAR);
    const openN1 = await transitionStore.getSnapshot(DOSSIER, NEXT_YEAR);
    assert.ok(closedN?.closedAt, "N CLOSED");
    assert.equal(closedN?.successorFiscalYear, NEXT_YEAR);
    assert.ok(openN1, "exactly one N+1 snapshot");
    assert.equal(openN1.closedAt, null);
    assert.equal(
      [...transitionStore.snapshots.keys()].filter((k) => k.startsWith(`${DOSSIER}:`)).length,
      2,
    );
    assert.equal((await transitionStore.getDossier(DOSSIER))?.activeFiscalYear, NEXT_YEAR);

    // Cold browser: local = null, active_fiscal_year from dossier.
    const listedForHydrate = await snapshotStoreFromTransition(transitionStore).listByDossier(DOSSIER);
    const activeYear = (await transitionStore.getDossier(DOSSIER))!.activeFiscalYear!;
    const hydration = resolveWorkspaceHydration({
      local: null,
      snapshots: listedForHydrate,
      fallbackYear: FROM_YEAR,
      activeFiscalYear: activeYear,
    });
    assert.ok(hydration.workspace);
    assert.equal(hydration.workspace.fiscalYear.year, NEXT_YEAR, "COLD RESTORE N+1");
    assert.equal(hydration.workspace.fiscalYear.status, "draft");

    __setWorkspaceSnapshotStoreForTests(snapshotStoreFromTransition(transitionStore));

    const history = await listClosedFiscalYearArchives(DOSSIER);
    assert.equal(history.status, "ok");
    if (history.status !== "ok") throw new Error("unreachable");
    assert.deepEqual(
      history.archives.map((a) => a.fiscalYear),
      [FROM_YEAR],
      "HISTORY CONTAINS N only",
    );

    const archived = await loadArchivedWorkspaceFromServer({
      dossierId: DOSSIER,
      fiscalYear: FROM_YEAR,
    });
    assert.equal(archived.status, "ok");
    if (archived.status !== "ok") throw new Error("unreachable");
    assert.equal(archived.readOnly, true);
    assert.equal(archived.blockWrites, true);
    assert.equal(archived.workspace.fiscalYear.year, FROM_YEAR);
    assert.equal(archived.workspace.fiscalYear.status, "closed");
    assert.equal(archived.workspace.declarationDraft?.fiscalResult?.exercice, FROM_YEAR);
    assert.equal(
      archived.workspace.declarationDraft?.declaration?.currentVersionId,
      "ver-n-2025",
    );

    // Consulting N must not regress active year.
    assert.equal((await transitionStore.getDossier(DOSSIER))?.activeFiscalYear, NEXT_YEAR);

    const payN = await paymentEnv.store.getByDossierYear(DOSSIER, FROM_YEAR);
    const payN1 = await paymentEnv.store.getByDossierYear(DOSSIER, NEXT_YEAR);
    assert.equal(payN?.status, "paid");
    assert.equal(payN1, null, "PAYMENT N ≠ N+1");

    const deliveryN = await resolveDeliveryAccess(
      { authToken: "tok-owner", dossierId: DOSSIER, fiscalYear: FROM_YEAR },
      paymentEnv.deps,
    );
    assert.equal(deliveryN.ok, true);

    const deliveryN1 = await resolveDeliveryAccess(
      { authToken: "tok-owner", dossierId: DOSSIER, fiscalYear: NEXT_YEAR },
      paymentEnv.deps,
    );
    assert.equal(deliveryN1.ok, false);
    if (deliveryN1.ok) throw new Error("unreachable");
    assert.equal(deliveryN1.response.status, 402);
    const deliveryBody = (await deliveryN1.response.json()) as { code?: string };
    assert.equal(deliveryBody.code, "payment_required");

    // N+1 payload remains the committed next workspace (sanity).
    const parsedN1 = parseWorkspaceSnapshot(openN1.payload);
    assert.equal(parsedN1.ok, true);
    if (!parsedN1.ok) throw new Error("unreachable");
    assert.equal(parsedN1.envelope.workspace.fiscalYear.year, NEXT_YEAR);
    assert.equal(parsedN1.envelope.workspace.fiscalYear.previousFiscalYearId, "fy-n-flow");
  });
});
