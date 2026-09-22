/**
 * Lot 4D.1 — contrat TaxPackageControlFact.
 * Run: npx tsx --test src/lib/lmnp/services/takeover/lot4d1-tax-package-control-facts.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

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
  createTaxPackageControlFact,
  createTaxPackageControlFacts,
  isTaxPackageControlFact,
  isV1TaxPackageControlCase,
  TAX_PACKAGE_CONTROL_V1_MATRIX,
  validateTaxPackageControlFact,
  type TaxPackageControlFact,
  type TaxPackageControlFactDraft,
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
    confidence: createConfidenceScore(0.92, ["fixture"]),
    evidence: { snippet: sourceRef, page: 1 },
    fieldSource: "extracted",
  };
}

function draft(
  partial: Partial<TaxPackageControlFactDraft> &
    Pick<TaxPackageControlFactDraft, "formType" | "sourceCase" | "kind">,
  amount?: number | "missing",
  documentId = "doc-liasse-a",
): TaxPackageControlFactDraft {
  const sourceCase = partial.sourceCase;
  const value =
    amount === "missing"
      ? missingCandidate("case absente du document", {
          documentId,
          documentRole: "prior_tax_package",
          sourceRef: `${partial.formType}:${sourceCase}`,
        })
      : presentCandidate(
          amount ?? 0,
          "direct",
          prov(documentId, `${partial.formType}:${sourceCase}`),
        );
  return {
    formYear: FORM_YEAR,
    fiscalYear: FY,
    periodPosition: "closing",
    value,
    ...partial,
  };
}

function mustCreate(d: TaxPackageControlFactDraft): TaxPackageControlFact {
  const result = createTaxPackageControlFact(d);
  assert.equal(result.status, "created", JSON.stringify(result));
  if (result.status !== "created") throw new Error("unreachable");
  return result.fact;
}

describe("Lot 4D.1 — observations séparées (028/496, 030/576)", () => {
  it("T1 — 028 et 496 même valeur → deux observations", () => {
    const pkg = createTaxPackageControlFacts("pkg-t1", [
      draft({ formType: "2033A", sourceCase: "028", kind: "total_gross" }, 150_000),
      draft({ formType: "2033C", sourceCase: "496", kind: "total_gross" }, 150_000),
    ]);
    assert.equal(pkg.status, "created");
    if (pkg.status === "created") {
      assert.equal(pkg.package.facts.length, 2);
      assert.equal(pkg.package.facts[0]!.sourceCase, "028");
      assert.equal(pkg.package.facts[1]!.sourceCase, "496");
      assert.ok(isCandidatePresent(pkg.package.facts[0]!.value));
      assert.ok(isCandidatePresent(pkg.package.facts[1]!.value));
      assert.equal(pkg.package.facts[0]!.value.value, 150_000);
      assert.equal(pkg.package.facts[1]!.value.value, 150_000);
    }
  });

  it("T2 — 028 et 496 valeurs différentes → deux observations", () => {
    const pkg = createTaxPackageControlFacts("pkg-t2", [
      draft({ formType: "2033A", sourceCase: "028", kind: "total_gross" }, 150_000),
      draft({ formType: "2033C", sourceCase: "496", kind: "total_gross" }, 149_980),
    ]);
    assert.equal(pkg.status, "created");
    if (pkg.status === "created") {
      assert.equal(pkg.package.facts.length, 2);
      assert.notEqual(
        isCandidatePresent(pkg.package.facts[0]!.value) && pkg.package.facts[0]!.value.value,
        isCandidatePresent(pkg.package.facts[1]!.value) && pkg.package.facts[1]!.value.value,
      );
    }
  });

  it("T3 — 030 et 576 même valeur → deux observations", () => {
    const pkg = createTaxPackageControlFacts("pkg-t3", [
      draft(
        { formType: "2033A", sourceCase: "030", kind: "total_cumulative_depreciation" },
        36_000,
      ),
      draft(
        { formType: "2033C", sourceCase: "576", kind: "total_cumulative_depreciation" },
        36_000,
      ),
    ]);
    assert.equal(pkg.status, "created");
    if (pkg.status === "created") assert.equal(pkg.package.facts.length, 2);
  });

  it("T4 — 030 et 576 différentes → deux observations", () => {
    const pkg = createTaxPackageControlFacts("pkg-t4", [
      draft(
        { formType: "2033A", sourceCase: "030", kind: "total_cumulative_depreciation" },
        36_000,
      ),
      draft(
        { formType: "2033C", sourceCase: "576", kind: "total_cumulative_depreciation" },
        37_000,
      ),
    ]);
    assert.equal(pkg.status, "created");
    if (pkg.status === "created") assert.equal(pkg.package.facts.length, 2);
  });
});

describe("Lot 4D.1 — zero / missing / décimales", () => {
  it("T5 — present(0) ≠ missing", () => {
    const zero = mustCreate(
      draft({ formType: "2033A", sourceCase: "030", kind: "total_cumulative_depreciation" }, 0),
    );
    const absent = mustCreate(
      draft({ formType: "2033A", sourceCase: "030", kind: "total_cumulative_depreciation" }, "missing"),
    );
    assert.ok(isCandidatePresent(zero.value));
    assert.equal(zero.value.value, 0);
    assert.ok(isCandidateAbsent(absent.value));
    assert.notEqual(zero.value.status, absent.value.status);
  });

  it("T6 — absence de case ≠ present(0)", () => {
    const pkg = createTaxPackageControlFacts("pkg-t6", [
      draft({ formType: "2033A", sourceCase: "028", kind: "total_gross" }, 150_000),
    ]);
    assert.equal(pkg.status, "created");
    if (pkg.status === "created") {
      assert.equal(pkg.package.facts.length, 1);
      assert.equal(
        pkg.package.facts.find((f) => f.sourceCase === "030"),
        undefined,
        "030 absente ≠ inventée à 0",
      );
    }
  });

  it("T17 — valeur décimale non arrondie", () => {
    const fact = mustCreate(
      draft({ formType: "2033C", sourceCase: "496", kind: "total_gross" }, 149_999.64),
    );
    assert.ok(isCandidatePresent(fact.value));
    assert.equal(fact.value.value, 149_999.64);
  });
});

describe("Lot 4D.1 — identité documentaire", () => {
  it("T7/T8/T9/T10/T11 — sourceCase, provenance, fiscalYear, formYear, closing", () => {
    const fact = mustCreate(
      draft({ formType: "2033A", sourceCase: "028", kind: "total_gross" }, 150_000, "doc-A"),
    );
    assert.equal(fact.sourceCase, "028");
    assert.equal(fact.formType, "2033A");
    assert.equal(fact.fiscalYear, FY);
    assert.equal(fact.formYear, FORM_YEAR);
    assert.equal(fact.periodPosition, "closing");
    assert.ok(isCandidatePresent(fact.value));
    assert.equal(fact.value.provenance.documentId, "doc-A");
    assert.equal(fact.value.provenance.documentRole, "prior_tax_package");
  });

  it("T15 — deux documents même case → deux observations", () => {
    const pkg = createTaxPackageControlFacts("pkg-t15", [
      draft({ formType: "2033C", sourceCase: "496", kind: "total_gross" }, 150_000, "doc-A"),
      draft({ formType: "2033C", sourceCase: "496", kind: "total_gross" }, 151_000, "doc-B"),
    ]);
    assert.equal(pkg.status, "created");
    if (pkg.status === "created") {
      assert.equal(pkg.package.facts.length, 2);
      assert.ok(isCandidatePresent(pkg.package.facts[0]!.value));
      assert.ok(isCandidatePresent(pkg.package.facts[1]!.value));
      assert.equal(pkg.package.facts[0]!.value.provenance.documentId, "doc-A");
      assert.equal(pkg.package.facts[1]!.value.provenance.documentId, "doc-B");
    }
  });

  it("T16 — package partiel valide (028+030 seuls ; liste vide)", () => {
    const partial = createTaxPackageControlFacts("pkg-partial", [
      draft({ formType: "2033A", sourceCase: "028", kind: "total_gross" }, 150_000),
      draft(
        { formType: "2033A", sourceCase: "030", kind: "total_cumulative_depreciation" },
        36_000,
      ),
    ]);
    assert.equal(partial.status, "created");
    const empty = createTaxPackageControlFacts("pkg-empty", []);
    assert.equal(empty.status, "created");
    if (empty.status === "created") assert.equal(empty.package.facts.length, 0);
  });
});

describe("Lot 4D.1 — refus structurels 570/490/318", () => {
  it("T12 — 570 ne peut pas être closing cumulative", () => {
    const result = createTaxPackageControlFact({
      formType: "2033C",
      sourceCase: "570",
      kind: "total_cumulative_depreciation",
      periodPosition: "closing",
      formYear: FORM_YEAR,
      fiscalYear: FY,
      value: presentCandidate(36_000, "direct", prov("doc", "2033C:570")),
    });
    assert.equal(result.status, "rejected");
    if (result.status === "rejected") {
      assert.ok(result.issues.some((i) => i.code === "CASE_NOT_IN_V1"));
    }
    assert.equal(isV1TaxPackageControlCase("570"), false);
  });

  it("T13 — 490 ne peut pas devenir total_gross closing", () => {
    const result = createTaxPackageControlFact({
      formType: "2033C",
      sourceCase: "490",
      kind: "total_gross",
      periodPosition: "closing",
      formYear: FORM_YEAR,
      fiscalYear: FY,
      value: presentCandidate(150_000, "direct", prov("doc", "2033C:490")),
    });
    assert.equal(result.status, "rejected");
  });

  it("T14 — 318 refusée", () => {
    const result = createTaxPackageControlFact({
      formType: "2033A",
      sourceCase: "318",
      kind: "total_cumulative_depreciation",
      periodPosition: "closing",
      formYear: FORM_YEAR,
      fiscalYear: FY,
      value: presentCandidate(3_720, "direct", prov("doc", "2033B:318")),
    });
    assert.equal(result.status, "rejected");
  });
});

describe("Lot 4D.1 — pas de tolérance / canonical / réconciliation", () => {
  it("T18 — confidence n'entraîne aucune canonicalisation", () => {
    const pkg = createTaxPackageControlFacts("pkg-t18", [
      draft({ formType: "2033A", sourceCase: "028", kind: "total_gross" }, 150_000),
      draft({ formType: "2033C", sourceCase: "496", kind: "total_gross" }, 150_000),
    ]);
    assert.equal(pkg.status, "created");
    if (pkg.status === "created") {
      assert.equal(pkg.package.facts.length, 2, "pas de fusion malgré même montant/confidence");
    }
  });

  it("T19/T20 — aucun champ tolerance ni canonicalValue", () => {
    const fact = mustCreate(
      draft({ formType: "2033A", sourceCase: "028", kind: "total_gross" }, 150_000),
    );
    assert.equal("tolerance" in fact, false);
    assert.equal("canonicalValue" in fact, false);
    assert.equal("reconciliationStatus" in fact, false);
    assert.equal("delta" in fact, false);
    for (const row of TAX_PACKAGE_CONTROL_V1_MATRIX) {
      assert.ok(row.sourceCase);
      assert.equal(row.periodPosition, "closing");
    }
  });

  it("T24 — correction trail / originalValue via CandidateValue", () => {
    const base = mustCreate(
      draft({ formType: "2033A", sourceCase: "028", kind: "total_gross" }, 150_000),
    );
    assert.ok(isCandidatePresent(base.value));
    const corrected = applyCandidateCorrection(base.value, 150_100, {
      correctedAt: "2026-09-22T00:00:00.000Z",
      correctedBy: "auditor",
      reason: "saisie manuelle",
    });
    const withCorrection = mustCreate({
      ...base,
      value: corrected,
    });
    assert.ok(isCandidatePresent(withCorrection.value));
    assert.equal(withCorrection.value.value, 150_100);
    assert.equal(withCorrection.value.originalValue, 150_000);
    assert.equal(withCorrection.value.reviewState, "corrected");
  });

  it("T25 — JSON préserve zero / missing / sourceCase", () => {
    const pkg = createTaxPackageControlFacts("pkg-json", [
      draft({ formType: "2033A", sourceCase: "030", kind: "total_cumulative_depreciation" }, 0),
      draft({ formType: "2033C", sourceCase: "576", kind: "total_cumulative_depreciation" }, "missing"),
    ]);
    assert.equal(pkg.status, "created");
    if (pkg.status === "created") {
      const roundtrip = JSON.parse(JSON.stringify(pkg.package)) as typeof pkg.package;
      assert.equal(roundtrip.facts[0]!.sourceCase, "030");
      assert.equal(roundtrip.facts[0]!.value.status, "present");
      assert.equal((roundtrip.facts[0]!.value as { value: number }).value, 0);
      assert.equal(roundtrip.facts[1]!.sourceCase, "576");
      assert.equal(roundtrip.facts[1]!.value.status, "missing");
    }
  });
});

describe("Lot 4D.1 — frontières architecturales", () => {
  it("T21/T22/T23 — pas d'Opening, Asset, parser", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(
      new URL("./tax-package-control-facts.ts", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(src, /from ["']@\/lib\/lmnp\/services\/fiscal-year-opening/);
    assert.doesNotMatch(src, /mapAcceptedCandidateAssetsToOpening/);
    assert.doesNotMatch(src, /from ["']\.\/asset-candidates/);
    assert.doesNotMatch(src, /from ["']@\/lib\/lmnp\/services\/pipelines/);
    assert.doesNotMatch(src, /from ["']@\/lib\/documents\/ocr/);
    assert.doesNotMatch(src, /from ["']xlsx["']/);
    assert.doesNotMatch(src, /readSpreadsheetGrid|extractDepreciation/);
    assert.doesNotMatch(src, /Math\.round\(/);
    assert.doesNotMatch(src, /resolvePriorHistoryEligibility/);
  });

  it("validate refuse combinaison opening + case V1 closing only", () => {
    const result = validateTaxPackageControlFact({
      formType: "2033A",
      sourceCase: "028",
      kind: "total_gross",
      periodPosition: "opening",
      formYear: FORM_YEAR,
      fiscalYear: FY,
      value: presentCandidate(150_000, "direct", prov("doc", "2033A:028")),
    });
    assert.equal(result.ok, false);
  });
});

describe("Lot 4D.1b — scellement anti-bypass", () => {
  it("TEST A — 572 est explicitement interdite", () => {
    const result = createTaxPackageControlFact({
      formType: "2033C",
      sourceCase: "572",
      kind: "total_cumulative_depreciation",
      periodPosition: "closing",
      formYear: FORM_YEAR,
      fiscalYear: FY,
      value: presentCandidate(3_720, "direct", prov("doc", "2033C:572")),
    });
    assert.equal(result.status, "rejected");
    if (result.status === "rejected") {
      assert.ok(result.issues.some((i) => i.code === "CASE_NOT_IN_V1"));
      assert.ok(result.issues.some((i) => i.message.includes("572")));
    }
  });

  it("TEST B — triplet V1 incohérent 576 + total_gross", () => {
    const result = createTaxPackageControlFact({
      formType: "2033C",
      sourceCase: "576",
      kind: "total_gross",
      periodPosition: "closing",
      formYear: FORM_YEAR,
      fiscalYear: FY,
      value: presentCandidate(36_000, "direct", prov("doc", "2033C:576")),
    });
    assert.equal(result.status, "rejected");
    if (result.status === "rejected") {
      assert.ok(result.issues.some((i) => i.code === "INCOHERENT_V1_TRIPLET"));
    }
  });

  it("TEST C — periodPosition opening refusée pour 496/total_gross", () => {
    const result = createTaxPackageControlFact({
      formType: "2033C",
      sourceCase: "496",
      kind: "total_gross",
      periodPosition: "opening",
      formYear: FORM_YEAR,
      fiscalYear: FY,
      value: presentCandidate(150_000, "direct", prov("doc", "2033C:496")),
    });
    assert.equal(result.status, "rejected");
    if (result.status === "rejected") {
      assert.ok(result.issues.some((i) => i.code === "INCOHERENT_V1_TRIPLET"));
    }
  });

  it("TEST D — literal hors factory : pas scellé ; factory seule voie runtime", () => {
    // Contre-audit 4D.1 : object literal « plausible » sans factory.
    // NOTE : le @ts-expect-error ci-dessous n'est PAS typechecké par `tsc`
    // (exclude **/*.test.ts). La garde compile-time automatisée est
    // tax-package-control-facts.brand-assignability.ts.
    const bypassLiteral = {
      kind: "total_gross" as const,
      formType: "2033C" as const,
      sourceCase: "576" as const,
      periodPosition: "closing" as const,
      formYear: FORM_YEAR,
      fiscalYear: FY,
      value: presentCandidate(36_000, "direct", prov("doc", "bypass")),
    };

    // @ts-expect-error — documentation locale uniquement (tsx ne typecheck pas)
    const typedBypass: TaxPackageControlFact = bypassLiteral;
    void typedBypass;

    assert.equal(
      isTaxPackageControlFact(bypassLiteral),
      false,
      "literal sans brand ≠ TaxPackageControlFact scellé",
    );

    // Même champs cohérents V1 : sans factory, toujours non scellé
    const coherentButUnsealed = {
      kind: "total_gross" as const,
      formType: "2033C" as const,
      sourceCase: "496" as const,
      periodPosition: "closing" as const,
      formYear: FORM_YEAR,
      fiscalYear: FY,
      value: presentCandidate(150_000, "direct", prov("doc", "unsealed")),
    };
    assert.equal(isTaxPackageControlFact(coherentButUnsealed), false);

    const sealed = mustCreate(
      draft({ formType: "2033C", sourceCase: "496", kind: "total_gross" }, 150_000),
    );
    assert.equal(isTaxPackageControlFact(sealed), true);

    // Cast TypeScript n'ajoute pas le sceau runtime
    const castOnly = coherentButUnsealed as unknown as TaxPackageControlFact;
    assert.equal(isTaxPackageControlFact(castOnly), false);
  });

  it("factory scelle ; surface publique ne réexporte pas le Symbol de brand", async () => {
    const mod = await import("./tax-package-control-facts");
    assert.equal(typeof mod.createTaxPackageControlFact, "function");
    assert.equal(typeof mod.validateTaxPackageControlFact, "function");
    assert.equal(typeof mod.isTaxPackageControlFact, "function");
    assert.equal(
      "TAX_PACKAGE_CONTROL_FACT_BRAND" in mod,
      false,
      "le Symbol de brand ne doit pas être une exportation publique de construction",
    );
  });
});

