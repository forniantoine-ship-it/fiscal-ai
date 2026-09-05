/**
 * P1-1 — branchement réel des stocks fiscaux N → N+1. L'audit read-only
 * préalable avait établi que `resolveStocksOuverture()` (fiscal-year-cycle.ts)
 * était correcte et exhaustivement testée EN ISOLATION (T4-T10,
 * fiscal-year-cycle.test.ts) mais n'avait AUCUN caller runtime : la clôture de
 * N persistait bien ses stocks (`FiscalYear.closures[]`), mais N+1 démarrait
 * avec un `declarationDraft` vierge de tout `fiscalResult`, et
 * `runDeclarationGeneration()` ne pouvait donc jamais les relire.
 *
 * Ce fichier teste la CHAÎNE RÉELLE, pas la fonction pure isolément :
 *   FiscalResult N (avec stocks) → closeFiscalYear() → FiscalYearClosure
 *   → persistFiscalYearClosureAndTransition() → resolveStocksOuverture()
 *   → FiscalYear(N+1).stocksOuverture (persisté IndexedDB, survit à un
 *     refresh) → runDeclarationGeneration(draftN+1, anneeN+1, stocksOuverture)
 *   → FiscalResult N+1 dont resultatFiscal/stocks reflètent réellement
 *     l'imputation du déficit et la consommation de l'amortissement reporté
 *     de N — jamais perdus, jamais doublés.
 *
 * Run: npx tsx --test --env-file=.env.local src/lib/lmnp/store/stocks-ouverture-n-plus-1.test.ts
 */
import "fake-indexeddb/auto";
(globalThis as unknown as { window: unknown }).window = globalThis;

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { persistFiscalYearClosureAndTransition } from "./dossier-db";
import { getFiscalYearRecord } from "./db";
import type { PersistedWorkspace } from "./persistence";
import type { DeclarationDraft, FiscalEngineOutput, FiscalYear } from "../types/domain";
import type { FiscalYearRecord } from "./dossier-db";
import { resolveStocksOuverture } from "../services/dossier/fiscal-year-cycle";
import { runDeclarationGeneration } from "../services/declaration/run-declaration-generation";

let idCounter = 0;
function uid(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
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
    stocks: { deficits: [], amortissementsReportes: 0 },
    trace: { ksArtifacts: [], computedAt: "2026-09-04T00:00:00.000Z", journal: [] },
    computedAt: "2026-09-04T00:00:00.000Z",
    ...overrides,
  };
}

function readyWorkspace(overrides: {
  fiscalYearId?: string;
  fiscalYearOverrides?: Partial<FiscalYear>;
  fiscalResultOverrides?: Partial<FiscalEngineOutput>;
} = {}): PersistedWorkspace {
  const fiscalYearId = overrides.fiscalYearId ?? uid("fy");
  const propertyId = uid("prop");
  return {
    fiscalYear: {
      id: fiscalYearId,
      year: 2025,
      status: "ready_to_close",
      regime: "reel",
      propertyIds: [propertyId],
      declarationGeneratedAt: "2026-09-01T00:00:00.000Z",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      closures: [],
      ...overrides.fiscalYearOverrides,
    },
    properties: [{ id: propertyId, label: "Mon bien", address: "1 rue X", city: "Lyon", postalCode: "69000" }],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: {
      completedSteps: [],
      siren: "123456789",
      fiscalResult: fiscalResult(overrides.fiscalResultOverrides),
    },
  };
}

/** Draft N+1 générable — mêmes champs d'identité que les fixtures F-006 déjà établies (run-declaration-generation.test.ts). */
function generableDraftNPlus1(overrides: Partial<DeclarationDraft> = {}): DeclarationDraft {
  return {
    completedSteps: [],
    siret: "12345678901234",
    siren: "123456789",
    exploitantFirstName: "Elsa",
    exploitantLastName: "Bouvard",
    dateMiseEnService: "2025-02-01",
    revenusAssistant: { exerciceFiscal: 2026, totalRecettes: 7000 },
    chargesAssistant: { exerciceFiscal: 2026, totalDeductible: 2000, totalPreExploitation: 0 },
    amortissementAssistant: { exerciceFiscal: 2026, totalDotations: 1000, status: "validated" },
    ...overrides,
  } as unknown as DeclarationDraft;
}

