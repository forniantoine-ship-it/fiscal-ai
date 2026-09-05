/**
 * P3-SOCLE-CYCLE-FISCAL — P0-1 v2 — comportement du reducer pour :
 *  - JOURNEY_MARK_TRANSMITTED (clôture + closure) ;
 *  - CREATE_NEXT_FISCAL_YEAR (même dossier, exercice suivant) ;
 *  - CREATE_NEW_DECLARATION — test de RÉGRESSION démontrant que cette action
 *    conserve sa sémantique historique ("déclarer un autre bien", reset
 *    complet) et NE crée PAS de FiscalYear N+1 (T-P0-2/point 20).
 * Run: npx tsx --test src/lib/lmnp/store/reducer-fiscal-year-cycle.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { lmnpReducer, type LmnpState } from "./reducer";
import type { FiscalEngineOutput, FiscalYear, Property } from "../types";
import type { PersistedWorkspace } from "./persistence";

function baseFiscalYear(overrides: Partial<FiscalYear> = {}): FiscalYear {
  return {
    id: "fy-1",
    year: 2025,
    status: "draft",
    regime: "reel",
    propertyIds: ["prop-1"],
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function baseProperty(): Property {
  return { id: "prop-1", label: "Mon bien", address: "1 rue X", city: "Lyon", postalCode: "69000" };
}

function fiscalResult(overrides: Partial<FiscalEngineOutput> = {}): FiscalEngineOutput {
  return {
    exercice: 2025,
    resultatFiscal: 5500,
    resultatAvantAmort: 7000,
    totalRecettes: 9000,
    totalCharges: 2000,
    amortDeduct: 1500,
    amortReporte: 0,
    deficitNouveau: 0,
    stocks: { deficits: [{ millesime: 2025, montant: 800 }], amortissementsReportes: 0 },
    trace: { ksArtifacts: [], computedAt: "2026-09-04T00:00:00.000Z", journal: [] },
    computedAt: "2026-09-04T00:00:00.000Z",
    ...overrides,
  };
}

function baseState(overrides: Partial<LmnpState> = {}): LmnpState {
  return {
    fiscalYear: baseFiscalYear(),
    properties: [baseProperty()],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: { completedSteps: [] },
    fileRegistry: new Map(),
    ...overrides,
  };
}

describe("JOURNEY_MARK_TRANSMITTED — clôture (P0-1)", () => {
  it("ferme l'exercice et ajoute une closure quand un FiscalResult existe", () => {
    const state = baseState({
      declarationDraft: { completedSteps: [], fiscalResult: fiscalResult() },
    });
    const next = lmnpReducer(state, { type: "JOURNEY_MARK_TRANSMITTED" });

    assert.equal(next.fiscalYear.status, "closed");
    assert.ok(next.fiscalYear.transmittedAt);
    assert.equal(next.fiscalYear.closures?.length, 1);
    assert.deepEqual(next.fiscalYear.closures?.[0].stocks, fiscalResult().stocks);
  });

  it("sans FiscalResult, ferme l'exercice mais n'invente aucune closure", () => {
    const state = baseState();
    const next = lmnpReducer(state, { type: "JOURNEY_MARK_TRANSMITTED" });

    assert.equal(next.fiscalYear.status, "closed");
    assert.deepEqual(next.fiscalYear.closures ?? [], []);
  });

  it("T-P0-13 — une seconde transmission (correction) ajoute une nouvelle closure sans effacer la première", () => {
    const afterFirst = lmnpReducer(
      baseState({ declarationDraft: { completedSteps: [], fiscalResult: fiscalResult() } }),
      { type: "JOURNEY_MARK_TRANSMITTED" },
    );
    assert.equal(afterFirst.fiscalYear.closures?.length, 1);
    const firstClosureId = afterFirst.fiscalYear.closures?.[0].id;

    const corrected = lmnpReducer(
      {
        ...afterFirst,
        declarationDraft: { completedSteps: [], fiscalResult: fiscalResult({ resultatFiscal: 6000, stocks: { deficits: [], amortissementsReportes: 0 } }) },
      },
      { type: "JOURNEY_MARK_TRANSMITTED" },
    );

    assert.equal(corrected.fiscalYear.closures?.length, 2, "V1 reste tracée, jamais remplacée");
    assert.equal(corrected.fiscalYear.closures?.[0].id, firstClosureId);
  });
});

describe("CREATE_NEXT_FISCAL_YEAR — même dossier, exercice suivant (P0-1 v2)", () => {
  it("T-P0-1/T-P0-7/T-P0-12 — applique exactement le FiscalYear fourni, conserve les propriétés et l'identité", () => {
    const closed = lmnpReducer(
      baseState({
        fiscalYear: baseFiscalYear({ dossierId: "dossier-1", status: "closed" }),
        declarationDraft: {
          completedSteps: [],
          siren: "123456789",
          fiscalResult: fiscalResult(),
        },
      }),
      { type: "JOURNEY_MARK_TRANSMITTED" },
    );

    // Simule ce que persistFiscalYearTransition() aurait construit et déjà
    // persisté — le reducer ne doit JAMAIS recalculer ce FiscalYear lui-même.
    const nextFiscalYear: FiscalYear = {
      id: "fy-2",
      year: closed.fiscalYear.year + 1,
      status: "draft",
      regime: "reel",
      propertyIds: closed.fiscalYear.propertyIds,
      dossierId: "dossier-1",
      previousFiscalYearId: closed.fiscalYear.id,
      closures: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const next = lmnpReducer(closed, { type: "CREATE_NEXT_FISCAL_YEAR", nextFiscalYear });

    // T-P0-7 — N+1 pointe vers N, même dossier, année exacte. (updatedAt est
    // recalculé par finalizeState()/applyWorkspaceProgress(), un mécanisme
    // préexistant partagé par tous les cas du reducer — comparé séparément.)
    assert.deepEqual({ ...next.fiscalYear, updatedAt: undefined }, { ...nextFiscalYear, updatedAt: undefined });
    assert.equal(next.fiscalYear.id, nextFiscalYear.id);
    assert.equal(next.fiscalYear.previousFiscalYearId, closed.fiscalYear.id);
    assert.equal(next.fiscalYear.dossierId, "dossier-1");
    assert.equal(next.fiscalYear.year, closed.fiscalYear.year + 1);

    // T-P0-12 — Property.id conservé, jamais régénéré.
    assert.equal(next.properties.length, 1);
    assert.equal(next.properties[0].id, "prop-1");

    // Données exercice-scoped repartent vides.
    assert.deepEqual(next.documents, []);
    assert.deepEqual(next.extractions, []);
    assert.deepEqual(next.validationItems, []);
    assert.deepEqual(next.ledgerEntries, []);
    assert.deepEqual(next.aiActivityFeed ?? [], []);
    assert.equal(next.declarationDraft?.fiscalResult, undefined);

    // Identité Dossier-level reportée.
    assert.equal(next.declarationDraft?.siren, "123456789");
  });

  it("T-P0-6 — N reste intégralement conservé en mémoire jusqu'au dispatch — le reducer ne mute jamais N", () => {
    const closed = lmnpReducer(
      baseState({ declarationDraft: { completedSteps: [], fiscalResult: fiscalResult() } }),
      { type: "JOURNEY_MARK_TRANSMITTED" },
    );
    const snapshotBefore = JSON.stringify(closed.fiscalYear);
    const nextFiscalYear: FiscalYear = {
      id: "fy-2",
      year: closed.fiscalYear.year + 1,
      status: "draft",
      regime: "reel",
      propertyIds: closed.fiscalYear.propertyIds,
      previousFiscalYearId: closed.fiscalYear.id,
      closures: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    lmnpReducer(closed, { type: "CREATE_NEXT_FISCAL_YEAR", nextFiscalYear });
    assert.equal(JSON.stringify(closed.fiscalYear), snapshotBefore, "N n'est jamais muté par la création de N+1");
  });
});

describe("CLOSE_FISCAL_YEAR_AND_CREATE_NEXT — geste unique « Clôturer et continuer » (Design Gate, Décision 1)", () => {
  it("applique exactement le PersistedWorkspace fourni, N n'est référencé nulle part dans l'état résultant", () => {
    const state = baseState({
      fiscalYear: baseFiscalYear({
        dossierId: "dossier-1",
        status: "ready_to_close",
        declarationGeneratedAt: "2026-09-01T00:00:00.000Z",
      }),
      declarationDraft: { completedSteps: [], siren: "123456789", fiscalResult: fiscalResult() },
    });

    // Simule ce que persistFiscalYearClosureAndTransition() aurait construit et
    // déjà persisté — le reducer ne doit JAMAIS recalculer ce workspace.
    const nextWorkspace: PersistedWorkspace = {
      fiscalYear: {
        id: "fy-2",
        year: state.fiscalYear.year + 1,
        status: "draft",
        regime: "reel",
        propertyIds: state.fiscalYear.propertyIds,
        dossierId: "dossier-1",
        previousFiscalYearId: state.fiscalYear.id,
        closures: [],
        createdAt: "2026-09-04T00:00:00.000Z",
        updatedAt: "2026-09-04T00:00:00.000Z",
      },
      properties: state.properties,
      documents: [],
      extractions: [],
      validationItems: [],
      ledgerEntries: [],
      declarationDraft: { completedSteps: [], siren: "123456789" },
      aiActivityFeed: [],
    };

    const next = lmnpReducer(state, { type: "CLOSE_FISCAL_YEAR_AND_CREATE_NEXT", nextWorkspace });

    // Exercice N absent du workspace actif après l'action (et donc après un
    // reload, puisque c'est ce même état qui est autosauvegardé).
    assert.notEqual(next.fiscalYear.id, state.fiscalYear.id);
    assert.equal(next.fiscalYear.id, "fy-2");
    assert.equal(next.fiscalYear.previousFiscalYearId, state.fiscalYear.id);
    assert.equal(next.fiscalYear.dossierId, "dossier-1");
    assert.equal(next.fiscalYear.status, "draft");

    // transmittedAt jamais posé par ce chemin (indépendance EDI).
    assert.equal(next.fiscalYear.transmittedAt, undefined);

    // Données exercice-scoped reparties vides, identité reportée.
    assert.deepEqual(next.documents, []);
    assert.deepEqual(next.extractions, []);
    assert.deepEqual(next.validationItems, []);
    assert.deepEqual(next.ledgerEntries, []);
    assert.deepEqual(next.aiActivityFeed ?? [], []);
    assert.equal(next.declarationDraft?.fiscalResult, undefined);
    assert.equal(next.declarationDraft?.siren, "123456789");

    // properties[] conservé tel quel (Property reste Dossier-level).
    assert.equal(next.properties.length, 1);
    assert.equal(next.properties[0].id, "prop-1");
  });

  it("N reste intégralement conservé en mémoire jusqu'au dispatch — le reducer ne mute jamais N", () => {
    const state = baseState({
      fiscalYear: baseFiscalYear({ status: "ready_to_close", declarationGeneratedAt: "2026-09-01T00:00:00.000Z" }),
    });
    const snapshotBefore = JSON.stringify(state.fiscalYear);

    const nextWorkspace: PersistedWorkspace = {
      fiscalYear: {
        id: "fy-2",
        year: state.fiscalYear.year + 1,
        status: "draft",
        regime: "reel",
        propertyIds: state.fiscalYear.propertyIds,
        previousFiscalYearId: state.fiscalYear.id,
        closures: [],
        createdAt: "2026-09-04T00:00:00.000Z",
        updatedAt: "2026-09-04T00:00:00.000Z",
      },
      properties: state.properties,
      documents: [],
      extractions: [],
      validationItems: [],
      ledgerEntries: [],
      declarationDraft: { completedSteps: [] },
      aiActivityFeed: [],
    };

    lmnpReducer(state, { type: "CLOSE_FISCAL_YEAR_AND_CREATE_NEXT", nextWorkspace });
    assert.equal(JSON.stringify(state.fiscalYear), snapshotBefore, "N n'est jamais muté par cette action");
  });
});

describe("CREATE_NEW_DECLARATION — RÉGRESSION : sémantique historique préservée (T-P0-2 / point 20)", () => {
  it("réinitialise intégralement le workspace (nouveau propertyId, nouveau fiscalYear.id, PAS un chaînage N+1)", () => {
    const closed = lmnpReducer(
      baseState({
        fiscalYear: baseFiscalYear({ dossierId: "dossier-1", status: "closed" }),
        declarationDraft: { completedSteps: [], siren: "123456789", fiscalResult: fiscalResult() },
      }),
      { type: "JOURNEY_MARK_TRANSMITTED" },
    );

    const next = lmnpReducer(closed, { type: "CREATE_NEW_DECLARATION" });

    // Ce n'est PAS un N+1 : ni dossierId, ni previousFiscalYearId, ni closures héritées.
    assert.equal(next.fiscalYear.dossierId, undefined, "CREATE_NEW_DECLARATION ne doit jamais produire un FiscalYear rattaché au dossier courant");
    assert.equal(next.fiscalYear.previousFiscalYearId, undefined, "CREATE_NEW_DECLARATION ne doit jamais chaîner à N");
    assert.deepEqual(next.fiscalYear.closures ?? [], [], "aucune closure de N ne doit être héritée par un flux qui n'est pas un chaînage N+1");
    assert.equal(next.fiscalYear.year, new Date().getFullYear(), "l'année reflète l'année civile courante (createDefaultWorkspace), jamais un calcul N+1");

    // Property régénérée (nouvel id) — comportement historique, pas conservé.
    assert.notEqual(next.properties[0]?.id, "prop-1", "CREATE_NEW_DECLARATION régénère une nouvelle Property, contrairement à CREATE_NEXT_FISCAL_YEAR");

    // Identité repartie à zéro (pas de report — contrairement à CREATE_NEXT_FISCAL_YEAR).
    assert.equal(next.declarationDraft?.siren, undefined);

    // N (l'exercice clos) n'est conservé nulle part dans l'état résultant.
    assert.notEqual(next.fiscalYear.id, closed.fiscalYear.id);
  });
});
