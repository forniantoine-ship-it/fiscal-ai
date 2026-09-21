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
import type { PretFinancementExercice } from "@/runtime/capabilities/f011/types";
import type { BilanInputs, VentilationTiersInputs } from "@/runtime/capabilities/bilan/types";
import {
  buildVentilationTiersInputs,
  deriveVentilationTiersIntakeState,
  EMPTY_VENTILATION_TIERS_INTAKE_STATE,
} from "../services/declaration/ventilation-tiers-intake";
import { resolveDeclarationGenerationGate } from "../services/declaration/declaration-generation-gate";
import { runDeclarationGeneration } from "../services/declaration/run-declaration-generation";

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

  it("#13b Lot 4 blocker — dateMiseEnService A→B invalide F010–F014 dérivés + génération ; A→A no-op ; inputs source préservés", async () => {
    const lmnpReducer = await loadReducer();
    const DATE_A = "2020-01-01";
    const DATE_B = "2021-06-15";
    const logementState = {
      step: "complete" as const,
      nature: "achat" as const,
      acquisitionSource: "manuel" as const,
      prixAcquisition: 250000,
      typeBien: "appartement" as const,
      surface: 55,
      adresse: "12 rue Test",
      dateAcquisition: "2019-03-15",
      fraisNotaire: 15000,
      choixTraitementFrais: "deduction" as const,
      montantMobilier: 5000,
      fieldSources: {},
      confirmed: { prixAcquisition: true },
      updatedAt: "2026-01-01T00:00:00Z",
    };
    const financementState = {
      step: "complete" as const,
      presenceEmprunt: true,
      nombrePrets: 1,
      currentLoanIndex: 0,
      loans: [],
      fieldSources: {},
      updatedAt: "2026-01-01T00:00:00Z",
    };
    const chargesState = {
      step: "complete" as const,
      fieldSources: {},
      updatedAt: "2026-01-01T00:00:00Z",
    };
    const chargesOutput = {
      exerciceFiscal: 2026,
      totalDeductible: 2000,
      totalNonDeductible: 0,
      totalAmortissable: 0,
      totalPreExploitation: 0,
      parCategorie: {},
      composantsNouveaux: [],
      fieldSources: {},
      computedAt: "2026-01-01T00:00:00Z",
    };
    const draft = {
      completedSteps: ["siren", "logement", "credit", "charges", "revenus", "amortissement"],
      dateMiseEnService: DATE_A,
      logementAssistantState: logementState as never,
      financementAssistantState: financementState as never,
      chargesAssistantState: chargesState as never,
      logementAmortissement: logementAmortissementFixture({ exerciceFiscal: 2026 }),
      financementCharges: financementFixture(),
      chargesAssistant: chargesOutput,
      revenusAssistant: revenusFixture(),
      amortissementAssistant: amortissementFixture(),
      logementConfirmedAt: "2026-01-01T00:00:00Z",
      creditConfirmedAt: "2026-01-01T00:00:00Z",
      chargesConfirmedAt: "2026-01-01T00:00:00Z",
      revenusConfirmedAt: "2026-01-01T00:00:00Z",
      amortissementConfirmedAt: "2026-01-01T00:00:00Z",
      fiscalResult: { exercice: 2026, resultatFiscal: 1000 } as never,
      rfs: { kind: "rfs" } as never,
      liasseResult: { kind: "liasse" } as never,
      liasseRfs: { kind: "liasseRfs" } as never,
    };
    const state = baseState(
      draft,
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const afterChange = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { dateMiseEnService: DATE_B },
    });
    const nextDraft = afterChange.declarationDraft!;

    assert.equal(nextDraft.dateMiseEnService, DATE_B);
    // F010–F014 dérivés + confirmations invalidés
    assert.equal(nextDraft.logementAmortissement, undefined);
    assert.equal(nextDraft.financementCharges, undefined);
    assert.equal(nextDraft.chargesAssistant, undefined);
    assert.equal(nextDraft.revenusAssistant, undefined);
    assert.equal(nextDraft.amortissementAssistant, undefined);
    assert.equal(nextDraft.logementConfirmedAt, undefined);
    assert.equal(nextDraft.creditConfirmedAt, undefined);
    assert.equal(nextDraft.chargesConfirmedAt, undefined);
    assert.equal(nextDraft.revenusConfirmedAt, undefined);
    assert.equal(nextDraft.amortissementConfirmedAt, undefined);
    // Génération stale
    assert.equal(nextDraft.fiscalResult, undefined);
    assert.equal(nextDraft.rfs, undefined);
    assert.equal(nextDraft.liasseResult, undefined);
    assert.equal(nextDraft.liasseRfs, undefined);
    assert.equal(afterChange.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(afterChange.fiscalYear.paidAt, PAID_AT);
    // Inputs source préservés
    assert.deepEqual(nextDraft.logementAssistantState, draft.logementAssistantState);
    assert.deepEqual(nextDraft.financementAssistantState, draft.financementAssistantState);
    assert.deepEqual(nextDraft.chargesAssistantState, draft.chargesAssistantState);

    // A→A : aucune invalidation
    const stateSame = baseState(
      draft,
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );
    const afterSame = lmnpReducer(stateSame, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { dateMiseEnService: DATE_A },
    });
    assert.equal(afterSame.declarationDraft?.logementAmortissement, draft.logementAmortissement);
    assert.equal(afterSame.declarationDraft?.financementCharges, draft.financementCharges);
    assert.equal(afterSame.declarationDraft?.chargesAssistant, draft.chargesAssistant);
    assert.equal(afterSame.declarationDraft?.revenusAssistant, draft.revenusAssistant);
    assert.equal(afterSame.declarationDraft?.amortissementAssistant, draft.amortissementAssistant);
    assert.equal(afterSame.declarationDraft?.chargesConfirmedAt, draft.chargesConfirmedAt);
    assert.equal(afterSame.declarationDraft?.revenusConfirmedAt, draft.revenusConfirmedAt);
    assert.equal(afterSame.declarationDraft?.fiscalResult, draft.fiscalResult);
    assert.equal(afterSame.fiscalYear.declarationGeneratedAt, GENERATED_AT);
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

  it("#17 Lot 4 — chargesAssistant modifié + declarationGeneratedAt posé → génération invalidée", async () => {
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
      undefined,
      "Lot 4 — charges F012 contributives : modification → déclaration générée stale (paidAt intact)",
    );
    assert.equal(next.fiscalYear.paidAt, PAID_AT);
    assert.equal(next.declarationDraft?.chargesConfirmedAt, undefined);
  });

  it("#18 (Chantier 2 §4/§5) — F-012 modifie un composant amortissable : le panel invalide amortissementAssistant dans le même patch → declarationGeneratedAt effacé", async () => {
    // F012ChargesAssistantPanel.persistCompletion() détecte le drift des
    // composants (composantsNouveauxChanged) et, dans CE cas, ajoute
    // `amortissementAssistant: undefined` au MÊME patch que `chargesAssistant`
    // — ce test reproduit exactement ce patch composé, sans dépendre de React.
    const lmnpReducer = await loadReducer();
    const chargesFixture = {
      exerciceFiscal: 2026,
      totalDeductible: 0,
      totalNonDeductible: 0,
      totalAmortissable: 12000,
      totalPreExploitation: 0,
      parCategorie: {},
      composantsNouveaux: [
        {
          id: "travaux-1",
          label: "Extension",
          montant: 12000,
          dureeAnnees: 18,
          dotationAnnuelle: 667,
          nature: "amélioration" as const,
          dateDebut: "2025-06-01",
          origin: "f012_travaux" as const,
        },
      ],
      fieldSources: {},
      computedAt: "2026-01-01T00:00:00Z",
    };
    const state = baseState(
      {
        completedSteps: ["charges", "amortissement"],
        chargesAssistant: { ...chargesFixture, composantsNouveaux: [{ ...chargesFixture.composantsNouveaux[0]!, montant: 8000 }] },
        chargesConfirmedAt: "2026-01-01T00:00:00Z",
        amortissementAssistant: amortissementFixture(),
      },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { chargesAssistant: chargesFixture, amortissementAssistant: undefined },
    });

    assert.equal(next.declarationDraft?.amortissementAssistant, undefined, "F-014 redevient à revalider");
    assert.equal(
      next.fiscalYear.declarationGeneratedAt,
      undefined,
      "la modification d'un composant amortissable ripple jusqu'à declarationGeneratedAt via la clé contributive existante",
    );
  });
});

