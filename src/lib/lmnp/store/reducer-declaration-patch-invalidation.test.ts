import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type {
  AmortissementAssistantOutput,
  FinancementChargesOutput,
  FiscalYear,
  LogementAmortissementOutput,
  Property,
  RevenusAssistantOutput,
} from "../types";

/**
 * P2-2 — reducer.ts importe transitivement src/lib/supabase.ts (client créé
 * au chargement du module) : import dynamique après avoir posé des valeurs
 * factices, même pattern que reducer-declaration-invalidation.test.ts (P2-1.1).
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

type ReducerState = Parameters<Awaited<ReturnType<typeof loadReducer>>>[0];

function baseState(
  declarationDraft: ReducerState["declarationDraft"],
  fiscalYear: FiscalYear = baseFiscalYear(),
): ReducerState {
  return {
    fiscalYear,
    properties: [baseProperty()],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft,
    fileRegistry: new Map(),
  } as unknown as ReducerState;
}

const GENERATED_AT = "2026-06-01T10:00:00Z";
const PAID_AT = "2026-06-01T09:00:00Z";

function financementFixture(overrides: Partial<FinancementChargesOutput> = {}): FinancementChargesOutput {
  return {
    exerciceFiscal: 2026,
    totalInteretsEmprunt: 1000,
    totalInteretsPreExploitation: 0,
    totalCapitalRembourse: 2000,
    totalChargesFinancementExercice: 1000,
    prets: [],
    fieldSources: {},
    computedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function revenusFixture(overrides: Partial<RevenusAssistantOutput> = {}): RevenusAssistantOutput {
  return {
    exerciceFiscal: 2026,
    totalRecettes: 12000,
    loyersEncaisses: 12000,
    indemnitesAssurance: 0,
    recettesPlateforme: 0,
    ajustementsJanDec: 0,
    moisLocationEffectifs: 12,
    fieldSources: {},
    computedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function amortissementFixture(
  overrides: Partial<AmortissementAssistantOutput> = {},
): AmortissementAssistantOutput {
  return {
    exerciceFiscal: 2026,
    totalDotations: 5000,
    status: "validated",
    planVersion: "v1",
    profil: "PROF-001",
    validatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function logementAmortissementFixture(
  overrides: Partial<LogementAmortissementOutput> = {},
): LogementAmortissementOutput {
  return {
    prixRevient: 200000,
    valeurTerrain: 40000,
    valeurBati: 160000,
    baseAmortissableBati: 160000,
    montantMobilier: 10000,
    dotationAnnuelle: 4000,
    dureeMoyenneAnnees: 25,
    prorataRatio: 1,
    plan: { composants: [] } as unknown as LogementAmortissementOutput["plan"],
    fieldSources: {},
    computedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("DECLARATION_PATCH_DRAFT — invalidation de declarationGeneratedAt sur modification contributive (P2-2)", () => {
  it("#1 financementCharges modifié + declarationGeneratedAt posé → declarationGeneratedAt effacé, paidAt inchangé", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      { completedSteps: ["credit"], financementCharges: financementFixture(), creditConfirmedAt: "2026-01-01T00:00:00Z" },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { financementCharges: financementFixture({ totalInteretsEmprunt: 1500 }) },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(next.fiscalYear.paidAt, PAID_AT);
  });

  it("#2 revenusAssistant modifié + declarationGeneratedAt posé → declarationGeneratedAt effacé, paidAt inchangé", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      { completedSteps: ["revenus"], revenusAssistant: revenusFixture(), revenusConfirmedAt: "2026-01-01T00:00:00Z" },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { revenusAssistant: revenusFixture({ totalRecettes: 13000 }) },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(next.fiscalYear.paidAt, PAID_AT);
  });

  it("#3 amortissementAssistant modifié + declarationGeneratedAt posé → declarationGeneratedAt effacé, paidAt inchangé", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      {
        completedSteps: ["amortissement"],
        amortissementAssistant: amortissementFixture(),
        amortissementConfirmedAt: "2026-01-01T00:00:00Z",
      },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { amortissementAssistant: amortissementFixture({ totalDotations: 6000 }) },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(next.fiscalYear.paidAt, PAID_AT);
  });

  it("#4a financementCharges — même valeur qu'avant → pas d'invalidation inutile", async () => {
    const lmnpReducer = await loadReducer();
    const fixture = financementFixture();
    const state = baseState(
      { completedSteps: ["credit"], financementCharges: fixture },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    // Même valeur, nouvel objet (pas la même référence) — l'égalité doit être structurelle.
    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { financementCharges: { ...fixture } },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, GENERATED_AT);
  });

  it("#4b revenusAssistant — même valeur qu'avant → pas d'invalidation inutile", async () => {
    const lmnpReducer = await loadReducer();
    const fixture = revenusFixture();
    const state = baseState(
      { completedSteps: ["revenus"], revenusAssistant: fixture },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { revenusAssistant: { ...fixture } },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, GENERATED_AT);
  });

  it("#4c amortissementAssistant — même valeur qu'avant → pas d'invalidation inutile", async () => {
    const lmnpReducer = await loadReducer();
    const fixture = amortissementFixture();
    const state = baseState(
      { completedSteps: ["amortissement"], amortissementAssistant: fixture },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { amortissementAssistant: { ...fixture } },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, GENERATED_AT);
  });

  it("#5 patch non contributif (ex. logementDocumentId) → declarationGeneratedAt conservé", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      { completedSteps: [] },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { logementDocumentId: "doc-logement-1" },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, GENERATED_AT);
    assert.equal(next.declarationDraft?.logementDocumentId, "doc-logement-1");
  });

  it("#6a financementCharges modifié, declarationGeneratedAt absent → reste absent, aucun comportement parasite", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      { completedSteps: ["credit"], financementCharges: financementFixture() },
      baseFiscalYear(),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { financementCharges: financementFixture({ totalInteretsEmprunt: 1500 }) },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(next.fiscalYear.paidAt, undefined);
  });

  it("#6b revenusAssistant modifié, declarationGeneratedAt absent → reste absent, aucun comportement parasite", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      { completedSteps: ["revenus"], revenusAssistant: revenusFixture() },
      baseFiscalYear(),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { revenusAssistant: revenusFixture({ totalRecettes: 13000 }) },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(next.fiscalYear.paidAt, undefined);
  });

  it("#6c amortissementAssistant modifié, declarationGeneratedAt absent → reste absent, aucun comportement parasite", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      { completedSteps: ["amortissement"], amortissementAssistant: amortissementFixture() },
      baseFiscalYear(),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { amortissementAssistant: amortissementFixture({ totalDotations: 6000 }) },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(next.fiscalYear.paidAt, undefined);
  });

  it("#7 paidAt défini dans tous les scénarios de modification contributive → jamais modifié", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      {
        completedSteps: ["credit", "revenus", "amortissement"],
        financementCharges: financementFixture(),
        revenusAssistant: revenusFixture(),
        amortissementAssistant: amortissementFixture(),
      },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: {
        financementCharges: financementFixture({ totalInteretsEmprunt: 1500 }),
        revenusAssistant: revenusFixture({ totalRecettes: 13000 }),
        amortissementAssistant: amortissementFixture({ totalDotations: 6000 }),
      },
    });

    assert.equal(next.fiscalYear.paidAt, PAID_AT, "le paiement déjà effectué n'est jamais remis en cause");
    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
  });

  it("#8 revenusAssistant remis à undefined (reset) après génération → invalidation également déclenchée", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      { completedSteps: ["revenus"], revenusAssistant: revenusFixture(), revenusConfirmedAt: "2026-01-01T00:00:00Z" },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { revenusAssistant: undefined, revenusConfirmedAt: undefined },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(next.fiscalYear.paidAt, PAID_AT);
  });
});

describe("DECLARATION_PATCH_DRAFT — invalidation étendue à Logement/Activité (P2-3)", () => {
  it("#9 logementAmortissement modifié + declarationGeneratedAt posé → declarationGeneratedAt effacé, paidAt inchangé", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      {
        completedSteps: ["logement"],
        logementAmortissement: logementAmortissementFixture(),
        logementConfirmedAt: "2026-01-01T00:00:00Z",
      },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { logementAmortissement: logementAmortissementFixture({ dotationAnnuelle: 4500 }) },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(next.fiscalYear.paidAt, PAID_AT);
  });

  it("#10 logementAmortissement — même valeur qu'avant → pas d'invalidation inutile", async () => {
    const lmnpReducer = await loadReducer();
    const fixture = logementAmortissementFixture();
    const state = baseState(
      { completedSteps: ["logement"], logementAmortissement: fixture },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { logementAmortissement: { ...fixture } },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, GENERATED_AT);
  });

  it("#11 logementAmortissement modifié, declarationGeneratedAt absent → reste absent, aucun comportement parasite", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      { completedSteps: ["logement"], logementAmortissement: logementAmortissementFixture() },
      baseFiscalYear(),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { logementAmortissement: logementAmortissementFixture({ dotationAnnuelle: 4500 }) },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(next.fiscalYear.paidAt, undefined);
  });

  it("#12 siret modifié + declarationGeneratedAt posé → declarationGeneratedAt effacé, paidAt inchangé", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      { completedSteps: ["siren"], siret: "12345678900011", inpiConfirmedAt: "2026-01-01T00:00:00Z" },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { siret: "98765432100022" },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(next.fiscalYear.paidAt, PAID_AT);
  });

  it("#13 dateMiseEnService modifiée + declarationGeneratedAt posé → declarationGeneratedAt effacé, paidAt inchangé", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      { completedSteps: ["siren"], dateMiseEnService: "2025-03-01" },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { dateMiseEnService: "2025-04-15" },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(next.fiscalYear.paidAt, PAID_AT);
  });

  it("#14 activityType modifié + declarationGeneratedAt posé → declarationGeneratedAt effacé, paidAt inchangé", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      { completedSteps: ["siren"], activityType: "LMNP" },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { activityType: "LMP" },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(next.fiscalYear.paidAt, PAID_AT);
  });

  it("#15 siret/dateMiseEnService/activityType — même valeur qu'avant → pas d'invalidation inutile", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      {
        completedSteps: ["siren"],
        siret: "12345678900011",
        dateMiseEnService: "2025-03-01",
        activityType: "LMNP",
      },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { siret: "12345678900011", dateMiseEnService: "2025-03-01", activityType: "LMNP" },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, GENERATED_AT);
  });

  it("#16 siret/dateMiseEnService/activityType modifiés, declarationGeneratedAt absent → reste absent, aucun comportement parasite", async () => {
    const lmnpReducer = await loadReducer();
    const state = baseState(
      { completedSteps: ["siren"], siret: "12345678900011" },
      baseFiscalYear(),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { siret: "98765432100022" },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(next.fiscalYear.paidAt, undefined);
  });

  it("#17 F-012 Charges reste hors périmètre : chargesAssistant modifié + declarationGeneratedAt posé → aucune invalidation (non couvert, comme avant P2-2/P2-3)", async () => {
    const lmnpReducer = await loadReducer();
    const chargesFixture = {
      exerciceFiscal: 2026,
      totalDeductible: 1000,
      totalNonDeductible: 0,
      totalAmortissable: 0,
      totalPreExploitation: 0,
      parCategorie: {},
      composantsNouveaux: [],
      fieldSources: {},
      computedAt: "2026-01-01T00:00:00Z",
    };
    const state = baseState(
      { completedSteps: ["charges"], chargesAssistant: chargesFixture, chargesConfirmedAt: "2026-01-01T00:00:00Z" },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { chargesAssistant: { ...chargesFixture, totalDeductible: 2000 } },
    });

    assert.equal(
      next.fiscalYear.declarationGeneratedAt,
      GENERATED_AT,
      "F-012 est verrouillé en lecture seule une fois confirmé (audit P2-2/P2-3) — volontairement hors périmètre",
    );
  });
});