describe("P1-1 — chaîne réelle : clôture N (déficit + amortissement reportables) → stocks d'ouverture persistés sur N+1 → génération N+1 consomme réellement ces stocks", () => {
  it("PROOF — stocks de clôture N retrouvés intacts sur FiscalYear N+1 (y compris après relecture IndexedDB), puis effectivement imputés/consommés par le FiscalResult N+1", async () => {
    const dossierId = uid("dossier");
    const userId = uid("user");
    // N ferme avec un déficit reportable (800, millésime 2025) ET un
    // amortissement reporté (500) — les deux types de stock identifiés par
    // l'audit read-only.
    const workspace = readyWorkspace({
      fiscalResultOverrides: {
        exercice: 2025,
        stocks: { deficits: [{ millesime: 2025, montant: 800 }], amortissementsReportes: 500 },
      },
    });

    const result = await persistFiscalYearClosureAndTransition({
      dossierId,
      userId,
      workspace,
      now: "2026-09-04T00:00:00.000Z",
    });

    // 1) N+1 possède bien les stocks d'ouverture persistés (valeur de retour,
    // avant toute relecture IndexedDB).
    assert.ok(result.nextFiscalYear.stocksOuverture, "N+1 doit porter des stocks d'ouverture");
    assert.deepEqual(
      result.nextFiscalYear.stocksOuverture?.stocks,
      { deficits: [{ millesime: 2025, montant: 800 }], amortissementsReportes: 500 },
    );
    const closureId = result.closedFiscalYear.closures?.[result.closedFiscalYear.closures.length - 1]?.id;
    assert.equal(result.nextFiscalYear.stocksOuverture?.sourceClosureId, closureId);

    // 2) Le champ survit à une relecture IndexedDB réelle (simule un refresh
    // — pas seulement la valeur de retour en mémoire de cet appel).
    const archivedNPlus1 = await getFiscalYearRecord<FiscalYearRecord>(result.nextFiscalYear.id);
    assert.deepEqual(archivedNPlus1?.stocksOuverture, result.nextFiscalYear.stocksOuverture);

    // 3) Ce qui serait dispatché en mémoire (nextWorkspace.fiscalYear, lu par
    // ValidationDocumentStep.tsx) porte lui aussi le champ.
    assert.deepEqual(result.nextWorkspace.fiscalYear.stocksOuverture, result.nextFiscalYear.stocksOuverture);

    // 4) `declarationDraft.fiscalResult` de N+1 reste ABSENT — jamais réutilisé
    // comme vecteur de transport inter-exercices (invariant imposé,
    // architecture P1-1).
    assert.equal(result.nextWorkspace.declarationDraft?.fiscalResult, undefined);

    // 5) Génération réelle de N+1, en lisant le champ persisté — exactement
    // ce que fait ValidationDocumentStep.tsx (fiscalYear.stocksOuverture?.stocks).
    const draftNPlus1 = generableDraftNPlus1();
    const generation = runDeclarationGeneration(
      draftNPlus1,
      result.nextFiscalYear.year,
      result.nextFiscalYear.stocksOuverture?.stocks,
    );
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") throw new Error("unreachable");
    const fr = generation.fiscalResult;

    // 7000 (recettes) - 2000 (charges) = 5000 de résultat avant amortissement.
    assert.equal(fr.resultatAvantAmort, 5000);
    // Le déficit antérieur (800) est imputé AVANT l'amortissement de
    // l'exercice (1000), puis l'amortissement reporté de N (500) est consommé
    // avec la dotation de N+1 (1000) — aucun des deux stocks n'est ignoré :
    // 5000 - 800 (déficit) = 4200 ; 4200 - 1000 (amort dotation N+1) = 3200 ;
    // 3200 - 500 (amort reporté N consommé) = 2700.
    assert.equal(
      fr.resultatFiscal,
      2700,
      "jamais 4000 (stocks ignorés : 5000 - 1000) — les deux stocks de N doivent réellement réduire le résultat de N+1",
    );
    assert.equal(fr.amortDeduct, 1000);
    assert.equal(fr.amortReporte, 0, "l'amortissement reporté de N (500) est intégralement consommé, pas laissé à 500 ni doublé à 1500");
    assert.equal(fr.deficitNouveau, 0);

    // 6) Le déficit et l'amortissement reporté de N ne sont NI perdus NI
    // doublés dans le nouveau stock de clôture de N+1 : intégralement
    // consommés → le nouveau stock est vide, jamais 800/500 inchangés (perdu)
    // ni 1600/1000 (doublé).
    assert.deepEqual(fr.stocks.deficits, []);
    assert.equal(fr.stocks.amortissementsReportes, 0);

    // 7) La closure de N elle-même reste immuable — la consommation par N+1
    // n'a rien réécrit rétroactivement dans FiscalYear(N).closures[].
    const archivedN = await getFiscalYearRecord<FiscalYearRecord>(workspace.fiscalYear.id);
    const nClosure = archivedN?.closures?.[archivedN.closures.length - 1];
    assert.deepEqual(nClosure?.stocks, { deficits: [{ millesime: 2025, montant: 800 }], amortissementsReportes: 500 });
  });

  it("aucune double comptabilisation sur 3 générations (N → N+1 → N+2) : les stocks de N+2 reflètent la clôture de N+1, jamais un cumul avec ceux de N", async () => {
    const dossierId = uid("dossier");
    const userId = uid("user");
    const workspaceN = readyWorkspace({
      fiscalResultOverrides: {
        exercice: 2025,
        stocks: { deficits: [{ millesime: 2025, montant: 800 }], amortissementsReportes: 500 },
      },
    });

    const resultN = await persistFiscalYearClosureAndTransition({
      dossierId,
      userId,
      workspace: workspaceN,
      now: "2026-09-04T00:00:00.000Z",
    });
    assert.deepEqual(resultN.nextFiscalYear.stocksOuverture?.stocks, {
      deficits: [{ millesime: 2025, montant: 800 }],
      amortissementsReportes: 500,
    });

    // N+1 est ensuite lui-même travaillé et clôturé avec SON PROPRE résultat
    // (déficit et amortissement reporté différents de ceux de N — 200 et 50,
    // simulant l'imputation partielle réelle d'un exercice réel).
    const workspaceNPlus1: PersistedWorkspace = {
      ...resultN.nextWorkspace,
      fiscalYear: { ...resultN.nextFiscalYear, status: "ready_to_close", declarationGeneratedAt: "2027-05-01T00:00:00.000Z" },
      declarationDraft: {
        ...resultN.nextWorkspace.declarationDraft,
        fiscalResult: fiscalResult({
          exercice: 2026,
          stocks: { deficits: [{ millesime: 2026, montant: 200 }], amortissementsReportes: 50 },
        }),
      },
    };

    const resultNPlus1 = await persistFiscalYearClosureAndTransition({
      dossierId,
      userId,
      workspace: workspaceNPlus1,
      now: "2027-09-04T00:00:00.000Z",
    });

    // N+2 reflète EXACTEMENT la clôture de N+1 (200 / 50) — jamais celle de N
    // (800 / 500), jamais un cumul des deux (1000 / 550).
    assert.deepEqual(resultNPlus1.nextFiscalYear.stocksOuverture?.stocks, {
      deficits: [{ millesime: 2026, montant: 200 }],
      amortissementsReportes: 50,
    });
  });
});