function pretFixture(overrides: Partial<PretFinancementExercice> = {}): PretFinancementExercice {
  return {
    pretId: "pret-1",
    typePret: "amortissable",
    interetsEmpruntExercice: 4602,
    interetsPreExploitation: 0,
    assuranceEmpruntExercice: 601,
    assurancePreExploitation: 0,
    capitalRembourseExercice: 496,
    capitalRestantDu31_12: 130256,
    fraisDossierDeductibles: 0,
    garantieDeductible: 1763,
    iraDeductible: 0,
    ...overrides,
  };
}

function bilanInputsAvecPostes(postes: VentilationTiersInputs["postes"]): BilanInputs {
  return {
    tresorerie: { bankMode: "INCONNU" },
    compteExploitant: {},
    ran: { situation: "NATIF" },
    ventilationTiers: { postes },
  };
}

/**
 * P0-1C — audit du mécanisme A (invalidation immédiate du reducer,
 * `DECLARATION_PATCH_DRAFT` / `isDeepEqualDraftValue`). Vérifie les
 * propriétés démontrées par l'audit : `computedAt` est un horodatage
 * technique jamais fiscal (correction de production, cf. reducer.ts),
 * les tableaux (`prets[]`) sont comparés structurellement et non par
 * référence, une vraie modification reste toujours détectée, le round-trip
 * `deriveVentilationTiersIntakeState()` → `buildVentilationTiersInputs()`
 * est stable, et la comparaison ne mute aucun des deux états comparés.
 *
 * `undefined` vs propriété absente (C4) : démontré à l'exécution de C6
 * ci-dessous AVANT correction (échec reproductible) — le round-trip
 * `versPosteEconomiqueInput()` reconstruit `libelle: undefined` explicitement
 * pour un poste sans libellé, alors que le poste d'origine ne porte jamais
 * cette clé avant sa première réhydratation. Corrigé dans `isDeepEqualDraftValue`
 * (`definedKeys()`, reducer.ts) — une clé `undefined` et une clé absente sont
 * désormais équivalentes, alignées sur la sémantique JSON réelle de la
 * persistance (IndexedDB/Supabase ne conservent jamais une clé `undefined`).
 *
 * Non trouvés par l'audit (documentés, non testés/non corrigés) :
 * - `bilanPatrimonial.ventilationTiers.postes[].id` (crypto.randomUUID,
 *   régénéré uniquement lors d'une suppression + recréation d'un poste
 *   équivalent) : risque réel mais étroit (aucun contrôle de réordonnancement
 *   dans l'UI), déjà neutralisé côté fiscal par le mécanisme B (P0-1B compare
 *   `rfs.patrimoine`, une sortie résolue par somme, insensible à cet id) —
 *   non corrigé ici pour ne pas dupliquer la sémantique de
 *   `resolveVentilationTiers()` dans le reducer ;
 * - `amortissementAssistant.validatedAt` : même nature qu'un `computedAt`
 *   potentiel, mais aucun chemin réel démontré où il varierait sans
 *   changement fiscal (contrairement à `computedAt`, tracé concrètement
 *   dans `RevenusDocumentStep.tsx`/`F011FinancementAssistantPanel.tsx`) —
 *   non exclu, faute de preuve.
 */
