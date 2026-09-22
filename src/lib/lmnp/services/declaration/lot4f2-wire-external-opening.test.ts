/**
 * Lot 4F.2 — câblage Opening externe validée → gate EXTERNAL_HISTORY + moteur N.
 *
 * Run: npx tsx --test src/lib/lmnp/services/declaration/lot4f2-wire-external-opening.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createConfidenceScore } from "@/lib/documents/types/confidence-score";
import { resolvePriorHistoryEligibility } from "@/lib/lmnp/services/declaration/prior-history-eligibility";
import { resolveDeclarationGenerationGate } from "@/lib/lmnp/services/declaration/declaration-generation-gate";
import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import {
  applyResolvedOpeningDepreciation,
  isAvailable,
  isUsableExternalTakeoverOpening,
  resolveOpeningDepreciation,
  type FiscalYearOpening,
} from "@/lib/lmnp/services/fiscal-year-opening";
import { computeOpeningContentHash } from "@/lib/lmnp/services/fiscal-year-opening/content-hash";
import { unavailable } from "@/lib/lmnp/services/fiscal-year-opening/opening-fact";
import {
  buildExternalTakeoverFiscalYearOpening,
  selectBuiltExternalTakeoverOpening,
  type BuildExternalTakeoverFiscalYearOpeningInput,
} from "@/lib/lmnp/services/takeover";
import type { CandidateHistoricalAsset } from "@/lib/lmnp/services/takeover/asset-candidates";
import type { CandidateFiscalStocks } from "@/lib/lmnp/services/takeover/fiscal-stocks-candidates";
import {
  missingCandidate,
  presentCandidate,
  type CandidateProvenance,
  type CandidateValue,
} from "@/lib/lmnp/services/takeover/candidate-value";
import { createHistoricalControlReconciliation } from "@/lib/lmnp/services/takeover/historical-control-reconciliation";
import {
  createTaxPackageControlFact,
  type TaxPackageControlFact,
  type TaxPackageControlFactDraft,
} from "@/lib/lmnp/services/takeover/tax-package-control-facts";
import type { HistoricalTaxPackageControlsReconciliation } from "@/lib/lmnp/services/takeover/reconcile-historical-tax-package-controls";
import type { DeclarationDraft, Property } from "@/lib/lmnp/types";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const NOW = "2026-01-15T00:00:00.000Z";
const FY = 2025;
const TARGET = 2026;
const FORM_YEAR = 2026;

const PROPERTY: Property = {
  id: "prop-1",
  label: "Studio Lyon",
  address: "1 rue Test",
  city: "Lyon",
  postalCode: "69001",
};

function prov(documentId: string, sourceRef: string): CandidateProvenance {
  return {
    documentId,
    documentRole: "depreciation_register",
    fieldLabel: sourceRef,
    sourceRef,
    extractionMethod: "fixture_structured",
    confidence: createConfidenceScore(0.9, ["fixture"]),
    evidence: { snippet: sourceRef, page: 1 },
    fieldSource: "extracted",
  };
}

function taxProv(sourceRef: string): CandidateProvenance {
  return {
    documentId: "doc-liasse",
    documentRole: "prior_tax_package",
    fieldLabel: sourceRef,
    sourceRef,
    extractionMethod: "fixture_structured",
    confidence: createConfidenceScore(0.92, ["fixture"]),
    evidence: { snippet: sourceRef, page: 1 },
    fieldSource: "extracted",
  };
}

function mustFact(draft: TaxPackageControlFactDraft): TaxPackageControlFact {
  const created = createTaxPackageControlFact(draft);
  assert.equal(created.status, "created", JSON.stringify(created));
  if (created.status !== "created") throw new Error("unreachable");
  return created.fact;
}

function controlFact(
  formType: "2033A" | "2033C",
  sourceCase: "028" | "030" | "496" | "576",
  kind: "total_gross" | "total_cumulative_depreciation",
  amount: number,
): TaxPackageControlFact {
  return mustFact({
    formType,
    sourceCase,
    kind,
    formYear: FORM_YEAR,
    fiscalYear: FY,
    periodPosition: "closing",
    value: presentCandidate(amount, "direct", taxProv(`${formType}:${sourceCase}`)),
  });
}

function controlsFromPairs(params: {
  grossLeft: number | "missing";
  grossRight: number | "missing";
  depLeft: number | "missing";
  depRight: number | "missing";
}): HistoricalTaxPackageControlsReconciliation {
  const left028 =
    params.grossLeft === "missing"
      ? []
      : [controlFact("2033A", "028", "total_gross", params.grossLeft)];
  const right496 =
    params.grossRight === "missing"
      ? []
      : [controlFact("2033C", "496", "total_gross", params.grossRight)];
  const left030 =
    params.depLeft === "missing"
      ? []
      : [
          controlFact(
            "2033A",
            "030",
            "total_cumulative_depreciation",
            params.depLeft,
          ),
        ];
  const right576 =
    params.depRight === "missing"
      ? []
      : [
          controlFact(
            "2033C",
            "576",
            "total_cumulative_depreciation",
            params.depRight,
          ),
        ];

  const gross = createHistoricalControlReconciliation({
    kind: "total_gross",
    left: left028,
    right: right496,
  });
  const dep = createHistoricalControlReconciliation({
    kind: "total_cumulative_depreciation",
    left: left030,
    right: right576,
  });
  assert.equal(gross.status, "created");
  assert.equal(dep.status, "created");
  if (gross.status !== "created" || dep.status !== "created") throw new Error("unreachable");
  return {
    packageId: "pkg-4f2-controls",
    totalGross: gross.result,
    totalCumulativeDepreciation: dep.result,
  };
}

function concordantControls(): HistoricalTaxPackageControlsReconciliation {
  return controlsFromPairs({
    grossLeft: 132_000,
    grossRight: 132_000,
    depLeft: 35_000,
    depRight: 35_000,
  });
}

function notComparableControls(): HistoricalTaxPackageControlsReconciliation {
  return controlsFromPairs({
    grossLeft: 132_000,
    grossRight: "missing",
    depLeft: 35_000,
    depRight: 35_000,
  });
}

function conflictControls(): HistoricalTaxPackageControlsReconciliation {
  return controlsFromPairs({
    grossLeft: 132_000,
    grossRight: 100_000,
    depLeft: 35_000,
    depRight: 35_000,
  });
}

function explicitZeroStocks(): CandidateFiscalStocks {
  return {
    deficits: presentCandidate([], "direct", taxProv("stocks:deficits")),
    amortissementsReportes: presentCandidate(0, "direct", taxProv("stocks:ard")),
    amortissementsReportesSource: "manual_entry",
  };
}

function completeAsset(params: {
  candidateKey: string;
  label: string;
  coutBrut: number;
  cumulOuverture: number;
  classification: "batiment" | "mobilier" | "terrain";
  startDate?: string;
  durationYears?: number;
  propertyId?: string | "missing";
}): CandidateHistoricalAsset {
  const documentId = `doc-${params.candidateKey}`;
  const amortizable = params.classification !== "terrain";
  const propertyId: CandidateValue<string> =
    params.propertyId === "missing" || params.propertyId === undefined
      ? missingCandidate("propertyId absent")
      : presentCandidate(params.propertyId, "direct", prov(documentId, "propertyId"));

  return {
    candidateKey: params.candidateKey,
    sourceAssetRef: params.candidateKey,
    label: presentCandidate(params.label, "direct", prov(documentId, "label")),
    coutBrut: presentCandidate(params.coutBrut, "direct", prov(documentId, "coutBrut")),
    cumulOuverture: presentCandidate(
      params.cumulOuverture,
      "direct",
      prov(documentId, "cumulOuverture"),
    ),
    startDate:
      amortizable && params.startDate
        ? presentCandidate(params.startDate, "direct", prov(documentId, "startDate"))
        : missingCandidate("n/a"),
    durationYears:
      amortizable && params.durationYears !== undefined
        ? presentCandidate(params.durationYears, "direct", prov(documentId, "duration"))
        : missingCandidate("n/a"),
    method: amortizable
      ? presentCandidate("lineaire", "direct", prov(documentId, "method"))
      : missingCandidate("n/a"),
    prorataConvention: amortizable
      ? presentCandidate("annuel_plein", "direct", prov(documentId, "prorata"))
      : missingCandidate("n/a"),
    classification: presentCandidate(
      params.classification,
      "direct",
      prov(documentId, "classification"),
    ),
    nonAmortizable: presentCandidate(
      params.classification === "terrain",
      "direct",
      prov(documentId, "nonAmortizable"),
    ),
    propertyId,
  };
}

function referenceAssets(): CandidateHistoricalAsset[] {
  return [
    completeAsset({
      candidateKey: "cand-immeuble",
      label: "Immeuble",
      coutBrut: 120_000,
      cumulOuverture: 30_000,
      classification: "batiment",
      startDate: "2015-01-01",
      durationYears: 40,
      propertyId: "prop-1",
    }),
    completeAsset({
      candidateKey: "cand-mobilier",
      label: "Mobilier",
      coutBrut: 12_000,
      cumulOuverture: 5_000,
      classification: "mobilier",
      startDate: "2018-06-01",
      durationYears: 10,
      propertyId: "prop-1",
    }),
  ];
}

function baseInput(
  overrides: Partial<BuildExternalTakeoverFiscalYearOpeningInput> = {},
): BuildExternalTakeoverFiscalYearOpeningInput {
  const assets = overrides.assets ?? referenceAssets();
  const idMap: Record<string, string> = {};
  for (const a of assets) {
    idMap[a.candidateKey] = `asset-${a.candidateKey}`;
  }
  return {
    openingId: "opening-4f2-ref",
    dossierId: "dossier-4f2",
    takeoverId: "takeover-4f2",
    targetFiscalYear: TARGET,
    sourceFiscalYear: FY,
    assets,
    stableAssetIdByCandidateKey: idMap,
    stocks: explicitZeroStocks(),
    controls: concordantControls(),
    validatedAt: NOW,
    validator: "lot4f2-test",
    ...overrides,
    stableAssetIdByCandidateKey: overrides.stableAssetIdByCandidateKey ?? idMap,
  };
}

function buildReferenceOpening(): FiscalYearOpening {
  const result = buildExternalTakeoverFiscalYearOpening(baseInput());
  assert.equal(result.status, "built", JSON.stringify(result));
  if (result.status !== "built") throw new Error("unreachable");
  return result.opening;
}

/** Draft économique N générable — DN sera écrasée par l'Opening ancrée. */
function generableDraft(overrides: Partial<DeclarationDraft> = {}): DeclarationDraft {
  return {
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
    } as DeclarationDraft["logementAmortissement"],
    creditDeclaredNoneAt: NOW,
    revenusConfirmedAt: NOW,
    chargesConfirmedAt: NOW,
    amortissementConfirmedAt: NOW,
    siret: "12345678901234",
    siren: "123456789",
    exploitantFirstName: "Marie",
    exploitantLastName: "Dupont",
    dateMiseEnService: "2015-01-01",
    revenusAssistant: { exerciceFiscal: TARGET, totalRecettes: 18000 },
    chargesAssistant: { exerciceFiscal: TARGET, totalDeductible: 4000, totalPreExploitation: 0 },
    amortissementAssistant: {
      exerciceFiscal: TARGET,
      totalDotations: 9999,
      status: "validated",
    },
    ...overrides,
  } as DeclarationDraft;
}

