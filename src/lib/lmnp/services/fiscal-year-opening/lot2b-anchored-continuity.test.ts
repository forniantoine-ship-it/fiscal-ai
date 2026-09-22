/**
 * Lot 2B — propagation ancre historique (ID-based) dans la chaîne comptable.
 * Run: npx tsx --test src/lib/lmnp/services/fiscal-year-opening/lot2b-anchored-continuity.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assemblePlan } from "@/runtime/capabilities/f010/assemble-plan";
import { computeAmortizationPlan } from "@/runtime/capabilities/f010/compute-amortization-plan";
import { composePlanAmortissement } from "@/runtime/capabilities/f014/compose-plan-amortissement";

import { adaptInternalOpening } from "./adapt-internal-opening";
import { computeOpeningContentHash } from "./content-hash";
import { available, unavailable } from "./opening-fact";
import { isAvailable } from "./opening-fact";
import { propagateAnchoredDepreciation } from "./propagate-anchored-depreciation";
import { resolveOpeningDepreciation } from "./resolve-opening-depreciation";
import {
  fixtureClosedFiscalYear,
  fixtureClosure,
} from "./fixtures";
import type { FiscalYearOpening, OpeningAsset } from "./types";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

const ORACLE = {
  dossierId: "dossier-oracle-2b",
  assetId: "actif-bati-hist-1",
  terrainId: "terrain-hist-1",
  propertyId: "prop-1",
  base: 12_000,
  terrain: 2_000,
  cumul2026Open: 4_500,
  startDate: "2020-01-01",
  durationYears: 12,
} as const;

function makeValidatedOpening(params: {
  targetFiscalYear: number;
  assets: OpeningAsset[];
  source?: FiscalYearOpening["source"];
  validationStatus?: "validated" | "pending";
  mutateAfterValidate?: (o: FiscalYearOpening) => void;
  stocksAmortReportes?: number;
}): FiscalYearOpening {
  const opening: FiscalYearOpening = {
    openingId: `opening-${params.targetFiscalYear}`,
    revision: 1,
    targetFiscalYear: params.targetFiscalYear,
    dossierId: ORACLE.dossierId,
    source: params.source ?? {
      kind: "external_takeover",
      takeoverId: "takeover-oracle",
      sourceFiscalYear: params.targetFiscalYear - 1,
    },
    stocks: {
      deficits: available([]),
      amortissementsReportes: available(params.stocksAmortReportes ?? 0),
    },
    assets: available(params.assets),
    loans: unavailable("hors scope 2B"),
    patrimoine: {
      ouvertureCompteExploitant: unavailable("hors scope"),
      ran: unavailable("hors scope"),
      tresorerieOuverture: unavailable("hors scope"),
    },
    properties: available([
      { propertyId: ORACLE.propertyId, label: "Bien oracle", dateMiseEnService: ORACLE.startDate },
    ]),
    identity: unavailable("hors scope"),
    provenance: {
      source: { fieldPath: "source", sourceKind: "external", sourceRef: "takeover-oracle" },
      "stocks.deficits": { fieldPath: "stocks.deficits", sourceKind: "external" },
      "stocks.amortissementsReportes": {
        fieldPath: "stocks.amortissementsReportes",
        sourceKind: "external",
      },
    },
    validation: { status: "pending" },
  };

  if (params.validationStatus === "pending") {
    return opening;
  }

  const hash = computeOpeningContentHash(opening);
  opening.validation = {
    status: "validated",
    openingRevision: opening.revision,
    contentHash: hash,
    validatedAt: "2026-01-01T00:00:00.000Z",
    validator: "lot2b-test",
  };

  if (params.mutateAfterValidate) {
    params.mutateAfterValidate(opening);
  }
  return opening;
}

function oracleAssets2026(overrides: Partial<OpeningAsset> = {}): OpeningAsset[] {
  return [
    {
      id: ORACLE.assetId,
      propertyId: ORACLE.propertyId,
      label: "Bâti amortissable",
      categorie: "composant",
      origin: "historique",
      coutBrut: available(ORACLE.base),
      cumulOuverture: available(ORACLE.cumul2026Open),
      plan: available({
        kind: "amortizable",
        startDate: ORACLE.startDate,
        durationYears: ORACLE.durationYears,
        prorataConvention: "annuel_plein",
      }),
      ...overrides,
    },
    {
      id: ORACLE.terrainId,
      propertyId: ORACLE.propertyId,
      label: "Terrain",
      categorie: "terrain",
      origin: "historique",
      coutBrut: available(ORACLE.terrain),
      cumulOuverture: available(0),
      plan: available({ kind: "non_amortizable" }),
    },
  ];
}

function archivedShellForClosure(year: number, propertyId: string): PersistedWorkspace {
  const closed = fixtureClosedFiscalYear({
    id: `fy-${year}`,
    year,
    dossierId: ORACLE.dossierId,
    propertyIds: [propertyId],
  });
  return {
    fiscalYear: closed,
    properties: [
      {
        id: propertyId,
        label: "Bien oracle",
        address: "1 rue Oracle",
        city: "Lyon",
        postalCode: "69001",
      },
    ],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: {
      completedSteps: [],
      dateMiseEnService: ORACLE.startDate,
    },
  };
}

describe("Lot 2B — E2E 4500 → 5500 → 6500 (vraie clôture)", () => {
  it("2026 ancré → F014/RFS/patrimoine/snapshot = 5500 ; 2027 depuis clôture réelle = 6500", () => {
    const opening2026 = makeValidatedOpening({
      targetFiscalYear: 2026,
      assets: oracleAssets2026(),
    });

    const year2026 = propagateAnchoredDepreciation({
      opening: opening2026,
      expectedDossierId: ORACLE.dossierId,
      expectedExerciceFiscal: 2026,
      dateMiseEnService: ORACLE.startDate,
    });
    assert.equal(year2026.status, "ready");
    if (year2026.status !== "ready") return;

    // Oracle 2026
    assert.equal(year2026.dotationExercice, 1000);
    assert.equal(year2026.cumulAmortissable, 5500);
    assert.equal(year2026.vncAmortissable, 6500);
    assert.equal(year2026.vncTotale, 8500);
    assert.equal(year2026.brutTotal, 14_000);
    assert.notEqual(year2026.cumulAmortissable, 7000);

    // F014 = même cumul (pas de reconstruction depuis 2020)
    const f014Ligne = year2026.f014.composants.find((c) => c.id === ORACLE.assetId);
    assert.ok(f014Ligne);
    assert.equal(f014Ligne!.dotation_exercice, 1000);
    assert.equal(f014Ligne!.plan_pluriannuel.length, 1);
    assert.equal(f014Ligne!.plan_pluriannuel[0].cumul_amortissements, 5500);
    assert.equal(f014Ligne!.plan_pluriannuel[0].valeur_nette_comptable, 6500);
    assert.doesNotMatch(f014Ligne!.id, /^f010-\d+$/);

    // RFS
    assert.equal(year2026.immobilisations.lignes[0].amortissementsCumules, 5500);
    assert.equal(year2026.immobilisations.lignes[0].id, ORACLE.assetId);
    assert.equal(year2026.immobilisations.valeurTerrain, 2000);

    // Patrimoine
    assert.equal(year2026.patrimoine.cumuleTotal, 5500);
    assert.equal(year2026.patrimoine.netTotal, 8500);
    const patBati = year2026.patrimoine.actifs.find((a) => a.id === ORACLE.assetId);
    const patTerrain = year2026.patrimoine.actifs.find((a) => a.id === ORACLE.terrainId || a.categorie === "terrain");
    assert.ok(patBati);
    assert.equal(patBati!.amortissementCumule, 5500);
    assert.equal(patBati!.vnc, 6500);
    assert.ok(patTerrain);
    assert.equal(patTerrain!.vnc, 2000);

    // Snapshot conserve ID + plan
    const snapActif = year2026.snapshot.actifs.find((a) => a.id === ORACLE.assetId);
    assert.ok(snapActif);
    assert.equal(snapActif!.amortissementCumule, 5500);
    assert.equal(snapActif!.propertyId, ORACLE.propertyId);
    assert.equal(snapActif!.dureeAnnees, 12);
    assert.equal(snapActif!.prorataConvention, "annuel_plein");
    assert.equal(snapActif!.dateDebut, ORACLE.startDate);
    assert.equal(year2026.snapshot.amortissementsCumulesCloture, 5500);
    assert.equal(year2026.snapshot.vncCloture, 8500);

    // Continuité 570+572=576 conceptuelle : 4500+1000=5500
    assert.equal(ORACLE.cumul2026Open + year2026.dotationExercice, year2026.cumulAmortissable);

    // --- Vraie clôture 2026 → ouverture interne 2027 (INTERDIT de fabriquer 5500) ---
    const closure2026 = fixtureClosure({
      id: "closure-2026-oracle",
      fiscalYearId: "fy-2026",
      dossierId: ORACLE.dossierId,
      stocks: {
        deficits: [],
        amortissementsReportes: 9999, // stock fiscal volontairement différent
        deficitsExpires: [],
      },
      immobilisationsComptables: year2026.snapshot,
    });
    const closed2026 = fixtureClosedFiscalYear({
      id: "fy-2026",
      year: 2026,
      dossierId: ORACLE.dossierId,
      propertyIds: [ORACLE.propertyId],
      status: "closed",
      closures: [closure2026],
    });
    const archived = archivedShellForClosure(2026, ORACLE.propertyId);
    archived.fiscalYear = closed2026;

    const adapted = adaptInternalOpening({
      targetFiscalYear: 2027,
      openingId: "opening-2027-from-closure",
      revision: 1,
      closedFiscalYear: closed2026,
      archivedWorkspace: archived,
    });
    assert.ok(adapted.opening);
    const opening2027raw = adapted.opening!;
    assert.equal(opening2027raw.source.kind, "internal_closure");
    assert.equal(isAvailable(opening2027raw.assets), true);
    if (!isAvailable(opening2027raw.assets)) return;

    const bati2027 = opening2027raw.assets.value.find((a) => a.id === ORACLE.assetId);
    assert.ok(bati2027, "même assetId");
    assert.equal(bati2027!.propertyId, ORACLE.propertyId);
    assert.equal(isAvailable(bati2027!.cumulOuverture), true);
    if (!isAvailable(bati2027!.cumulOuverture)) return;
    // Le 5500 DOIT venir du snapshot de clôture 2026
    assert.equal(bati2027!.cumulOuverture.value, year2026.snapshot.actifs.find((a) => a.id === ORACLE.assetId)!.amortissementCumule);
    assert.equal(bati2027!.cumulOuverture.value, 5500);
    assert.equal(isAvailable(bati2027!.plan), true);
    if (isAvailable(bati2027!.plan) && bati2027!.plan.value.kind === "amortizable") {
      assert.equal(bati2027!.plan.value.prorataConvention, "annuel_plein");
      assert.notEqual(bati2027!.plan.value.prorataConvention, "jours_reels");
    }

    // Stock fiscal ≠ cumul comptable
    assert.equal(isAvailable(opening2027raw.stocks.amortissementsReportes), true);
    if (isAvailable(opening2027raw.stocks.amortissementsReportes)) {
      assert.equal(opening2027raw.stocks.amortissementsReportes.value, 9999);
      assert.notEqual(opening2027raw.stocks.amortissementsReportes.value, 5500);
    }

    // Valider l'ouverture interne 2027 puis recalculer
    const opening2027: FiscalYearOpening = {
      ...opening2027raw,
      validation: { status: "pending" },
    };
    opening2027.validation = {
      status: "validated",
      openingRevision: opening2027.revision,
      contentHash: computeOpeningContentHash(opening2027),
      validatedAt: "2027-01-01T00:00:00.000Z",
      validator: "lot2b-test",
    };

    const year2027 = propagateAnchoredDepreciation({
      opening: opening2027,
      expectedDossierId: ORACLE.dossierId,
      expectedExerciceFiscal: 2027,
      dateMiseEnService: ORACLE.startDate,
    });
    assert.equal(year2027.status, "ready");
    if (year2027.status !== "ready") return;

    assert.equal(year2027.resolved.entries[0].cumulOuverture, 5500);
    assert.equal(year2027.dotationExercice, 1000);
    assert.equal(year2027.cumulAmortissable, 6500);
    assert.equal(year2027.vncAmortissable, 5500);
  });
});

describe("Lot 2B — gardes d'identité et validation", () => {
  it("ID absent / index-based → blocked", () => {
    const opening = makeValidatedOpening({
      targetFiscalYear: 2026,
      assets: oracleAssets2026({ id: "f010-0" }),
    });
    const r = resolveOpeningDepreciation({ opening });
    assert.equal(r.status, "blocked");
  });

  it("mauvais propertyId manquant → blocked", () => {
    const opening = makeValidatedOpening({
      targetFiscalYear: 2026,
      assets: oracleAssets2026({ propertyId: undefined }),
    });
    const r = resolveOpeningDepreciation({ opening });
    assert.equal(r.status, "blocked");
    if (r.status === "blocked") {
      assert.ok(r.issues.some((i) => i.code === "PROPERTY_ID_MISSING"));
    }
  });

  it("doublon assetId → blocked", () => {
    const assets = oracleAssets2026();
    assets.push({ ...assets[0], label: "Doublon label différent" });
    const opening = makeValidatedOpening({ targetFiscalYear: 2026, assets });
    const r = resolveOpeningDepreciation({ opening });
    assert.equal(r.status, "blocked");
  });

  it("labels identiques, IDs différents → ready (ID-based)", () => {
    const assets: OpeningAsset[] = [
      {
        id: "actif-a",
        propertyId: ORACLE.propertyId,
        label: "Même label",
        categorie: "composant",
        origin: "historique",
        coutBrut: available(6000),
        cumulOuverture: available(1000),
        plan: available({
          kind: "amortizable",
          startDate: "2020-01-01",
          durationYears: 12,
          prorataConvention: "annuel_plein",
        }),
      },
      {
        id: "actif-b",
        propertyId: ORACLE.propertyId,
        label: "Même label",
        categorie: "composant",
        origin: "historique",
        coutBrut: available(6000),
        cumulOuverture: available(2000),
        plan: available({
          kind: "amortizable",
          startDate: "2020-01-01",
          durationYears: 12,
          prorataConvention: "annuel_plein",
        }),
      },
      {
        id: ORACLE.terrainId,
        propertyId: ORACLE.propertyId,
        label: "Terrain",
        categorie: "terrain",
        coutBrut: available(2000),
        cumulOuverture: available(0),
        plan: available({ kind: "non_amortizable" }),
      },
    ];
    const opening = makeValidatedOpening({ targetFiscalYear: 2026, assets });
    const r = resolveOpeningDepreciation({ opening });
    assert.equal(r.status, "ready");
    if (r.status !== "ready") return;
    assert.equal(r.entries.length, 2);
    const a = r.entries.find((e) => e.assetId === "actif-a");
    const b = r.entries.find((e) => e.assetId === "actif-b");
    assert.ok(a);
    assert.ok(b);
    assert.equal(a!.cumulOuverture, 1000);
    assert.equal(b!.cumulOuverture, 2000);

    const applied = propagateAnchoredDepreciation({
      opening,
      expectedExerciceFiscal: 2026,
    });
    assert.equal(applied.status, "ready");
    if (applied.status !== "ready") return;
    // da = 6000/12 = 500
    assert.equal(
      applied.plan.lignes.find((l) => l.id === "actif-a")?.amortissementsCumules,
      1500, // 1000 + 500
    );
    assert.equal(
      applied.plan.lignes.find((l) => l.id === "actif-b")?.amortissementsCumules,
      2500, // 2000 + 500
    );
  });

  it("ordre des actifs inversé → mêmes IDs / cumuls", () => {
    const assets = oracleAssets2026().reverse();
    const opening = makeValidatedOpening({ targetFiscalYear: 2026, assets });
    const year = propagateAnchoredDepreciation({ opening, expectedExerciceFiscal: 2026 });
    assert.equal(year.status, "ready");
    if (year.status !== "ready") return;
    assert.equal(year.plan.lignes.find((l) => l.id === ORACLE.assetId)?.amortissementsCumules, 5500);
  });

  it("cumul unavailable → blocked (pas 0)", () => {
    const opening = makeValidatedOpening({
      targetFiscalYear: 2026,
      assets: oracleAssets2026({ cumulOuverture: unavailable("inconnu") }),
    });
    const r = resolveOpeningDepreciation({ opening });
    assert.equal(r.status, "blocked");
    if (r.status === "blocked") {
      assert.ok(r.issues.some((i) => i.code === "CUMUL_UNAVAILABLE"));
    }
  });

  it("cumul 0 explicite → ready, dotation normale", () => {
    const opening = makeValidatedOpening({
      targetFiscalYear: 2026,
      assets: oracleAssets2026({ cumulOuverture: available(0) }),
    });
    const year = propagateAnchoredDepreciation({ opening, expectedExerciceFiscal: 2026 });
    assert.equal(year.status, "ready");
    if (year.status !== "ready") return;
    assert.equal(year.dotationExercice, 1000);
    assert.equal(year.cumulAmortissable, 1000);
  });

  it("cumul > base → blocked", () => {
    const opening = makeValidatedOpening({
      targetFiscalYear: 2026,
      assets: oracleAssets2026({ cumulOuverture: available(12_001) }),
    });
    const r = resolveOpeningDepreciation({ opening });
    assert.equal(r.status, "blocked");
  });

  it("validation pending → blocked", () => {
    const opening = makeValidatedOpening({
      targetFiscalYear: 2026,
      assets: oracleAssets2026(),
      validationStatus: "pending",
    });
    const r = resolveOpeningDepreciation({ opening });
    assert.equal(r.status, "blocked");
    if (r.status === "blocked") {
      assert.ok(r.issues.some((i) => i.code === "OPENING_NOT_VALIDATED"));
    }
  });

  it("validation périmée (mutation post-hash) → blocked", () => {
    const opening = makeValidatedOpening({
      targetFiscalYear: 2026,
      assets: oracleAssets2026(),
      mutateAfterValidate: (o) => {
        o.revision = 99;
      },
    });
    const r = resolveOpeningDepreciation({ opening });
    assert.equal(r.status, "blocked");
  });

  it("collision historique / acquisition N → blocked", () => {
    const opening = makeValidatedOpening({
      targetFiscalYear: 2026,
      assets: oracleAssets2026(),
    });
    const r = resolveOpeningDepreciation({
      opening,
      currentYearAcquisitionIds: [ORACLE.assetId],
    });
    assert.equal(r.status, "blocked");
    if (r.status === "blocked") {
      assert.ok(r.issues.some((i) => i.code === "HISTORICAL_NEW_COLLISION"));
    }
  });

  it("acquisition N (origin) ignorée de l'inventaire ancré", () => {
    const assets = oracleAssets2026();
    assets.push({
      id: "travaux-n-2026",
      propertyId: ORACLE.propertyId,
      label: "Travaux N",
      categorie: "travaux",
      origin: "acquisition_exercice",
      coutBrut: available(3000),
      cumulOuverture: available(0),
      plan: available({
        kind: "amortizable",
        startDate: "2026-06-01",
        durationYears: 10,
        prorataConvention: "mensuel",
      }),
    });
    const opening = makeValidatedOpening({ targetFiscalYear: 2026, assets });
    const r = resolveOpeningDepreciation({ opening });
    assert.equal(r.status, "ready");
    if (r.status !== "ready") return;
    assert.equal(r.entries.some((e) => e.assetId === "travaux-n-2026"), false);
    assert.equal(r.entries.length, 1);
  });
});

describe("Lot 2B — nouveau LMNP sans ancre + stock fiscal", () => {
  it("sans ancre : computeAmortizationPlan inchangé (non-régression)", () => {
    const input = {
      prixAcquisition: 280000,
      mobilierInclus: false,
      fraisNotaire: 19500,
      choixTraitementFrais: "integration" as const,
      typeBien: "appartement" as const,
      ratioTerrain: 0.15,
      dateMiseEnService: "2024-04-15",
      exerciceFiscal: 2026,
    };
    const a = computeAmortizationPlan(input);
    const b = computeAmortizationPlan(input);
    assert.deepEqual(a.plan, b.plan);
    assert.equal(a.plan.lignes.find((l) => l.label === "Gros œuvre")!.amortissementsCumules, 6900);

    // assemblePlan sans openingAnchors
    const assembled = assemblePlan({
      composantsBati: [
        { label: "X", montant: 12_000, dureeAnnees: 12, dotationAnnuelle: 1000 },
      ],
      composantsMobilier: [],
      dotationsAnnee1: [{ label: "X", dotationProratisee: 1000 }],
      premiereAnnee: 2020,
      exerciceFiscal: 2026,
    });
    assert.equal(assembled.plan.lignes[0].amortissementsCumules, 7000);
    assert.equal(assembled.plan.lignes[0].id, undefined);
  });

  it("F014 chemin non ancré conserve f010-${index}", () => {
    const plan = assemblePlan({
      composantsBati: [
        { label: "Gros œuvre", montant: 100_000, dureeAnnees: 50, dotationAnnuelle: 2000 },
      ],
      composantsMobilier: [],
      dotationsAnnee1: [{ label: "Gros œuvre", dotationProratisee: 1420.5 }],
      premiereAnnee: 2024,
      exerciceFiscal: 2026,
    }).plan;
    const f014 = composePlanAmortissement({
      exerciceFiscal: 2026,
      dateMiseEnService: "2024-04-15",
      planLogement: plan,
      prorataRatio: 0.71,
    }).plan;
    assert.equal(f014.composants[0].id, "f010-0");
    assert.ok(f014.composants[0].plan_pluriannuel.length > 1);
  });

  it("stock fiscal indépendant du cumul comptable", () => {
    const low = makeValidatedOpening({
      targetFiscalYear: 2026,
      assets: oracleAssets2026(),
      stocksAmortReportes: 0,
    });
    const high = makeValidatedOpening({
      targetFiscalYear: 2026,
      assets: oracleAssets2026(),
      stocksAmortReportes: 50_000,
    });
    const a = propagateAnchoredDepreciation({ opening: low, expectedExerciceFiscal: 2026 });
    const b = propagateAnchoredDepreciation({ opening: high, expectedExerciceFiscal: 2026 });
    assert.equal(a.status, "ready");
    assert.equal(b.status, "ready");
    if (a.status !== "ready" || b.status !== "ready") return;
    assert.equal(a.cumulAmortissable, b.cumulAmortissable);
    assert.equal(a.dotationExercice, b.dotationExercice);
    assert.equal(a.vncAmortissable, b.vncAmortissable);
  });

  it("sources 2B : pas de fusion stock fiscal / pas de fallback label en production", () => {
    const resolveSrc = readFileSync(path.join(MODULE_DIR, "resolve-opening-depreciation.ts"), "utf8");
    const propSrc = readFileSync(path.join(MODULE_DIR, "propagate-anchored-depreciation.ts"), "utf8");
    assert.doesNotMatch(resolveSrc, /amortissementsReportes/);
    assert.doesNotMatch(propSrc, /amortissementsReportes/);
    assert.doesNotMatch(resolveSrc, /anchorsByLabel|match.*label/);
    assert.match(resolveSrc, /assetId/);
    assert.match(resolveSrc, /propertyId/);
  });
});
