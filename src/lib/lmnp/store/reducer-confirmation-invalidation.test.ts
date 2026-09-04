import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type {
  ChargesExtractionData,
  CreditFinancingData,
  FiscalYear,
  LmnpDocument,
  Property,
} from "../types";
import type { PersistedWorkspace } from "./persistence";

/**
 * P1-5.2 — reducer.ts importe transitivement src/lib/supabase.ts (client créé
 * au chargement du module) : import dynamique après avoir posé des valeurs
 * factices, même pattern que reducer-revenus-removal.test.ts.
 */
async function loadReducer() {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.invalid.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const mod = await import("./reducer");
  return mod.lmnpReducer;
}

function baseFiscalYear(): FiscalYear {
  return {
    id: "fy-1",
    year: 2026,
    status: "draft",
    regime: "reel",
    propertyIds: ["prop-1"],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function baseProperty(): Property {
  return { id: "prop-1", label: "", address: "", city: "", postalCode: "" };
}

function doc(id: string, category: LmnpDocument["category"], overrides: Partial<LmnpDocument> = {}): LmnpDocument {
  return {
    id,
    fiscalYearId: "fy-1",
    fileName: `${id}.pdf`,
    mimeType: "application/pdf",
    sizeBytes: 100,
    category,
    documentType: "unknown",
    status: "analyzed",
    uploadedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

type ReducerState = Parameters<Awaited<ReturnType<typeof loadReducer>>>[0];

function baseState(documents: LmnpDocument[], declarationDraft: ReducerState["declarationDraft"]): ReducerState {
  return {
    fiscalYear: baseFiscalYear(),
    properties: [baseProperty()],
    documents,
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft,
    fileRegistry: new Map(),
  } as unknown as ReducerState;
}

const chargesExtractionFixture = { categories: [] } as unknown as ChargesExtractionData;
const creditFinancingFixture = { loans: [] } as unknown as CreditFinancingData;

describe("REMOVE_DOCUMENT — invalidation des confirmations Charges/Crédit/Amortissement (P1-5.2)", () => {
  it("#1 Charges : document contributeur supprimé → chargesConfirmedAt supprimé", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      [doc("doc-charges-1", "charges")],
      {
        completedSteps: ["charges"],
        chargesDocumentIds: ["doc-charges-1"],
        chargesConfirmedAt: "2026-01-01T00:00:00Z",
        chargesExtraction: chargesExtractionFixture,
      },
    );

    const next = lmnpReducer(state, { type: "REMOVE_DOCUMENT", documentId: "doc-charges-1" });

    assert.equal(next.declarationDraft?.chargesConfirmedAt, undefined);
  });

  it("#2 Charges : document non contributeur supprimé → chargesConfirmedAt conservé", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      [doc("doc-charges-1", "charges"), doc("doc-autre", "autre")],
      {
        completedSteps: ["charges"],
        chargesDocumentIds: ["doc-charges-1"],
        chargesConfirmedAt: "2026-01-01T00:00:00Z",
        chargesExtraction: chargesExtractionFixture,
      },
    );

    const next = lmnpReducer(state, { type: "REMOVE_DOCUMENT", documentId: "doc-autre" });

    assert.equal(next.declarationDraft?.chargesConfirmedAt, "2026-01-01T00:00:00Z");
  });

  it("#3 Crédit : document contributeur supprimé → creditConfirmedAt supprimé", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      [doc("doc-credit-1", "emprunt")],
      {
        completedSteps: ["credit"],
        creditDocumentId: "doc-credit-1",
        creditConfirmedAt: "2026-01-01T00:00:00Z",
        creditFinancing: creditFinancingFixture,
      },
    );

    const next = lmnpReducer(state, { type: "REMOVE_DOCUMENT", documentId: "doc-credit-1" });

    assert.equal(next.declarationDraft?.creditConfirmedAt, undefined);
  });

  it("#4 Crédit : autre document supprimé → creditConfirmedAt conservé", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      [doc("doc-credit-1", "emprunt"), doc("doc-autre", "autre")],
      {
        completedSteps: ["credit"],
        creditDocumentId: "doc-credit-1",
        creditConfirmedAt: "2026-01-01T00:00:00Z",
        creditFinancing: creditFinancingFixture,
      },
    );

    const next = lmnpReducer(state, { type: "REMOVE_DOCUMENT", documentId: "doc-autre" });

    assert.equal(next.declarationDraft?.creditConfirmedAt, "2026-01-01T00:00:00Z");
  });

  it("#5 Amortissement : CONFIRM_AMORTISSEMENT capture correctement amortissementDocumentIds", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      [
        doc("doc-amort-1", "amortissement"),
        doc("doc-amort-2", "amortissement"),
        doc("doc-charges-1", "charges"),
      ],
      undefined,
    );

    const next = lmnpReducer(state, {
      type: "CONFIRM_AMORTISSEMENT",
      ventilation: { components: [], summary: { componentCount: 0, travauxTotal: 0, mobilierTotal: 0, averageDurationYears: 0 } },
    });

    assert.deepEqual(
      [...(next.declarationDraft?.amortissementDocumentIds ?? [])].sort(),
      ["doc-amort-1", "doc-amort-2"],
      "seuls les documents de catégorie amortissement sont capturés, pas les documents charges",
    );
  });

  it("#6 Amortissement : document contributeur supprimé → amortissementConfirmedAt supprimé", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      [doc("doc-amort-1", "amortissement")],
      {
        completedSteps: ["amortissement"],
        amortissementDocumentIds: ["doc-amort-1"],
        amortissementConfirmedAt: "2026-01-01T00:00:00Z",
        amortissementVentilation: { components: [{ id: "c1", label: "x", category: "Mobilier", ventilationPercent: 100, amount: 500, durationYears: 5, annualAmortization: 100, allocation: "immobilisation" }], summary: { componentCount: 1, travauxTotal: 0, mobilierTotal: 500, averageDurationYears: 5 } },
      },
    );

    const next = lmnpReducer(state, { type: "REMOVE_DOCUMENT", documentId: "doc-amort-1" });

    assert.equal(next.declarationDraft?.amortissementConfirmedAt, undefined);
  });

  it("#7 Amortissement : document non contributeur supprimé → confirmation conservée", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      [doc("doc-amort-1", "amortissement"), doc("doc-autre", "autre")],
      {
        completedSteps: ["amortissement"],
        amortissementDocumentIds: ["doc-amort-1"],
        amortissementConfirmedAt: "2026-01-01T00:00:00Z",
      },
    );

    const next = lmnpReducer(state, { type: "REMOVE_DOCUMENT", documentId: "doc-autre" });

    assert.equal(next.declarationDraft?.amortissementConfirmedAt, "2026-01-01T00:00:00Z");
  });

  it("#8 Plusieurs documents contributeurs : suppression d'un seul → confirmation invalidée, données conservées", async () => {
    const lmnpReducer = await loadReducer();
    const ventilation = {
      components: [{ id: "c1", label: "x", category: "Mobilier", ventilationPercent: 100, amount: 500, durationYears: 5, annualAmortization: 100, allocation: "immobilisation" as const }],
      summary: { componentCount: 1, travauxTotal: 0, mobilierTotal: 500, averageDurationYears: 5 },
    };
    const state = baseState(
      [doc("doc-amort-1", "amortissement"), doc("doc-amort-2", "amortissement")],
      {
        completedSteps: ["amortissement"],
        amortissementDocumentIds: ["doc-amort-1", "doc-amort-2"],
        amortissementConfirmedAt: "2026-01-01T00:00:00Z",
        amortissementVentilation: ventilation,
      },
    );

    const next = lmnpReducer(state, { type: "REMOVE_DOCUMENT", documentId: "doc-amort-1" });

    assert.equal(next.declarationDraft?.amortissementConfirmedAt, undefined, "un seul contributeur retiré suffit à invalider toute la confirmation");
    assert.deepEqual(next.declarationDraft?.amortissementVentilation, ventilation, "les données déjà calculées ne sont pas recalculées ni effacées");
  });

  it("#9 Aucune donnée fiscale confirmée n'est supprimée par REMOVE_DOCUMENT (Charges + Crédit + Amortissement en un seul état)", async () => {
    const lmnpReducer = await loadReducer();
    const ventilation = { components: [], summary: { componentCount: 0, travauxTotal: 0, mobilierTotal: 0, averageDurationYears: 0 } };
    const state = baseState(
      [doc("doc-charges-1", "charges"), doc("doc-credit-1", "emprunt"), doc("doc-amort-1", "amortissement")],
      {
        completedSteps: ["charges", "credit", "amortissement"],
        chargesDocumentIds: ["doc-charges-1"],
        chargesConfirmedAt: "2026-01-01T00:00:00Z",
        chargesExtraction: chargesExtractionFixture,
        creditDocumentId: "doc-credit-1",
        creditConfirmedAt: "2026-01-01T00:00:00Z",
        creditFinancing: creditFinancingFixture,
        amortissementDocumentIds: ["doc-amort-1"],
        amortissementConfirmedAt: "2026-01-01T00:00:00Z",
        amortissementVentilation: ventilation,
      },
    );

    const next = lmnpReducer(state, { type: "REMOVE_DOCUMENT", documentId: "doc-charges-1" });

    assert.equal(next.declarationDraft?.chargesConfirmedAt, undefined, "charges invalidé (contributeur supprimé)");
    assert.deepEqual(next.declarationDraft?.chargesExtraction, chargesExtractionFixture, "chargesExtraction conservé tel quel");
    assert.equal(next.declarationDraft?.creditConfirmedAt, "2026-01-01T00:00:00Z", "crédit non touché — document non lié");
    assert.deepEqual(next.declarationDraft?.creditFinancing, creditFinancingFixture, "creditFinancing conservé");
    assert.equal(next.declarationDraft?.amortissementConfirmedAt, "2026-01-01T00:00:00Z", "amortissement non touché — document non lié");
    assert.deepEqual(next.declarationDraft?.amortissementVentilation, ventilation, "amortissementVentilation conservé");
  });

  it("#11 Régression Revenus : le mécanisme existant reste seul déclencheur pour la catégorie revenus, inchangé", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      [doc("doc-revenus-1", "revenus"), doc("doc-charges-1", "charges")],
      {
        completedSteps: ["charges"],
        chargesDocumentIds: ["doc-charges-1"],
        chargesConfirmedAt: "2026-01-01T00:00:00Z",
        chargesExtraction: chargesExtractionFixture,
      },
    );

    // Supprimer un document revenus sans revenueGptSession ne doit déclencher
    // aucune des nouvelles branches charges/crédit/amortissement — elles sont
    // indépendantes et ne doivent réagir qu'à leurs propres listes d'ids.
    const next = lmnpReducer(state, { type: "REMOVE_DOCUMENT", documentId: "doc-revenus-1" });

    assert.equal(next.declarationDraft?.chargesConfirmedAt, "2026-01-01T00:00:00Z", "aucune interférence croisée entre catégories");
  });

  it("#12 Document local sans artefact Supabase, contributeur d'une confirmation : invalidation identique, aucun comportement serveur introduit", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      [doc("doc-amort-local", "amortissement", { hasSupabaseArtifacts: false })],
      {
        completedSteps: ["amortissement"],
        amortissementDocumentIds: ["doc-amort-local"],
        amortissementConfirmedAt: "2026-01-01T00:00:00Z",
      },
    );

    const next = lmnpReducer(state, { type: "REMOVE_DOCUMENT", documentId: "doc-amort-local" });

    assert.equal(
      next.declarationDraft?.amortissementConfirmedAt,
      undefined,
      "l'invalidation de confirmation est indépendante de hasSupabaseArtifacts — même comportement local ou Supabase",
    );
  });
});

describe("#10 Persistance : amortissementDocumentIds survit au round-trip structuredClone (IndexedDB)", () => {
  it("un workspace avec amortissementDocumentIds est conservé intégralement", () => {
    const workspace: PersistedWorkspace = {
      fiscalYear: baseFiscalYear(),
      properties: [baseProperty()],
      documents: [doc("doc-amort-1", "amortissement"), doc("doc-amort-2", "amortissement")],
      extractions: [],
      validationItems: [],
      ledgerEntries: [],
      declarationDraft: {
        completedSteps: ["amortissement"],
        amortissementDocumentIds: ["doc-amort-1", "doc-amort-2"],
        amortissementConfirmedAt: "2026-01-01T00:00:00Z",
      },
    } as unknown as PersistedWorkspace;

    const recovered = structuredClone(workspace);

    assert.deepEqual(
      recovered.declarationDraft?.amortissementDocumentIds,
      ["doc-amort-1", "doc-amort-2"],
      "amortissementDocumentIds doit survivre au clonage structuré sans transformation",
    );
    assert.equal(recovered.declarationDraft?.amortissementConfirmedAt, "2026-01-01T00:00:00Z");
  });
});