describe("P0-1C — robustesse du deep-equal du reducer (audit 2026-09-07)", () => {
  it("C1 — revenusAssistant : computedAt seul modifié (reconfirmation sans changement fiscal) → aucune invalidation", async () => {
    const lmnpReducer = await loadReducer();
    const fixture = revenusFixture({ computedAt: "2026-01-01T00:00:00Z" });
    const state = baseState(
      { completedSteps: ["revenus"], revenusAssistant: fixture },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { revenusAssistant: { ...fixture, computedAt: "2026-06-15T08:30:00Z" } },
    });

    assert.equal(
      next.fiscalYear.declarationGeneratedAt,
      GENERATED_AT,
      "computedAt est un horodatage technique — reconfirmer le même exercice sans rien changer ne doit pas invalider (chemin réel : RevenusDocumentStep.tsx handleConfirm)",
    );
  });

  it("C1 — financementCharges : computedAt seul modifié → aucune invalidation", async () => {
    const lmnpReducer = await loadReducer();
    const fixture = financementFixture({ computedAt: "2026-01-01T00:00:00Z" });
    const state = baseState(
      { completedSteps: ["credit"], financementCharges: fixture },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { financementCharges: { ...fixture, computedAt: "2026-06-15T08:30:00Z" } },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, GENERATED_AT);
  });

  it("C1 — logementAmortissement : computedAt seul modifié → aucune invalidation", async () => {
    const lmnpReducer = await loadReducer();
    const fixture = logementAmortissementFixture({ computedAt: "2026-01-01T00:00:00Z" });
    const state = baseState(
      { completedSteps: ["logement"], logementAmortissement: fixture },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { logementAmortissement: { ...fixture, computedAt: "2026-06-15T08:30:00Z" } },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, GENERATED_AT);
  });

  it("C2 — computedAt modifié EN MÊME TEMPS qu'une vraie donnée fiscale → invalidation conservée (l'exclusion ne masque jamais une vraie modification)", async () => {
    const lmnpReducer = await loadReducer();
    const fixture = revenusFixture({ computedAt: "2026-01-01T00:00:00Z" });
    const state = baseState(
      { completedSteps: ["revenus"], revenusAssistant: fixture },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { revenusAssistant: { ...fixture, totalRecettes: 13000, computedAt: "2026-06-15T08:30:00Z" } },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
  });

  it("C3 — financementCharges.prets[] : même contenu, nouveaux objets, même ordre → aucune invalidation (comparaison structurelle, pas par référence)", async () => {
    const lmnpReducer = await loadReducer();
    const fixture = financementFixture({ prets: [pretFixture({ pretId: "pret-1" }), pretFixture({ pretId: "pret-2", capitalRestantDu31_12: 45000 })] });
    const state = baseState(
      { completedSteps: ["credit"], financementCharges: fixture },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: {
        financementCharges: {
          ...fixture,
          prets: [pretFixture({ pretId: "pret-1" }), pretFixture({ pretId: "pret-2", capitalRestantDu31_12: 45000 })],
        },
      },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, GENERATED_AT, "des objets fraîchement recréés mais structurellement identiques ne doivent jamais invalider");
  });

  it("C8 — financementCharges.prets[] : deux prêts réellement différents intervertis de position → invalidation conservée (l'ordre reste un signal valide quand le contenu diffère réellement)", async () => {
    const lmnpReducer = await loadReducer();
    const pretA = pretFixture({ pretId: "pret-1", capitalRestantDu31_12: 130256 });
    const pretB = pretFixture({ pretId: "pret-2", capitalRestantDu31_12: 45000 });
    const fixture = financementFixture({ prets: [pretA, pretB] });
    const state = baseState(
      { completedSteps: ["credit"], financementCharges: fixture },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      // Intervertis : position 0 porte désormais le CRD de pret-2 et vice versa.
      patch: { financementCharges: { ...fixture, prets: [pretB, pretA] } },
    });

    assert.equal(
      next.fiscalYear.declarationGeneratedAt,
      undefined,
      "deux prêts de contenu différent échangés de position doivent rester détectés — ne pas neutraliser la sensibilité à l'ordre par défaut",
    );
  });

  it("C4 — bilanPatrimonial.ventilationTiers.postes[].libelle : undefined vs propriété absente → aucune invalidation (équivalence démontrée par C6)", async () => {
    const lmnpReducer = await loadReducer();
    // Poste d'origine sans la clé `libelle` du tout — forme produite avant
    // toute réhydratation (versPosteEconomiqueInput() ne l'ajoute qu'au
    // premier round-trip, cf. C6 ci-dessous).
    const bilanPatrimonial = bilanInputsAvecPostes([{ id: "poste-1", nature: "LOYER_DU_PAR_LOCATAIRE", montant: 500 }]);
    const state = baseState(
      { completedSteps: [], bilanPatrimonial },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    // Même poste, mais `libelle` explicitement présent avec la valeur `undefined`.
    const bilanAvecLibelleUndefined: BilanInputs = {
      ...bilanPatrimonial,
      ventilationTiers: { postes: [{ id: "poste-1", nature: "LOYER_DU_PAR_LOCATAIRE", montant: 500, libelle: undefined }] },
    };

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { bilanPatrimonial: bilanAvecLibelleUndefined },
    });

    assert.equal(
      next.fiscalYear.declarationGeneratedAt,
      GENERATED_AT,
      "libelle: undefined et l'absence de la clé libelle représentent le même fait fiscal (aucun libellé) — jamais une invalidation",
    );
  });

  it("C6 — round-trip deriveVentilationTiersIntakeState() → buildVentilationTiersInputs() : un état fiscal identique ne devient jamais artificiellement différent (postes seuls)", async () => {
    const lmnpReducer = await loadReducer();
    const bilanPatrimonial = bilanInputsAvecPostes([{ id: "poste-1", nature: "LOYER_DU_PAR_LOCATAIRE", montant: 500 }]);
    const state = baseState(
      { completedSteps: [], bilanPatrimonial },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    // Round-trip réel : UI state dérivé depuis la valeur persistée, puis
    // reconstruit — exactement ce que rejoue PatrimonialIntakeCard à chaque
    // rendu, sans aucune édition utilisateur entre les deux.
    const uiState = deriveVentilationTiersIntakeState(bilanPatrimonial.ventilationTiers);
    const ventilationTiersReconstruite = buildVentilationTiersInputs(uiState);
    const bilanReconstruit: BilanInputs = { ...bilanPatrimonial, ventilationTiers: ventilationTiersReconstruite };

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { bilanPatrimonial: bilanReconstruit },
    });

    assert.equal(
      next.fiscalYear.declarationGeneratedAt,
      GENERATED_AT,
      "un round-trip sans édition utilisateur ne doit jamais faire apparaître une différence artificielle",
    );
  });

  it("C6 (complément) — round-trip avec confirmation de liste vide (naturesConfirmeesVides) : stable également", async () => {
    const lmnpReducer = await loadReducer();
    const bilanPatrimonial: BilanInputs = {
      tresorerie: { bankMode: "INCONNU" },
      compteExploitant: {},
      ran: { situation: "NATIF" },
      ventilationTiers: {
        postes: [{ id: "poste-1", nature: "LOYER_DU_PAR_LOCATAIRE", montant: 500 }],
        naturesConfirmeesVides: ["AUTRE_CREANCE_ACTIVITE"],
      },
    };
    const state = baseState(
      { completedSteps: [], bilanPatrimonial },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const uiState = deriveVentilationTiersIntakeState(bilanPatrimonial.ventilationTiers);
    const ventilationTiersReconstruite = buildVentilationTiersInputs(uiState);
    const bilanReconstruit: BilanInputs = { ...bilanPatrimonial, ventilationTiers: ventilationTiersReconstruite };

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { bilanPatrimonial: bilanReconstruit },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, GENERATED_AT);
  });

  it("C6 (état vide) — round-trip depuis EMPTY_VENTILATION_TIERS_INTAKE_STATE ne produit jamais un objet vide artificiel", () => {
    // Garde de non-régression sur la doctrine B-FAMILY elle-même (lue, non modifiée) :
    // un état UI vide ne doit jamais construire {postes: []}/{} qui laisserait
    // croire à une saisie — condition nécessaire pour que C6 ci-dessus soit valide.
    assert.equal(buildVentilationTiersInputs(EMPTY_VENTILATION_TIERS_INTAKE_STATE), undefined);
  });

  it("C7 — non-mutation : la comparaison ne modifie ni l'état avant, ni le patch fourni", async () => {
    const lmnpReducer = await loadReducer();
    const fixture = revenusFixture({ computedAt: "2026-01-01T00:00:00Z" });
    const state = baseState(
      { completedSteps: ["revenus"], revenusAssistant: fixture },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );
    const patch = { revenusAssistant: { ...fixture, computedAt: "2026-06-15T08:30:00Z" } };
    const stateSnapshot = JSON.stringify(state.declarationDraft);
    const patchSnapshot = JSON.stringify(patch);

    lmnpReducer(state, { type: "DECLARATION_PATCH_DRAFT", patch });

    assert.equal(JSON.stringify(state.declarationDraft), stateSnapshot, "l'état d'origine ne doit jamais être muté par la comparaison");
    assert.equal(JSON.stringify(patch), patchSnapshot, "le patch fourni ne doit jamais être muté par la comparaison");
  });
});