function externalFacts() {
  return {
    priorHistoryDeclaration: {
      status: "EXTERNAL_HISTORY" as const,
      declaredAt: NOW,
    },
  };
}

function proof(opening: FiscalYearOpening, year = TARGET) {
  return { fiscalYearOpening: opening, requestedFiscalYear: year };
}

// ---------------------------------------------------------------------------
describe("Lot 4F.2 — scénario de référence E2E", () => {
  it("A–H : Opening 4F.1 built/validated → EXTERNAL_HISTORY → moteur N ancré", () => {
    const buildResult = buildExternalTakeoverFiscalYearOpening(baseInput());
    assert.equal(buildResult.status, "built");
    if (buildResult.status !== "built") return;

    const selected = selectBuiltExternalTakeoverOpening({
      buildResult,
      requestedFiscalYear: TARGET,
    });
    assert.equal(selected.status, "ready");
    if (selected.status !== "ready") return;
    const opening = selected.opening;

    assert.equal(opening.source.kind, "external_takeover");
    assert.equal(opening.validation.status, "validated");
    assert.equal(opening.targetFiscalYear, TARGET);
    assert.ok(isAvailable(opening.stocks.deficits));
    assert.ok(isAvailable(opening.stocks.amortissementsReportes));
    assert.deepEqual(opening.stocks.deficits.value, []);
    assert.equal(opening.stocks.amortissementsReportes.value, 0);

    // A — EXTERNAL_HISTORY autorisé uniquement avec preuve Opening
    const eligibility = resolvePriorHistoryEligibility(externalFacts(), proof(opening));
    assert.equal(eligibility.eligible, true);
    assert.equal(eligibility.eligible && eligibility.status, "EXTERNAL_HISTORY");
    assert.equal(eligibility.eligible && eligibility.basis, "proven_by_validated_opening");

    // B — runDeclarationGeneration reçoit cette Opening
    const gen = runDeclarationGeneration(
      generableDraft(),
      TARGET,
      undefined,
      undefined,
      undefined,
      undefined,
      opening,
    );
    assert.equal(gen.status, "generated", JSON.stringify(gen));
    if (gen.status !== "generated") return;

    // C/D/E — resolveOpeningDepreciation consomme C0=30000/5000 ; DN seule
    const dep = resolveOpeningDepreciation({
      opening,
      expectedExerciceFiscal: TARGET,
    });
    assert.equal(dep.status, "ready");
    if (dep.status !== "ready") return;
    const immeuble = dep.entries.find((e) => e.assetId === "asset-cand-immeuble");
    const mobilier = dep.entries.find((e) => e.assetId === "asset-cand-mobilier");
    assert.ok(immeuble);
    assert.ok(mobilier);
    assert.equal(immeuble!.cumulOuverture, 30_000);
    assert.equal(mobilier!.cumulOuverture, 5_000);

    const applied = applyResolvedOpeningDepreciation({ resolved: dep });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    const dnImmeuble = applied.lignes.find((l) => l.id === "asset-cand-immeuble");
    const dnMobilier = applied.lignes.find((l) => l.id === "asset-cand-mobilier");
    assert.ok(dnImmeuble);
    assert.ok(dnMobilier);
    // C1 = C0 + DN — pas de reconstruction historique
    assert.equal(dnImmeuble!.amortissementsCumules, 30_000 + dnImmeuble!.dotationExercice);
    assert.equal(dnMobilier!.amortissementsCumules, 5_000 + dnMobilier!.dotationExercice);
    assert.equal(dnImmeuble!.dotationExercice, 120_000 / 40);
    assert.equal(dnMobilier!.dotationExercice, 12_000 / 10);

    // E — moteur N utilise exactement la DN Opening (pas le 9999 du draft)
    assert.equal(gen.rfs.fiscalResult.amortCalcule, applied.plan.totalAnnuelExercice);
    assert.notEqual(gen.rfs.fiscalResult.amortCalcule, 9999);

    // F — stocks explicites [] / 0
    assert.deepEqual(gen.fiscalResult.stocks.deficits, []);
    assert.equal(gen.fiscalResult.stocks.amortissementsReportes, 0);

    // G — résultat fiscal produit
    assert.equal(typeof gen.fiscalResult.resultatFiscal, "number");
    assert.ok(Number.isFinite(gen.fiscalResult.resultatFiscal));

    // H — aucune reconstruction N-1 (une seule ligne de plan par actif ancré)
    assert.equal(applied.plan.lignes.length, 2);

    // Gate génération alignée
    const gate = resolveDeclarationGenerationGate({
      draft: generableDraft(),
      properties: [PROPERTY],
      fiscalYear: TARGET,
      paid: false,
      generated: false,
      priorHistory: eligibility,
      fiscalYearOpening: opening,
    });
    assert.equal(gate.canGenerate, true);
    assert.equal(gate.canCheckout, true);
  });
});

