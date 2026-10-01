/**
 * R2C.2 — immobilisations / 2033-C / emprunts / détail 2033-B PAR BIEN, puis somme — DORMANT (aucun branchement).
 *
 * Bien A (continuation) + bien B (première année) → un bloc ImmobilisationsRfs PAR BIEN → réconciliation PAR BIEN →
 * cases 2033-C PAR BIEN (même fonction que le mapper mono) → somme en centimes. Jamais un bloc fusionné passé dans une
 * logique « premier exercice oui/non ». Prêts : (propertyId, pretId). 2033-B : conservation PAR BIEN avant somme.
 *
 * Run: npx tsx --test src/lib/lmnp/dossier/r2c2-immobilisations-emprunts.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, mock } from "node:test";

import { buildPropertyFiscalContribution, consolidateFiscalContributions, loanKey } from "@/lib/lmnp/dossier/fiscal-consolidation";
import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import { buildFiscalEngineInputs, draftAmortissementForGeneration } from "@/lib/lmnp/services/declaration/generation-inputs";
import { produceFiscalResult } from "@/runtime/capabilities/f006/produce-fiscal-result";
import type { DeclarationDraft } from "@/lib/lmnp/types";
import { map2033CFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033c";
import type { FiscalRepresentation, ImmobilisationsRfs } from "@/runtime/capabilities/rfs/types";

const ROOT = process.cwd();
const source = (relative: string) => readFileSync(path.join(ROOT, relative), "utf8");
const Y = 2026;
const T = "2026-01-01T00:00:00.000Z";
const A = "home-1";
const B = "bien-b";

type Api = typeof import("@/lib/lmnp/dossier/property-immobilisations") & typeof import("@/runtime/capabilities/rfs/projection/map-2033c");

async function api(): Promise<Api> {
  const [immobilisations, mapper] = await Promise.all([
    import("@/lib/lmnp/dossier/property-immobilisations"),
    import("@/runtime/capabilities/rfs/projection/map-2033c"),
  ]);
  return { ...immobilisations, ...mapper } as Api;
}

// ---------------------------------------------------------------------------
// Blocs d'immobilisations (cas mixte imposé)
// ---------------------------------------------------------------------------

/** A — continuation : brut ouverture 200 000 (bâti 170 000 + terrain 30 000), cumul ouverture 20 000, dotation N 5 000. */
function immoA(overrides: Partial<ImmobilisationsRfs> = {}): ImmobilisationsRfs {
  return {
    lignes: [{ label: "Bâti A", montant: 170000, dureeAnnees: 34, dotationExercice: 5000, amortissementsCumules: 25000, vnc: 145000 }],
    totalAnnuelExercice: 5000,
    totalBrut: 170000,
    valeurTerrain: 30000,
    montantMobilier: 0,
    dateMiseEnService: "2023-05-01",
    composantsNouveaux: [],
    composantsDetail: [],
    ...overrides,
  };
}

/** B — première année : brut 150 000 (bâti 125 000 + terrain 25 000), aucune ouverture, dotation N 3 000. */
function immoB(overrides: Partial<ImmobilisationsRfs> = {}): ImmobilisationsRfs {
  return {
    lignes: [{ label: "Bâti B", montant: 125000, dureeAnnees: 40, dotationExercice: 3000, amortissementsCumules: 3000, vnc: 122000 }],
    totalAnnuelExercice: 3000,
    totalBrut: 125000,
    valeurTerrain: 25000,
    montantMobilier: 0,
    dateMiseEnService: "2026-04-01",
    composantsNouveaux: [],
    composantsDetail: [],
    ...overrides,
  };
}

const OPENING_A = { brut: 200000, amortissementsCumules: 20000, sourceClosureId: "closure-a" };

