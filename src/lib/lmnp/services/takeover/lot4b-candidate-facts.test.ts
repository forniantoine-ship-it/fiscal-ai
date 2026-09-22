/**
 * Lot 4B — candidate facts + provenance.
 * Run: npx tsx --test src/lib/lmnp/services/takeover/lot4b-candidate-facts.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createConfidenceScore } from "@/lib/documents/types/confidence-score";
import { isAvailable, isUnavailable } from "@/lib/lmnp/services/fiscal-year-opening/opening-fact";
import {
  applyCandidateCorrection,
  assertNotCase318AmortStockSource,
  confirmCandidate,
  fixtureAssetRegisterCandidates,
  fixtureTaxPackageCandidates,
  fixtureTakeoverCandidatePackage,
  isCandidatePresent,
  mapAcceptedCandidateAssetsToOpening,
  mapAcceptedCandidateStocksToOpening,
  missingCandidate,
  presentCandidate,
  type CandidateHistoricalAsset,
  type CandidateProvenance,
} from "./index";

const PROV: CandidateProvenance = {
  documentId: "doc-1",
  documentRole: "prior_tax_package",
  evidence: { snippet: "4 500 €", page: 2 },
  fieldLabel: "stock ARD",
  sourceRef: "row:12",
  extractionMethod: "test",
  confidence: createConfidenceScore(0.91, ["test"]),
  fieldSource: "extracted",
};

describe("Lot 4B — candidate numérique : 0 / missing", () => {
  it("0 reste 0 (present)", () => {
    const v = presentCandidate(0, "direct", PROV);
    assert.equal(v.status, "present");
    assert.equal(v.value, 0);
  });

  it("missing reste missing — jamais normalisé en 0", () => {
    const v = missingCandidate("non extrait");
    assert.equal(v.status, "missing");
    assert.notEqual(v.status, "present");
  });
});

describe("Lot 4B — candidate liste : [] / missing", () => {
  it("[] reste [] (present = absence confirmée de déficits)", () => {
    const v = presentCandidate([], "direct", PROV);
    assert.equal(v.status, "present");
    assert.deepEqual(v.value, []);
  });

  it("missing reste missing — jamais normalisé en []", () => {
    const v = missingCandidate();
    assert.equal(v.status, "missing");
  });
});

describe("Lot 4B — provenance & confidence", () => {
  it("conserve documentId, page, snippet, confidence", () => {
    const v = presentCandidate(4500, "direct", PROV);
    assert.equal(v.provenance.documentId, "doc-1");
    assert.equal(v.provenance.evidence?.page, 2);
    assert.equal(v.provenance.evidence?.snippet, "4 500 €");
    assert.equal(v.provenance.confidence?.value, 0.91);
    assert.equal(v.provenance.confidence?.band, "high");
  });
});

describe("Lot 4B — nature direct / derived / inferred", () => {
  it("conserve direct, derived, inferred", () => {
    assert.equal(presentCandidate(1, "direct", PROV).nature, "direct");
    assert.equal(presentCandidate(1, "derived", PROV).nature, "derived");
    assert.equal(presentCandidate(1, "inferred", PROV).nature, "inferred");
  });

  it("inferred n'est pas promu implicitement vers Opening", () => {
    const stocks = {
      deficits: presentCandidate([], "direct", PROV),
      amortissementsReportes: presentCandidate(100, "inferred", PROV),
      amortissementsReportesSource: "manual_entry" as const,
    };
    const result = mapAcceptedCandidateStocksToOpening({ stocks });
    assert.equal(result.status, "blocked");
    assert.ok(
      result.status === "blocked" &&
        result.issues.some((i) => i.code === "INFERRED_NOT_ACCEPTED"),
    );
  });

  it("inferred accepté uniquement avec opt-in explicite", () => {
    const stocks = {
      deficits: presentCandidate([], "direct", PROV),
      amortissementsReportes: presentCandidate(100, "inferred", PROV),
      amortissementsReportesSource: "manual_entry" as const,
    };
    const result = mapAcceptedCandidateStocksToOpening({
      stocks,
      acceptInferredPaths: ["stocks.amortissementsReportes"],
    });
    assert.equal(result.status, "mapped");
    assert.ok(result.status === "mapped" && isAvailable(result.stocks.amortissementsReportes));
    assert.equal(
      result.status === "mapped" && result.stocks.amortissementsReportes.status === "available"
        ? result.stocks.amortissementsReportes.value
        : null,
      100,
    );
  });
});

describe("Lot 4B — correction / confirmation", () => {
  it("conserve la valeur originale après correction", () => {
    const original = presentCandidate(4500, "direct", PROV);
    const corrected = applyCandidateCorrection(original, 4600, {
      correctedAt: "2026-09-22T10:00:00.000Z",
      correctedBy: "reviewer-1",
      reason: "arrondi",
    });
    assert.equal(corrected.value, 4600);
    assert.equal(corrected.originalValue, 4500);
    assert.equal(corrected.reviewState, "corrected");
    assert.equal(corrected.provenance.fieldSource, "user_correction");
    assert.equal(corrected.provenance.documentId, "doc-1");
  });

  it("confirmation conserve la valeur et marque confirmed", () => {
    const confirmed = confirmCandidate(presentCandidate(4500, "direct", PROV), {
      correctedAt: "2026-09-22T10:00:00.000Z",
      correctedBy: "reviewer-1",
    });
    assert.equal(confirmed.value, 4500);
    assert.equal(confirmed.reviewState, "confirmed");
  });
});

describe("Lot 4B — identité assets", () => {
  it("deux lignes même label, sourceAssetRef distincts restent distinctes", () => {
    const assets = fixtureAssetRegisterCandidates();
    const a = {
      ...assets[0]!,
      candidateKey: "cand-a",
      sourceAssetRef: "SRC-A",
      label: presentCandidate("Même libellé", "direct", PROV),
    };
    const b = {
      ...assets[0]!,
      candidateKey: "cand-b",
      sourceAssetRef: "SRC-B",
      label: presentCandidate("Même libellé", "direct", PROV),
    };
    assert.notEqual(a.candidateKey, b.candidateKey);
    assert.notEqual(a.sourceAssetRef, b.sourceAssetRef);
    assert.equal(
      isCandidatePresent(a.label) && isCandidatePresent(b.label) && a.label.value === b.label.value,
      true,
    );
  });

  it("deux lignes sans ID source ne reçoivent PAS le même ID stable automatiquement", () => {
    const base = fixtureAssetRegisterCandidates()[0]!;
    const withoutRef = (key: string): CandidateHistoricalAsset => ({
      ...base,
      candidateKey: key,
      sourceAssetRef: undefined,
    });
    const a = withoutRef("line-orphan-1");
    const b = withoutRef("line-orphan-2");
    assert.equal(a.sourceAssetRef, undefined);
    assert.equal(b.sourceAssetRef, undefined);
    assert.notEqual(a.candidateKey, b.candidateKey);

    const blocked = mapAcceptedCandidateAssetsToOpening({
      assets: [a, b],
      stableAssetIdByCandidateKey: {},
    });
    assert.equal(blocked.status, "blocked");
    assert.ok(
      blocked.status === "blocked" &&
        blocked.issues.filter((i) => i.code === "STABLE_ASSET_ID_REQUIRED").length === 2,
    );
  });

  it("refuse un assetId index-based f010-N", () => {
    const asset = fixtureAssetRegisterCandidates()[0]!;
    const result = mapAcceptedCandidateAssetsToOpening({
      assets: [asset],
      stableAssetIdByCandidateKey: { [asset.candidateKey]: "f010-0" },
    });
    assert.equal(result.status, "blocked");
    assert.ok(
      result.status === "blocked" &&
        result.issues.some((i) => i.code === "STABLE_ASSET_ID_INDEX_BASED"),
    );
  });
});

describe("Lot 4B — propertyId", () => {
  it("property inconnue reste inconnue — aucun fallback properties[0]", () => {
    for (const asset of fixtureAssetRegisterCandidates()) {
      assert.equal(asset.propertyId.status, "missing");
    }
    const assets = fixtureAssetRegisterCandidates();
    const result = mapAcceptedCandidateAssetsToOpening({
      assets,
      stableAssetIdByCandidateKey: {
        "cand-batiment": "asset-bat-uuid",
        "cand-terrain": "asset-ter-uuid",
        "cand-mobilier": "asset-mob-uuid",
      },
    });
    assert.equal(result.status, "mapped");
    if (result.status === "mapped") {
      for (const a of result.assets) {
        assert.equal(a.propertyId, undefined);
      }
    }
  });
});

describe("Lot 4B — stocks fiscaux / anti-318", () => {
  it("supporte déficits + stock ARD depuis source dédiée", () => {
    const stocks = fixtureTaxPackageCandidates();
    assert.ok(isCandidatePresent(stocks.deficits));
    assert.equal(stocks.deficits.value.length, 2);
    assert.ok(isCandidatePresent(stocks.amortissementsReportes));
    assert.equal(stocks.amortissementsReportes.value, 4500);
    assert.equal(stocks.amortissementsReportesSource, "stock_historique_explicit");
  });

  it("aucune règle 318 → stock ARD (assert runtime)", () => {
    assert.throws(() => assertNotCase318AmortStockSource("cerfa_2033b_318"), /318/);
    assert.throws(() => assertNotCase318AmortStockSource("case_318"), /318/);
    assert.throws(() => assertNotCase318AmortStockSource("mouvement_annuel"), /318|mouvement/i);
    assert.doesNotThrow(() => assertNotCase318AmortStockSource("stock_historique_explicit"));
  });

  it("missing stocks → Opening unavailable, pas 0 / []", () => {
    const result = mapAcceptedCandidateStocksToOpening({
      stocks: {
        deficits: missingCandidate("non extrait"),
        amortissementsReportes: missingCandidate("non extrait"),
      },
    });
    assert.equal(result.status, "mapped");
    if (result.status === "mapped") {
      assert.ok(isUnavailable(result.stocks.deficits));
      assert.ok(isUnavailable(result.stocks.amortissementsReportes));
    }
  });

  it("present 0 et [] se mappent en available(0) / available([])", () => {
    const result = mapAcceptedCandidateStocksToOpening({
      stocks: {
        deficits: presentCandidate([], "direct", PROV),
        amortissementsReportes: presentCandidate(0, "direct", PROV),
        amortissementsReportesSource: "stock_historique_explicit",
      },
    });
    assert.equal(result.status, "mapped");
    if (result.status === "mapped") {
      assert.ok(isAvailable(result.stocks.deficits));
      assert.deepEqual(
        result.stocks.deficits.status === "available" ? result.stocks.deficits.value : null,
        [],
      );
      assert.ok(isAvailable(result.stocks.amortissementsReportes));
      assert.equal(
        result.stocks.amortissementsReportes.status === "available"
          ? result.stocks.amortissementsReportes.value
          : null,
        0,
      );
    }
  });
});

describe("Lot 4B — mapping assets acceptés", () => {
  it("mappe le registre fixture avec IDs stables explicites", () => {
    const pkg = fixtureTakeoverCandidatePackage();
    const result = mapAcceptedCandidateAssetsToOpening({
      assets: pkg.assets,
      stableAssetIdByCandidateKey: {
        "cand-batiment": "asset-bat-uuid",
        "cand-terrain": "asset-ter-uuid",
        "cand-mobilier": "asset-mob-uuid",
      },
    });
    assert.equal(result.status, "mapped");
    if (result.status === "mapped") {
      assert.equal(result.assets.length, 3);
      const terrain = result.assets.find((a) => a.id === "asset-ter-uuid");
      assert.ok(terrain);
      assert.equal(terrain!.categorie, "terrain");
      assert.ok(isAvailable(terrain!.plan));
      assert.equal(
        terrain!.plan.status === "available" ? terrain!.plan.value.kind : null,
        "non_amortizable",
      );
      const bat = result.assets.find((a) => a.id === "asset-bat-uuid");
      assert.ok(bat && isAvailable(bat.plan));
      assert.equal(bat!.plan.status === "available" ? bat!.plan.value.kind : null, "amortizable");
    }
  });

  it("n'invente pas durée / prorata manquants", () => {
    const base = fixtureAssetRegisterCandidates()[0]!;
    const incomplete: CandidateHistoricalAsset = {
      ...base,
      candidateKey: "cand-incomplete",
      durationYears: missingCandidate("durée absente du document"),
      prorataConvention: missingCandidate("prorata absent"),
    };
    const result = mapAcceptedCandidateAssetsToOpening({
      assets: [incomplete],
      stableAssetIdByCandidateKey: { "cand-incomplete": "asset-incomplete-uuid" },
    });
    assert.equal(result.status, "mapped");
    if (result.status === "mapped") {
      assert.equal(result.assets.length, 1);
      assert.ok(isUnavailable(result.assets[0]!.plan));
    }
  });
});

describe("Lot 4B — package fixture", () => {
  it("agrège tax package + asset register sans prétendre une OCR", () => {
    const pkg = fixtureTakeoverCandidatePackage();
    assert.equal(pkg.packageId, "pkg-fixture-4b");
    assert.equal(pkg.assets.length, 3);
    assert.equal(pkg.stocks.amortissementsReportesSource, "stock_historique_explicit");
  });
});