// ---------------------------------------------------------------------------
describe("Lot 4F.2 — fail-closed", () => {
  it("A — manual_review_required → moteur NON appelé", () => {
    const buildResult = buildExternalTakeoverFiscalYearOpening(
      baseInput({ controls: notComparableControls() }),
    );
    assert.equal(buildResult.status, "manual_review_required");

    const selected = selectBuiltExternalTakeoverOpening({
      buildResult,
      requestedFiscalYear: TARGET,
    });
    assert.equal(selected.status, "blocked");
    assert.equal(selected.status === "blocked" && selected.code, "MANUAL_REVIEW_REQUIRED");

    const opening =
      buildResult.status === "manual_review_required" ? buildResult.opening : undefined;
    assert.ok(opening);
    assert.equal(opening!.validation.status, "pending");
    assert.equal(isUsableExternalTakeoverOpening(opening, TARGET), false);

    const eligibility = resolvePriorHistoryEligibility(externalFacts(), proof(opening!));
    assert.equal(eligibility.eligible, false);

    // Interdit : ne pas lancer avec Opening pending
    const gen = runDeclarationGeneration(
      generableDraft(),
      TARGET,
      undefined,
      undefined,
      undefined,
      undefined,
      opening,
    );
    assert.equal(gen.status, "blocked");
  });

  it("B — blocked → moteur NON appelé", () => {
    const buildResult = buildExternalTakeoverFiscalYearOpening(
      baseInput({ controls: conflictControls() }),
    );
    assert.equal(buildResult.status, "blocked");

    const selected = selectBuiltExternalTakeoverOpening({
      buildResult,
      requestedFiscalYear: TARGET,
    });
    assert.equal(selected.status, "blocked");
    assert.equal(selected.status === "blocked" && selected.code, "BUILD_BLOCKED");

    const eligibility = resolvePriorHistoryEligibility(externalFacts());
    assert.equal(eligibility.eligible, false);
  });

  it("C — Opening validated mais mauvais targetFiscalYear → refus", () => {
    const opening = buildReferenceOpening();
    assert.equal(opening.targetFiscalYear, 2026);

    assert.equal(isUsableExternalTakeoverOpening(opening, 2025), false);
    const eligibility = resolvePriorHistoryEligibility(externalFacts(), proof(opening, 2025));
    assert.equal(eligibility.eligible, false);

    const selected = selectBuiltExternalTakeoverOpening({
      buildResult: { status: "built", opening },
      requestedFiscalYear: 2025,
    });
    assert.equal(selected.status, "blocked");
    assert.equal(selected.status === "blocked" && selected.code, "FISCAL_YEAR_MISMATCH");

    const gen = runDeclarationGeneration(
      generableDraft({
        revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 18000 },
        chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 4000, totalPreExploitation: 0 },
        amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1000, status: "validated" },
      }),
      2025,
      undefined,
      undefined,
      undefined,
      undefined,
      opening,
    );
    assert.equal(gen.status, "blocked");
  });

  it("D — source.kind != external_takeover + EXTERNAL_HISTORY → refus", () => {
    const opening = buildReferenceOpening();
    const wrongSource: FiscalYearOpening = {
      ...opening,
      source: {
        kind: "internal_closure",
        previousFiscalYearId: "fy-prev",
        sourceClosureId: "closure-1",
      },
    };
    wrongSource.validation = {
      status: "validated",
      openingRevision: wrongSource.revision,
      contentHash: computeOpeningContentHash(wrongSource),
      validatedAt: NOW,
      validator: "lot4f2-wrong-source",
    };

    assert.equal(isUsableExternalTakeoverOpening(wrongSource, TARGET), false);
    assert.equal(
      resolvePriorHistoryEligibility(externalFacts(), proof(wrongSource)).eligible,
      false,
    );
  });

  it("E — Opening validation pending → refus", () => {
    const opening = buildReferenceOpening();
    const pending: FiscalYearOpening = {
      ...opening,
      validation: { status: "pending" },
    };
    assert.equal(isUsableExternalTakeoverOpening(pending, TARGET), false);
    assert.equal(resolvePriorHistoryEligibility(externalFacts(), proof(pending)).eligible, false);

    const gen = runDeclarationGeneration(
      generableDraft(),
      TARGET,
      undefined,
      undefined,
      undefined,
      undefined,
      pending,
    );
    assert.equal(gen.status, "blocked");
  });

  it("F — EXTERNAL_HISTORY sans Opening → refus", () => {
    const eligibility = resolvePriorHistoryEligibility(externalFacts());
    assert.equal(eligibility.eligible, false);
    assert.equal(eligibility.eligible === false && eligibility.reason, "EXTERNAL_HISTORY_DECLARED");

    const gate = resolveDeclarationGenerationGate({
      draft: generableDraft(),
      properties: [PROPERTY],
      fiscalYear: TARGET,
      paid: false,
      generated: false,
      priorHistory: eligibility,
    });
    assert.equal(gate.canGenerate, false);
    assert.equal(gate.canCheckout, false);
  });

  it("G — Opening externe valide + stocks zéro explicites → moteur appelé", () => {
    const opening = buildReferenceOpening();
    assert.deepEqual(opening.stocks.deficits.value, []);
    assert.equal(opening.stocks.amortissementsReportes.value, 0);

    assert.equal(resolvePriorHistoryEligibility(externalFacts(), proof(opening)).eligible, true);

    const gen = runDeclarationGeneration(
      generableDraft(),
      TARGET,
      undefined,
      undefined,
      undefined,
      undefined,
      opening,
    );
    assert.equal(gen.status, "generated");
  });

  it("stocks inconnus (unavailable) → jamais le moteur via chemin Opening", () => {
    const opening = buildReferenceOpening();
    const unknownStocks: FiscalYearOpening = {
      ...opening,
      stocks: {
        deficits: unavailable("stocks inconnus — jamais []"),
        amortissementsReportes: unavailable("ARD inconnu — jamais 0"),
      },
    };
    unknownStocks.validation = {
      status: "validated",
      openingRevision: unknownStocks.revision,
      contentHash: computeOpeningContentHash(unknownStocks),
      validatedAt: NOW,
      validator: "lot4f2-unknown-stocks",
    };

    // Gate peut encore voir source/year/validation OK, mais le moteur bloque stocks
    const gen = runDeclarationGeneration(
      generableDraft(),
      TARGET,
      undefined,
      undefined,
      undefined,
      undefined,
      unknownStocks,
    );
    assert.equal(gen.status, "blocked");
    if (gen.status !== "blocked") return;
    assert.ok(gen.anomalies.some((a) => a.message.includes("UNAVAILABLE") || a.message.includes("unavailable") || a.message.includes("STOCK")));
  });
});

