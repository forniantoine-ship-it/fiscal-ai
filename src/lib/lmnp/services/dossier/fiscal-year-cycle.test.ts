/**
 * P3-SOCLE-CYCLE-FISCAL — P0-1 — tests de la logique pure du cycle N → N+1.
 * Couvre T4 à T12 de la matrice de tests du Design Gate (T1/T2/T3/T13/T14 —
 * migration/atomicité/documents — sont couverts séparément dans
 * `dossier-db.test.ts`, au niveau où ils s'appliquent réellement).
 * Run: npx tsx --test src/lib/lmnp/services/dossier/fiscal-year-cycle.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  appendClosure,
  buildFiscalYearClosure,
  canCloseFiscalYear,
  canCreateNextFiscalYear,
  createNextDeclarationDraft,
  createNextFiscalYear,
  extractAmortissementBase,
  extractDossierLevelDataFromWorkspace,
  extractFinancementBases,
  extractIdentity,
  latestClosure,
  resolveStocksOuverture,
} from "./fiscal-year-cycle";
import type { DeclarationDraft, FiscalYear, Property } from "../../types/domain";
import type { PersistedWorkspace } from "../../store/persistence";
import type { F011LoanDraft } from "@/runtime/assistants/f011-financement/types";
import { runDeclarationGeneration } from "../declaration/run-declaration-generation";

const NOW = "2026-09-04T00:00:00.000Z";

function baseFiscalYear(overrides: Partial<FiscalYear> = {}): FiscalYear {
  return {
    id: "fy-N",
    year: 2025,
    status: "draft",
    regime: "reel",
    propertyIds: ["prop-1"],
    createdAt: NOW,
    updatedAt: NOW,
    dossierId: "dossier-1",
    previousFiscalYearId: null,
    closures: [],
    ...overrides,
  };
}

const STOCKS_V1 = { deficits: [{ millesime: 2025, montant: 1200 }], amortissementsReportes: 300 };
const STOCKS_V2 = { deficits: [{ millesime: 2025, montant: 900 }], amortissementsReportes: 300 };

// ---------------------------------------------------------------------------
// T11 — F-010 : amortissementBase permet de recalculer N et N+1 sans utiliser
// l'output N comme input.
// ---------------------------------------------------------------------------
describe("extractAmortissementBase — T11", () => {
  it("extrait uniquement les champs stables (composants/valeurTerrain/montantMobilier/dateMiseEnService), jamais dotationExercice/amortissementsCumules (exercice-spécifiques)", () => {
    const logementAmortissement: DeclarationDraft["logementAmortissement"] = {
      prixRevient: 125136,
      valeurTerrain: 17960,
      valeurBati: 107176,
      baseAmortissableBati: 107176,
      montantMobilier: 5400,
      dotationAnnuelle: 1500,
      dureeMoyenneAnnees: 30,
      prorataRatio: 1,
      plan: {
        lignes: [
          { label: "Gros œuvre", montant: 37186, dureeAnnees: 75, dotationExercice: 372, amortissementsCumules: 372, vnc: 36814 },
        ],
        totalAnnuelExercice: 372,
        totalBrut: 37186,
      },
      fieldSources: {},
      computedAt: NOW,
    };

    const base = extractAmortissementBase(logementAmortissement, "2024-04-15");
    assert.deepEqual(base, {
      composants: [{ label: "Gros œuvre", montant: 37186, dureeAnnees: 75 }],
      valeurTerrain: 17960,
      montantMobilier: 5400,
      dateMiseEnService: "2024-04-15",
    });
    // Aucune valeur d'exercice (dotationExercice/amortissementsCumules/vnc) n'a fuité dans la base stable.
    assert.equal(
      Object.prototype.hasOwnProperty.call(base!.composants[0], "dotationExercice"),
      false,
    );
  });

  it("undefined si aucun plan d'amortissement n'existe encore — jamais une base inventée", () => {
    assert.equal(extractAmortissementBase(undefined, "2024-04-15"), undefined);
  });
});

// ---------------------------------------------------------------------------
// T12 — F-011 : FinancementBase permet de recalculer les exercices concernés.
// ---------------------------------------------------------------------------
describe("extractFinancementBases — T12", () => {
  it("extrait les termes stables d'un prêt depuis F011LoanDraft[], jamais depuis un output d'exercice", () => {
    const loans: F011LoanDraft[] = [
      {
        pretId: "pret-1",
        typePret: "amortissable",
        capitalInitial: 200000,
        tauxNominal: 0.032,
        dureeMois: 240,
        datePremiereMensualite: "2024-05-01",
        assuranceAnnuelle: 480,
        fraisDossier: 900,
        commissionCaution: 3200,
        iraMontant: 0,
      },
    ];
    const bases = extractFinancementBases(loans);
    assert.deepEqual(bases, [
      {
        pretId: "pret-1",
        capitalInitial: 200000,
        tauxNominal: 0.032,
        dureeMois: 240,
        datePremiereMensualite: "2024-05-01",
        assuranceAnnuelle: 480,
        fraisDossier: 900,
        garantieDeductible: 3200,
        iraDeductible: 0,
      },
    ]);
  });

  it("tableau vide si aucun prêt — jamais undefined transformé en une valeur inventée", () => {
    assert.deepEqual(extractFinancementBases(undefined), []);
  });
});

// ---------------------------------------------------------------------------
// T8 — Closure versionnée : une seconde clôture de N n'écrase pas la première.
// ---------------------------------------------------------------------------
describe("appendClosure/latestClosure — T8", () => {
  it("append-only : deux clôtures successives cohabitent, la première reste intacte", () => {
    const v1 = buildFiscalYearClosure({
      fiscalYearId: "fy-N",
      dossierId: "dossier-1",
      stocks: STOCKS_V1,
      computedAt: NOW,
      sourceDeclarationVersionId: "decl-v1",
      now: NOW,
    });
    let fy = baseFiscalYear();
    fy = appendClosure(fy, v1);
    assert.equal(fy.closures?.length, 1);

    const v2 = buildFiscalYearClosure({
      fiscalYearId: "fy-N",
      dossierId: "dossier-1",
      stocks: STOCKS_V2,
      computedAt: NOW,
      sourceDeclarationVersionId: "decl-v2",
      now: "2026-09-05T00:00:00.000Z",
    });
    fy = appendClosure(fy, v2);

    assert.equal(fy.closures?.length, 2);
    assert.deepEqual(fy.closures?.[0], v1, "V1 reste intacte, jamais réécrite");
    assert.equal(latestClosure(fy)?.id, v2.id);
  });

  it("idempotent : ré-appliquer la même closure ne la duplique pas", () => {
    const v1 = buildFiscalYearClosure({
      fiscalYearId: "fy-N",
      dossierId: "dossier-1",
      stocks: STOCKS_V1,
      computedAt: NOW,
      now: NOW,
    });
    let fy = baseFiscalYear();
    fy = appendClosure(fy, v1);
    fy = appendClosure(fy, v1);
    assert.equal(fy.closures?.length, 1);
  });
});

// ---------------------------------------------------------------------------
// T4/T5/T6/T7/T9/T10 — garde stricte des stocks N → N+1.
// ---------------------------------------------------------------------------
describe("resolveStocksOuverture — garde stricte", () => {
  it("T4 — N clôturé avec closure → N+1 consomme précisément cette closure (sourceClosureId conservé)", () => {
    const closure = buildFiscalYearClosure({
      fiscalYearId: "fy-N",
      dossierId: "dossier-1",
      stocks: STOCKS_V1,
      computedAt: NOW,
      now: NOW,
    });
    const n = appendClosure(baseFiscalYear({ status: "closed" }), closure);
    const nPlus1 = baseFiscalYear({ id: "fy-N+1", year: 2026, previousFiscalYearId: "fy-N" });

    const result = resolveStocksOuverture(nPlus1, n);
    assert.deepEqual(result, { status: "available", sourceClosureId: closure.id, stocks: STOCKS_V1 });
  });

  it("T5 — mauvais dossier : un précédent FiscalYear d'un autre dossier est refusé", () => {
    const closure = buildFiscalYearClosure({
      fiscalYearId: "fy-N",
      dossierId: "dossier-AUTRE",
      stocks: STOCKS_V1,
      computedAt: NOW,
      now: NOW,
    });
    const n = appendClosure(
      baseFiscalYear({ status: "closed", dossierId: "dossier-AUTRE" }),
      closure,
    );
    const nPlus1 = baseFiscalYear({
      id: "fy-N+1",
      year: 2026,
      dossierId: "dossier-1",
      previousFiscalYearId: "fy-N",
    });

    const result = resolveStocksOuverture(nPlus1, n);
    assert.equal(result.status, "unavailable");
  });

  it("T6 — N-2 ne peut jamais servir de N-1 (adjacence stricte)", () => {
    const closure = buildFiscalYearClosure({
      fiscalYearId: "fy-N-2",
      dossierId: "dossier-1",
      stocks: STOCKS_V1,
      computedAt: NOW,
      now: NOW,
    });
    const nMinus2 = appendClosure(
      baseFiscalYear({ id: "fy-N-2", year: 2023, status: "closed" }),
      closure,
    );
    const nPlus1 = baseFiscalYear({
      id: "fy-N+1",
      year: 2026,
      previousFiscalYearId: "fy-N-2",
    });

    const result = resolveStocksOuverture(nPlus1, nMinus2);
    assert.equal(result.status, "unavailable");
  });

  it("T7 — exercice précédent non clos ne fournit pas de stocks", () => {
    const closure = buildFiscalYearClosure({
      fiscalYearId: "fy-N",
      dossierId: "dossier-1",
      stocks: STOCKS_V1,
      computedAt: NOW,
      now: NOW,
    });
    const n = appendClosure(baseFiscalYear({ status: "ready_to_close" }), closure);
    const nPlus1 = baseFiscalYear({ id: "fy-N+1", year: 2026, previousFiscalYearId: "fy-N" });

    const result = resolveStocksOuverture(nPlus1, n);
    assert.equal(result.status, "unavailable");
  });

  it("aucun previousFiscalYearId → continuité indisponible, jamais 0 ni estimation", () => {
    const n = baseFiscalYear({ status: "closed" });
    const nPlus1 = baseFiscalYear({ id: "fy-N+1", year: 2026, previousFiscalYearId: null });
    const result = resolveStocksOuverture(nPlus1, n);
    assert.equal(result.status, "unavailable");
  });

  it("N clos sans aucune closure produite → continuité indisponible", () => {
    const n = baseFiscalYear({ status: "closed", closures: [] });
    const nPlus1 = baseFiscalYear({ id: "fy-N+1", year: 2026, previousFiscalYearId: "fy-N" });
    const result = resolveStocksOuverture(nPlus1, n);
    assert.equal(result.status, "unavailable");
  });

  it("T10 — après une nouvelle closure de N, sourceClosureId de N+1 permet de détecter une dépendance obsolète", () => {
    const v1 = buildFiscalYearClosure({ fiscalYearId: "fy-N", dossierId: "dossier-1", stocks: STOCKS_V1, computedAt: NOW, now: NOW });
    let n = appendClosure(baseFiscalYear({ status: "closed" }), v1);
    const nPlus1 = baseFiscalYear({ id: "fy-N+1", year: 2026, previousFiscalYearId: "fy-N" });

    const firstResult = resolveStocksOuverture(nPlus1, n);
    assert.equal(firstResult.status, "available");
    const consumedClosureId = firstResult.status === "available" ? firstResult.sourceClosureId : undefined;

    // N est corrigé : une nouvelle closure V2 est ajoutée (jamais un remplacement de V1).
    const v2 = buildFiscalYearClosure({ fiscalYearId: "fy-N", dossierId: "dossier-1", stocks: STOCKS_V2, computedAt: NOW, now: "2026-09-06T00:00:00.000Z" });
    n = appendClosure(n, v2);

    const currentLatest = latestClosure(n);
    assert.notEqual(currentLatest?.id, consumedClosureId, "la closure consommée par N+1 n'est plus la dernière : dépendance obsolète détectable");
    assert.equal(n.closures?.length, 2, "V1 reste tracée, jamais supprimée");
  });
});

// ---------------------------------------------------------------------------
// Création de N+1 — ne copie aucune donnée métier, garde les références.
// ---------------------------------------------------------------------------
describe("createNextFiscalYear / createNextDeclarationDraft / extractIdentity", () => {
  it("N+1 référence dossierId et previousFiscalYearId, propertyIds copiés (référence, pas régénération d'ID)", () => {
    const n = baseFiscalYear({ status: "closed" });
    const nPlus1 = createNextFiscalYear(n, "dossier-1", "2026-09-04T00:00:00.000Z");
    assert.equal(nPlus1.dossierId, "dossier-1");
    assert.equal(nPlus1.previousFiscalYearId, "fy-N");
    assert.deepEqual(nPlus1.propertyIds, ["prop-1"]);
    assert.notEqual(nPlus1.id, n.id);
    assert.equal(nPlus1.year, 2026);
    assert.deepEqual(nPlus1.closures, []);
  });

  it("extractIdentity ne reporte que les champs Dossier-level, jamais les données d'exercice", () => {
    const draft: DeclarationDraft = {
      completedSteps: ["siren"],
      siren: "123456789",
      exploitantFirstName: "Marie",
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000, loyersEncaisses: 9000, indemnitesAssurance: 0, recettesPlateforme: 0, ajustementsJanDec: 0, moisLocationEffectifs: 12, fieldSources: {}, computedAt: NOW },
    } as DeclarationDraft;
    const identity = extractIdentity(draft);
    assert.deepEqual(identity, { siren: "123456789", exploitantFirstName: "Marie" });
    assert.equal((identity as Record<string, unknown>).revenusAssistant, undefined);
  });

  it("createNextDeclarationDraft reporte l'identité mais repart d'un draft vide sinon", () => {
    const previous: DeclarationDraft = { completedSteps: ["siren"], siren: "123456789" } as DeclarationDraft;
    const next = createNextDeclarationDraft(previous);
    assert.deepEqual(next, { completedSteps: [], siren: "123456789" });
  });
});

// ---------------------------------------------------------------------------
// Extraction Dossier-level depuis un workspace mono-exercice existant.
// ---------------------------------------------------------------------------
describe("extractDossierLevelDataFromWorkspace", () => {
  it("rattache amortissementBase au premier bien, extrait financements[], sans modifier le workspace", () => {
    const workspace: PersistedWorkspace = {
      fiscalYear: baseFiscalYear(),
      properties: [{ id: "prop-1", label: "Mon bien", address: "1 rue X", city: "Lyon", postalCode: "69000" }],
      documents: [],
      extractions: [],
      validationItems: [],
      ledgerEntries: [],
      declarationDraft: {
        completedSteps: [],
        dateMiseEnService: "2024-04-15",
        logementAmortissement: {
          prixRevient: 125136,
          valeurTerrain: 17960,
          valeurBati: 107176,
          baseAmortissableBati: 107176,
          montantMobilier: 5400,
          dotationAnnuelle: 1500,
          dureeMoyenneAnnees: 30,
          prorataRatio: 1,
          plan: {
            lignes: [{ label: "Gros œuvre", montant: 37186, dureeAnnees: 75, dotationExercice: 372, amortissementsCumules: 372, vnc: 36814 }],
            totalAnnuelExercice: 372,
            totalBrut: 37186,
          },
          fieldSources: {},
          computedAt: NOW,
        },
      },
    };

    const { properties, financements } = extractDossierLevelDataFromWorkspace(workspace);
    assert.equal(properties[0].id, "prop-1", "Property.id conservé");
    assert.deepEqual(properties[0].amortissementBase?.dateMiseEnService, "2024-04-15");
    assert.deepEqual(financements, []);
    // Non-mutation du workspace source.
    assert.equal(workspace.properties[0].amortissementBase, undefined);
  });
});

// ---------------------------------------------------------------------------
// P3-SOCLE-CYCLE-FISCAL — P0-1 v2 — préconditions de CREATE_NEXT_FISCAL_YEAR
// (T-P0-4 / T-P0-5, niveau fonction pure).
// ---------------------------------------------------------------------------
describe("canCreateNextFiscalYear — préconditions 3/4", () => {
  it("T-P0-4 — refuse si l'exercice n'est pas clôturé", () => {
    const result = canCreateNextFiscalYear({
      id: "fy-1",
      year: 2025,
      status: "ready_to_close",
      regime: "reel",
      propertyIds: ["prop-1"],
      createdAt: NOW,
      updatedAt: NOW,
      closures: [
        {
          id: "closure-1",
          fiscalYearId: "fy-1",
          stocks: { deficits: [], amortissementsReportes: 0 },
          computedAt: NOW,
          closedAt: NOW,
        },
      ],
    });
    assert.equal(result.ok, false);
  });

  it("T-P0-5 — refuse si aucune closure n'existe, même si le statut est closed", () => {
    const result = canCreateNextFiscalYear({
      id: "fy-1",
      year: 2025,
      status: "closed",
      regime: "reel",
      propertyIds: ["prop-1"],
      createdAt: NOW,
      updatedAt: NOW,
      closures: [],
    });
    assert.equal(result.ok, false);
  });

  it("autorise quand l'exercice est clos ET porte une closure", () => {
    const result = canCreateNextFiscalYear({
      id: "fy-1",
      year: 2025,
      status: "closed",
      regime: "reel",
      propertyIds: ["prop-1"],
      createdAt: NOW,
      updatedAt: NOW,
      closures: [
        {
          id: "closure-1",
          fiscalYearId: "fy-1",
          stocks: { deficits: [], amortissementsReportes: 0 },
          computedAt: NOW,
          closedAt: NOW,
        },
      ],
    });
    assert.equal(result.ok, true);
  });
});

// ---------------------------------------------------------------------------
// Design Gate "Clôture N → N+1", Décision 1 — précondition du geste
// utilisateur unique "Clôturer et continuer".
// ---------------------------------------------------------------------------
describe("canCloseFiscalYear — précondition du geste de clôture", () => {
  it("refuse si status !== ready_to_close", () => {
    const result = canCloseFiscalYear({
      fiscalYear: baseFiscalYear({ status: "pending_validation", declarationGeneratedAt: NOW }),
      declarationDraft: undefined,
      properties: [],
    });
    assert.equal(result.ok, false);
  });

  it("refuse si declarationGeneratedAt est absent, même si status === ready_to_close", () => {
    const result = canCloseFiscalYear({
      fiscalYear: baseFiscalYear({ status: "ready_to_close", declarationGeneratedAt: undefined }),
      declarationDraft: undefined,
      properties: [],
    });
    assert.equal(result.ok, false);
  });

  it("autorise quand status === ready_to_close ET declarationGeneratedAt existe (dossier minimal, aucune dérive détectable)", () => {
    const result = canCloseFiscalYear({
      fiscalYear: baseFiscalYear({ status: "ready_to_close", declarationGeneratedAt: NOW }),
      declarationDraft: undefined,
      properties: [],
    });
    assert.equal(result.ok, true);
  });

  it("ne dépend jamais de transmittedAt — la clôture reste indépendante de l'EDI", () => {
    const withoutTransmission = canCloseFiscalYear({
      fiscalYear: baseFiscalYear({ status: "ready_to_close", declarationGeneratedAt: NOW, transmittedAt: undefined }),
      declarationDraft: undefined,
      properties: [],
    });
    assert.equal(withoutTransmission.ok, true);
  });
});

// ---------------------------------------------------------------------------
// P0-1 (audit "Idempotence + Generation Gate", constats B1/B2) — la clôture
// ne doit jamais reposer sur declarationGeneratedAt seul : elle doit refléter
// la MÊME dérive que resolveDeclarationGenerationGate() (aucune seconde liste
// de champs, aucun fingerprint parallèle — réutilisation directe du gate).
// ---------------------------------------------------------------------------
describe("canCloseFiscalYear — drift (P0-1, B1/B2)", () => {
  const PROPERTY: Property = {
    id: "prop-1",
    label: "Studio Lyon",
    address: "1 rue Test",
    city: "Lyon",
    postalCode: "69001",
  };

  function completeFlags(overrides: Partial<DeclarationDraft> = {}): DeclarationDraft {
    return {
      completedSteps: [],
      inpiConfirmedAt: NOW,
      logementConfirmedAt: NOW,
      creditDeclaredNoneAt: NOW,
      revenusConfirmedAt: NOW,
      chargesConfirmedAt: NOW,
      amortissementConfirmedAt: NOW,
      ...overrides,
    } as DeclarationDraft;
  }

  function generationReadyDraft(overrides: Partial<DeclarationDraft> = {}): DeclarationDraft {
    return completeFlags({
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
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1500, status: "validated" },
      ...overrides,
    } as DeclarationDraft);
  }

  function readyFiscalYear(overrides: Partial<FiscalYear> = {}): FiscalYear {
    return baseFiscalYear({
      status: "ready_to_close",
      declarationGeneratedAt: NOW,
      ...overrides,
    });
  }

  // Reproduit exactement ce que ValidationDocumentStep.tsx écrit sur le
  // draft après une génération (fiscalResult = miroir de la dernière
  // génération) — même helper que run-declaration-generation.test.ts.
  function apresGeneration(draft: DeclarationDraft): DeclarationDraft {
    const generation = runDeclarationGeneration(draft, 2025);
    assert.equal(generation.status, "generated", "le fixture doit produire une génération réelle, pas un blocage");
    if (generation.status !== "generated") throw new Error("unreachable");
    return { ...draft, fiscalResult: generation.fiscalResult, rfs: generation.rfs } as DeclarationDraft;
  }

  it("R1 — génération valide → canCloseFiscalYear === true", () => {
    const draft = apresGeneration(generationReadyDraft());
    const result = canCloseFiscalYear({
      fiscalYear: readyFiscalYear(),
      declarationDraft: draft,
      properties: [PROPERTY],
    });
    assert.equal(result.ok, true);
  });

  it("R2 — replay identique (aucun changement fiscal/identité) → canCloseFiscalYear === true", () => {
    const draft = apresGeneration(generationReadyDraft());
    // Deuxième évaluation, mêmes données strictement — simule un rendu
    // ultérieur sans aucune modification utilisateur entre-temps.
    const result = canCloseFiscalYear({
      fiscalYear: readyFiscalYear(),
      declarationDraft: { ...draft },
      properties: [PROPERTY],
    });
    assert.equal(result.ok, true);
  });

  it("R3a — nom/prénom modifiés après génération → canCloseFiscalYear === false", () => {
    const draft = apresGeneration(generationReadyDraft());
    const corrige = { ...draft, exploitantLastName: "Martin" } as DeclarationDraft;
    const result = canCloseFiscalYear({
      fiscalYear: readyFiscalYear(),
      declarationDraft: corrige,
      properties: [PROPERTY],
    });
    assert.equal(result.ok, false);
    assert.ok(result.ok === false && result.reason.length > 0);
  });

  it("R3a — SIREN modifié après génération → canCloseFiscalYear === false", () => {
    const draft = apresGeneration(generationReadyDraft());
    const corrige = { ...draft, siren: "987654321" } as DeclarationDraft;
    const result = canCloseFiscalYear({
      fiscalYear: readyFiscalYear(),
      declarationDraft: corrige,
      properties: [PROPERTY],
    });
    assert.equal(result.ok, false);
  });

  it("R3a — adresse personnelle modifiée après génération → canCloseFiscalYear === false", () => {
    const draft = apresGeneration(generationReadyDraft());
    const corrige = { ...draft, personalAddress: "22 avenue Neuve" } as DeclarationDraft;
    const result = canCloseFiscalYear({
      fiscalYear: readyFiscalYear(),
      declarationDraft: corrige,
      properties: [PROPERTY],
    });
    assert.equal(result.ok, false);
  });

  it("R3a — email/téléphone modifiés après génération → canCloseFiscalYear === false", () => {
    const draft = apresGeneration(generationReadyDraft());
    const corrige = {
      ...draft,
      exploitantEmail: "nouvelle.adresse@example.com",
      exploitantTelephone: "0611223344",
    } as DeclarationDraft;
    const result = canCloseFiscalYear({
      fiscalYear: readyFiscalYear(),
      declarationDraft: corrige,
      properties: [PROPERTY],
    });
    assert.equal(result.ok, false);
  });

  it("R3b — financement ajouté après génération (dérive fiscale) → canCloseFiscalYear === false", () => {
    const draft = apresGeneration(generationReadyDraft());
    const corrige = {
      ...draft,
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000 + 1200, totalPreExploitation: 0 },
    } as DeclarationDraft;
    const result = canCloseFiscalYear({
      fiscalYear: readyFiscalYear(),
      declarationDraft: corrige,
      properties: [PROPERTY],
    });
    assert.equal(result.ok, false);
  });

  it("R3b — amortissement modifié après génération (dérive fiscale) → canCloseFiscalYear === false", () => {
    const draft = apresGeneration(generationReadyDraft());
    const corrige = {
      ...draft,
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 3000, status: "validated" as const },
    } as DeclarationDraft;
    const result = canCloseFiscalYear({
      fiscalYear: readyFiscalYear(),
      declarationDraft: corrige,
      properties: [PROPERTY],
    });
    assert.equal(result.ok, false);
  });

  it("R4 — après correction détectée, une nouvelle génération valide redonne canCloseFiscalYear === true", () => {
    const draft = apresGeneration(generationReadyDraft());
    const corrige = { ...draft, exploitantLastName: "Martin" } as DeclarationDraft;

    const bloque = canCloseFiscalYear({
      fiscalYear: readyFiscalYear(),
      declarationDraft: corrige,
      properties: [PROPERTY],
    });
    assert.equal(bloque.ok, false, "la clôture doit être bloquée avant régénération");

    // Régénération réelle (même chemin que ValidationDocumentStep.tsx) sur
    // le draft corrigé — le nouveau fiscalResult/rfs reflète "Martin".
    const regenere = apresGeneration(corrige);

    const debloque = canCloseFiscalYear({
      fiscalYear: readyFiscalYear(),
      declarationDraft: regenere,
      properties: [PROPERTY],
    });
    assert.equal(debloque.ok, true, "après régénération, plus aucune dérive détectée");
  });
});
