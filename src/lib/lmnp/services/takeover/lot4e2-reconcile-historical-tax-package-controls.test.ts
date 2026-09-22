/**
 * Lot 4E.2 — assemblage des 2 contrôles liasse historiques.
 * Run: npx tsx --test src/lib/lmnp/services/takeover/lot4e2-reconcile-historical-tax-package-controls.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createConfidenceScore } from "@/lib/documents/types/confidence-score";
import {
  isCandidatePresent,
  missingCandidate,
  presentCandidate,
  type CandidateProvenance,
  type CandidateValue,
} from "./candidate-value";
import { reconcileHistoricalTaxPackageControls } from "./reconcile-historical-tax-package-controls";
import {
  createTaxPackageControlFact,
  type TaxPackageControlFact,
  type TaxPackageControlFactDraft,
  type TaxPackageControlFacts,
} from "./tax-package-control-facts";

const FORM_YEAR = 2026;
const FY = 2025;

function prov(documentId: string, sourceRef: string, page = 1): CandidateProvenance {
  return {
    documentId,
    documentRole: "prior_tax_package",
    fieldLabel: sourceRef,
    sourceRef,
    extractionMethod: "fixture_structured",
    confidence: createConfidenceScore(0.9, ["fixture"]),
    evidence: { snippet: sourceRef, page },
    fieldSource: "extracted",
  };
}

function mustFact(draft: TaxPackageControlFactDraft): TaxPackageControlFact {
  const created = createTaxPackageControlFact(draft);
  assert.equal(created.status, "created", JSON.stringify(created));
  if (created.status !== "created") throw new Error("unreachable");
  return created.fact;
}

function amountValue(
  amount: number | "missing",
  documentId: string,
  sourceRef: string,
): CandidateValue<number> {
  if (amount === "missing") {
    return missingCandidate("case absente", {
      documentId,
      documentRole: "prior_tax_package",
      sourceRef,
    });
  }
  return presentCandidate(amount, "direct", prov(documentId, sourceRef));
}

function fact028(
  amount: number | "missing",
  options?: { documentId?: string; fiscalYear?: number; formYear?: number },
): TaxPackageControlFact {
  const documentId = options?.documentId ?? "doc-a";
  return mustFact({
    kind: "total_gross",
    formType: "2033A",
    sourceCase: "028",
    formYear: options?.formYear ?? FORM_YEAR,
    fiscalYear: options?.fiscalYear ?? FY,
    periodPosition: "closing",
    value: amountValue(amount, documentId, "2033A:028"),
  });
}

function fact496(
  amount: number | "missing",
  options?: { documentId?: string; fiscalYear?: number; formYear?: number },
): TaxPackageControlFact {
  const documentId = options?.documentId ?? "doc-c";
  return mustFact({
    kind: "total_gross",
    formType: "2033C",
    sourceCase: "496",
    formYear: options?.formYear ?? FORM_YEAR,
    fiscalYear: options?.fiscalYear ?? FY,
    periodPosition: "closing",
    value: amountValue(amount, documentId, "2033C:496"),
  });
}

function fact030(
  amount: number | "missing",
  options?: { documentId?: string; fiscalYear?: number; formYear?: number },
): TaxPackageControlFact {
  const documentId = options?.documentId ?? "doc-a";
  return mustFact({
    kind: "total_cumulative_depreciation",
    formType: "2033A",
    sourceCase: "030",
    formYear: options?.formYear ?? FORM_YEAR,
    fiscalYear: options?.fiscalYear ?? FY,
    periodPosition: "closing",
    value: amountValue(amount, documentId, "2033A:030"),
  });
}

function fact576(
  amount: number | "missing",
  options?: { documentId?: string; fiscalYear?: number; formYear?: number },
): TaxPackageControlFact {
  const documentId = options?.documentId ?? "doc-c";
  return mustFact({
    kind: "total_cumulative_depreciation",
    formType: "2033C",
    sourceCase: "576",
    formYear: options?.formYear ?? FORM_YEAR,
    fiscalYear: options?.fiscalYear ?? FY,
    periodPosition: "closing",
    value: amountValue(amount, documentId, "2033C:576"),
  });
}

function fact426(amount: number): TaxPackageControlFact {
  return mustFact({
    kind: "land_gross",
    formType: "2033C",
    sourceCase: "426",
    formYear: FORM_YEAR,
    fiscalYear: FY,
    periodPosition: "closing",
    value: amountValue(amount, "doc-c", "2033C:426"),
  });
}

function fact476(amount: number): TaxPackageControlFact {
  return mustFact({
    kind: "furniture_gross",
    formType: "2033C",
    sourceCase: "476",
    formYear: FORM_YEAR,
    fiscalYear: FY,
    periodPosition: "closing",
    value: amountValue(amount, "doc-c", "2033C:476"),
  });
}

function pkg(facts: TaxPackageControlFact[], packageId = "pkg-4e2"): TaxPackageControlFacts {
  return { packageId, facts };
}

describe("Lot 4E.2 — assemblage des 2 contrôles", () => {
  it("A — les deux contrôles concordants", () => {
    const result = reconcileHistoricalTaxPackageControls(
      pkg([fact028(150_000), fact496(150_000), fact030(42_000), fact576(42_000)]),
    );
    assert.equal(result.totalGross.status, "concordant");
    assert.equal(result.totalGross.kind, "total_gross");
    assert.equal(result.totalCumulativeDepreciation.status, "concordant");
    assert.equal(result.totalCumulativeDepreciation.kind, "total_cumulative_depreciation");
    assert.equal(result.packageId, "pkg-4e2");
  });

  it("B — gross conflict", () => {
    const result = reconcileHistoricalTaxPackageControls(
      pkg([fact028(150_000), fact496(147_000), fact030(42_000), fact576(42_000)]),
    );
    assert.equal(result.totalGross.status, "conflict");
    assert.equal(result.totalCumulativeDepreciation.status, "concordant");
  });

  it("C — depreciation conflict", () => {
    const result = reconcileHistoricalTaxPackageControls(
      pkg([fact028(150_000), fact496(150_000), fact030(42_000), fact576(40_000)]),
    );
    assert.equal(result.totalGross.status, "concordant");
    assert.equal(result.totalCumulativeDepreciation.status, "conflict");
  });

  it("D — 028 absent / 496 present → empty_side", () => {
    const result = reconcileHistoricalTaxPackageControls(pkg([fact496(150_000)]));
    assert.equal(result.totalGross.status, "not_comparable");
    assert.equal(result.totalGross.notComparableReason, "empty_side");
    assert.equal(result.totalGross.left.observations.length, 0);
    assert.equal(result.totalGross.right.observations.length, 1);
  });

  it("E — present(0) ↔ present(0) → concordant", () => {
    const result = reconcileHistoricalTaxPackageControls(pkg([fact028(0), fact496(0)]));
    assert.equal(result.totalGross.status, "concordant");
  });

  it("F — present(0) ↔ missing → not_comparable (jamais 0↔0 artificiel)", () => {
    const result = reconcileHistoricalTaxPackageControls(
      pkg([fact028(0), fact496("missing")]),
    );
    assert.equal(result.totalGross.status, "not_comparable");
    assert.equal(result.totalGross.notComparableReason, "missing_observation");
    assert.notEqual(result.totalGross.status, "concordant");
  });

  it("G — duplicate 028 identiques → toutes transmises + concordant", () => {
    const result = reconcileHistoricalTaxPackageControls(
      pkg([
        fact028(150_000, { documentId: "doc-1" }),
        fact028(150_000, { documentId: "doc-2" }),
        fact496(150_000),
      ]),
    );
    assert.equal(result.totalGross.status, "concordant");
    assert.equal(result.totalGross.left.observations.length, 2);
    const ids = result.totalGross.left.observations.map((o) => {
      assert.ok(isCandidatePresent(o.value));
      return o.value.provenance.documentId;
    });
    assert.deepEqual(ids, ["doc-1", "doc-2"]);
  });

  it("H — duplicate 028 divergentes → divergent_duplicates", () => {
    const result = reconcileHistoricalTaxPackageControls(
      pkg([
        fact028(150_000, { documentId: "doc-1" }),
        fact028(148_000, { documentId: "doc-2" }),
        fact496(150_000),
      ]),
    );
    assert.equal(result.totalGross.status, "not_comparable");
    assert.equal(result.totalGross.notComparableReason, "divergent_duplicates");
    assert.equal(result.totalGross.left.observations.length, 2);
  });

  it("I — duplicate 496 divergentes → symétrique", () => {
    const result = reconcileHistoricalTaxPackageControls(
      pkg([
        fact028(150_000),
        fact496(150_000, { documentId: "doc-c1" }),
        fact496(149_000, { documentId: "doc-c2" }),
      ]),
    );
    assert.equal(result.totalGross.status, "not_comparable");
    assert.equal(result.totalGross.notComparableReason, "divergent_duplicates");
    assert.equal(result.totalGross.right.observations.length, 2);
  });

  it("J — fiscalYear mismatch → fiscal_year_mismatch", () => {
    const result = reconcileHistoricalTaxPackageControls(
      pkg([
        fact028(150_000, { fiscalYear: 2025 }),
        fact496(150_000, { fiscalYear: 2024 }),
      ]),
    );
    assert.equal(result.totalGross.status, "not_comparable");
    assert.equal(result.totalGross.notComparableReason, "fiscal_year_mismatch");
  });

  it("K — mixed-year duplicates → fiscal_year_mismatch", () => {
    const result = reconcileHistoricalTaxPackageControls(
      pkg([
        fact028(150_000, { fiscalYear: 2025, documentId: "doc-25" }),
        fact028(150_000, { fiscalYear: 2024, documentId: "doc-24" }),
        fact496(150_000, { fiscalYear: 2025 }),
      ]),
    );
    assert.equal(result.totalGross.status, "not_comparable");
    assert.equal(result.totalGross.notComparableReason, "fiscal_year_mismatch");
    assert.equal(result.totalGross.left.observations.length, 2);
  });

  it("L — formYear différent / même fiscalYear → autorisé", () => {
    const result = reconcileHistoricalTaxPackageControls(
      pkg([
        fact028(150_000, { formYear: 2026, fiscalYear: 2025 }),
        fact496(150_000, { formYear: 2025, fiscalYear: 2025 }),
      ]),
    );
    assert.equal(result.totalGross.status, "concordant");
    assert.equal(result.totalGross.left.observations[0]!.formYear, 2026);
    assert.equal(result.totalGross.right.observations[0]!.formYear, 2025);
  });

  it("M — 426 / 476 présents → aucun effet sur les 2 contrôles", () => {
    const result = reconcileHistoricalTaxPackageControls(
      pkg([
        fact028(150_000),
        fact496(150_000),
        fact030(42_000),
        fact576(42_000),
        fact426(60_000),
        fact476(12_000),
      ]),
    );
    assert.equal(result.totalGross.status, "concordant");
    assert.equal(result.totalCumulativeDepreciation.status, "concordant");
    assert.equal(result.totalGross.left.observations.length, 1);
    assert.equal(result.totalGross.right.observations.length, 1);
    assert.equal(result.totalCumulativeDepreciation.left.observations.length, 1);
    assert.equal(result.totalCumulativeDepreciation.right.observations.length, 1);
  });

  it("N — package source inchangé après appel", () => {
    const facts = [
      fact028(150_000),
      fact496(150_000),
      fact030(42_000),
      fact576(42_000),
      fact426(60_000),
    ];
    const packageFacts = pkg(facts);
    const before = JSON.stringify({
      packageId: packageFacts.packageId,
      factsLen: packageFacts.facts.length,
      cases: packageFacts.facts.map((f) => f.sourceCase),
    });
    const factsRef = packageFacts.facts;
    reconcileHistoricalTaxPackageControls(packageFacts);
    assert.equal(packageFacts.facts, factsRef);
    assert.equal(packageFacts.facts.length, 5);
    assert.deepEqual(
      packageFacts.facts.map((f) => f.sourceCase),
      ["028", "496", "030", "576", "426"],
    );
    assert.equal(
      JSON.stringify({
        packageId: packageFacts.packageId,
        factsLen: packageFacts.facts.length,
        cases: packageFacts.facts.map((f) => f.sourceCase),
      }),
      before,
    );
  });
});

describe("Lot 4E.2 — protection mauvaise paire", () => {
  it("028=42000 + 576=42000 sans 496 → gross empty_side, jamais concordance 028↔576", () => {
    const result = reconcileHistoricalTaxPackageControls(
      pkg([fact028(42_000), fact576(42_000)]),
    );
    assert.equal(result.totalGross.status, "not_comparable");
    assert.equal(result.totalGross.notComparableReason, "empty_side");
    assert.equal(result.totalGross.left.sourceCase, "028");
    assert.equal(result.totalGross.right.sourceCase, "496");
    assert.equal(result.totalGross.right.observations.length, 0);
    assert.notEqual(result.totalGross.status, "concordant");

    assert.equal(result.totalCumulativeDepreciation.status, "not_comparable");
    assert.equal(result.totalCumulativeDepreciation.notComparableReason, "empty_side");
    assert.equal(result.totalCumulativeDepreciation.left.sourceCase, "030");
    assert.equal(result.totalCumulativeDepreciation.right.sourceCase, "576");
  });

  it("030 + 496 sans 576 → depreciation empty_side, jamais 030↔496", () => {
    const result = reconcileHistoricalTaxPackageControls(
      pkg([fact030(42_000), fact496(150_000)]),
    );
    assert.equal(result.totalCumulativeDepreciation.status, "not_comparable");
    assert.equal(result.totalCumulativeDepreciation.notComparableReason, "empty_side");
    assert.notEqual(result.totalCumulativeDepreciation.status, "concordant");
    assert.equal(result.totalGross.status, "not_comparable");
    assert.equal(result.totalGross.notComparableReason, "empty_side");
  });
});