// ---------------------------------------------------------------------------
describe("Lot 4F.2 — non-régression chemins existants", () => {
  it("NO_PRIOR_HISTORY / FIRST_REAL_YEAR sans Opening → inchangé", () => {
    const first = resolvePriorHistoryEligibility({
      priorHistoryDeclaration: { status: "FIRST_REAL_YEAR", declaredAt: NOW },
    });
    assert.deepEqual(first, {
      eligible: true,
      status: "FIRST_REAL_YEAR",
      basis: "declared_by_client",
    });

    const gen = runDeclarationGeneration(generableDraft(), TARGET);
    assert.equal(gen.status, "generated");
    // Sans Opening : DN draft (9999) conservée — Opening optionnelle
    assert.equal(gen.status === "generated" && gen.rfs.fiscalResult.amortCalcule, 9999);
  });

  it("NATIVE_CONTINUITY (INTERNAL_HISTORY) inchangé", () => {
    const result = resolvePriorHistoryEligibility({
      previousFiscalYearId: "fy-0",
      stocksOuverture: {
        sourceClosureId: "closure-1",
        stocks: { deficits: [], amortissementsReportes: 0 },
      },
    });
    assert.deepEqual(result, {
      eligible: true,
      status: "NATIVE_CONTINUITY",
      basis: "proven_by_data",
    });
  });

  it("EXTERNAL_HISTORY n'est JAMAIS always-allowed", () => {
    assert.equal(resolvePriorHistoryEligibility(externalFacts()).eligible, false);
    const opening = buildReferenceOpening();
    // Opening d'un autre exercice
    assert.equal(
      resolvePriorHistoryEligibility(externalFacts(), proof(opening, 2099)).eligible,
      false,
    );
  });

  it("aucun fallback || 0 / || [] / ?? 0 / ?? [] sur le chemin modifié", () => {
    const eligibilitySrc = readFileSync(
      path.join(MODULE_DIR, "prior-history-eligibility.ts"),
      "utf8",
    );
    const runSrc = readFileSync(path.join(MODULE_DIR, "run-declaration-generation.ts"), "utf8");
    const selectSrc = readFileSync(
      path.join(MODULE_DIR, "../takeover/select-built-external-takeover-opening.ts"),
      "utf8",
    );
    const usableSrc = readFileSync(
      path.join(MODULE_DIR, "../fiscal-year-opening/is-usable-external-takeover-opening.ts"),
      "utf8",
    );

    for (const [label, src] of [
      ["eligibility", eligibilitySrc],
      ["run", runSrc],
      ["select", selectSrc],
      ["usable", usableSrc],
    ] as const) {
      assert.doesNotMatch(src, /stocks\s*\?\?\s*\[\]/, label);
      assert.doesNotMatch(src, /deficits\s*\?\?\s*\[\]/, label);
      assert.doesNotMatch(src, /amortissementsReportes\s*\?\?\s*0/, label);
      assert.doesNotMatch(src, /\|\|\s*\[\]/, label);
      assert.doesNotMatch(src, /cumulOuverture\s*\|\|\s*0/, label);
    }
  });

  it("moteur ne connaît pas les types takeover 4C/4D/4E", () => {
    const runSrc = readFileSync(path.join(MODULE_DIR, "run-declaration-generation.ts"), "utf8");
    assert.doesNotMatch(runSrc, /CandidateHistoricalAsset|CandidateFiscalStocks|TaxPackageControlFact/);
    assert.doesNotMatch(runSrc, /HistoricalTaxPackageControlsReconciliation/);
    assert.doesNotMatch(runSrc, /buildExternalTakeoverFiscalYearOpening/);
    assert.match(runSrc, /FiscalYearOpening/);
    assert.match(runSrc, /resolveOpeningDepreciation/);
    assert.match(runSrc, /resolveCanonicalOpeningFiscalStocks/);
  });
});