async function mixed(options: {
  a?: Partial<ImmobilisationsRfs>;
  b?: Partial<ImmobilisationsRfs>;
  openingA?: typeof OPENING_A;
  originA?: "native" | "takeover" | undefined;
  originB?: "native" | "takeover" | undefined;
  amortCalculeGlobal?: number;
  omitOriginA?: boolean;
} = {}) {
  const { buildPropertyImmobilisations, consolidatePropertyImmobilisations } = await api();
  const blockA = buildPropertyImmobilisations({
    propertyId: A,
    ...(options.omitOriginA ? {} : { origin: options.originA ?? "native" }),
    exerciceFiscal: Y,
    source: { kind: "immobilisations", immobilisations: immoA(options.a) },
    ...("openingA" in options ? (options.openingA ? { opening: options.openingA } : {}) : { opening: OPENING_A }),
    dotationsExercice: 5000,
  });
  const blockB = buildPropertyImmobilisations({
    propertyId: B,
    origin: options.originB ?? "native",
    exerciceFiscal: Y,
    source: { kind: "immobilisations", immobilisations: immoB(options.b) },
    dotationsExercice: 3000,
  });
  return {
    blockA,
    blockB,
    result: consolidatePropertyImmobilisations([blockA, blockB], options.amortCalculeGlobal !== undefined ? { amortCalculeGlobal: options.amortCalculeGlobal } : {}),
  };
}

type Consolidated = Awaited<ReturnType<typeof mixed>>["result"];
const caseValue = (result: Consolidated, caseId: string) => result.form2033C.cases.find((item) => item.caseId === caseId)?.value;
const isNonAlimentee = (result: Consolidated, caseId: string) => result.form2033C.casesNonAlimentees.some((item) => item.caseId === caseId);

