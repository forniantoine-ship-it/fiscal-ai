/**
 * Lot 4F.1 — builder External Takeover → FiscalYearOpening.
 * Run: npx tsx --test src/lib/lmnp/services/takeover/lot4f1-build-external-takeover-opening.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createConfidenceScore } from "@/lib/documents/types/confidence-score";
import { isAvailable, isUnavailable } from "@/lib/lmnp/services/fiscal-year-opening";
import {
  documentAbsentCandidate,
  missingCandidate,
  presentCandidate,
  type CandidateProvenance,
  type CandidateValue,
} from "./candidate-value";
import type { CandidateHistoricalAsset } from "./asset-candidates";
import type { CandidateFiscalStocks } from "./fiscal-stocks-candidates";
import {
  buildExternalTakeoverFiscalYearOpening,
  type BuildExternalTakeoverFiscalYearOpeningInput,
} from "./build-external-takeover-opening";
import { createHistoricalControlReconciliation } from "./historical-control-reconciliation";
import {
  createTaxPackageControlFact,
  type TaxPackageControlFact,
  type TaxPackageControlFactDraft,
} from "./tax-package-control-facts";
import type { HistoricalTaxPackageControlsReconciliation } from "./reconcile-historical-tax-package-controls";

const FY = 2025;
const TARGET = 2026;
const FORM_YEAR = 2026;

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
    packageId: "pkg-4f1-controls",
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
  prorata?: "annuel_plein" | "missing";
  classificationMissing?: boolean;
  coutMissing?: boolean;
  cumulMissing?: boolean;
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
    coutBrut: params.coutMissing
      ? missingCandidate("cout brut absent")
      : presentCandidate(params.coutBrut, "direct", prov(documentId, "coutBrut")),
    cumulOuverture: params.cumulMissing
      ? missingCandidate("cumul absent")
      : presentCandidate(params.cumulOuverture, "direct", prov(documentId, "cumulOuverture")),
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
    prorataConvention:
      amortizable && params.prorata !== "missing"
        ? presentCandidate(
            params.prorata ?? "annuel_plein",
            "direct",
            prov(documentId, "prorata"),
          )
        : missingCandidate("prorata absent"),
    classification: params.classificationMissing
      ? missingCandidate("classification absente")
      : presentCandidate(params.classification, "direct", prov(documentId, "classification")),
    nonAmortizable: params.classificationMissing
      ? missingCandidate("nonAmortizable inconnu")
      : presentCandidate(
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
      prorata: "annuel_plein",
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
      prorata: "annuel_plein",
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
    openingId: "opening-4f1-ref",
    dossierId: "dossier-4f1",
    takeoverId: "takeover-4f1",
    targetFiscalYear: TARGET,
    sourceFiscalYear: FY,
    assets,
    stableAssetIdByCandidateKey: idMap,
    stocks: explicitZeroStocks(),
    controls: concordantControls(),
    validatedAt: "2026-01-15T00:00:00.000Z",
    validator: "lot4f1-test",
    ...overrides,
    stableAssetIdByCandidateKey:
      overrides.stableAssetIdByCandidateKey ?? idMap,
  };
}

describe("Lot 4F.1 — scénario de référence", () => {
  it("construit Opening external_takeover avec ancres 30k+5k non recalculées", () => {
    const result = buildExternalTakeoverFiscalYearOpening(baseInput());
    assert.equal(result.status, "built", JSON.stringify(result));
    if (result.status !== "built") return;

    const { opening } = result;
    assert.equal(opening.source.kind, "external_takeover");
    if (opening.source.kind === "external_takeover") {
      assert.equal(opening.source.takeoverId, "takeover-4f1");
      assert.equal(opening.source.sourceFiscalYear, FY);
    }
    assert.equal(opening.validation.status, "validated");
    assert.ok(isAvailable(opening.assets));
    assert.equal(opening.assets.value.length, 2);

    const immeuble = opening.assets.value.find((a) => a.id === "asset-cand-immeuble");
    const mobilier = opening.assets.value.find((a) => a.id === "asset-cand-mobilier");
    assert.ok(immeuble && mobilier);
    assert.ok(isAvailable(immeuble.coutBrut) && isAvailable(immeuble.cumulOuverture));
    assert.ok(isAvailable(mobilier.coutBrut) && isAvailable(mobilier.cumulOuverture));
    assert.equal(immeuble.coutBrut.value, 120_000);
    assert.equal(immeuble.cumulOuverture.value, 30_000);
    assert.equal(mobilier.coutBrut.value, 12_000);
    assert.equal(mobilier.cumulOuverture.value, 5_000);

    const historicalCumul =
      immeuble.cumulOuverture.value + mobilier.cumulOuverture.value;
    assert.equal(historicalCumul, 35_000);

    assert.ok(isAvailable(opening.stocks.deficits));
    assert.ok(isAvailable(opening.stocks.amortissementsReportes));
    assert.deepEqual(opening.stocks.deficits.value, []);
    assert.equal(opening.stocks.amortissementsReportes.value, 0);
  });
});

describe("Lot 4F.1 — blockers A–J", () => {
  it("A — propertyId missing → blocker", () => {
    const assets = [
      completeAsset({
        candidateKey: "cand-immeuble",
        label: "Immeuble",
        coutBrut: 120_000,
        cumulOuverture: 30_000,
        classification: "batiment",
        startDate: "2015-01-01",
        durationYears: 40,
        propertyId: "missing",
      }),
    ];
    const result = buildExternalTakeoverFiscalYearOpening(baseInput({ assets }));
    assert.equal(result.status, "blocked");
    if (result.status === "blocked") {
      assert.ok(result.issues.some((i) => i.code === "ASSET_PROPERTY_ID_REQUIRED"));
    }
  });

  it("B — prorata absente sur reprise ancrée → Opening sans convention inventée", () => {
    const assets = [
      completeAsset({
        candidateKey: "cand-immeuble",
        label: "Immeuble",
        coutBrut: 120_000,
        cumulOuverture: 30_000,
        classification: "batiment",
        startDate: "2015-01-01",
        durationYears: 40,
        propertyId: "prop-1",
        prorata: "missing",
      }),
    ];
    const result = buildExternalTakeoverFiscalYearOpening(baseInput({ assets }));
    assert.equal(result.status, "built");
    if (result.status !== "built") return;
    assert.ok(isAvailable(result.opening.assets));
    const asset = result.opening.assets.value[0];
    assert.ok(asset && isAvailable(asset.plan));
    if (!asset || !isAvailable(asset.plan) || asset.plan.value.kind !== "amortizable") return;
    assert.equal(asset.plan.value.prorataConvention, undefined);
    assert.equal("prorataConvention" in asset.plan.value, false);
    assert.equal(JSON.stringify(asset.plan.value).includes("jours_reels"), false);
  });

  it("C — classification missing → blocker", () => {
    const assets = [
      completeAsset({
        candidateKey: "cand-immeuble",
        label: "Immeuble",
        coutBrut: 120_000,
        cumulOuverture: 30_000,
        classification: "batiment",
        startDate: "2015-01-01",
        durationYears: 40,
        propertyId: "prop-1",
        classificationMissing: true,
      }),
    ];
    const result = buildExternalTakeoverFiscalYearOpening(baseInput({ assets }));
    assert.equal(result.status, "blocked");
    if (result.status === "blocked") {
      assert.ok(result.issues.some((i) => i.code === "ASSET_CATEGORIE_UNRESOLVED"));
    }
  });

  it("D — cumulOuverture missing → blocker", () => {
    const assets = [
      completeAsset({
        candidateKey: "cand-immeuble",
        label: "Immeuble",
        coutBrut: 120_000,
        cumulOuverture: 30_000,
        classification: "batiment",
        startDate: "2015-01-01",
        durationYears: 40,
        propertyId: "prop-1",
        cumulMissing: true,
      }),
    ];
    const result = buildExternalTakeoverFiscalYearOpening(baseInput({ assets }));
    assert.equal(result.status, "blocked");
    if (result.status === "blocked") {
      assert.ok(result.issues.some((i) => i.code === "ASSET_CUMUL_OUVERTURE_UNAVAILABLE"));
    }
  });

  it("E — coutBrut missing → blocker", () => {
    const assets = [
      completeAsset({
        candidateKey: "cand-immeuble",
        label: "Immeuble",
        coutBrut: 120_000,
        cumulOuverture: 30_000,
        classification: "batiment",
        startDate: "2015-01-01",
        durationYears: 40,
        propertyId: "prop-1",
        coutMissing: true,
      }),
    ];
    const result = buildExternalTakeoverFiscalYearOpening(baseInput({ assets }));
    assert.equal(result.status, "blocked");
    if (result.status === "blocked") {
      assert.ok(result.issues.some((i) => i.code === "ASSET_COUT_BRUT_UNAVAILABLE"));
    }
  });

  it("F — deficits unknown → blocker", () => {
    const stocks: CandidateFiscalStocks = {
      deficits: missingCandidate("déficits inconnus"),
      amortissementsReportes: presentCandidate(0, "direct", taxProv("ard")),
      amortissementsReportesSource: "manual_entry",
    };
    const result = buildExternalTakeoverFiscalYearOpening(baseInput({ stocks }));
    assert.equal(result.status, "blocked");
    if (result.status === "blocked") {
      assert.ok(result.issues.some((i) => i.code === "STOCKS_DEFICITS_UNKNOWN"));
    }
  });

  it("G — ARD unknown → blocker", () => {
    const stocks: CandidateFiscalStocks = {
      deficits: presentCandidate([], "direct", taxProv("def")),
      amortissementsReportes: documentAbsentCandidate("ARD absent"),
    };
    const result = buildExternalTakeoverFiscalYearOpening(baseInput({ stocks }));
    assert.equal(result.status, "blocked");
    if (result.status === "blocked") {
      assert.ok(result.issues.some((i) => i.code === "STOCKS_ARD_UNKNOWN"));
    }
  });

  it("H — 4E totalGross conflict → blocker", () => {
    const controls = controlsFromPairs({
      grossLeft: 132_000,
      grossRight: 130_000,
      depLeft: 35_000,
      depRight: 35_000,
    });
    const result = buildExternalTakeoverFiscalYearOpening(baseInput({ controls }));
    assert.equal(result.status, "blocked");
    if (result.status === "blocked") {
      assert.ok(result.issues.some((i) => i.code === "CONTROL_TOTAL_GROSS_CONFLICT"));
    }
  });

  it("I — 4E cumulative depreciation conflict → blocker", () => {
    const controls = controlsFromPairs({
      grossLeft: 132_000,
      grossRight: 132_000,
      depLeft: 35_000,
      depRight: 33_000,
    });
    const result = buildExternalTakeoverFiscalYearOpening(baseInput({ controls }));
    assert.equal(result.status, "blocked");
    if (result.status === "blocked") {
      assert.ok(
        result.issues.some((i) => i.code === "CONTROL_CUMULATIVE_DEPRECIATION_CONFLICT"),
      );
    }
  });

  it("J — 4E not_comparable → manual_review_required, validation pending", () => {
    const controls = controlsFromPairs({
      grossLeft: 132_000,
      grossRight: "missing",
      depLeft: 35_000,
      depRight: 35_000,
    });
    const result = buildExternalTakeoverFiscalYearOpening(baseInput({ controls }));
    assert.equal(result.status, "manual_review_required");
    if (result.status === "manual_review_required") {
      assert.equal(result.opening.validation.status, "pending");
      assert.ok(
        result.issues.some((i) => i.code === "CONTROL_TOTAL_GROSS_NOT_COMPARABLE"),
      );
    }
  });
});

describe("Lot 4F.1 — zéros / totaux / no recalc", () => {
  it("K — zero explicite stocks → PAS blocker", () => {
    const result = buildExternalTakeoverFiscalYearOpening(
      baseInput({ stocks: explicitZeroStocks() }),
    );
    assert.equal(result.status, "built");
  });

  it("L — present(0) cumulOuverture → acceptable", () => {
    const assets = [
      completeAsset({
        candidateKey: "cand-terrain",
        label: "Terrain",
        coutBrut: 60_000,
        cumulOuverture: 0,
        classification: "terrain",
        propertyId: "prop-1",
      }),
      ...referenceAssets(),
    ];
    const result = buildExternalTakeoverFiscalYearOpening(baseInput({ assets }));
    assert.equal(result.status, "built");
    if (result.status === "built") {
      const terrain = result.opening.assets;
      assert.ok(isAvailable(terrain));
      const t = terrain.value.find((a) => a.id === "asset-cand-terrain");
      assert.ok(t && isAvailable(t.cumulOuverture));
      assert.equal(t.cumulOuverture.value, 0);
    }
  });

  it("CRITIQUE — totaux 4E seuls ne créent pas d'actifs", () => {
    const result = buildExternalTakeoverFiscalYearOpening(
      baseInput({
        assets: [],
        stableAssetIdByCandidateKey: {},
      }),
    );
    assert.equal(result.status, "blocked");
    if (result.status === "blocked") {
      assert.ok(result.issues.some((i) => i.code === "NO_ASSET_DETAIL"));
    }
  });

  it("CRITIQUE — cumul historique 30000 conservé malgré plan théorique différent", () => {
    // Durée / date qui permettraient un autre cumul théorique si on recalculait.
    const assets = [
      completeAsset({
        candidateKey: "cand-immeuble",
        label: "Immeuble",
        coutBrut: 120_000,
        cumulOuverture: 30_000,
        classification: "batiment",
        startDate: "2000-01-01",
        durationYears: 25,
        propertyId: "prop-1",
        prorata: "annuel_plein",
      }),
    ];
    const result = buildExternalTakeoverFiscalYearOpening(baseInput({ assets }));
    assert.equal(result.status, "built");
    if (result.status === "built") {
      const asset = result.opening.assets;
      assert.ok(isAvailable(asset));
      const immeuble = asset.value[0]!;
      assert.ok(isAvailable(immeuble.cumulOuverture));
      assert.equal(immeuble.cumulOuverture.value, 30_000);
      // Plan présent pour DN future — mais cumul d'ouverture inchangé.
      assert.ok(isAvailable(immeuble.plan));
    }
  });

  it("provenance documentaire reste external, sans marqueur de déclaration client", () => {
    const result = buildExternalTakeoverFiscalYearOpening(baseInput());
    assert.equal(result.status, "built");
    if (result.status !== "built") return;
    const deficits = result.opening.provenance["stocks.deficits"];
    const ard = result.opening.provenance["stocks.amortissementsReportes"];
    assert.equal(deficits?.sourceKind, "external");
    assert.equal(ard?.sourceKind, "external");
    assert.equal(deficits?.sourceRef, undefined);
    assert.doesNotMatch(deficits?.note ?? "", /déclaration explicite du client/);
    assert.doesNotMatch(ard?.note ?? "", /déclaration explicite du client/);
  });

  it("déclaration client explicite reste identifiable dans l'Opening", () => {
    const client = (sourceRef: string): CandidateProvenance => ({
      ...taxProv(sourceRef),
      documentId: "takeover-review-answers",
      documentRole: "other",
      extractionMethod: "user_review_answer",
      fieldSource: "user_correction",
    });
    const result = buildExternalTakeoverFiscalYearOpening(
      baseInput({
        stocks: {
          deficits: presentCandidate([], "direct", client("stocks:deficits")),
          amortissementsReportes: presentCandidate(0, "direct", client("stocks:ard")),
          amortissementsReportesSource: "manual_entry",
        },
      }),
    );
    assert.equal(result.status, "built");
    if (result.status !== "built") return;
    assert.equal(result.opening.provenance["stocks.deficits"]?.sourceKind, "external");
    assert.equal(
      result.opening.provenance["stocks.deficits"]?.sourceRef,
      "takeover-review-answers",
    );
    assert.match(
      result.opening.provenance["stocks.deficits"]?.note ?? "",
      /déclaration explicite du client/,
    );
    assert.match(
      result.opening.provenance["stocks.amortissementsReportes"]?.note ?? "",
      /déclaration explicite du client/,
    );
    assert.ok(isAvailable(result.opening.stocks.deficits));
    if (isAvailable(result.opening.stocks.deficits)) {
      assert.deepEqual(result.opening.stocks.deficits.value, []);
    }
    assert.ok(isAvailable(result.opening.stocks.amortissementsReportes));
    if (isAvailable(result.opening.stocks.amortissementsReportes)) {
      assert.equal(result.opening.stocks.amortissementsReportes.value, 0);
    }
  });

  it("missing stocks ≠ zero stocks", () => {
    const missing = buildExternalTakeoverFiscalYearOpening(
      baseInput({
        stocks: {
          deficits: missingCandidate("inconnu"),
          amortissementsReportes: missingCandidate("inconnu"),
        },
      }),
    );
    const zero = buildExternalTakeoverFiscalYearOpening(
      baseInput({ stocks: explicitZeroStocks() }),
    );
    assert.equal(missing.status, "blocked");
    assert.equal(zero.status, "built");
    if (zero.status === "built") {
      assert.ok(isAvailable(zero.opening.stocks.deficits));
      assert.ok(!isUnavailable(zero.opening.stocks.deficits));
    }
  });
});