describe("Lot 4D.1c — bypass post-factory (spread / assign / mutation)", () => {
  it("TEST E — spread incohérent → isTaxPackageControlFact false", () => {
    const fact = mustCreate(
      draft({ formType: "2033A", sourceCase: "028", kind: "total_gross" }, 150_000),
    );
    assert.equal(isTaxPackageControlFact(fact), true);

    const forged = {
      ...fact,
      sourceCase: "576",
      kind: "total_gross",
    };
    assert.equal(isTaxPackageControlFact(forged), false);
  });

  it("TEST F — Object.assign incohérent → false", () => {
    const fact = mustCreate(
      draft({ formType: "2033A", sourceCase: "028", kind: "total_gross" }, 150_000),
    );
    const forged = Object.assign({}, fact, {
      sourceCase: "576",
      kind: "total_gross",
    });
    assert.equal(isTaxPackageControlFact(forged), false);
  });

  it("TEST G — case 572 via spread → false", () => {
    const fact = mustCreate(
      draft({ formType: "2033A", sourceCase: "028", kind: "total_gross" }, 150_000),
    );
    const forged = {
      ...fact,
      sourceCase: "572",
    };
    assert.equal(isTaxPackageControlFact(forged), false);
  });

  it("TEST H — factory fact intact → true", () => {
    const fact = mustCreate(
      draft({ formType: "2033A", sourceCase: "028", kind: "total_gross" }, 150_000),
    );
    assert.equal(isTaxPackageControlFact(fact), true);
  });

  it("TEST I — spread sans modification métier → true (brand + invariants revalidés)", () => {
    // Choix A documenté : spread fidèle conserve le brand ; revalidation V1 OK → true.
    // Un spread incohérent reste false (TEST E/G) — propriété obligatoire.
    const fact = mustCreate(
      draft({ formType: "2033C", sourceCase: "496", kind: "total_gross" }, 150_000),
    );
    const copy = { ...fact };
    assert.equal(isTaxPackageControlFact(copy), true);
  });

  it("TEST J — mutation post-factory impossible (Object.freeze)", () => {
    const fact = mustCreate(
      draft({ formType: "2033A", sourceCase: "028", kind: "total_gross" }, 150_000),
    );
    assert.equal(Object.isFrozen(fact), true);
    // Hors mode strict, l'assignation silencieuse échoue ; Reflect.set → false.
    assert.equal(Reflect.set(fact as object, "sourceCase", "576"), false);
    assert.equal(fact.sourceCase, "028");
    assert.equal(isTaxPackageControlFact(fact), true);
  });
});