const P0_1D_PROPERTY: Property = { id: "prop-1", label: "Studio Lyon", address: "1 rue Test", city: "Lyon", postalCode: "69001" };

function p0_1dCompleteFlags(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    completedSteps: [],
    inpiConfirmedAt: "2026-01-01T00:00:00.000Z",
    logementConfirmedAt: "2026-01-01T00:00:00.000Z",
    // Lot 1 — sortie F-010 requise pour isLogementComplete(). Forme lue par
    // map-2033a (`plan.lignes`), pas le `{composants}` du fixture d'invalidation
    // reducer (celui-ci reste pour les tests DECLARATION_PATCH_DRAFT #9–#11).
    logementAmortissement: {
      computedAt: "2026-01-01T00:00:00.000Z",
      prixRevient: 200000,
      valeurTerrain: 40000,
      valeurBati: 160000,
      baseAmortissableBati: 160000,
      montantMobilier: 0,
      dotationAnnuelle: 5333,
      dureeMoyenneAnnees: 30,
      plan: { lignes: [], totalAnnuelExercice: 0, totalBrut: 0 },
    },
    creditDeclaredNoneAt: "2026-01-01T00:00:00.000Z",
    revenusConfirmedAt: "2026-01-01T00:00:00.000Z",
    chargesConfirmedAt: "2026-01-01T00:00:00.000Z",
    amortissementConfirmedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Dossier réel, générable — mêmes valeurs que declaration-generation-gate.test.ts, pour exercer le mécanisme B réel (non simulé). */
function p0_1dGenerationReadyDraft(overrides: Partial<Record<string, unknown>> = {}) {
  return p0_1dCompleteFlags({
    siret: "12345678901234",
    siren: "123456789",
    exploitantFirstName: "Marie",
    exploitantLastName: "Dupont",
    dateMiseEnService: "2020-01-01",
    revenusAssistant: revenusFixture(),
    chargesAssistant: {
      exerciceFiscal: 2026,
      totalDeductible: 2000,
      totalNonDeductible: 0,
      totalAmortissable: 0,
      totalPreExploitation: 0,
      parCategorie: {},
      composantsNouveaux: [],
      fieldSources: {},
      computedAt: "2026-01-01T00:00:00Z",
    },
    amortissementAssistant: amortissementFixture(),
    ...overrides,
  });
}

/**
 * P0-1D (2026-09-07) — investigation « properties-only changes » : une
 * propriété fiscale réelle qui changerait sans que ni le mécanisme A
 * (reducer, ce fichier) ni le mécanisme B (declaration-generation-gate.ts,
 * inchangé) ne la détectent.
 *
 * CONCLUSION DE L'AUDIT (aucune modification de production dans ce
 * chantier) : pour les 8 clés contributives de reducer.ts, `isDeepEqualDraftValue`
 * compare l'objet ENTIER de façon structurelle et récursive (P0-1C) —
 * n'importe quelle propriété fiscale, même profondément imbriquée
 * (`financementCharges.prets[].garantieDeductible`, `bilanPatrimonial
 * .tresorerie.closingCash`...), est donc déjà visible du mécanisme A, sauf
 * `computedAt` (exclusion justifiée, P0-1C) et l'équivalence undefined/absence
 * (également P0-1C). Aucun CAS 4 (A ne détecte pas ET B ne détecte pas) n'a
 * été démontré dans ce périmètre — voir la restitution du chantier pour le
 * détail CAS 1/2/3 et les candidats écartés (identité hors des 3 clés
 * siret/dateMiseEnService/activityType : déjà un CAS 3 connu et documenté
 * depuis P0-1, compensé par `identiteChanged()` ; `chargesAssistant` :
 * hors des 8 clés, verrouillé en lecture seule une fois confirmé — pas un
 * chemin réel, hors périmètre de ce chantier).
 */
describe("P0-1D — investigation properties-only (audit 2026-09-07)", () => {
  it("D1a — financementCharges.prets[0].garantieDeductible (propriété fiscale imbriquée, totaux inchangés) → invalidation", async () => {
    const lmnpReducer = await loadReducer();
    const fixture = financementFixture({ prets: [pretFixture({ garantieDeductible: 1763 })] });
    const state = baseState(
      { completedSteps: ["credit"], financementCharges: fixture },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      // Seule la garantie déductible du prêt change — totalInteretsEmprunt/
      // totalCapitalRembourse/totalChargesFinancementExercice restent
      // volontairement identiques : la détection ne doit pas dépendre de
      // ces seuls totaux, mais de l'objet entier.
      patch: { financementCharges: { ...fixture, prets: [pretFixture({ garantieDeductible: 2500 })] } },
    });

    assert.equal(
      next.fiscalYear.declarationGeneratedAt,
      undefined,
      "une propriété fiscale imbriquée doit être détectée même si les totaux de premier niveau restent identiques",
    );
  });

  it("D1b — bilanPatrimonial.tresorerie.closingCash (propriété patrimoniale imbriquée) → invalidation", async () => {
    const lmnpReducer = await loadReducer();
    const bilanPatrimonial: BilanInputs = {
      tresorerie: { bankMode: "DEDIE", closingCash: 1200 },
      compteExploitant: {},
      ran: { situation: "NATIF" },
    };
    const state = baseState(
      { completedSteps: [], bilanPatrimonial },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { bilanPatrimonial: { ...bilanPatrimonial, tresorerie: { bankMode: "DEDIE", closingCash: 1850 } } },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
  });

  it("Dispense 2033-A — modification du CA N-1 déclaré après génération → invalidation (même mécanisme générique que bilanPatrimonial)", async () => {
    const lmnpReducer = await loadReducer();
    const dispense2033A = { caReferenceN1Declaree: 40_000 };
    const state = baseState(
      { completedSteps: [], dispense2033A },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { dispense2033A: { ...dispense2033A, caReferenceN1Declaree: 70_000 } },
    });

    assert.equal(
      next.fiscalYear.declarationGeneratedAt,
      undefined,
      "une modification du CA N-1 déclaré après génération doit rouvrir canRetryAfterPayment",
    );
  });

  it("Dispense 2033-A — modification de la décision (FILE_2033A/USE_DISPENSE) après génération → invalidation", async () => {
    const lmnpReducer = await loadReducer();
    const dispense2033A = { caReferenceN1Declaree: 40_000, decision: "FILE_2033A" as const };
    const state = baseState(
      { completedSteps: [], dispense2033A },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { dispense2033A: { ...dispense2033A, decision: "USE_DISPENSE" } },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
  });

  it("Dispense 2033-A — patch identique (même valeur) → aucune invalidation, jamais un faux positif", async () => {
    const lmnpReducer = await loadReducer();
    const dispense2033A = { caReferenceN1Declaree: 40_000, decision: "USE_DISPENSE" as const };
    const state = baseState(
      { completedSteps: [], dispense2033A },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { dispense2033A: { ...dispense2033A } },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, GENERATED_AT, "une valeur strictement égale ne doit jamais invalider");
  });

  it("D2 — aucun candidat de perte de propriété par reconstruction démontré : chaque fabrique dispatch l'objet contributif ENTIER, jamais un patch partiel", () => {
    // Vérification structurelle, pas d'exécution UI : les 4 fabriques
    // identifiées (F011FinancementAssistantPanel/CreditDocumentStep,
    // F014AmortissementsAssistantPanel, F010LogementAssistantPanel,
    // RevenusDocumentStep) construisent un objet complet avant dispatch —
    // aucune ne relit puis ne réécrit un sous-ensemble de champs. Documenté
    // ici plutôt que testé mécaniquement : rien à reproduire, donc aucun
    // test D2 exécutable de façon significative n'a été ajouté au-delà de
    // cette assertion de non-régression sur les fixtures elles-mêmes.
    const fixture = financementFixture();
    assert.ok("prets" in fixture && "computedAt" in fixture, "la fixture de référence reste un objet complet, cohérent avec les fabriques réelles auditées");
  });

  it("D3 — propriété technique isolée (computedAt, déjà couverte par P0-1C) : aucune invalidation — pas de nouvelle exclusion ajoutée en P0-1D", async () => {
    const lmnpReducer = await loadReducer();
    const fixture = amortissementFixture();
    const state = baseState(
      { completedSteps: ["amortissement"], amortissementAssistant: fixture },
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT }),
    );

    // Même valeur, nouvel objet — vérifie que P0-1D n'a introduit aucune
    // régression sur la propriété déjà validée par P0-1C (computedAt exclu
    // via financementCharges/revenusAssistant/logementAmortissement ;
    // amortissementAssistant n'a pas de computedAt — ce test confirme que
    // l'absence de cette clé ne casse rien).
    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { amortissementAssistant: { ...fixture } },
    });

    assert.equal(next.fiscalYear.declarationGeneratedAt, GENERATED_AT);
  });

  it("D4 — coexistence avec P0-1B : patrimoine modifié, mécanisme A volontairement contourné (dispatch direct sans passer par le reducer) → mécanisme B détecte quand même", () => {
    // Mécanisme A "contourné" : on n'appelle jamais lmnpReducer/DECLARATION_PATCH_DRAFT
    // ici — seulement resolveDeclarationGenerationGate(), exactement le
    // scénario visé par D4 (A bypassé intentionnellement dans le test).
    const bilanAvant: BilanInputs = {
      tresorerie: { bankMode: "INCONNU" },
      compteExploitant: {},
      ran: { situation: "NATIF" },
      ventilationTiers: { postes: [{ id: "poste-1", nature: "LOYER_DU_PAR_LOCATAIRE", montant: 500 }] },
    };
    const draft = { ...p0_1dGenerationReadyDraft(), bilanPatrimonial: bilanAvant };
    const generation = runDeclarationGeneration(draft as never, 2026, undefined, bilanAvant);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") throw new Error("unreachable");
    const draftGenere = { ...draft, fiscalResult: generation.fiscalResult, rfs: generation.rfs };

    const bilanApres: BilanInputs = { ...bilanAvant, ventilationTiers: { postes: [{ id: "poste-1", nature: "LOYER_DU_PAR_LOCATAIRE", montant: 900 }] } };
    const draftModifieSansReducer = { ...draftGenere, bilanPatrimonial: bilanApres };

    const gate = resolveDeclarationGenerationGate({
      draft: draftModifieSansReducer as never,
      properties: [P0_1D_PROPERTY],
      fiscalYear: 2026,
      paid: true,
      generated: true,
    });

    assert.equal(gate.canGenerate, true, "le mécanisme B (P0-1B) doit détecter seul une dérive patrimoniale même quand le mécanisme A n'a jamais été sollicité");
  });

  it("D5 — continuité N+1 (stocksOuverture réel) : pipeline complet reducer → gate, modification réelle toujours détectée, réplication identique jamais régénérée", async () => {
    const lmnpReducer = await loadReducer();
    const stocksOuverture = { deficits: [{ millesime: 2025, montant: 3000 }], amortissementsReportes: 0 };
    const draftInitial = {
      ...p0_1dGenerationReadyDraft({
        revenusAssistant: revenusFixture({ totalRecettes: 9000 }),
        amortissementAssistant: amortissementFixture({ totalDotations: 8000 }),
      }),
    };
    const generation = runDeclarationGeneration(draftInitial as never, 2026, stocksOuverture);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") throw new Error("unreachable");

    // Mécanisme A — le reducer écrit le miroir fiscalResult (comme
    // ValidationDocumentStep.tsx après une génération réelle).
    const stateGenere = baseState(
      { ...draftInitial, fiscalResult: generation.fiscalResult } as never,
      baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT, stocksOuverture: { sourceClosureId: "closure-n", stocks: stocksOuverture } }),
    );

    // (a) réplication strictement identique — le patch renvoie exactement
    // le même revenusAssistant : le reducer ne doit jamais invalider.
    const replique = lmnpReducer(stateGenere, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { revenusAssistant: { ...draftInitial.revenusAssistant } },
    });
    assert.equal(replique.fiscalYear.declarationGeneratedAt, GENERATED_AT, "réplication identique — le mécanisme A ne doit pas invalider");
    const gateApresReplique = resolveDeclarationGenerationGate({
      draft: replique.declarationDraft as never,
      properties: [P0_1D_PROPERTY],
      fiscalYear: 2026,
      paid: true,
      generated: true,
      stocksOuverture,
    });
    assert.equal(gateApresReplique.canGenerate, false, "réplication identique — le mécanisme B ne doit pas non plus considérer la génération périmée");

    // (b) vraie modification fiscale — le mécanisme A doit invalider.
    const modifie = lmnpReducer(stateGenere, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { revenusAssistant: revenusFixture({ totalRecettes: 15000 }) },
    });
    assert.equal(modifie.fiscalYear.declarationGeneratedAt, undefined, "vraie modification fiscale — le mécanisme A doit invalider même en continuité N+1");
  });

  it("D6 — non-mutation du pipeline complet (reducer puis gate) : aucun des deux mécanismes ne modifie le draft/fiscalYear fournis", () => {
    const bilanPatrimonial: BilanInputs = {
      tresorerie: { bankMode: "INCONNU" },
      compteExploitant: {},
      ran: { situation: "NATIF" },
      ventilationTiers: { postes: [{ id: "poste-1", nature: "LOYER_DU_PAR_LOCATAIRE", montant: 500 }] },
    };
    const draft = { ...p0_1dGenerationReadyDraft(), bilanPatrimonial };
    const generation = runDeclarationGeneration(draft as never, 2026, undefined, bilanPatrimonial);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") throw new Error("unreachable");
    const draftGenere = { ...draft, fiscalResult: generation.fiscalResult, rfs: generation.rfs };
    const fiscalYear = baseFiscalYear({ declarationGeneratedAt: GENERATED_AT, paidAt: PAID_AT });

    const draftSnapshot = JSON.stringify(draftGenere);
    const fiscalYearSnapshot = JSON.stringify(fiscalYear);

    resolveDeclarationGenerationGate({
      draft: draftGenere as never,
      properties: [P0_1D_PROPERTY],
      fiscalYear: fiscalYear.year,
      paid: true,
      generated: true,
    });

    assert.equal(JSON.stringify(draftGenere), draftSnapshot, "le gate ne doit jamais muter le draft fourni");
    assert.equal(JSON.stringify(fiscalYear), fiscalYearSnapshot, "le gate ne doit jamais muter le fiscalYear fourni");
  });
});
