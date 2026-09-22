/**
 * Lot 4E.1 — contrat minimal de rapprochement historique.
 * Run: npx tsx --test src/lib/lmnp/services/takeover/lot4e1-historical-control-reconciliation.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createConfidenceScore } from "@/lib/documents/types/confidence-score";
import {
  documentAbsentCandidate,
  extractionImpossibleCandidate,
  isCandidatePresent,
  missingCandidate,
  presentCandidate,
  type CandidateProvenance,
} from "./candidate-value";
import {
  createHistoricalControlReconciliation,
  HISTORICAL_CONTROL_RECONCILIATION_V1_PAIRS,
  isHistoricalControlReconciliationResult,
} from "./historical-control-reconciliation";
import {
  createTaxPackageControlFact,
  type TaxPackageControlFact,
  type TaxPackageControlFactDraft,
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
    confidence: createConfidenceScore(0.92, ["fixture"]),
    evidence: { snippet: sourceRef, page },
    fieldSource: "extracted",
  };
}

function mustCreate(draft: TaxPackageControlFactDraft): TaxPackageControlFact {
  const result = createTaxPackageControlFact(draft);
  assert.equal(result.status, "created", JSON.stringify(result));
  if (result.status !== "created") throw new Error("unreachable");
  return result.fact;
}

function fact028(
  amount: number | "missing" | "extraction_impossible" | "document_absent",
  options?: { documentId?: string; fiscalYear?: number; formYear?: number; page?: number },
): TaxPackageControlFact {
  const documentId = options?.documentId ?? "doc-a";
  const sourceRef = "2033A:028";
  const value =
    amount === "missing"
      ? missingCandidate("case absente", {
          documentId,
          documentRole: "prior_tax_package",
          sourceRef,
        })
      : amount === "extraction_impossible"
        ? extractionImpossibleCandidate("illisible", {
            documentId,
            documentRole: "prior_tax_package",
            sourceRef,
          })
        : amount === "document_absent"
          ? documentAbsentCandidate("formulaire absent", {
              documentId,
              documentRole: "prior_tax_package",
              sourceRef,
            })
          : presentCandidate(amount, "direct", prov(documentId, sourceRef, options?.page));
  return mustCreate({
    kind: "total_gross",
    formType: "2033A",
    sourceCase: "028",
    formYear: options?.formYear ?? FORM_YEAR,
    fiscalYear: options?.fiscalYear ?? FY,
    periodPosition: "closing",
    value,
  });
}

function fact496(
  amount: number | "missing" | "extraction_impossible" | "document_absent",
  options?: { documentId?: string; fiscalYear?: number; formYear?: number; page?: number },
): TaxPackageControlFact {
  const documentId = options?.documentId ?? "doc-c";
  const sourceRef = "2033C:496";
  const value =
    amount === "missing"
      ? missingCandidate("case absente", {
          documentId,
          documentRole: "prior_tax_package",
          sourceRef,
        })
      : amount === "extraction_impossible"
        ? extractionImpossibleCandidate("illisible", {
            documentId,
            documentRole: "prior_tax_package",
            sourceRef,
          })
        : amount === "document_absent"
          ? documentAbsentCandidate("formulaire absent", {
              documentId,
              documentRole: "prior_tax_package",
              sourceRef,
            })
          : presentCandidate(amount, "direct", prov(documentId, sourceRef, options?.page));
  return mustCreate({
    kind: "total_gross",
    formType: "2033C",
    sourceCase: "496",
    formYear: options?.formYear ?? FORM_YEAR,
    fiscalYear: options?.fiscalYear ?? FY,
    periodPosition: "closing",
    value,
  });
}

function mustReconcile(
  left: readonly TaxPackageControlFact[],
  right: readonly TaxPackageControlFact[],
  kind: "total_gross" | "total_cumulative_depreciation" = "total_gross",
) {
  const created = createHistoricalControlReconciliation({ kind, left, right });
  assert.equal(created.status, "created", JSON.stringify(created));
  if (created.status !== "created") throw new Error("unreachable");
  return created.result;
}

describe("Lot 4E.1 — matrice V1", () => {
  it("expose uniquement 028↔496 et 030↔576", () => {
    assert.equal(HISTORICAL_CONTROL_RECONCILIATION_V1_PAIRS.total_gross.left.sourceCase, "028");
    assert.equal(HISTORICAL_CONTROL_RECONCILIATION_V1_PAIRS.total_gross.right.sourceCase, "496");
    assert.equal(
      HISTORICAL_CONTROL_RECONCILIATION_V1_PAIRS.total_cumulative_depreciation.left.sourceCase,
      "030",
    );
    assert.equal(
      HISTORICAL_CONTROL_RECONCILIATION_V1_PAIRS.total_cumulative_depreciation.right.sourceCase,
      "576",
    );
  });
});

describe("Lot 4E.1 — sémantique A–K", () => {
  it("A — concordance exacte 150000 ↔ 150000", () => {
    const result = mustReconcile([fact028(150_000)], [fact496(150_000)]);
    assert.equal(result.status, "concordant");
    assert.equal(result.fiscalYear, FY);
    assert.equal(result.notComparableReason, undefined);
    assert.equal(result.left.observations.length, 1);
    assert.equal(result.right.observations.length, 1);
    assert.equal("canonicalValue" in result, false);
    assert.ok(isHistoricalControlReconciliationResult(result));
  });

  it("B — conflit 150000 ↔ 147000 (aucune résolution)", () => {
    const result = mustReconcile([fact028(150_000)], [fact496(147_000)]);
    assert.equal(result.status, "conflict");
    assert.equal(result.fiscalYear, FY);
    assert.equal(result.notComparableReason, undefined);
    const left = result.left.observations[0]!.value;
    const right = result.right.observations[0]!.value;
    assert.ok(isCandidatePresent(left));
    assert.ok(isCandidatePresent(right));
    assert.equal(left.value, 150_000);
    assert.equal(right.value, 147_000);
    assert.equal("resolvedValue" in result, false);
    assert.equal("tolerance" in result, false);
  });

  it("C — present ↔ missing → not_comparable (pas conflict)", () => {
    const result = mustReconcile([fact028(150_000)], [fact496("missing")]);
    assert.equal(result.status, "not_comparable");
    assert.equal(result.notComparableReason, "missing_observation");
    assert.notEqual(result.status, "conflict");
  });

  it("D — extraction_impossible d'un côté → pas faux conflict", () => {
    const result = mustReconcile(
      [fact028(150_000)],
      [fact496("extraction_impossible")],
    );
    assert.equal(result.status, "not_comparable");
    assert.equal(result.notComparableReason, "extraction_impossible");
  });

  it("E — document_absent d'un côté → pas faux conflict", () => {
    const result = mustReconcile([fact028(150_000)], [fact496("document_absent")]);
    assert.equal(result.status, "not_comparable");
    assert.equal(result.notComparableReason, "document_absent");
  });

  it("F — duplicates identiques → concordance + preuves conservées", () => {
    const result = mustReconcile(
      [
        fact028(150_000, { documentId: "doc-1", page: 1 }),
        fact028(150_000, { documentId: "doc-2", page: 2 }),
      ],
      [fact496(150_000, { documentId: "doc-c" })],
    );
    assert.equal(result.status, "concordant");
    assert.equal(result.left.observations.length, 2);
    const ids = result.left.observations.map((o) => {
      assert.ok(isCandidatePresent(o.value));
      return o.value.provenance.documentId;
    });
    assert.deepEqual(ids, ["doc-1", "doc-2"]);
    assert.equal(result.left.observations[0]!.value.provenance.evidence?.page, 1);
    assert.equal(result.left.observations[1]!.value.provenance.evidence?.page, 2);
  });

  it("G — duplicates divergents → not_comparable, aucune sélection", () => {
    const result = mustReconcile(
      [
        fact028(150_000, { documentId: "doc-1" }),
        fact028(148_000, { documentId: "doc-2" }),
      ],
      [fact496(150_000)],
    );
    assert.equal(result.status, "not_comparable");
    assert.equal(result.notComparableReason, "divergent_duplicates");
    assert.equal(result.left.observations.length, 2);
    const amounts = result.left.observations.map((o) => {
      assert.ok(isCandidatePresent(o.value));
      return o.value.value;
    });
    assert.deepEqual(amounts, [150_000, 148_000]);
    assert.notEqual(result.status, "conflict");
    assert.notEqual(result.status, "concordant");
  });

  it("H — fiscalYear différent → jamais comparable", () => {
    const result = mustReconcile(
      [fact028(150_000, { fiscalYear: 2025 })],
      [fact496(150_000, { fiscalYear: 2024 })],
    );
    assert.equal(result.status, "not_comparable");
    assert.equal(result.notComparableReason, "fiscal_year_mismatch");
    assert.equal(result.fiscalYear, null);
  });

  it("I — formYear différent / fiscalYear identique → comparable", () => {
    const result = mustReconcile(
      [fact028(150_000, { formYear: 2026, fiscalYear: 2025 })],
      [fact496(150_000, { formYear: 2025, fiscalYear: 2025 })],
    );
    assert.equal(result.status, "concordant");
    assert.equal(result.fiscalYear, 2025);
    assert.equal(result.left.observations[0]!.formYear, 2026);
    assert.equal(result.right.observations[0]!.formYear, 2025);
  });

  it("J — present(0) ↔ present(0) → vraie concordance", () => {
    const result = mustReconcile([fact028(0)], [fact496(0)]);
    assert.equal(result.status, "concordant");
    const left = result.left.observations[0]!.value;
    const right = result.right.observations[0]!.value;
    assert.ok(isCandidatePresent(left));
    assert.ok(isCandidatePresent(right));
    assert.equal(left.value, 0);
    assert.equal(right.value, 0);
  });

  it("K — present(0) ↔ missing → not_comparable, pas concordance", () => {
    const result = mustReconcile([fact028(0)], [fact496("missing")]);
    assert.equal(result.status, "not_comparable");
    assert.equal(result.notComparableReason, "missing_observation");
    assert.notEqual(result.status, "concordant");
  });
});

describe("Lot 4E.1 — preuves / 4F readiness / garde-fous", () => {
  it("préserve documentId, sourceCase, formType, formYear, fiscalYear, page", () => {
    const result = mustReconcile(
      [fact028(150_000, { documentId: "liasse-a", page: 1, formYear: 2026 })],
      [fact496(150_000, { documentId: "liasse-c", page: 3, formYear: 2026 })],
    );
    const l = result.left.observations[0]!;
    const r = result.right.observations[0]!;
    assert.equal(l.sourceCase, "028");
    assert.equal(r.sourceCase, "496");
    assert.equal(l.formType, "2033A");
    assert.equal(r.formType, "2033C");
    assert.equal(l.fiscalYear, FY);
    assert.equal(r.fiscalYear, FY);
    assert.ok(isCandidatePresent(l.value));
    assert.ok(isCandidatePresent(r.value));
    assert.equal(l.value.provenance.documentId, "liasse-a");
    assert.equal(r.value.provenance.documentId, "liasse-c");
    assert.equal(l.value.provenance.evidence?.page, 1);
    assert.equal(r.value.provenance.evidence?.page, 3);
  });

  it("refuse un côté avec mauvaise case", () => {
    const created = createHistoricalControlReconciliation({
      kind: "total_gross",
      left: [fact496(150_000)],
      right: [fact496(150_000)],
    });
    assert.equal(created.status, "rejected");
  });

  it("isHistoricalControlReconciliationResult rejette un faux conflict", () => {
    const honest = mustReconcile([fact028(150_000)], [fact496("missing")]);
    const forged = {
      ...honest,
      status: "conflict" as const,
      notComparableReason: undefined,
    };
    assert.equal(isHistoricalControlReconciliationResult(forged), false);
  });

  it("côté vide → not_comparable empty_side", () => {
    const result = mustReconcile([], [fact496(150_000)]);
    assert.equal(result.status, "not_comparable");
    assert.equal(result.notComparableReason, "empty_side");
  });
});