describe("R2C.2 — IM1 → IM5 : A continuation + B première année, colonnes par bien puis somme", () => {
  it("IM1 → IM5 — 490 = 200 000, 492 = 150 000, 496 = 350 000, 570 = 20 000, 572 = 8 000, 576 = 28 000", async () => {
    const { result, blockA, blockB } = await mixed();
    assert.equal(result.status, "ready", JSON.stringify(result.blockingReasons));
    assert.equal(blockA.movement, "continuation");
    assert.equal(blockB.movement, "first_year");
    assert.deepEqual(
      ["490", "492", "496", "570", "572", "576"].map((caseId) => [caseId, caseValue(result, caseId)]),
      [["490", 200000], ["492", 150000], ["496", 350000], ["570", 20000], ["572", 8000], ["576", 28000]],
    );
  });

  it("chaque case globale = Σ des cases par bien, exacte au centime, contributions tracées par bien", async () => {
    const { result } = await mixed();
    const c490 = result.form2033C.cases.find((item) => item.caseId === "490")!;
    assert.deepEqual(c490.contributions, [{ propertyId: A, value: 200000 }, { propertyId: B, value: 0 }]);
    const c492 = result.form2033C.cases.find((item) => item.caseId === "492")!;
    assert.deepEqual(c492.contributions, [{ propertyId: A, value: 0 }, { propertyId: B, value: 150000 }]);
  });

  it("chaque bien se réconcilie seul (jamais un bloc fusionné « premier exercice oui/non »)", async () => {
    const { blockA, blockB } = await mixed();
    assert.equal(blockA.reconciliation?.status, "ok");
    assert.equal(blockA.reconciliation?.status === "ok" && blockA.reconciliation.mode, "exercice_ulterieur");
    assert.equal(blockB.reconciliation?.status === "ok" && blockB.reconciliation.mode, "premier_exercice");
    assert.doesNotMatch(source("src/lib/lmnp/dossier/property-immobilisations.ts"), /lignes: \[\s*\.\.\.\w+\.lignes,\s*\.\.\.\w+\.lignes/);
  });
});

describe("R2C.2 — IM6, IM7, IM10, IM11 : identité des actifs par bien", () => {
  it("IM6 — chaque ligne et chaque actif multi porte le propertyId de SON bien", async () => {
    const { result, blockA, blockB } = await mixed();
    for (const block of [blockA, blockB]) {
      for (const ligne of block.immobilisations!.lignes) assert.equal(ligne.propertyId, block.propertyId);
    }
    assert.ok(result.assets.length >= 4);
    for (const asset of result.assets) assert.ok(asset.propertyId === A || asset.propertyId === B, JSON.stringify(asset));
  });

  it("IM7 / IM10 — terrain A + terrain B : deux actifs distincts (clé composite), 426 = somme", async () => {
    const { assetKey } = await api();
    const { result } = await mixed();
    const terrains = result.assets.filter((asset) => asset.assetId === "terrain");
    assert.deepEqual(terrains.map((asset) => [asset.propertyId, asset.coutBrut]), [[A, 30000], [B, 25000]]);
    assert.notEqual(assetKey(A, "terrain"), assetKey(B, "terrain"));
    assert.equal(new Set(result.assets.map((asset) => asset.key)).size, result.assets.length);
    assert.equal(caseValue(result, "426"), 55000);
  });

  it("IM11 — travaux-1 sur A et sur B : deux composants (détail calculé PAR BIEN, jamais dédoublonné entre biens)", async () => {
    const { buildPropertyImmobilisations, consolidatePropertyImmobilisations } = await api();
    const view = (montant: number, dateMiseEnService: string): DeclarationDraft => ({
      completedSteps: [],
      dateMiseEnService,
      logementAmortissement: {
        exerciceFiscal: Y, computedAt: T, prixRevient: 150000, fraisEnCharges: 0, valeurTerrain: 20000, valeurBati: 130000,
        baseAmortissableBati: 130000, montantMobilier: 0, dotationAnnuelle: 2600, dureeMoyenneAnnees: 50, prorataRatio: 1,
        plan: { lignes: [{ label: "Bâti", montant: 130000, dureeAnnees: 50, dotationExercice: 2600, amortissementsCumules: 2600, vnc: 127400 }], totalAnnuelExercice: 2600, totalBrut: 130000 },
        fieldSources: {},
      },
      chargesAssistant: {
        exerciceFiscal: Y, totalDeductible: 0, totalPreExploitation: 0, parCategorie: {}, fieldSources: {}, computedAt: T,
        composantsNouveaux: [{ id: "travaux-1", label: "Cuisine", montant, dureeAnnees: 10, dotationAnnuelle: montant / 10, nature: "amélioration", dateDebut: "2026-01-01", origin: "f012_travaux" }],
      },
      amortissementAssistant: { exerciceFiscal: Y, totalDotations: 2600 + montant / 10, status: "validated" },
    }) as unknown as DeclarationDraft;
    const blocks = [[A, 10000], [B, 6000]].map(([propertyId, montant]) => buildPropertyImmobilisations({
      propertyId: propertyId as string, origin: "native", exerciceFiscal: Y,
      source: { kind: "draft", view: view(montant as number, "2026-01-01") },
    }));
    for (const block of blocks) {
      assert.deepEqual(block.immobilisations!.composantsDetail!.map((detail) => [detail.id, detail.propertyId]), [["travaux-1", block.propertyId]]);
    }
    const result = consolidatePropertyImmobilisations(blocks);
    const travaux = result.assets.filter((asset) => asset.assetId === "travaux-1");
    assert.deepEqual(travaux.map((asset) => [asset.propertyId, asset.coutBrut]), [[A, 10000], [B, 6000]]);
  });
});

describe("R2C.2 — IM12, IM13, IM14, EM1 : fail-closed par bien", () => {
  it("IM12 — Σ dotations par bien ≠ amortissement global : colonnes de mouvement non publiées, 572 = montant global", async () => {
    const { result } = await mixed({ amortCalculeGlobal: 8100 });
    for (const caseId of ["490", "492", "496", "570", "576"]) assert.ok(isNonAlimentee(result, caseId), caseId);
    assert.equal(caseValue(result, "572"), 8100);
  });

  it("IM13 — réconciliation de A invalide : jamais compensée par B, cases globales non publiées avec la raison de A", async () => {
    const { result, blockB } = await mixed({ openingA: { ...OPENING_A, brut: 200500 } });
    assert.equal(blockB.reconciliation?.status, "ok");
    for (const caseId of ["490", "492", "496", "570", "576"]) {
      assert.equal(caseValue(result, caseId), undefined, caseId);
      const reason = result.form2033C.casesNonAlimentees.find((item) => item.caseId === caseId)!;
      assert.ok(reason.raisons.some((raison) => raison.propertyId === A), JSON.stringify(reason));
      assert.equal(reason.raisons.some((raison) => raison.propertyId === B), false);
    }
  });

  it("IM14 — B première année : aucune ouverture persistée ni inventée (0 = projection de colonne seulement)", async () => {
    const { blockB } = await mixed();
    assert.equal(blockB.opening, undefined);
    assert.equal(blockB.immobilisations!.mouvements, undefined);
  });

  it("EM1 — origine absente : bloqué (missing_entry_mode), jamais supposée", async () => {
    const { result, blockA } = await mixed({ omitOriginA: true });
    assert.ok(blockA.reasons.some((reason) => reason.code === "missing_entry_mode"));
    assert.equal(result.status, "blocked");
  });

  it("reprise sans ouverture (le bien se réconcilie en première année) : incohérent, bloqué", async () => {
    const { blockA } = await mixed({ originA: "takeover", openingA: undefined as never, a: { dateMiseEnService: "2026-02-01", lignes: [{ label: "Bâti A", montant: 170000, dureeAnnees: 34, dotationExercice: 5000, amortissementsCumules: 5000, vnc: 165000 }] } });
    assert.ok(blockA.reasons.some((reason) => reason.code === "takeover_without_opening"), JSON.stringify(blockA.reasons));
  });
});

describe("R2C.2 — FA1, FA2 : frais d'acquisition", () => {
  it("FA1 / FA2 — A en reprise (continuation) + B première année, frais intégrés : B en augmentation, A sans augmentation fictive", async () => {
    // B : frais 12 000 intégrés au prix de revient → bâti 137 000 (+ terrain 25 000).
    const { result } = await mixed({
      originA: "takeover",
      b: { lignes: [{ label: "Bâti B (frais intégrés)", montant: 137000, dureeAnnees: 40, dotationExercice: 3000, amortissementsCumules: 3000, vnc: 134000 }], totalBrut: 137000 },
    });
    const c492 = result.form2033C.cases.find((item) => item.caseId === "492")!;
    assert.deepEqual(c492.contributions, [{ propertyId: A, value: 0 }, { propertyId: B, value: 162000 }]);
    assert.equal(caseValue(result, "490"), 200000);
  });
});

// ---------------------------------------------------------------------------
// IM9 — parité mono du mapper 2033-C (empreintes capturées AVANT extraction, HEAD f993c20)
// ---------------------------------------------------------------------------

function monoDraft(): DeclarationDraft {
  return {
    completedSteps: [], siret: "12345678900012", siren: "123456789", exploitantFirstName: "Mono", exploitantLastName: "Parite",
    activityStartDate: "2026-03-01", dateMiseEnService: "2026-04-15", activityType: "LMNP",
    logementAmortissement: {
      exerciceFiscal: Y, prixRevient: 215000, fraisEnCharges: 15000.37, valeurTerrain: 30000, valeurBati: 170000, baseAmortissableBati: 170000,
      montantMobilier: 8000, dotationAnnuelle: 4544.21, dureeMoyenneAnnees: 30, prorataRatio: 0.71,
      plan: {
        lignes: [
          { id: "gros-oeuvre", label: "Gros œuvre", montant: 100000, dureeAnnees: 50, dotationExercice: 1420.01, amortissementsCumules: 1420.01 },
          { id: "facades", label: "Façades", montant: 70000, dureeAnnees: 25, dotationExercice: 1988.2, amortissementsCumules: 1988.2 },
          { id: "mobilier", label: "Mobilier", montant: 8000, dureeAnnees: 5, dotationExercice: 1136.0, amortissementsCumules: 1136.0 },
        ],
        totalAnnuelExercice: 4544.21, totalBrut: 178000,
      },
      fieldSources: {}, computedAt: T,
    },
    financementCharges: { exerciceFiscal: Y, totalInteretsEmprunt: 0, totalInteretsPreExploitation: 0, totalAssurance: 0, totalCapitalRembourse: 0, totalChargesFinancementExercice: 0, prets: [], fieldSources: {}, computedAt: T },
    chargesAssistant: { exerciceFiscal: Y, totalDeductible: 3456.78, totalNonDeductible: 0, totalAmortissable: 0, totalPreExploitation: 0, parCategorie: { taxe_fonciere: 1200.11, copropriete: 2256.67 }, composantsNouveaux: [], fieldSources: {}, computedAt: T },
    revenusAssistant: { exerciceFiscal: Y, totalRecettes: 14321.09, loyersEncaisses: 14321.09, fieldSources: {}, computedAt: T },
    amortissementAssistant: { exerciceFiscal: Y, totalDotations: 4544.21, status: "validated" },
    dispense2033A: { caReferenceN1Declaree: 0 },
  } as unknown as DeclarationDraft;
}

function monoRfs(): FiscalRepresentation {
  mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-06-01T12:00:00.000Z") });
  try {
    const generated = runDeclarationGeneration(monoDraft(), Y);
    assert.equal(generated.status, "generated", JSON.stringify(generated));
    return JSON.parse(JSON.stringify(generated.status === "generated" ? generated.rfs : undefined));
  } finally {
    mock.timers.reset();
  }
}

const clone = <V>(value: V): V => JSON.parse(JSON.stringify(value));
const MAPPER_BRANCHES: Array<[string, (rfs: FiscalRepresentation) => FiscalRepresentation, string]> = [
  ["premier exercice", (rfs) => rfs, "6abf4846bac742caba50c9f3ff77cbee750f5d153792a2793e5c3e2cc7926cc4"],
  ["immobilisations absentes", (rfs) => { const r = clone(rfs); delete (r as Partial<FiscalRepresentation>).immobilisations; return r; }, "81d9ef901f94068cac69e49dc16e066820f9811985d4977d88e0d6b36e77d3ff"],
  ["terrain absent", (rfs) => { const r = clone(rfs); delete r.immobilisations!.valeurTerrain; return r; }, "d117a468ce40dc14c78937c45454bf1e21a2807c0355881b47824ece7d6f958d"],
  ["mobilier absent", (rfs) => { const r = clone(rfs); delete r.immobilisations!.montantMobilier; return r; }, "d976ab40bfa07795090b7a047cb529bce84e58eecbc20d1e8e692184e0ed78b7"],
  ["divergence F-010/F-014", (rfs) => { const r = clone(rfs); r.fiscalResult.amortCalcule += 100; return r; }, "fed2da7ae41c5b9677d24717a75962749a53325286bb8bb3addcf1cbc9528651"],
  ["F-012 sans détail", (rfs) => { const r = clone(rfs); r.immobilisations!.composantsNouveaux = [{ id: "t", label: "T", montant: 1000, dureeAnnees: 10, dotationAnnuelle: 100, nature: "amélioration", dateDebut: "2026-02-01", origin: "f012_travaux" }]; delete r.immobilisations!.composantsDetail; return r; }, "0020f7482a64c3f91296ac9f370669000431f3e9429a9e92f3c88ec4b7c4fb04"],
  ["date absente", (rfs) => { const r = clone(rfs); delete r.immobilisations!.dateMiseEnService; return r; }, "bbd54776f24faf643d6042b1c902b2cd733c5dda58ee143d1d827e0f7f14e8dd"],
  ["exercice ultérieur sans ouverture", (rfs) => { const r = clone(rfs); r.immobilisations!.dateMiseEnService = "2024-04-15"; return r; }, "efeb995684a06da677f1a1386e6ee871d240aeb2636c693977b8fa8c90932535"],
  ["exercice ultérieur avec ouverture", (rfs) => { const r = clone(rfs); r.immobilisations!.dateMiseEnService = "2024-04-15"; r.immobilisations!.mouvements = { valeurBruteOuverture: 208000, amortissementsCumulesOuverture: 0, sourceClosureId: "c" }; return r; }, "2580c8ae8b1a84cdf0dd94cb666e75ee43c17270c52ecf0a08a1b9245763d81c"],
  ["réconciliation brut en échec", (rfs) => { const r = clone(rfs); r.immobilisations!.dateMiseEnService = "2024-04-15"; r.immobilisations!.mouvements = { valeurBruteOuverture: 209000, amortissementsCumulesOuverture: 0 }; return r; }, "7ceaeff387292c0fd9aadd0d60bfebc55e337d8a8d455e8969e32faadc214444"],
  ["réconciliation amortissements en échec", (rfs) => { const r = clone(rfs); r.immobilisations!.dateMiseEnService = "2024-04-15"; r.immobilisations!.mouvements = { valeurBruteOuverture: 208000, amortissementsCumulesOuverture: 1000 }; return r; }, "c316412aea58627fe0bafc3966c1b1047d232c407e805cbfccf8d8b78143063f"],
];

describe("R2C.2 — IM9 : mapper 2033-C mono strictement identique (empreintes HEAD)", () => {
  const base = monoRfs();
  for (const [name, mutate, expected] of MAPPER_BRANCHES) {
    it(`IM9 — ${name}`, () => {
      const form = map2033CFromRfs(mutate(base));
      assert.equal(createHash("sha256").update(JSON.stringify(form)).digest("hex"), expected);
    });
  }

  it("IM9 — le mapper mono délègue à la répartition extraite (une seule logique 2033-C)", () => {
    const code = source("src/runtime/capabilities/rfs/projection/map-2033c.ts");
    assert.match(code, /export function repartir2033CImmobilisations\(/);
    assert.match(code, /repartir2033CImmobilisations\(\{/);
    assert.doesNotMatch(source("src/lib/lmnp/dossier/property-immobilisations.ts"), /caseId: "49[026]"|caseId: "57[06]"/, "aucune affectation de case réécrite côté multi");
  });

  it("un seul bien : la consolidation reproduit exactement les cases du mapper mono", async () => {
    const { buildPropertyImmobilisations, consolidatePropertyImmobilisations } = await api();
    const rfs = base;
    const form = map2033CFromRfs(rfs);
    const block = buildPropertyImmobilisations({ propertyId: A, origin: "native", exerciceFiscal: Y, source: { kind: "immobilisations", immobilisations: rfs.immobilisations! }, dotationsExercice: rfs.fiscalResult.amortCalcule });
    const result = consolidatePropertyImmobilisations([block], { amortCalculeGlobal: rfs.fiscalResult.amortCalcule });
    for (const item of form.cases) assert.equal(caseValue(result, item.caseId), item.value, item.caseId);
  });
});

// ---------------------------------------------------------------------------
// Prêts (LOAN1 → LOAN6) et détail 2033-B (CH1 → CH3) — à partir des contributions R2C.1
// ---------------------------------------------------------------------------

type BienSpec = {
  recettes?: number;
  charges: number;
  cats?: Record<string, number>;
  credit: "present" | "none" | "unknown";
  pretIds?: string[];
  interets?: number;
  frais?: number;
};

function bienView(spec: BienSpec): DeclarationDraft {
  const interets = spec.interets ?? 1000;
  return {
    completedSteps: [], siret: "12345678900012", activityType: "LMNP", activityStartDate: "2026-01-01", dateMiseEnService: "2026-02-01",
    revenusAssistant: { exerciceFiscal: Y, totalRecettes: spec.recettes ?? 10000, fieldSources: {}, computedAt: T },
    chargesAssistant: {
      exerciceFiscal: Y, totalDeductible: spec.charges, totalPreExploitation: 0, totalNonDeductible: 0,
      ...(spec.cats ? { parCategorie: spec.cats } : {}), composantsNouveaux: [], fieldSources: {}, computedAt: T,
    },
    ...(spec.credit === "present"
      ? {
          financementCharges: {
            exerciceFiscal: Y, totalInteretsEmprunt: interets * (spec.pretIds ?? ["loan-1"]).length, totalInteretsPreExploitation: 0, totalAssurance: 0,
            totalAssurancePreExploitation: 0, totalCapitalRembourse: 0, totalChargesFinancementExercice: interets * (spec.pretIds ?? ["loan-1"]).length,
            prets: (spec.pretIds ?? ["loan-1"]).map((pretId) => ({
              pretId, typePret: "amortissable", interetsEmpruntExercice: interets, interetsPreExploitation: 0, assuranceEmpruntExercice: 0,
              assurancePreExploitation: 0, capitalRembourseExercice: 0, capitalRestantDu31_12: 1000, fraisDossierDeductibles: 0, garantieDeductible: 0, iraDeductible: 0,
            })),
            fieldSources: {}, computedAt: T,
          },
        }
      : {}),
    ...(spec.credit === "none" ? { creditDeclaredNoneAt: T } : {}),
    amortissementAssistant: { exerciceFiscal: Y, totalDotations: 1000, status: "validated" },
    logementAmortissement: { exerciceFiscal: Y, computedAt: T, fraisEnCharges: spec.frais ?? 0 },
  } as unknown as DeclarationDraft;
}

function contributions(specs: Array<[string, BienSpec]>) {
  return specs.map(([propertyId, spec]) => buildPropertyFiscalContribution({ propertyId, view: bienView(spec), fiscalYear: Y, entryMode: "native" }));
}

const ACTIVITY = { exerciceFiscal: Y, activite: { siret: "12345678900012", activityType: "LMNP" as const }, dateDebutActivite: "2026-01-01" };

describe("R2C.2 — LOAN1 → LOAN6 : prêts multi, (propertyId, pretId)", () => {
  it("LOAN1 / LOAN3 / LOAN4 — A.loan-1 et B.loan-1 : deux prêts, pretId persistés inchangés, chacun une fois", async () => {
    const { rfsEmpruntsMulti } = await api();
    const result = consolidateFiscalContributions(ACTIVITY, contributions([[A, { charges: 0, credit: "present", interets: 2000 }], [B, { charges: 0, credit: "present", interets: 300 }]]));
    assert.equal(result.status, "ready", JSON.stringify(result.blockingReasons));
    const emprunts = rfsEmpruntsMulti(result.inputs!);
    assert.deepEqual(emprunts.map((pret) => [pret.propertyId, pret.pretId, pret.interetsEmpruntExercice]), [[A, "loan-1", 2000], [B, "loan-1", 300]]);
  });

  it("LOAN2 — A deux prêts + B sans crédit établi : deux prêts globaux, jamais []", async () => {
    const { rfsEmpruntsMulti } = await api();
    const result = consolidateFiscalContributions(ACTIVITY, contributions([[A, { charges: 0, credit: "present", pretIds: ["loan-1", "loan-2"] }], [B, { charges: 0, credit: "none" }]]));
    assert.deepEqual(rfsEmpruntsMulti(result.inputs!).map((pret) => [pret.propertyId, pret.pretId]), [[A, "loan-1"], [A, "loan-2"]]);
  });

  it("LOAN5 — index (propertyId, pretId) : le descriptif de B ne peut jamais s'appliquer à A.loan-1", async () => {
    const { indexLoansByKey } = await api();
    const result = consolidateFiscalContributions(ACTIVITY, contributions([[A, { charges: 0, credit: "present", interets: 2000 }], [B, { charges: 0, credit: "present", interets: 300 }]]));
    const index = indexLoansByKey(result.inputs!.emprunts);
    assert.equal(index.size, 2);
    assert.equal(index.get(loanKey(A, "loan-1"))!.pret.interetsEmpruntExercice, 2000);
    assert.equal(index.get(loanKey(B, "loan-1"))!.pret.interetsEmpruntExercice, 300);
  });

  it("LOAN6 — tous sans crédit : [] ; crédit inconnu : bloqué en amont, jamais []", async () => {
    const { rfsEmpruntsMulti } = await api();
    const none = consolidateFiscalContributions(ACTIVITY, contributions([[A, { charges: 0, credit: "none" }], [B, { charges: 0, credit: "none" }]]));
    assert.deepEqual(rfsEmpruntsMulti(none.inputs!), []);
    const unknown = consolidateFiscalContributions(ACTIVITY, contributions([[A, { charges: 0, credit: "present" }], [B, { charges: 0, credit: "unknown" }]]));
    assert.equal(unknown.status, "blocked");
    assert.equal(unknown.inputs, undefined);
  });
});

describe("R2C.2 — CH1 → CH3 : détail 2033-B, conservation PAR BIEN avant somme", () => {
  it("CH0 — fr.charges d'un bien composé EXACTEMENT comme F-006 (aucune dérive du transport)", async () => {
    const { propertyChargesForDetail2033B } = await api();
    for (const spec of [
      { charges: 1000.07, cats: { taxe_fonciere: 600.05, assurance_pno: 400.02 }, credit: "present" as const, interets: 812.4, frais: 1500.5 },
      { charges: 0, credit: "none" as const },
    ]) {
      const view = bienView(spec);
      const [contribution] = contributions([[A, spec]]);
      const engine = buildFiscalEngineInputs({ draft: view, fiscalYear: Y, amortissementAssistant: draftAmortissementForGeneration(view), usesTakeoverHistory: false });
      const { result } = produceFiscalResult(engine);
      assert.ok(result);
      assert.deepEqual(propertyChargesForDetail2033B(contribution!), result!.charges);
    }
  });

  it("CH1 — détails A et B conservés : somme par catégorie en centimes, 242/244 cohérents", async () => {
    const { resolveMultiPropertyCharges2033BDetail } = await api();
    const detail = resolveMultiPropertyCharges2033BDetail(contributions([
      [A, { charges: 1000.07, cats: { taxe_fonciere: 600.05, assurance_pno: 400.02 }, credit: "none" }],
      [B, { charges: 2000.2, cats: { taxe_fonciere: 1500.15, copropriete: 500.05 }, credit: "none" }],
    ]));
    assert.equal(detail.status, "CONSERVE", JSON.stringify(detail));
    assert.equal(detail.ligne244, 2100.2);
    assert.equal(detail.ligne242, 900.07);
    assert.deepEqual(detail.parCategorie, { taxe_fonciere: 2100.2, assurance_pno: 400.02, copropriete: 500.05 });
  });

  it("CH2 — détail de A non conservé : 242/244 globales non publiées, raison de A, jamais compensée par B, génération non bloquée", async () => {
    const { resolveMultiPropertyCharges2033BDetail } = await api();
    const detail = resolveMultiPropertyCharges2033BDetail(contributions([
      [A, { charges: 1000, cats: { taxe_fonciere: 600 }, credit: "none" }],
      [B, { charges: 400, cats: { taxe_fonciere: 0, copropriete: 800 }, credit: "none" }],
    ]));
    assert.equal(detail.status, "ECART");
    assert.equal(detail.ligne242, undefined);
    assert.equal(detail.ligne244, undefined);
    assert.ok(detail.parBien.find((item) => item.propertyId === A)!.detail.raisons.length > 0);
    assert.ok(detail.raisons.every((raison) => raison.propertyId !== undefined));
    assert.equal("blockingReasons" in detail, false, "aucun blocage de génération : publication de case seulement");
  });

  it("CH3 — bien aux totaux nuls sans table : conservation triviale du contrat existant, aucune catégorie inventée", async () => {
    const { resolveMultiPropertyCharges2033BDetail } = await api();
    const detail = resolveMultiPropertyCharges2033BDetail(contributions([
      [A, { charges: 1000.07, cats: { taxe_fonciere: 600.05, assurance_pno: 400.02 }, credit: "none" }],
      [B, { charges: 0, credit: "none" }],
    ]));
    assert.equal(detail.status, "CONSERVE", JSON.stringify(detail));
    assert.deepEqual(detail.parCategorie, { taxe_fonciere: 600.05, assurance_pno: 400.02 });
    assert.equal(detail.ligne244, 600.05);
  });

  it("FA1 (déduction) — frais d'acquisition de B en charges : raison KS conservée sur B, 242/244 non publiées, jamais masquées", async () => {
    const { resolveMultiPropertyCharges2033BDetail } = await api();
    const detail = resolveMultiPropertyCharges2033BDetail(contributions([
      [A, { charges: 1000.07, cats: { taxe_fonciere: 600.05, assurance_pno: 400.02 }, credit: "none" }],
      [B, { charges: 0, cats: {}, credit: "none", frais: 9000.5 }],
    ]));
    assert.equal(detail.status, "ECART");
    assert.ok(detail.raisons.some((raison) => raison.propertyId === B && /frais d'acquisition/.test(raison.raison)));
  });
});

describe("R2C.2 — IM8 et périmètre", () => {
  it("IM8 — aucun properties[0] / propertyIds[0] / repli mono dans le nouveau module", () => {
    assert.doesNotMatch(source("src/lib/lmnp/dossier/property-immobilisations.ts"), /properties\[0\]|propertyIds\[0\]|resolveMono/);
  });

  it("dormant : aucun appelant de production, aucun F-006 / RFS / liasse invoqué", () => {
    const code = source("src/lib/lmnp/dossier/property-immobilisations.ts");
    // Appels et imports seulement (les commentaires peuvent citer la composition mono qu'ils reproduisent).
    assert.doesNotMatch(code, /\b(produceFiscalResult|buildFiscalRepresentation|assembleLiasseFromRfs|runDeclarationGeneration)\(/);
    assert.doesNotMatch(code, /from "[^"]*(produce-fiscal-result|build-fiscal-representation|assemble-liasse-from-rfs|run-declaration-generation)"/);
    for (const file of ["src/lib/lmnp/services/declaration/run-declaration-generation.ts", "src/components/lmnp/documents/ValidationDocumentStep.tsx", "src/lib/lmnp/services/declaration/build-liasse-dossier-document.ts"]) {
      assert.doesNotMatch(source(file), /property-immobilisations/, file);
    }
  });
});
