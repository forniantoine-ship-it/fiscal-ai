import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type {
  ChargesExtractionData,
  CreditFinancingData,
  FiscalYear,
  LmnpDocument,
  Property,
} from "../types";

/**
 * P2-1.1 — reducer.ts importe transitivement src/lib/supabase.ts (client créé
 * au chargement du module) : import dynamique après avoir posé des valeurs
 * factices, même pattern que reducer-confirmation-invalidation.test.ts.
 */
async function loadReducer() {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.invalid.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const mod = await import("./reducer");
  return mod.lmnpReducer;
}

function baseFiscalYear(overrides: Partial<FiscalYear> = {}): FiscalYear {
  return {
    id: "fy-1",
    year: 2026,
    status: "draft",
    regime: "reel",
    propertyIds: ["prop-1"],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
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

function baseState(
  documents: LmnpDocument[],
  declarationDraft: ReducerState["declarationDraft"],
  fiscalYear: FiscalYear = baseFiscalYear(),
): ReducerState {
  return {
    fiscalYear,
    properties: [baseProperty()],
    documents,
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft,
    fileRegistry: new Map(),
  } as unknown as ReducerState;
}

const GENERATED_AT = "2026-06-01T10:00:00Z";
const PAID_AT = "2026-06-01T09:00:00Z";

const chargesExtractionFixture = { categories: [] } as unknown as ChargesExtractionData;
const creditFinancingFixture = { loans: [] } as unknown as CreditFinancingData;

describe("REMOVE_DOCUMENT — invalidation de declarationGeneratedAt (P2-1.1)", () => {
  it("#1 Revenus : document contributeur supprimé après génération → declarationGeneratedAt supprimé, paidAt inchangé", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      [doc("doc-revenus-1", "revenus")],
      {
        completedSteps: ["revenus"],
        revenueGptSession: { properties: [], mode: "upload" },
        revenusConfirmedAt: "2026-01-01T00:00:00Z",
      },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, { type: "REMOVE_DOCUMENT", documentId: "doc-revenus-1" });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(next.fiscalYear.paidAt, PAID_AT);
  });

  it("#2 Charges : document contributeur supprimé après génération → declarationGeneratedAt supprimé, paidAt inchangé", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      [doc("doc-charges-1", "charges")],
      {
        completedSteps: ["charges"],
        chargesDocumentIds: ["doc-charges-1"],
        chargesConfirmedAt: "2026-01-01T00:00:00Z",
        chargesExtraction: chargesExtractionFixture,
      },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, { type: "REMOVE_DOCUMENT", documentId: "doc-charges-1" });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(next.fiscalYear.paidAt, PAID_AT);
  });

  it("#3 Crédit : document contributeur supprimé après génération → declarationGeneratedAt supprimé, paidAt inchangé", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      [doc("doc-credit-1", "emprunt")],
      {
        completedSteps: ["credit"],
        creditDocumentId: "doc-credit-1",
        creditConfirmedAt: "2026-01-01T00:00:00Z",
        creditFinancing: creditFinancingFixture,
      },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, { type: "REMOVE_DOCUMENT", documentId: "doc-credit-1" });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(next.fiscalYear.paidAt, PAID_AT);
  });

  it("#4 Amortissement : document contributeur supprimé après génération → declarationGeneratedAt supprimé, paidAt inchangé", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      [doc("doc-amort-1", "amortissement")],
      {
        completedSteps: ["amortissement"],
        amortissementDocumentIds: ["doc-amort-1"],
        amortissementConfirmedAt: "2026-01-01T00:00:00Z",
      },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, { type: "REMOVE_DOCUMENT", documentId: "doc-amort-1" });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(next.fiscalYear.paidAt, PAID_AT);
  });

  it("#5a Revenus : mêmes conditions mais declarationGeneratedAt absent → reste absent, aucun comportement parasite", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      [doc("doc-revenus-1", "revenus")],
      {
        completedSteps: ["revenus"],
        revenueGptSession: { properties: [], mode: "upload" },
        revenusConfirmedAt: "2026-01-01T00:00:00Z",
      },
      baseFiscalYear(),
    );

    const next = lmnpReducer(state, { type: "REMOVE_DOCUMENT", documentId: "doc-revenus-1" });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(next.fiscalYear.paidAt, undefined);
    // La branche existante continue d'invalider la confirmation elle-même.
    assert.equal(next.declarationDraft?.revenusConfirmedAt, undefined);
  });

  it("#5b Charges : mêmes conditions mais declarationGeneratedAt absent → reste absent, aucun comportement parasite", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      [doc("doc-charges-1", "charges")],
      {
        completedSteps: ["charges"],
        chargesDocumentIds: ["doc-charges-1"],
        chargesConfirmedAt: "2026-01-01T00:00:00Z",
        chargesExtraction: chargesExtractionFixture,
      },
      baseFiscalYear(),
    );

    const next = lmnpReducer(state, { type: "REMOVE_DOCUMENT", documentId: "doc-charges-1" });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(next.fiscalYear.paidAt, undefined);
  });

  it("#5c Crédit : mêmes conditions mais declarationGeneratedAt absent → reste absent, aucun comportement parasite", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      [doc("doc-credit-1", "emprunt")],
      {
        completedSteps: ["credit"],
        creditDocumentId: "doc-credit-1",
        creditConfirmedAt: "2026-01-01T00:00:00Z",
        creditFinancing: creditFinancingFixture,
      },
      baseFiscalYear(),
    );

    const next = lmnpReducer(state, { type: "REMOVE_DOCUMENT", documentId: "doc-credit-1" });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(next.fiscalYear.paidAt, undefined);
  });

  it("#5d Amortissement : mêmes conditions mais declarationGeneratedAt absent → reste absent, aucun comportement parasite", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      [doc("doc-amort-1", "amortissement")],
      {
        completedSteps: ["amortissement"],
        amortissementDocumentIds: ["doc-amort-1"],
        amortissementConfirmedAt: "2026-01-01T00:00:00Z",
      },
      baseFiscalYear(),
    );

    const next = lmnpReducer(state, { type: "REMOVE_DOCUMENT", documentId: "doc-amort-1" });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(next.fiscalYear.paidAt, undefined);
  });

  it("#6a Charges : document non contributeur supprimé après génération → declarationGeneratedAt conservé", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      [doc("doc-charges-1", "charges"), doc("doc-autre", "autre")],
      {
        completedSteps: ["charges"],
        chargesDocumentIds: ["doc-charges-1"],
        chargesConfirmedAt: "2026-01-01T00:00:00Z",
        chargesExtraction: chargesExtractionFixture,
      },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, { type: "REMOVE_DOCUMENT", documentId: "doc-autre" });

    assert.equal(next.fiscalYear.declarationGeneratedAt, GENERATED_AT);
    assert.equal(next.fiscalYear.paidAt, PAID_AT);
  });

  it("#6b Crédit : document non contributeur supprimé après génération → declarationGeneratedAt conservé", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      [doc("doc-credit-1", "emprunt"), doc("doc-autre", "autre")],
      {
        completedSteps: ["credit"],
        creditDocumentId: "doc-credit-1",
        creditConfirmedAt: "2026-01-01T00:00:00Z",
        creditFinancing: creditFinancingFixture,
      },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, { type: "REMOVE_DOCUMENT", documentId: "doc-autre" });

    assert.equal(next.fiscalYear.declarationGeneratedAt, GENERATED_AT);
    assert.equal(next.fiscalYear.paidAt, PAID_AT);
  });

  it("#6c Amortissement : document non contributeur supprimé après génération → declarationGeneratedAt conservé", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      [doc("doc-amort-1", "amortissement"), doc("doc-autre", "autre")],
      {
        completedSteps: ["amortissement"],
        amortissementDocumentIds: ["doc-amort-1"],
        amortissementConfirmedAt: "2026-01-01T00:00:00Z",
      },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, { type: "REMOVE_DOCUMENT", documentId: "doc-autre" });

    assert.equal(next.fiscalYear.declarationGeneratedAt, GENERATED_AT);
    assert.equal(next.fiscalYear.paidAt, PAID_AT);
  });

  it("#6d Document local sans artefact Supabase, non contributeur : declarationGeneratedAt conservé", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      [
        doc("doc-amort-1", "amortissement"),
        doc("doc-libre", "autre", { hasSupabaseArtifacts: false }),
      ],
      {
        completedSteps: ["amortissement"],
        amortissementDocumentIds: ["doc-amort-1"],
        amortissementConfirmedAt: "2026-01-01T00:00:00Z",
      },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, { type: "REMOVE_DOCUMENT", documentId: "doc-libre" });

    assert.equal(next.fiscalYear.declarationGeneratedAt, GENERATED_AT);
    assert.equal(next.fiscalYear.paidAt, PAID_AT);
  });

  it("#7 Régression P1-5.2 : les quatre confirmations continuent d'être invalidées exactement comme avant", async () => {
    const lmnpReducer = await loadReducer();
    const ventilation = {
      components: [],
      summary: { componentCount: 0, travauxTotal: 0, mobilierTotal: 0, averageDurationYears: 0 },
    };
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
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, { type: "REMOVE_DOCUMENT", documentId: "doc-charges-1" });

    assert.equal(next.declarationDraft?.chargesConfirmedAt, undefined, "charges invalidé (contributeur supprimé)");
    assert.equal(next.declarationDraft?.creditConfirmedAt, "2026-01-01T00:00:00Z", "crédit non touché — document non lié");
    assert.equal(next.declarationDraft?.amortissementConfirmedAt, "2026-01-01T00:00:00Z", "amortissement non touché — document non lié");
    assert.deepEqual(next.declarationDraft?.amortissementVentilation, ventilation, "amortissementVentilation conservé");
    // Une seule branche contributive suffit à rendre la déclaration obsolète.
    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
  });

  it("#8 paidAt n'est jamais effacé, même quand declarationGeneratedAt l'est", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      [doc("doc-charges-1", "charges")],
      {
        completedSteps: ["charges"],
        chargesDocumentIds: ["doc-charges-1"],
        chargesConfirmedAt: "2026-01-01T00:00:00Z",
        chargesExtraction: chargesExtractionFixture,
      },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, { type: "REMOVE_DOCUMENT", documentId: "doc-charges-1" });

    assert.equal(next.fiscalYear.paidAt, PAID_AT, "le paiement déjà effectué n'est jamais remis en cause");
    assert.notEqual(next.fiscalYear.declarationGeneratedAt, GENERATED_AT);
  });
});
