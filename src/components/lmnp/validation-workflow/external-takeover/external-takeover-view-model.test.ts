/**
 * Lot 5.2 — view-model reprise externe (pur, sans DOM).
 * Run: npx tsx --test src/components/lmnp/validation-workflow/external-takeover/external-takeover-view-model.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { presentCandidate, missingCandidate } from "@/lib/lmnp/services/takeover/candidate-value";
import type { CandidateHistoricalAsset } from "@/lib/lmnp/services/takeover/asset-candidates";
import type { TakeoverException } from "@/lib/lmnp/services/takeover/exceptions";
import type { PrepareExternalTakeoverResult } from "@/lib/lmnp/services/takeover/prepare-external-takeover";
import { isExplicitAnswer } from "@/lib/lmnp/services/takeover/review-answers";
import {
  blankDeficitAmountDraft,
  buildAutoConfirmedRows,
  buildProgress,
  clientExceptionsFromResult,
  countOpenClientQuestions,
  hasBothTakeoverDocuments,
  hasExtractionFailure,
  hasManualReviewState,
  isExternalTakeoverComplete,
  parseDeficitAmountDrafts,
  parseExplicitArdAmount,
  toClientQuestions,
  withArdNoneAnswer,
  withArdUnknownAnswer,
  withAssetPropertyAnswer,
  withDeficitsNoneAnswer,
  withDeficitsRowsAnswer,
  withDeficitsUnknownAnswer,
} from "./external-takeover-view-model";
import { EXTERNAL_TAKEOVER_COPY } from "./external-takeover-copy";
import { resolvePriorHistoryCardView, PRIOR_HISTORY_COPY } from "../prior-history-card-view";
import { resolvePriorHistoryEligibility } from "@/lib/lmnp/services/declaration/prior-history-eligibility";
import { available, unavailable } from "@/lib/lmnp/services/fiscal-year-opening";
import type { FiscalYearOpening } from "@/lib/lmnp/services/fiscal-year-opening/types";

const NOW = "2026-01-15T00:00:00.000Z";

function asset(key: string, label: string, cout?: number, cumul?: number): CandidateHistoricalAsset {
  const prov = {
    documentId: "doc",
    documentRole: "depreciation_register" as const,
    fieldLabel: key,
    sourceRef: key,
    fieldSource: "extracted" as const,
  };
  return {
    candidateKey: key,
    label: presentCandidate(label, "direct", prov),
    coutBrut:
      cout === undefined ? missingCandidate() : presentCandidate(cout, "direct", prov),
    cumulOuverture:
      cumul === undefined ? missingCandidate() : presentCandidate(cumul, "direct", prov),
    startDate: missingCandidate(),
    durationYears: missingCandidate(),
    method: missingCandidate(),
    prorataConvention: missingCandidate(),
    classification: presentCandidate("batiment", "direct", prov),
    nonAmortizable: presentCandidate(false, "direct", prov),
    propertyId: missingCandidate(),
  };
}

function usableOpening(): FiscalYearOpening {
  return {
    openingId: "o1",
    revision: 1,
    targetFiscalYear: 2026,
    dossierId: "d",
    source: { kind: "external_takeover", takeoverId: "t", sourceFiscalYear: 2025 },
    stocks: {
      deficits: available([]),
      amortissementsReportes: available(0),
    },
    assets: available([]),
    loans: unavailable(),
    patrimoine: {
      ouvertureCompteExploitant: unavailable(),
      ran: unavailable(),
      tresorerieOuverture: unavailable(),
    },
    properties: unavailable(),
    identity: unavailable(),
    provenance: {},
    validation: {
      status: "validated",
      openingRevision: 1,
      contentHash: "h",
      validatedAt: NOW,
      validator: "test",
    },
  };
}

describe("Lot 5.2 — EXTERNAL_HISTORY n'est plus un hard-block", () => {
  it("EXTERNAL_HISTORY_DECLARED → external_takeover (plus « pas encore disponible »)", () => {
    const view = resolvePriorHistoryCardView(
      resolvePriorHistoryEligibility({
        priorHistoryDeclaration: { status: "EXTERNAL_HISTORY", declaredAt: NOW },
      }),
    );
    assert.equal(view.kind, "external_takeover");
    assert.doesNotMatch(PRIOR_HISTORY_COPY.blocked.EXTERNAL_HISTORY_DECLARED, /pas encore disponible/);
  });

  it("Opening validée → carte external_takeover (état terminé, pas questionnaire)", () => {
    const opening = usableOpening();
    const eligibility = resolvePriorHistoryEligibility(
      { priorHistoryDeclaration: { status: "EXTERNAL_HISTORY", declaredAt: NOW } },
      { fiscalYearOpening: opening, requestedFiscalYear: 2026 },
    );
    assert.equal(eligibility.eligible, true);
    assert.equal(resolvePriorHistoryCardView(eligibility).kind, "external_takeover");
    assert.equal(isExternalTakeoverComplete(opening), true);
  });
});

describe("Lot 5.2 — documents + auto-confirmés", () => {
  it("exige les deux documentIds", () => {
    assert.equal(hasBothTakeoverDocuments(undefined), false);
    assert.equal(
      hasBothTakeoverDocuments({ priorTaxPackageDocumentId: "a" }),
      false,
    );
    assert.equal(
      hasBothTakeoverDocuments({
        priorTaxPackageDocumentId: "a",
        priorDepreciationRegisterDocumentId: "b",
      }),
      true,
    );
  });

  it("auto-confirmés : uniquement valeurs présentes (jamais missing→0)", () => {
    const rows = buildAutoConfirmedRows([
      asset("a", "Immeuble", 120_000, 30_000),
      asset("b", "Sans montant"),
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.label, "Immeuble");
    assert.equal(rows[0]!.coutBrut, 120_000);
    assert.equal(rows[0]!.cumulOuverture, 30_000);
  });
});

describe("Lot 5.2 — exceptions → questions client uniquement", () => {
  const assets = [
    asset("cand-imm", "Immeuble", 120_000, 30_000),
    asset("cand-mob", "Mobilier", 12_000, 5_000),
  ];

  it("PROPERTY_MATCH_REQUIRED produit la question property (par asset)", () => {
    const exceptions: TakeoverException[] = [
      {
        code: "PROPERTY_MATCH_REQUIRED",
        message: "x",
        answerability: "client",
        candidateKey: "cand-imm",
      },
      {
        code: "PROPERTY_MATCH_REQUIRED",
        message: "y",
        answerability: "client",
        candidateKey: "cand-mob",
      },
    ];
    const questions = toClientQuestions(exceptions, assets);
    assert.equal(questions.length, 2);
    assert.ok(questions.every((q) => q.code === "PROPERTY_MATCH_REQUIRED"));
    assert.deepEqual(
      questions.map((q) => (q.code === "PROPERTY_MATCH_REQUIRED" ? q.candidateKey : "")),
      ["cand-imm", "cand-mob"],
    );
  });

  it("PRORATA_REQUIRED / DEFICITS / ARD", () => {
    const exceptions: TakeoverException[] = [
      {
        code: "PRORATA_REQUIRED",
        message: "p",
        answerability: "client",
        candidateKey: "cand-imm",
      },
      { code: "DEFICITS_REQUIRED", message: "d", answerability: "client" },
      { code: "ARD_REQUIRED", message: "a", answerability: "client" },
    ];
    const questions = toClientQuestions(exceptions, assets);
    assert.deepEqual(
      questions.map((q) => q.code),
      ["PRORATA_REQUIRED", "DEFICITS_REQUIRED", "ARD_REQUIRED"],
    );
  });

  it("conflict / manual_review : pas de question client, état review", () => {
    const blocked: PrepareExternalTakeoverResult = {
      status: "blocked",
      exceptions: [
        {
          code: "CONTROL_TOTAL_GROSS_CONFLICT",
          message: "conflict",
          answerability: "blocked",
        },
      ],
    };
    assert.equal(hasManualReviewState(blocked), true);
    assert.equal(clientExceptionsFromResult(blocked).length, 0);
    assert.equal(toClientQuestions(clientExceptionsFromResult(blocked), assets).length, 0);
  });

  it("DOCUMENT_EXTRACTION_FAILED → extraction failure", () => {
    const blocked: PrepareExternalTakeoverResult = {
      status: "blocked",
      exceptions: [
        {
          code: "DOCUMENT_EXTRACTION_FAILED",
          message: "fail",
          answerability: "blocked",
        },
      ],
    };
    assert.equal(hasExtractionFailure(blocked), true);
  });
});

describe("Lot 5.2 — zero vs unanswered + per-asset safety", () => {
  it("NON déficits → explicit [] ; NON ARD → explicit 0", () => {
    const deficits = withDeficitsNoneAnswer(undefined, NOW);
    assert.ok(isExplicitAnswer(deficits.deficits));
    assert.deepEqual(deficits.deficits.value, []);

    const ard = withArdNoneAnswer(undefined, NOW);
    assert.ok(isExplicitAnswer(ard.amortissementsReportes));
    assert.equal(ard.amortissementsReportes.value, 0);
  });

  it("unanswered reste distinct (pas de champ)", () => {
    const partial = withDeficitsNoneAnswer(undefined, NOW);
    assert.equal(partial.amortissementsReportes, undefined);
  });

  it("propertyId par candidateKey ne croise pas les assets", () => {
    let answers = withAssetPropertyAnswer(undefined, "cand-a", "prop-1", NOW);
    answers = withAssetPropertyAnswer(answers, "cand-b", "prop-2", NOW);
    assert.equal(answers.byCandidateKey?.["cand-a"]?.propertyId?.value, "prop-1");
    assert.equal(answers.byCandidateKey?.["cand-b"]?.propertyId?.value, "prop-2");
  });
});

describe("Lot 5.2 — progression + wording client", () => {
  it("progression documents → analyse → exceptions → reprise", () => {
    const steps = buildProgress({
      documentsReady: true,
      analyzing: false,
      hasResult: true,
      clientExceptionCount: 2,
      complete: false,
      labels: EXTERNAL_TAKEOVER_COPY.progress,
    });
    assert.equal(steps[0]!.done, true);
    assert.equal(steps[1]!.done, true);
    assert.match(steps[2]!.detail, /2 restantes/);
    assert.equal(steps[3]!.done, false);
  });

  it("copy sans jargon technique interdit", () => {
    const text = JSON.stringify(EXTERNAL_TAKEOVER_COPY);
    assert.doesNotMatch(text, /\b4E\b|\b4F\b|CandidateValue|Opening\b|ARD\b|stock fiscal|not_comparable|control fact/i);
    assert.match(text, /Je ne sais pas/);
    assert.match(text, /aucun déficit LMNP restant à reporter/);
    assert.match(text, /aucun amortissement non déduit restant à reporter/);
    assert.match(text, /encore nécessaire pour finaliser la reprise/);
  });

  it("UNKNOWN laisse la question ouverte : pas 0 restante, reprise non terminée", () => {
    const questions = toClientQuestions(
      [
        { code: "DEFICITS_REQUIRED", message: "d", answerability: "client" },
        { code: "ARD_REQUIRED", message: "a", answerability: "client" },
      ],
      [],
    );
    const count = countOpenClientQuestions(questions);
    assert.equal(count, 2);
    const steps = buildProgress({
      documentsReady: true,
      analyzing: false,
      hasResult: true,
      clientExceptionCount: count,
      complete: false,
      labels: EXTERNAL_TAKEOVER_COPY.progress,
    });
    assert.match(steps[2]!.detail, /2 restantes/);
    assert.doesNotMatch(steps[2]!.detail, /0 restante/);
    assert.equal(steps[2]!.done, false);
    assert.equal(steps[3]!.done, false);
    assert.equal(isExternalTakeoverComplete(undefined), false);
  });
});

describe("Stocks fiscaux — je ne sais pas", () => {
  it("NON reste une déclaration explicite", () => {
    const deficits = withDeficitsNoneAnswer(undefined, NOW);
    assert.deepEqual(deficits.deficits?.value, []);
    assert.equal(deficits.deficits?.reason, "client_confirmed_no_remaining_deficit");
    const ard = withArdNoneAnswer(undefined, NOW);
    assert.equal(ard.amortissementsReportes?.value, 0);
    assert.equal(
      ard.amortissementsReportes?.reason,
      "client_confirmed_no_remaining_undeducted_depreciation",
    );
  });

  it("UNKNOWN retire une déclaration précédente et survit au rechargement JSON", () => {
    const none = withArdNoneAnswer(withDeficitsNoneAnswer(undefined, NOW), NOW);
    const unknown = withArdUnknownAnswer(withDeficitsUnknownAnswer(none));
    assert.equal("deficits" in unknown, false);
    assert.equal("amortissementsReportes" in unknown, false);
    const reloaded = JSON.parse(JSON.stringify(unknown)) as typeof unknown;
    assert.equal(reloaded.deficits, undefined);
    assert.equal(reloaded.amortissementsReportes, undefined);
    assert.equal(isExplicitAnswer(reloaded.deficits), false);
    assert.equal(isExplicitAnswer(reloaded.amortissementsReportes), false);
  });

  it("NO → UNKNOWN retire le zéro, YES → UNKNOWN retire la valeur, UNKNOWN → NO la réécrit", () => {
    const noThenUnknown = withDeficitsUnknownAnswer(withDeficitsNoneAnswer(undefined, NOW));
    assert.equal(noThenUnknown.deficits, undefined);
    const yesThenUnknown = withDeficitsUnknownAnswer(
      withDeficitsRowsAnswer(undefined, [{ millesime: 2022, montant: 400 }], NOW),
    );
    assert.equal(yesThenUnknown.deficits, undefined);
    const unknownThenNo = withDeficitsNoneAnswer(yesThenUnknown, NOW);
    assert.deepEqual(unknownThenNo.deficits?.value, []);

    const ardNoThenUnknown = withArdUnknownAnswer(withArdNoneAnswer(undefined, NOW));
    assert.equal(ardNoThenUnknown.amortissementsReportes, undefined);
    assert.equal(ardNoThenUnknown.amortissementsReportesSource, undefined);
  });

  it("une ligne de déficit vide n'est pas un zéro, un 0 saisi reste conscient", () => {
    assert.equal(parseDeficitAmountDrafts([blankDeficitAmountDraft(2024)]), null);
    assert.equal(parseExplicitArdAmount(""), null);
    assert.equal(parseExplicitArdAmount("   "), null);
    assert.deepEqual(parseDeficitAmountDrafts([{ millesime: "2024", montant: "0" }]), [
      { millesime: 2024, montant: 0 },
    ]);
    assert.deepEqual(parseDeficitAmountDrafts([{ millesime: "2022", montant: "1500" }]), [
      { millesime: 2022, montant: 1500 },
    ]);
    assert.equal(parseExplicitArdAmount("250"), 250);
  });
});
