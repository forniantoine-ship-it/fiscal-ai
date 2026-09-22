/**
 * Lot 5.2 — persistence reducer + answers (sans DOM).
 * Env Supabase factice avant imports dynamiques (même pattern que prior-history-persistence).
 *
 * Run: npx tsx --test src/components/lmnp/validation-workflow/external-takeover/lot52-external-takeover-ui.test.ts
 */

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";

import { before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { available, unavailable } from "@/lib/lmnp/services/fiscal-year-opening";
import type { FiscalYearOpening } from "@/lib/lmnp/services/fiscal-year-opening/types";
import {
  withArdNoneAnswer,
  withDeficitsNoneAnswer,
  withAssetPropertyAnswer,
} from "./external-takeover-view-model";
import { isExplicitAnswer } from "@/lib/lmnp/services/takeover/review-answers";

const NOW = "2026-01-15T00:00:00.000Z";

type Mods = {
  reducer: typeof import("@/lib/lmnp/store/reducer");
  persistence: typeof import("@/lib/lmnp/store/persistence");
  takeover: typeof import("@/lib/lmnp/services/takeover");
};
let m: Mods;

before(async () => {
  m = {
    reducer: await import("@/lib/lmnp/store/reducer"),
    persistence: await import("@/lib/lmnp/store/persistence"),
    takeover: await import("@/lib/lmnp/services/takeover"),
  };
});

function state() {
  return { ...m.persistence.createDefaultWorkspace(), fileRegistry: new Map() };
}

function usableOpening(year: number): FiscalYearOpening {
  return {
    openingId: "o1",
    revision: 1,
    targetFiscalYear: year,
    dossierId: "d",
    source: { kind: "external_takeover", takeoverId: "t", sourceFiscalYear: year - 1 },
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

describe("Lot 5.2 — reducer persistence documents / answers / opening", () => {
  it("SET_EXTERNAL_TAKEOVER_DOCUMENTS conserve les deux rôles", () => {
    let s = state();
    s = m.reducer.lmnpReducer(s, {
      type: "SET_EXTERNAL_TAKEOVER_DOCUMENTS",
      documents: { priorTaxPackageDocumentId: "doc-liasse" },
    });
    s = m.reducer.lmnpReducer(s, {
      type: "SET_EXTERNAL_TAKEOVER_DOCUMENTS",
      documents: { priorDepreciationRegisterDocumentId: "doc-register" },
    });
    assert.equal(s.fiscalYear.externalTakeoverDocuments?.priorTaxPackageDocumentId, "doc-liasse");
    assert.equal(
      s.fiscalYear.externalTakeoverDocuments?.priorDepreciationRegisterDocumentId,
      "doc-register",
    );
  });

  it("answer → persistence → answers explicites conservées", () => {
    let s = state();
    const answers = withAssetPropertyAnswer(
      withDeficitsNoneAnswer(withArdNoneAnswer(undefined, NOW), NOW),
      "cand-a",
      "prop-1",
      NOW,
    );
    const nextFy = m.takeover.persistExternalTakeoverReviewAnswers({
      fiscalYear: s.fiscalYear,
      reviewAnswers: answers,
      updatedAt: NOW,
    });
    s = m.reducer.lmnpReducer(s, {
      type: "SET_EXTERNAL_TAKEOVER_REVIEW_ANSWERS",
      reviewAnswers: nextFy.externalTakeoverReviewAnswers!,
    });
    assert.ok(isExplicitAnswer(s.fiscalYear.externalTakeoverReviewAnswers?.deficits));
    assert.deepEqual(s.fiscalYear.externalTakeoverReviewAnswers?.deficits?.value, []);
    assert.ok(isExplicitAnswer(s.fiscalYear.externalTakeoverReviewAnswers?.amortissementsReportes));
    assert.equal(s.fiscalYear.externalTakeoverReviewAnswers?.amortissementsReportes?.value, 0);
    assert.equal(
      s.fiscalYear.externalTakeoverReviewAnswers?.byCandidateKey?.["cand-a"]?.propertyId?.value,
      "prop-1",
    );
  });

  it("built Opening persistée sur FiscalYear", () => {
    let s = state();
    const opening = usableOpening(s.fiscalYear.year);
    const persisted = m.takeover.persistExternalTakeoverOpening({
      fiscalYear: s.fiscalYear,
      opening,
      sourceRef: "takeover-1",
      updatedAt: NOW,
    });
    assert.equal(persisted.status, "persisted");
    if (persisted.status !== "persisted") return;
    s = m.reducer.lmnpReducer(s, {
      type: "SET_EXTERNAL_TAKEOVER_OPENING",
      opening: persisted.fiscalYear.externalTakeoverOpening!,
    });
    assert.equal(s.fiscalYear.externalTakeoverOpening?.opening.validation.status, "validated");
    assert.equal(s.fiscalYear.externalTakeoverOpening?.sourceRef, "takeover-1");
  });

  it("refuse Opening pending via persistExternalTakeoverOpening", () => {
    const s = state();
    const pending = usableOpening(s.fiscalYear.year);
    pending.validation = { status: "pending" };
    const refused = m.takeover.persistExternalTakeoverOpening({
      fiscalYear: s.fiscalYear,
      opening: pending,
      sourceRef: "t",
    });
    assert.equal(refused.status, "refused");
  });
});