describe("Lot 4D.1c — couverture valeurs / cases 426-476", () => {
  it("NaN rejeté", () => {
    const result = createTaxPackageControlFact({
      formType: "2033A",
      sourceCase: "028",
      kind: "total_gross",
      periodPosition: "closing",
      formYear: FORM_YEAR,
      fiscalYear: FY,
      value: presentCandidate(Number.NaN, "direct", prov("doc", "nan")),
    });
    assert.equal(result.status, "rejected");
    if (result.status === "rejected") {
      assert.ok(result.issues.some((i) => i.code === "NON_FINITE_VALUE"));
    }
  });

  it("Infinity rejeté", () => {
    const result = createTaxPackageControlFact({
      formType: "2033A",
      sourceCase: "028",
      kind: "total_gross",
      periodPosition: "closing",
      formYear: FORM_YEAR,
      fiscalYear: FY,
      value: presentCandidate(Number.POSITIVE_INFINITY, "direct", prov("doc", "inf")),
    });
    assert.equal(result.status, "rejected");
    if (result.status === "rejected") {
      assert.ok(result.issues.some((i) => i.code === "NON_FINITE_VALUE"));
    }
  });

  it("valeur négative rejetée", () => {
    const result = createTaxPackageControlFact({
      formType: "2033A",
      sourceCase: "028",
      kind: "total_gross",
      periodPosition: "closing",
      formYear: FORM_YEAR,
      fiscalYear: FY,
      value: presentCandidate(-1, "direct", prov("doc", "neg")),
    });
    assert.equal(result.status, "rejected");
    if (result.status === "rejected") {
      assert.ok(result.issues.some((i) => i.code === "NEGATIVE_VALUE"));
    }
  });

  it("426 accepté avec land_gross", () => {
    const fact = mustCreate(
      draft({ formType: "2033C", sourceCase: "426", kind: "land_gross" }, 60_000),
    );
    assert.equal(fact.sourceCase, "426");
    assert.equal(fact.kind, "land_gross");
    assert.equal(isTaxPackageControlFact(fact), true);
  });

  it("476 accepté avec furniture_gross", () => {
    const fact = mustCreate(
      draft({ formType: "2033C", sourceCase: "476", kind: "furniture_gross" }, 12_000),
    );
    assert.equal(fact.sourceCase, "476");
    assert.equal(fact.kind, "furniture_gross");
    assert.equal(isTaxPackageControlFact(fact), true);
  });
});
