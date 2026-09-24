/**
 * Fallback stocks fiscaux de reprise : NON explicite ≠ « Je ne sais pas ».
 * Run: npx tsx --test src/lib/lmnp/services/takeover/fiscal-stock-fallback.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";

import { createConfidenceScore } from "@/lib/documents/types/confidence-score";
import { isAvailable } from "@/lib/lmnp/services/fiscal-year-opening";
import {
  appendClosure,
  buildFiscalYearClosure,
  resolveStocksOuverture,
} from "@/lib/lmnp/services/dossier/fiscal-year-cycle";
import type { FiscalYear } from "@/lib/lmnp/types/domain";
import {
  withArdAmountAnswer,
  withArdNoneAnswer,
  withArdUnknownAnswer,
  withAssetPropertyAnswer,
  withAssetProrataAnswer,
  withDeficitsNoneAnswer,
  withDeficitsRowsAnswer,
  withDeficitsUnknownAnswer,
} from "@/components/lmnp/validation-workflow/external-takeover/external-takeover-view-model";
import {
  isCandidatePresent,
  presentCandidate,
  type CandidateProvenance,
} from "./candidate-value";
import { assertNotCase318AmortStockSource } from "./fiscal-stocks-candidates";
import {
  emptyDocumentaryFiscalStocks,
  mergeTakeoverReviewAnswers,
} from "./merge-review-answers";
import { prepareExternalTakeover } from "./prepare-external-takeover";
import { explicitAnswer, type TakeoverReviewAnswers } from "./review-answers";
import {
  createTaxPackageControlFact,
  createTaxPackageControlFacts,
  type TaxPackageControlFactDraft,
} from "./tax-package-control-facts";

const FY = 2025;
const TARGET = 2026;
const FORM_YEAR = 2026;
const PROP = "prop-ref-01";
const NOW = "2026-01-15T00:00:00.000Z";

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
  const pkg = createTaxPackageControlFacts("pkg-stock-fallback", drafts.map(mustFact));
  assert.equal(pkg.status, "created");
  if (pkg.status !== "created") throw new Error("unreachable");
  return pkg.package;
}

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
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new File([new Uint8Array(buffer)], "stock-fallback-register.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

async function candidateKeys(): Promise<string[]> {
  const { extractDepreciationRegisterFromSpreadsheet } = await import(
    "./extract-depreciation-register-spreadsheet"
  );
  const register = await extractDepreciationRegisterFromSpreadsheet({
    file: referenceRegisterFile(),
    documentId: "doc-register",
    targetFiscalYear: TARGET,
  });
  assert.equal(register.status, "extracted");
  return register.candidates.map((candidate) => candidate.candidateKey);
}

function assetAnswers(keys: readonly string[]): TakeoverReviewAnswers {
  let answers: TakeoverReviewAnswers = {};
  for (const key of keys) {
    answers = withAssetPropertyAnswer(answers, key, PROP, NOW);
    answers = withAssetProrataAnswer(answers, key, "annuel_plein", NOW);
  }
  return answers;
}

function prepareWith(reviewAnswers: TakeoverReviewAnswers) {
  return prepareExternalTakeover({
    openingId: "opening-stock-fallback",
    dossierId: "dossier-stock-fallback",
    takeoverId: "takeover-stock-fallback",
    targetFiscalYear: TARGET,
    sourceFiscalYear: FY,
    formYear: FORM_YEAR,
    register: {
      role: "prior_depreciation_register",
      documentId: "doc-register",
      file: referenceRegisterFile(),
    },
    taxPackage: {
      role: "prior_tax_package",
      documentId: "doc-liasse",
      package: referenceLiassePackage(),
    },
    reviewAnswers,
    validatedAt: NOW,
    validator: "fiscal-stock-fallback",
  });
}

describe("merge — NON explicite ≠ inconnu", () => {
  it("déficits NON → present([]) avec provenance client", () => {
    const merged = mergeTakeoverReviewAnswers({
      assets: [],
      stocks: emptyDocumentaryFiscalStocks(),
      reviewAnswers: withDeficitsNoneAnswer(undefined, NOW),
    });
    assert.ok(isCandidatePresent(merged.stocks.deficits));
    assert.deepEqual(merged.stocks.deficits.value, []);
    assert.equal(merged.stocks.deficits.provenance.fieldSource, "user_correction");
    assert.equal(merged.stocks.deficits.provenance.documentId, "takeover-review-answers");
    assert.equal(merged.stocks.deficits.correction?.reason, "client_confirmed_no_remaining_deficit");
  });

  it("déficits UNKNOWN → missing, jamais []", () => {
    const merged = mergeTakeoverReviewAnswers({
      assets: [],
      stocks: emptyDocumentaryFiscalStocks(),
      reviewAnswers: withDeficitsUnknownAnswer(withDeficitsNoneAnswer(undefined, NOW)),
    });
    assert.equal(isCandidatePresent(merged.stocks.deficits), false);
    if (!isCandidatePresent(merged.stocks.deficits)) {
      assert.equal(merged.stocks.deficits.status, "missing");
    }
  });

  it("ARD NON → present(0) avec provenance client", () => {
    const merged = mergeTakeoverReviewAnswers({
      assets: [],
      stocks: emptyDocumentaryFiscalStocks(),
      reviewAnswers: withArdNoneAnswer(undefined, NOW),
    });
    assert.ok(isCandidatePresent(merged.stocks.amortissementsReportes));
    assert.equal(merged.stocks.amortissementsReportes.value, 0);
    assert.equal(merged.stocks.amortissementsReportes.provenance.fieldSource, "user_correction");
  });

  it("ARD UNKNOWN → missing, jamais 0", () => {
    const merged = mergeTakeoverReviewAnswers({
      assets: [],
      stocks: emptyDocumentaryFiscalStocks(),
      reviewAnswers: withArdUnknownAnswer(withArdNoneAnswer(undefined, NOW)),
    });
    assert.equal(isCandidatePresent(merged.stocks.amortissementsReportes), false);
  });

  it("YES → UNKNOWN retire la valeur précédente", () => {
    const yes = withDeficitsRowsAnswer(undefined, [{ millesime: 2021, montant: 800 }], NOW);
    const cleared = withDeficitsUnknownAnswer(yes);
    const merged = mergeTakeoverReviewAnswers({
      assets: [],
      stocks: emptyDocumentaryFiscalStocks(),
      reviewAnswers: cleared,
    });
    assert.equal(isCandidatePresent(merged.stocks.deficits), false);

    const ardYes = withArdUnknownAnswer(withArdAmountAnswer(undefined, 1200, NOW));
    const ardMerged = mergeTakeoverReviewAnswers({
      assets: [],
      stocks: emptyDocumentaryFiscalStocks(),
      reviewAnswers: ardYes,
    });
    assert.equal(isCandidatePresent(ardMerged.stocks.amortissementsReportes), false);
  });

  it("le rechargement JSON ne transforme pas UNKNOWN en NON", () => {
    const stored = JSON.parse(
      JSON.stringify(withArdUnknownAnswer(withDeficitsUnknownAnswer(withDeficitsNoneAnswer(withArdNoneAnswer(undefined, NOW), NOW)))),
    ) as TakeoverReviewAnswers;
    assert.equal(stored.deficits, undefined);
    assert.equal(stored.amortissementsReportes, undefined);
    const merged = mergeTakeoverReviewAnswers({
      assets: [],
      stocks: emptyDocumentaryFiscalStocks(),
      reviewAnswers: stored,
    });
    assert.equal(isCandidatePresent(merged.stocks.deficits), false);
    assert.equal(isCandidatePresent(merged.stocks.amortissementsReportes), false);
  });

  it("une valeur documentaire extraite reste distincte d'une déclaration client", () => {
    const documentary = {
      deficits: presentCandidate([{ millesime: 2020, montant: 100 }], "direct", taxProv("deficits")),
      amortissementsReportes: presentCandidate(40, "direct", taxProv("ard")),
      amortissementsReportesSource: "aide_document" as const,
    };
    const kept = mergeTakeoverReviewAnswers({
      assets: [],
      stocks: documentary,
      reviewAnswers: {},
    });
    assert.ok(isCandidatePresent(kept.stocks.deficits));
    assert.equal(kept.stocks.deficits.provenance.fieldSource, "extracted");
    assert.equal(kept.stocks.deficits.provenance.documentId, "doc-liasse");

    const declared = mergeTakeoverReviewAnswers({
      assets: [],
      stocks: emptyDocumentaryFiscalStocks(),
      reviewAnswers: {
        deficits: explicitAnswer([{ millesime: 2020, montant: 100 }], { answeredAt: NOW }),
      },
    });
    assert.ok(isCandidatePresent(declared.stocks.deficits));
    assert.equal(declared.stocks.deficits.provenance.fieldSource, "user_correction");
  });
});

describe("Opening — inconnu reste fail-closed", () => {
  it("déficits UNKNOWN ne construit pas l'Opening", async () => {
    const keys = await candidateKeys();
    const answers = withArdNoneAnswer(assetAnswers(keys), NOW);
    const result = await prepareWith(withDeficitsUnknownAnswer(answers));
    assert.notEqual(result.status, "built");
    assert.ok(result.exceptions.some((exception) => exception.code === "DEFICITS_REQUIRED"));
  });

  it("ARD UNKNOWN ne construit pas l'Opening", async () => {
    const keys = await candidateKeys();
    const answers = withDeficitsNoneAnswer(assetAnswers(keys), NOW);
    const result = await prepareWith(withArdUnknownAnswer(answers));
    assert.notEqual(result.status, "built");
    assert.ok(result.exceptions.some((exception) => exception.code === "ARD_REQUIRED"));
  });

  it("NON explicite des deux stocks autorise l'Opening et conserve la déclaration client", async () => {
    const keys = await candidateKeys();
    const answers = withArdNoneAnswer(withDeficitsNoneAnswer(assetAnswers(keys), NOW), NOW);
    const result = await prepareWith(answers);
    assert.equal(result.status, "built", JSON.stringify(result));
    if (result.status !== "built") return;
    assert.ok(isAvailable(result.opening.stocks.deficits));
    if (isAvailable(result.opening.stocks.deficits)) {
      assert.deepEqual(result.opening.stocks.deficits.value, []);
    }
    assert.ok(isAvailable(result.opening.stocks.amortissementsReportes));
    if (isAvailable(result.opening.stocks.amortissementsReportes)) {
      assert.equal(result.opening.stocks.amortissementsReportes.value, 0);
    }
    assert.match(
      result.opening.provenance["stocks.deficits"]?.note ?? "",
      /déclaration explicite du client/,
    );
    assert.equal(
      result.opening.provenance["stocks.deficits"]?.sourceRef,
      "takeover-review-answers",
    );
    assert.match(
      result.opening.provenance["stocks.amortissementsReportes"]?.note ?? "",
      /déclaration explicite du client/,
    );
    assert.equal(result.opening.provenance["stocks.deficits"]?.sourceKind, "external");
  });
});

describe("N+1 — stocks connus repris, inconnu non promu", () => {
  it("une clôture N alimente N+1 sans relire les réponses de reprise", () => {
    const known = {
      deficits: [{ millesime: 2024, montant: 600 }],
      amortissementsReportes: 250,
    };
    const closure = buildFiscalYearClosure({
      fiscalYearId: "fy-N",
      dossierId: "dossier-1",
      stocks: known,
      computedAt: NOW,
      now: NOW,
    });
    const previous = appendClosure(
      {
        id: "fy-N",
        year: 2025,
        status: "closed",
        regime: "reel",
        propertyIds: ["prop-1"],
        createdAt: NOW,
        updatedAt: NOW,
        dossierId: "dossier-1",
        closures: [],
        externalTakeoverReviewAnswers: withDeficitsUnknownAnswer(
          withArdUnknownAnswer(undefined),
        ),
      } as FiscalYear,
      closure,
    );
    const current: FiscalYear = {
      id: "fy-N1",
      year: 2026,
      status: "draft",
      regime: "reel",
      propertyIds: ["prop-1"],
      createdAt: NOW,
      updatedAt: NOW,
      dossierId: "dossier-1",
      previousFiscalYearId: "fy-N",
      closures: [],
    };
    const resolved = resolveStocksOuverture(current, previous);
    assert.equal(resolved.status, "available");
    if (resolved.status !== "available") return;
    assert.deepEqual(resolved.stocks, known);
  });

  it("sans clôture, N+1 ne fabrique pas un stock nul", () => {
    const previous: FiscalYear = {
      id: "fy-N",
      year: 2025,
      status: "collecting_documents",
      regime: "reel",
      propertyIds: ["prop-1"],
      createdAt: NOW,
      updatedAt: NOW,
      dossierId: "dossier-1",
      closures: [],
    };
    const current: FiscalYear = {
      id: "fy-N1",
      year: 2026,
      status: "draft",
      regime: "reel",
      propertyIds: ["prop-1"],
      createdAt: NOW,
      updatedAt: NOW,
      dossierId: "dossier-1",
      previousFiscalYearId: "fy-N",
      closures: [],
    };
    const resolved = resolveStocksOuverture(current, previous);
    assert.equal(resolved.status, "unavailable");
  });
});

describe("garde-fous documentaires inchangés", () => {
  it("la case 318 reste interdite comme stock d'amortissements reportés", () => {
    assert.throws(() => assertNotCase318AmortStockSource("cerfa_2033b_318"), /318/);
    const rejected = createTaxPackageControlFact({
      formType: "2033B",
      sourceCase: "318",
      kind: "total_gross",
      formYear: FORM_YEAR,
      fiscalYear: FY,
      periodPosition: "closing",
      value: presentCandidate(1_000, "direct", taxProv("2033B:318")),
    });
    assert.equal(rejected.status, "rejected");
  });

  it("le 2033-D ne peut pas alimenter un stock de déficits LMNP-IR", () => {
    const rejected = createTaxPackageControlFact({
      formType: "2033D",
      sourceCase: "350",
      kind: "total_gross",
      formYear: FORM_YEAR,
      fiscalYear: FY,
      periodPosition: "closing",
      value: presentCandidate(500, "direct", taxProv("2033D:350")),
    });
    assert.equal(rejected.status, "rejected");
    const stocks = emptyDocumentaryFiscalStocks();
    assert.equal(isCandidatePresent(stocks.deficits), false);
    assert.equal(isCandidatePresent(stocks.amortissementsReportes), false);
  });
});