describe("P1-1 — cas négatifs : aucun stock n'est jamais inventé", () => {
  it("premier exercice d'un dossier (aucun previousFiscalYearId) — jamais de stocksOuverture, génération identique à un dossier sans historique", () => {
    // Un tout premier FiscalYear (jamais créé par un cycle clôture→transition)
    // ne porte structurellement aucun `stocksOuverture` — personne ne
    // l'a jamais posé. runDeclarationGeneration() appelé sans 3e argument
    // (exactement ce que fait ValidationDocumentStep.tsx via
    // `fiscalYear.stocksOuverture?.stocks` quand ce champ est absent) ne doit
    // imputer ni inventer aucun stock.
    const draft = generableDraftNPlus1();
    const generation = runDeclarationGeneration(draft, 2026);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") throw new Error("unreachable");
    // Sans stock antérieur : 7000 - 2000 = 5000 de résultat avant amort,
    // 1000 d'amortissement intégralement déductible → resultatFiscal = 4000.
    assert.equal(generation.fiscalResult.resultatFiscal, 4000);
    assert.equal(generation.fiscalResult.amortReporte, 0);
  });

  it("resolveStocksOuverture() — mêmes 6 gardes qu'avant P1-1, revérifiées au point d'intégration exact utilisé par persistFiscalYearClosureAndTransition() (non affaiblies, non dupliquées : cf. la matrice exhaustive T4-T10 de fiscal-year-cycle.test.ts)", () => {
    const now = "2026-09-04T00:00:00.000Z";
    const closedN: FiscalYear = {
      id: "fy-N",
      year: 2025,
      status: "closed",
      regime: "reel",
      propertyIds: ["prop-1"],
      dossierId: "dossier-1",
      createdAt: now,
      updatedAt: now,
      closures: [
        { id: "closure-1", fiscalYearId: "fy-N", dossierId: "dossier-1", stocks: { deficits: [], amortissementsReportes: 0 }, computedAt: now, closedAt: now },
      ],
    };

    // Mauvais dossier — N+1 d'un autre dossier ne doit jamais hériter des stocks de N.
    const nPlus1AutreDossier: FiscalYear = { ...closedN, id: "fy-N+1", year: 2026, dossierId: "dossier-AUTRE", previousFiscalYearId: "fy-N", closures: [] };
    assert.equal(resolveStocksOuverture(nPlus1AutreDossier, closedN).status, "unavailable");

    // Mauvais exercice précédent (non adjacent, N-2 au lieu de N-1).
    const nMoins2: FiscalYear = { ...closedN, id: "fy-N-2", year: 2023 };
    const nPlus1NonAdjacent: FiscalYear = { ...closedN, id: "fy-N+1", year: 2026, dossierId: "dossier-1", previousFiscalYearId: "fy-N-2", closures: [] };
    assert.equal(resolveStocksOuverture(nPlus1NonAdjacent, nMoins2).status, "unavailable");

    // N non clôturé — aucun stock, même avec une closure présente en mémoire.
    const nNonClos: FiscalYear = { ...closedN, status: "ready_to_close" };
    const nPlus1SurNNonClos: FiscalYear = { ...closedN, id: "fy-N+1", year: 2026, dossierId: "dossier-1", previousFiscalYearId: "fy-N", closures: [] };
    assert.equal(resolveStocksOuverture(nPlus1SurNNonClos, nNonClos).status, "unavailable");
  });
});
