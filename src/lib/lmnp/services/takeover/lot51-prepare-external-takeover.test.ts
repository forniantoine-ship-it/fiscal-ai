/**
 * Lot 5.1 — persistence + orchestration External Takeover.
 * Run: npx tsx --test src/lib/lmnp/services/takeover/lot51-prepare-external-takeover.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";

import { createConfidenceScore } from "@/lib/documents/types/confidence-score";
import { isAvailable } from "@/lib/lmnp/services/fiscal-year-opening";
import type { FiscalYear } from "@/lib/lmnp/types/domain";
import { isCandidatePresent } from "./candidate-value";
import { presentCandidate, type CandidateProvenance } from "./candidate-value";
import {
  createTaxPackageControlFact,
  createTaxPackageControlFacts,
  type TaxPackageControlFactDraft,
} from "./tax-package-control-facts";
import { explicitAnswer, type TakeoverReviewAnswers } from "./review-answers";
import { mergeTakeoverReviewAnswers, emptyDocumentaryFiscalStocks } from "./merge-review-answers";
import { prepareExternalTakeover } from "./prepare-external-takeover";
import {
  persistExternalTakeoverOpening,
  persistExternalTakeoverReviewAnswers,
} from "./persist-external-takeover-opening";
import { missingCandidate } from "./candidate-value";
import type { CandidateHistoricalAsset } from "./asset-candidates";

const FY = 2025;
const TARGET = 2026;
const FORM_YEAR = 2026;
const PROP = "prop-ref-01";

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

function mustFact(draft: TaxPackageControlFactDraft) {
  const created = createTaxPackageControlFact(draft);
  assert.equal(created.status, "created", JSON.stringify(created));
  if (created.status !== "created") throw new Error("unreachable");
  return created.fact;
}

function referenceLiassePackage() {
  const drafts: TaxPackageControlFactDraft[] = (
    [
      ["2033A", "028", "total_gross", 132_000],
      ["2033C", "496", "total_gross", 132_000],
      ["2033A", "030", "total_cumulative_depreciation", 35_000],
      ["2033C", "576", "total_cumulative_depreciation", 35_000],
    ] as const
  ).map(([formType, sourceCase, kind, amount]) => ({
    formType,
    sourceCase,
    kind,
    formYear: FORM_YEAR,
    fiscalYear: FY,
    periodPosition: "closing" as const,
    value: presentCandidate(amount, "direct", taxProv(`${formType}:${sourceCase}`)),
  }));

  const facts = drafts.map(mustFact);
  const pkg = createTaxPackageControlFacts("pkg-5.1-ref", facts);
  assert.equal(pkg.status, "created");
  if (pkg.status !== "created") throw new Error("unreachable");
  return pkg.package;
}

function workbookToFile(wb: XLSX.WorkBook, fileName: string): File {
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new File([new Uint8Array(buffer)], fileName, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Registre référence : immeuble 120k/30k + mobilier 12k/5k. */
function referenceRegisterFile(): File {
  const rows: (string | number)[][] = [
    [
      "N° immobilisation",
      "Libellé",
      "Valeur brute",
      "Amortissements antérieurs",
      "Date mise en service",
      "Durée",
      "Méthode",
      "Catégorie",
    ],
    ["SRC-IMM-01", "Immeuble", 120_000, 30_000, "15/03/2020", 40, "Linéaire", "batiment"],
    ["SRC-MOB-01", "Mobilier", 12_000, 5_000, "15/03/2020", 10, "Linéaire", "mobilier"],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Registre");
  return workbookToFile(wb, "lot51-reference-register.xlsx");
}

function baseInput(overrides: {
  reviewAnswers?: TakeoverReviewAnswers;
  register?: Parameters<typeof prepareExternalTakeover>[0]["register"];
} = {}) {
  return {
    openingId: "opening-5.1",
    dossierId: "dossier-5.1",
    takeoverId: "takeover-5.1",
    targetFiscalYear: TARGET,
    sourceFiscalYear: FY,
    formYear: FORM_YEAR,
    register: overrides.register ?? {
      role: "prior_depreciation_register" as const,
      documentId: "doc-register",
      file: referenceRegisterFile(),
    },
    taxPackage: {
      role: "prior_tax_package" as const,
      documentId: "doc-liasse",
      package: referenceLiassePackage(),
    },
    reviewAnswers: overrides.reviewAnswers,
    validatedAt: "2026-01-15T10:00:00.000Z",
    validator: "lot51-test",
  };
}

function fullReviewAnswers(candidateKeys: string[]): TakeoverReviewAnswers {
  const byCandidateKey: NonNullable<TakeoverReviewAnswers["byCandidateKey"]> = {};
  for (const key of candidateKeys) {
    byCandidateKey[key] = {
      propertyId: explicitAnswer(PROP, { answeredAt: "2026-01-10T00:00:00.000Z" }),
      prorataConvention: explicitAnswer("annuel_plein", {
        answeredAt: "2026-01-10T00:00:00.000Z",
      }),
    };
  }
  return {
    byCandidateKey,
    deficits: explicitAnswer([], { answeredAt: "2026-01-10T00:00:00.000Z" }),
    amortissementsReportes: explicitAnswer(0, {
      answeredAt: "2026-01-10T00:00:00.000Z",
    }),
    amortissementsReportesSource: "manual_entry",
  };
}

function baseFiscalYear(overrides: Partial<FiscalYear> = {}): FiscalYear {
  return {
    id: "fy-2026",
    year: TARGET,
    status: "collecting_documents",
    regime: "reel",
    propertyIds: [PROP],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    dossierId: "dossier-5.1",
    ...overrides,
  };
}

describe("Lot 5.1 — merge review answers semantics", () => {
  it("unanswered ne remplace pas ; [] / 0 explicites restent [] / 0", () => {
    const stocks = emptyDocumentaryFiscalStocks();
    assert.ok(!isCandidatePresent(stocks.deficits));
    assert.ok(!isCandidatePresent(stocks.amortissementsReportes));

    const unanswered = mergeTakeoverReviewAnswers({
      assets: [],
      stocks,
      reviewAnswers: {},
    });
    assert.ok(!isCandidatePresent(unanswered.stocks.deficits));
    assert.ok(!isCandidatePresent(unanswered.stocks.amortissementsReportes));

    const zeroed = mergeTakeoverReviewAnswers({
      assets: [],
      stocks,
      reviewAnswers: {
        deficits: explicitAnswer([]),
        amortissementsReportes: explicitAnswer(0),
        amortissementsReportesSource: "manual_entry",
      },
    });
    assert.ok(isCandidatePresent(zeroed.stocks.deficits));
    assert.deepEqual(zeroed.stocks.deficits.value, []);
    assert.ok(isCandidatePresent(zeroed.stocks.amortissementsReportes));
    assert.equal(zeroed.stocks.amortissementsReportes.value, 0);
  });

  it("propertyId mapping est par candidateKey (pas de singlePropertyId global)", () => {
    const asset = (key: string): CandidateHistoricalAsset => ({
      candidateKey: key,
      label: presentCandidate(key, "direct", taxProv("label")),
      coutBrut: presentCandidate(1, "direct", taxProv("cout")),
      cumulOuverture: presentCandidate(0, "direct", taxProv("cumul")),
      startDate: missingCandidate(),
      durationYears: missingCandidate(),
      method: missingCandidate(),
      prorataConvention: missingCandidate(),
      classification: presentCandidate("mobilier", "direct", taxProv("class")),
      nonAmortizable: presentCandidate(false, "direct", taxProv("na")),
      propertyId: missingCandidate("unknown"),
    });

    const merged = mergeTakeoverReviewAnswers({
      assets: [asset("a"), asset("b")],
      stocks: emptyDocumentaryFiscalStocks(),
      reviewAnswers: {
        byCandidateKey: {
          a: { propertyId: explicitAnswer("prop-a") },
        },
      },
    });

    assert.ok(isCandidatePresent(merged.assets[0]!.propertyId));
    assert.equal(merged.assets[0]!.propertyId.value, "prop-a");
    assert.ok(!isCandidatePresent(merged.assets[1]!.propertyId));
  });
});

describe("Lot 5.1 — reference case orchestration", () => {
  it("run 1 sans review answers → incomplete (pas de built Opening)", async () => {
    const result = await prepareExternalTakeover(baseInput());

    assert.notEqual(result.status, "built");
    assert.equal(result.status, "incomplete");
    if (result.status !== "incomplete") return;

    const codes = new Set(result.exceptions.map((e) => e.code));
    assert.ok(codes.has("PROPERTY_MATCH_REQUIRED"));
    assert.ok(codes.has("PRORATA_REQUIRED"));
    assert.ok(codes.has("DEFICITS_REQUIRED"));
    assert.ok(codes.has("ARD_REQUIRED"));

    assert.ok(result.controls);
    assert.equal(result.controls!.totalGross.status, "concordant");
    assert.equal(result.controls!.totalCumulativeDepreciation.status, "concordant");
  });

  it("run 2 avec answers explicites → built validated external_takeover", async () => {
    const first = await prepareExternalTakeover(baseInput());
    assert.equal(first.status, "incomplete");

    const { extractDepreciationRegisterFromSpreadsheet } = await import(
      "./extract-depreciation-register-spreadsheet"
    );
    const register = await extractDepreciationRegisterFromSpreadsheet({
      file: referenceRegisterFile(),
      documentId: "doc-register",
      targetFiscalYear: TARGET,
    });
    assert.equal(register.status, "extracted");
    assert.equal(register.candidates.length, 2);
    const exactKeys = register.candidates.map((c) => c.candidateKey);

    // Reprise : mêmes documents + answers — sans persister les candidates.
    const result = await prepareExternalTakeover(
      baseInput({ reviewAnswers: fullReviewAnswers(exactKeys) }),
    );

    assert.equal(result.status, "built", JSON.stringify(result));
    if (result.status !== "built") return;

    assert.equal(result.opening.validation.status, "validated");
    assert.equal(result.opening.source.kind, "external_takeover");
    assert.equal(result.controls.totalGross.status, "concordant");
    assert.equal(result.controls.totalCumulativeDepreciation.status, "concordant");

    assert.ok(isAvailable(result.opening.assets));
    const assets = result.opening.assets.value;
    assert.equal(assets.length, 2);

    const byCumul = new Map(
      assets.map((a) => [
        isAvailable(a.cumulOuverture) ? a.cumulOuverture.value : -1,
        a,
      ]),
    );
    const c30 = byCumul.get(30_000);
    const c5 = byCumul.get(5_000);
    assert.ok(c30, "C0 immeuble 30000");
    assert.ok(c5, "C0 mobilier 5000");
    assert.ok(isAvailable(c30!.cumulOuverture));
    assert.equal(c30!.cumulOuverture.value, 30_000);
    assert.ok(isAvailable(c5!.cumulOuverture));
    assert.equal(c5!.cumulOuverture.value, 5_000);

    assert.ok(isAvailable(result.opening.stocks.deficits));
    assert.deepEqual(result.opening.stocks.deficits.value, []);
    assert.ok(isAvailable(result.opening.stocks.amortissementsReportes));
    assert.equal(result.opening.stocks.amortissementsReportes.value, 0);
  });

  it("interruption / reprise : answers partielles puis complètes sans candidates persistées", async () => {
    const register = await (
      await import("./extract-depreciation-register-spreadsheet")
    ).extractDepreciationRegisterFromSpreadsheet({
      file: referenceRegisterFile(),
      documentId: "doc-register",
      targetFiscalYear: TARGET,
    });
    const keys = register.candidates.map((c) => c.candidateKey);

    const partial: TakeoverReviewAnswers = {
      byCandidateKey: {
        [keys[0]!]: {
          propertyId: explicitAnswer(PROP),
          prorataConvention: explicitAnswer("annuel_plein"),
        },
      },
      deficits: explicitAnswer([]),
      // ARD unanswered
    };

    let fy = persistExternalTakeoverReviewAnswers({
      fiscalYear: baseFiscalYear(),
      reviewAnswers: partial,
      updatedAt: "2026-01-11T00:00:00.000Z",
    });
    assert.ok(fy.externalTakeoverReviewAnswers);

    const run1 = await prepareExternalTakeover(
      baseInput({ reviewAnswers: fy.externalTakeoverReviewAnswers }),
    );
    assert.equal(run1.status, "incomplete");
    if (run1.status !== "incomplete") return;
    assert.ok(run1.exceptions.some((e) => e.code === "ARD_REQUIRED"));
    assert.ok(
      run1.exceptions.some(
        (e) => e.code === "PROPERTY_MATCH_REQUIRED" && e.candidateKey === keys[1],
      ),
    );

    const complete = fullReviewAnswers(keys);
    fy = persistExternalTakeoverReviewAnswers({
      fiscalYear: fy,
      reviewAnswers: complete,
      updatedAt: "2026-01-12T00:00:00.000Z",
    });

    const run2 = await prepareExternalTakeover(
      baseInput({ reviewAnswers: fy.externalTakeoverReviewAnswers }),
    );
    assert.equal(run2.status, "built");
    if (run2.status !== "built") return;

    const persisted = persistExternalTakeoverOpening({
      fiscalYear: fy,
      opening: run2.opening,
      sourceRef: "takeover-5.1",
      updatedAt: "2026-01-12T01:00:00.000Z",
    });
    assert.equal(persisted.status, "persisted");
    if (persisted.status !== "persisted") return;
    assert.equal(
      persisted.fiscalYear.externalTakeoverOpening?.opening.validation.status,
      "validated",
    );
  });
});

describe("Lot 5.1 — final opening write guard", () => {
  it("refuse pending / non usable Opening", () => {
    const fy = baseFiscalYear();
    const refused = persistExternalTakeoverOpening({
      fiscalYear: fy,
      opening: {
        openingId: "x",
        revision: 1,
        targetFiscalYear: TARGET,
        dossierId: "d",
        source: {
          kind: "external_takeover",
          takeoverId: "t",
          sourceFiscalYear: FY,
        },
        stocks: {
          deficits: { status: "available", value: [] },
          amortissementsReportes: { status: "available", value: 0 },
        },
        assets: { status: "unavailable", reason: "n/a" },
        loans: { status: "unavailable", reason: "n/a" },
        patrimoine: {
          ouvertureCompteExploitant: { status: "unavailable", reason: "n/a" },
          ran: { status: "unavailable", reason: "n/a" },
          tresorerieOuverture: { status: "unavailable", reason: "n/a" },
        },
        properties: { status: "unavailable", reason: "n/a" },
        identity: { status: "unavailable", reason: "n/a" },
        provenance: {},
        validation: { status: "pending" },
      },
      sourceRef: "t",
    });
    assert.equal(refused.status, "refused");
    assert.equal(refused.status === "refused" && refused.code, "OPENING_NOT_USABLE");
  });
});
