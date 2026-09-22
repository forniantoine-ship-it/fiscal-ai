/**
 * Lot 4D.2 — extraction / adaptation liasse N-1 → TaxPackageControlFacts.
 * Run: npx tsx --test src/lib/lmnp/services/takeover/lot4d2-tax-package-control-facts-extract.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createConfidenceScore } from "@/lib/documents/types/confidence-score";
import {
  applyCandidateCorrection,
  isCandidateAbsent,
  isCandidatePresent,
  missingCandidate,
  presentCandidate,
  type CandidateProvenance,
} from "./candidate-value";
import {
  extractTaxPackageControlFactsFromLiasse,
  type TaxPackageLiasseCaseObservation,
} from "./extract-tax-package-control-facts-from-liasse";
import {
  isTaxPackageControlFact,
  TAX_PACKAGE_CONTROL_V1_MATRIX,
} from "./tax-package-control-facts";

const FORM_YEAR = 2026;
const FY = 2025;

function prov(documentId: string, sourceRef: string): CandidateProvenance {
  return {
    documentId,
    documentRole: "prior_tax_package",
    fieldLabel: sourceRef,
    sourceRef,
    extractionMethod: "fixture_structured",
    confidence: createConfidenceScore(0.91, ["fixture"]),
    evidence: { snippet: sourceRef, page: 1 },
    fieldSource: "extracted",
  };
}

function presentObs(
  formType: string,
  sourceCase: string,
  amount: number,
  options?: {
    documentId?: string;
    formYear?: number;
    fiscalYear?: number;
    provenance?: Partial<CandidateProvenance>;
  },
): TaxPackageLiasseCaseObservation {
  const documentId = options?.documentId ?? "doc-liasse-n1";
  const sourceRef = `${formType}:${sourceCase}`;
  return {
    formType,
    sourceCase,
    formYear: options?.formYear ?? FORM_YEAR,
    fiscalYear: options?.fiscalYear ?? FY,
    value: presentCandidate(amount, "direct", {
      ...prov(documentId, sourceRef),
      ...options?.provenance,
      documentId,
    }),
  };
}

function missingObs(
  formType: string,
  sourceCase: string,
  options?: { documentId?: string; formYear?: number; fiscalYear?: number },
): TaxPackageLiasseCaseObservation {
  const documentId = options?.documentId ?? "doc-liasse-n1";
  return {
    formType,
    sourceCase,
    formYear: options?.formYear ?? FORM_YEAR,
    fiscalYear: options?.fiscalYear ?? FY,
    value: missingCandidate("case absente du document", {
      documentId,
      documentRole: "prior_tax_package",
      sourceRef: `${formType}:${sourceCase}`,
    }),
  };
}

function extract(observations: TaxPackageLiasseCaseObservation[], packageId = "pkg-4d2") {
  return extractTaxPackageControlFactsFromLiasse({ packageId, observations });
}

function kinds(result: ReturnType<typeof extract>) {
  return result.package.facts.map((f) => ({
    sourceCase: f.sourceCase,
    kind: f.kind,
    formType: f.formType,
  }));
}

describe("Lot 4D.2 — matrice V1 (TESTS 1–6)", () => {
  it("TEST 1 — 2033A 028 → total_gross", () => {
    const result = extract([presentObs("2033A", "028", 150_000)]);
    assert.equal(result.status, "extracted");
    assert.equal(result.package.facts.length, 1);
    assert.equal(result.package.facts[0]!.kind, "total_gross");
    assert.equal(result.package.facts[0]!.sourceCase, "028");
    assert.equal(result.package.facts[0]!.formType, "2033A");
    assert.equal(result.package.facts[0]!.periodPosition, "closing");
    assert.ok(isTaxPackageControlFact(result.package.facts[0]));
  });

  it("TEST 2 — 2033A 030 → total_cumulative_depreciation", () => {
    const result = extract([presentObs("2033A", "030", 42_000)]);
    assert.equal(result.package.facts[0]!.kind, "total_cumulative_depreciation");
    assert.equal(result.package.facts[0]!.sourceCase, "030");
  });

  it("TEST 3 — 2033C 426 → land_gross", () => {
    const result = extract([presentObs("2033C", "426", 60_000)]);
    assert.equal(result.package.facts[0]!.kind, "land_gross");
    assert.equal(result.package.facts[0]!.sourceCase, "426");
  });

  it("TEST 4 — 2033C 476 → furniture_gross", () => {
    const result = extract([presentObs("2033C", "476", 12_000)]);
    assert.equal(result.package.facts[0]!.kind, "furniture_gross");
    assert.equal(result.package.facts[0]!.sourceCase, "476");
  });

  it("TEST 5 — 2033C 496 → total_gross", () => {
    const result = extract([presentObs("2033C", "496", 150_000)]);
    assert.equal(result.package.facts[0]!.kind, "total_gross");
    assert.equal(result.package.facts[0]!.sourceCase, "496");
    assert.equal(result.package.facts[0]!.formType, "2033C");
  });

  it("TEST 6 — 2033C 576 → total_cumulative_depreciation", () => {
    const result = extract([presentObs("2033C", "576", 42_000)]);
    assert.equal(result.package.facts[0]!.kind, "total_cumulative_depreciation");
    assert.equal(result.package.facts[0]!.sourceCase, "576");
  });
});

describe("Lot 4D.2 — observations distinctes (TESTS 7–10)", () => {
  it("TEST 7 — 028 + 496 même montant → 2 observations", () => {
    const result = extract([
      presentObs("2033A", "028", 150_000),
      presentObs("2033C", "496", 150_000),
    ]);
    assert.equal(result.package.facts.length, 2);
    assert.deepEqual(kinds(result), [
      { sourceCase: "028", kind: "total_gross", formType: "2033A" },
      { sourceCase: "496", kind: "total_gross", formType: "2033C" },
    ]);
    const v0 = result.package.facts[0]!.value;
    const v1 = result.package.facts[1]!.value;
    assert.ok(isCandidatePresent(v0) && isCandidatePresent(v1));
    assert.equal(v0.value, 150_000);
    assert.equal(v1.value, 150_000);
  });

  it("TEST 8 — 028 + 496 montants différents → 2 observations, aucun arbitrage", () => {
    const result = extract([
      presentObs("2033A", "028", 150_000),
      presentObs("2033C", "496", 148_000),
    ]);
    assert.equal(result.package.facts.length, 2);
    const amounts = result.package.facts.map((f) => {
      assert.ok(isCandidatePresent(f.value));
      return f.value.value;
    });
    assert.deepEqual(amounts, [150_000, 148_000]);
    assert.equal("canonicalValue" in result.package, false);
    assert.equal("tolerance" in result.package, false);
    assert.equal("reconciliation" in result.package, false);
    assert.equal("delta" in result.package, false);
  });

  it("TEST 9 — 030 + 576 → 2 observations", () => {
    const result = extract([
      presentObs("2033A", "030", 40_000),
      presentObs("2033C", "576", 41_000),
    ]);
    assert.equal(result.package.facts.length, 2);
    assert.deepEqual(
      result.package.facts.map((f) => f.sourceCase),
      ["030", "576"],
    );
  });

  it("TEST 10 — deux documents / même case → 2 observations", () => {
    const result = extract([
      presentObs("2033A", "028", 150_000, { documentId: "doc-A" }),
      presentObs("2033A", "028", 150_000, { documentId: "doc-B" }),
    ]);
    assert.equal(result.package.facts.length, 2);
    const ids = result.package.facts.map((f) => {
      assert.ok(isCandidatePresent(f.value));
      return f.value.provenance.documentId;
    });
    assert.deepEqual(ids, ["doc-A", "doc-B"]);
  });
});

describe("Lot 4D.2 — zero / missing / décimales / provenance (TESTS 11–15)", () => {
  it("TEST 11 — present(0) → observation conservée", () => {
    const result = extract([presentObs("2033A", "030", 0)]);
    assert.equal(result.package.facts.length, 1);
    const value = result.package.facts[0]!.value;
    assert.ok(isCandidatePresent(value));
    assert.equal(value.value, 0);
  });

  it("TEST 12 — missing → fact missing, jamais present(0)", () => {
    const result = extract([missingObs("2033A", "030")]);
    assert.equal(result.package.facts.length, 1);
    const value = result.package.facts[0]!.value;
    assert.ok(isCandidateAbsent(value));
    assert.equal(value.status, "missing");
    assert.notEqual(value.status, "present");
  });

  it("TEST 13 — décimale préservée", () => {
    const result = extract([presentObs("2033C", "496", 149_999.64)]);
    const value = result.package.facts[0]!.value;
    assert.ok(isCandidatePresent(value));
    assert.equal(value.value, 149_999.64);
  });

  it("TEST 14 — documentId préservé", () => {
    const result = extract([
      presentObs("2033A", "028", 150_000, { documentId: "doc-immut-42" }),
    ]);
    const value = result.package.facts[0]!.value;
    assert.ok(isCandidatePresent(value));
    assert.equal(value.provenance.documentId, "doc-immut-42");
  });

  it("TEST 15 — formYear / fiscalYear distincts préservés", () => {
    const result = extract([
      presentObs("2033A", "028", 150_000, { formYear: 2026, fiscalYear: 2025 }),
    ]);
    const fact = result.package.facts[0]!;
    assert.equal(fact.formYear, 2026);
    assert.equal(fact.fiscalYear, 2025);
    assert.notEqual(fact.formYear, fact.fiscalYear);
  });
});

describe("Lot 4D.2 — cases interdites (TESTS 16–19)", () => {
  for (const sourceCase of ["490", "570", "572", "318"] as const) {
    it(`TEST — ${sourceCase} → aucun TaxPackageControlFact`, () => {
      const formType = sourceCase === "318" ? "2033B" : "2033A";
      const result = extract([presentObs(formType, sourceCase, 10_000)]);
      assert.equal(result.package.facts.length, 0);
      assert.equal(result.skipped.length, 1);
      assert.equal(result.skipped[0]!.sourceCase, sourceCase);
      assert.equal(result.issues.length, 0);
    });
  }

  it("cases interdites mélangées à V1 → seuls les V1 deviennent facts", () => {
    const result = extract([
      presentObs("2033A", "028", 150_000),
      presentObs("2033A", "490", 150_000),
      presentObs("2033A", "570", 40_000),
      presentObs("2033C", "572", 5_000),
      presentObs("2033B", "318", 1_000),
      presentObs("2033C", "496", 150_000),
    ]);
    assert.equal(result.package.facts.length, 2);
    assert.deepEqual(
      result.package.facts.map((f) => f.sourceCase),
      ["028", "496"],
    );
    assert.equal(result.skipped.length, 4);
  });
});

describe("Lot 4D.2 — interdits produit (TESTS 20–25)", () => {
  it("TEST 20 — aucun canonicalValue", () => {
    const result = extract([
      presentObs("2033A", "028", 150_000),
      presentObs("2033C", "496", 148_000),
    ]);
    for (const fact of result.package.facts) {
      assert.equal("canonicalValue" in fact, false);
    }
    assert.equal("canonicalValue" in result.package, false);
    assert.equal("canonicalValue" in result, false);
  });

  it("TEST 21 — aucune tolerance", () => {
    const result = extract([
      presentObs("2033A", "028", 150_000),
      presentObs("2033C", "496", 148_000),
    ]);
    for (const fact of result.package.facts) {
      assert.equal("tolerance" in fact, false);
    }
    assert.equal("tolerance" in result, false);
  });

  it("TEST 22 — aucune reconciliation", () => {
    const result = extract([
      presentObs("2033A", "028", 150_000),
      presentObs("2033C", "496", 148_000),
    ]);
    assert.equal("reconciliation" in result, false);
    assert.equal("reconciliationStatus" in result.package, false);
    for (const fact of result.package.facts) {
      assert.equal("reconciliationStatus" in fact, false);
    }
  });

  it("TEST 23 — aucun Opening / periodPosition opening", () => {
    const result = extract([
      presentObs("2033A", "028", 150_000),
      presentObs("2033A", "030", 40_000),
      presentObs("2033C", "426", 60_000),
      presentObs("2033C", "476", 12_000),
      presentObs("2033C", "496", 150_000),
      presentObs("2033C", "576", 40_000),
    ]);
    assert.equal(result.package.facts.length, 6);
    for (const fact of result.package.facts) {
      assert.equal(fact.periodPosition, "closing");
    }
    assert.equal("opening" in result, false);
    assert.equal("OpeningFact" in result, false);
  });

  it("TEST 24 — aucune création d'asset", () => {
    const result = extract([presentObs("2033C", "476", 12_000)]);
    assert.equal("assets" in result, false);
    assert.equal("CandidateHistoricalAsset" in result, false);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("candidateKey"), false);
    assert.equal(serialized.includes("OpeningAsset"), false);
  });

  it("TEST 25 — aucun mélange CandidateFiscalStocks", () => {
    const result = extract([presentObs("2033A", "028", 150_000)]);
    assert.equal("stocks" in result, false);
    assert.equal("deficits" in result.package, false);
    assert.equal("amortissementsReportes" in result.package, false);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("amortissementsReportesSource"), false);
    assert.equal(serialized.includes("CandidateFiscalStocks"), false);
  });
});

describe("Lot 4D.2 — provenance / correction / factory path", () => {
  it("préserve confidence et correction trail sans arbitrage", () => {
    const base = presentCandidate(150_000, "direct", prov("doc-corr", "2033A:028"));
    const corrected = applyCandidateCorrection(base, 151_000, {
      correctedAt: "2026-09-22T10:00:00.000Z",
      correctedBy: "reviewer",
      reason: "saisie humaine",
    });
    const result = extract([
      {
        formType: "2033A",
        sourceCase: "028",
        formYear: FORM_YEAR,
        fiscalYear: FY,
        value: corrected,
      },
    ]);
    const value = result.package.facts[0]!.value;
    assert.ok(isCandidatePresent(value));
    assert.equal(value.value, 151_000);
    assert.equal(value.reviewState, "corrected");
    assert.equal(value.originalValue, 150_000);
    assert.equal(value.correction?.reason, "saisie humaine");
    assert.equal(value.provenance.confidence?.value, 0.91);
  });

  it("réutilise TAX_PACKAGE_CONTROL_V1_MATRIX — pas de seconde matrice locale", () => {
    const source = readFileSync(
      new URL("./extract-tax-package-control-facts-from-liasse.ts", import.meta.url),
      "utf8",
    );
    assert.match(source, /TAX_PACKAGE_CONTROL_V1_MATRIX/);
    assert.match(source, /createTaxPackageControlFact/);
    assert.doesNotMatch(source, /sourceCase:\s*"028"\s*as const/);
    assert.equal(TAX_PACKAGE_CONTROL_V1_MATRIX.length, 6);
  });

  it("aucune construction directe / cast TaxPackageControlFact", () => {
    const source = readFileSync(
      new URL("./extract-tax-package-control-facts-from-liasse.ts", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(source, /as TaxPackageControlFact/);
    assert.doesNotMatch(source, /:\s*TaxPackageControlFact\s*=/);
    assert.doesNotMatch(source, /canonicalValue/);
    assert.doesNotMatch(source, /tolerance/);
    assert.doesNotMatch(source, /reconciliation/);
    assert.doesNotMatch(source, /OpeningFact|OpeningAsset|CandidateHistoricalAsset|CandidateFiscalStocks/);
  });

  it("valeur négative V1 → issue factory, pas de fact silencieux", () => {
    const result = extract([presentObs("2033A", "028", -1)]);
    assert.equal(result.package.facts.length, 0);
    assert.ok(result.issues.some((i) => i.code === "NEGATIVE_VALUE"));
  });

  it("observation absente de l'entrée → aucun fact inventé", () => {
    const result = extract([presentObs("2033A", "028", 150_000)]);
    assert.equal(
      result.package.facts.find((f) => f.sourceCase === "030"),
      undefined,
    );
  });
});

describe("Lot 4D.2 — minors contre-audit (cross-form / non-finite / ordre)", () => {
  const CROSS_FORM: ReadonlyArray<{ formType: string; sourceCase: string }> = [
    { formType: "2033A", sourceCase: "496" },
    { formType: "2033A", sourceCase: "576" },
    { formType: "2033C", sourceCase: "028" },
    { formType: "2033C", sourceCase: "030" },
  ];

  for (const { formType, sourceCase } of CROSS_FORM) {
    it(`cross-form ${formType}/${sourceCase} → 0 fact, skipped (pas lookup sourceCase seul)`, () => {
      const result = extract([presentObs(formType, sourceCase, 150_000)]);
      assert.equal(result.package.facts.length, 0);
      assert.equal(result.skipped.length, 1);
      assert.equal(result.skipped[0]!.formType, formType);
      assert.equal(result.skipped[0]!.sourceCase, sourceCase);
      assert.equal(result.issues.length, 0);
    });
  }

  it("NaN via adaptateur → 0 fact, NON_FINITE_VALUE, 0 skipped", () => {
    const result = extract([presentObs("2033A", "028", Number.NaN)]);
    assert.equal(result.package.facts.length, 0);
    assert.equal(result.skipped.length, 0);
    assert.equal(result.issues.length, 1);
    assert.equal(result.issues[0]!.code, "NON_FINITE_VALUE");
  });

  it("Infinity via adaptateur → 0 fact, NON_FINITE_VALUE, 0 skipped", () => {
    const result = extract([presentObs("2033A", "028", Number.POSITIVE_INFINITY)]);
    assert.equal(result.package.facts.length, 0);
    assert.equal(result.skipped.length, 0);
    assert.equal(result.issues.length, 1);
    assert.equal(result.issues[0]!.code, "NON_FINITE_VALUE");
  });

  it("fiscalYear invalide via adaptateur → 0 fact, INVALID_FISCAL_YEAR, 0 skipped", () => {
    const result = extract([
      presentObs("2033A", "028", 150_000, { fiscalYear: 999 }),
    ]);
    assert.equal(result.package.facts.length, 0);
    assert.equal(result.skipped.length, 0);
    assert.ok(result.issues.some((i) => i.code === "INVALID_FISCAL_YEAR"));
  });

  it("ordre d'entrée préservé — aucun tri / regroupement / déduplication", () => {
    const result = extract([
      presentObs("2033C", "496", 150_000),
      presentObs("2033A", "028", 150_000),
      presentObs("2033C", "576", 40_000),
      presentObs("2033A", "030", 40_000),
    ]);
    assert.deepEqual(
      result.package.facts.map((f) => f.sourceCase),
      ["496", "028", "576", "030"],
    );
    assert.equal(result.skipped.length, 0);
    assert.equal(result.issues.length, 0);
  });
});
