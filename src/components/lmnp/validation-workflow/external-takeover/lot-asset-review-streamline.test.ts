/**
 * Lot takeover UX — classification suggestions + property bulk confirmation.
 * Run: npx tsx --test \
 *   src/lib/lmnp/services/takeover/suggest-register-asset-classification.test.ts \
 *   src/components/lmnp/validation-workflow/external-takeover/lot-asset-review-streamline.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  isCandidateAbsent,
  isCandidatePresent,
  missingCandidate,
  presentCandidate,
} from "@/lib/lmnp/services/takeover/candidate-value";
import type { CandidateHistoricalAsset } from "@/lib/lmnp/services/takeover/asset-candidates";
import type { TakeoverException } from "@/lib/lmnp/services/takeover/exceptions";
import { mergeTakeoverReviewAnswers } from "@/lib/lmnp/services/takeover/merge-review-answers";
import { suggestRegisterAssetClassification } from "@/lib/lmnp/services/takeover/suggest-register-asset-classification";
import { isExplicitAnswer } from "@/lib/lmnp/services/takeover/review-answers";
import type { Property } from "@/lib/lmnp/types";
import {
  countOpenClientQuestions,
  toClientQuestions,
  withAssetClassificationAnswer,
  withBulkClassificationAnswer,
  withBulkPropertyAnswer,
  withClassificationSuggestionsDeclined,
  withPropertyBulkDeclined,
} from "@/components/lmnp/validation-workflow/external-takeover/external-takeover-view-model";
import { CLASSIFICATION_OPTIONS } from "@/components/lmnp/validation-workflow/external-takeover/external-takeover-copy";

const NOW = "2026-01-15T00:00:00.000Z";
const DOC = "doc-register";

function prov(field: string) {
  return {
    documentId: DOC,
    documentRole: "depreciation_register" as const,
    fieldLabel: field,
    sourceRef: field,
    fieldSource: "extracted" as const,
  };
}

function asset(params: {
  key: string;
  label: string;
  classification?: "present" | "missing";
  propertyId?: "present" | "missing";
  cumul?: number | "missing";
}): CandidateHistoricalAsset {
  return {
    candidateKey: params.key,
    label: presentCandidate(params.label, "direct", prov("label")),
    coutBrut: presentCandidate(1000, "direct", prov("cout")),
    cumulOuverture:
      params.cumul === "missing" || params.cumul === undefined
        ? missingCandidate("cumul missing")
        : presentCandidate(params.cumul, "direct", prov("cumul")),
    startDate: presentCandidate("2020-01-01", "direct", prov("start")),
    durationYears: presentCandidate(5, "direct", prov("dur")),
    method: presentCandidate("lineaire", "direct", prov("method")),
    prorataConvention: missingCandidate("prorata"),
    classification:
      params.classification === "present"
        ? presentCandidate("mobilier", "direct", prov("class"))
        : missingCandidate("classification absente — non déduite du libellé"),
    nonAmortizable: missingCandidate("na"),
    propertyId:
      params.propertyId === "present"
        ? presentCandidate("prop-1", "direct", prov("prop"))
        : missingCandidate("propertyId non assigné — aucun fallback mono-bien"),
  };
}

function propertyExceptions(keys: string[]): TakeoverException[] {
  return keys.map((candidateKey) => ({
    code: "PROPERTY_MATCH_REQUIRED",
    message: "x",
    answerability: "client" as const,
    candidateKey,
  }));
}

function classificationExceptions(keys: string[]): TakeoverException[] {
  return keys.map((candidateKey) => ({
    code: "CLASSIFICATION_REQUIRED",
    message: "x",
    answerability: "client" as const,
    candidateKey,
  }));
}

const PROP_A: Property = {
  id: "prop-a",
  label: "Studio Nantes",
  address: "1 rue Test",
  city: "Nantes",
  postalCode: "44000",
};

const PROP_B: Property = {
  id: "prop-b",
  label: "Appart Lyon",
  address: "2 rue Test",
  city: "Lyon",
  postalCode: "69000",
};

describe("suggestRegisterAssetClassification — fail closed", () => {
  it("D — libellé exact mobilier → proposition", () => {
    const s = suggestRegisterAssetClassification("Mobilier");
    assert.ok(s);
    assert.equal(s!.classification, "mobilier");
    assert.equal(s!.proof, "exact_label");
  });

  it("D — canapé (keyword existant) → mobilier", () => {
    const s = suggestRegisterAssetClassification("Canapé d'angle gris");
    assert.ok(s);
    assert.equal(s!.classification, "mobilier");
    assert.equal(s!.proof, "keyword_label");
  });

  it("E — libellé ambigu → UNKNOWN", () => {
    assert.equal(suggestRegisterAssetClassification("Installation"), null);
    assert.equal(suggestRegisterAssetClassification("Matériel"), null);
    assert.equal(suggestRegisterAssetClassification("Divers"), null);
    assert.equal(suggestRegisterAssetClassification("Agencement"), null);
    assert.equal(suggestRegisterAssetClassification("MacBook Pro"), null);
    assert.equal(suggestRegisterAssetClassification("Teletower telescopique Jefco"), null);
  });

  it("G — contradiction terrain+mobilier dans le libellé → UNKNOWN", () => {
    assert.equal(suggestRegisterAssetClassification("Terrain et mobilier inclus"), null);
  });
});

describe("Property bulk confirmation", () => {
  const assets = [
    asset({ key: "a1", label: "Immeuble", classification: "missing", propertyId: "missing" }),
    asset({ key: "a2", label: "Mobilier salon", classification: "missing", propertyId: "missing" }),
    asset({ key: "a3", label: "Lit", classification: "missing", propertyId: "missing" }),
  ];
  const keys = assets.map((a) => a.candidateKey);

  it("A — mono-bien + plusieurs actifs → 1 PROPERTY_BULK_CONFIRM", () => {
    const questions = toClientQuestions(propertyExceptions(keys), assets, {
      properties: [PROP_A],
    });
    assert.equal(questions.length, 1);
    assert.equal(questions[0]!.code, "PROPERTY_BULK_CONFIRM");
    if (questions[0]!.code !== "PROPERTY_BULK_CONFIRM") return;
    assert.equal(questions[0].assetCount, 3);
    assert.equal(questions[0].propertyId, "prop-a");
  });

  it("A — YES bulk → N réponses par candidateKey (pas de singlePropertyId global)", () => {
    const answers = withBulkPropertyAnswer(undefined, keys, "prop-a", NOW);
    assert.equal(answers.byCandidateKey?.a1?.propertyId?.value, "prop-a");
    assert.equal(answers.byCandidateKey?.a2?.propertyId?.value, "prop-a");
    assert.equal(answers.byCandidateKey?.a3?.propertyId?.value, "prop-a");
    assert.equal(answers.byCandidateKey?.a1?.propertyId?.reason, "bulk_property_confirmation");

    const merged = mergeTakeoverReviewAnswers({
      assets,
      stocks: {
        deficits: missingCandidate(),
        amortissementsReportes: missingCandidate(),
      },
      reviewAnswers: answers,
    });
    assert.ok(merged.assets.every((a) => isCandidatePresent(a.propertyId)));
    assert.ok(merged.assets.every((a) => isCandidatePresent(a.propertyId) && a.propertyId.value === "prop-a"));
  });

  it("B — refuse bulk → questions individuelles conservées", () => {
    const declined = withPropertyBulkDeclined(undefined, NOW);
    const questions = toClientQuestions(propertyExceptions(keys), assets, {
      properties: [PROP_A],
      reviewAnswers: declined,
    });
    assert.equal(questions.length, 3);
    assert.ok(questions.every((q) => q.code === "PROPERTY_MATCH_REQUIRED"));
  });

  it("C — multi-bien → aucune affectation globale silencieuse", () => {
    const questions = toClientQuestions(propertyExceptions(keys), assets, {
      properties: [PROP_A, PROP_B],
    });
    assert.equal(questions.length, 3);
    assert.ok(questions.every((q) => q.code === "PROPERTY_MATCH_REQUIRED"));
    assert.equal(
      questions.some((q) => q.code === "PROPERTY_BULK_CONFIRM"),
      false,
    );
  });

  it("I — confirmation déjà donnée ne redemande pas (exceptions absentes)", () => {
    const answers = withBulkPropertyAnswer(undefined, keys, "prop-a", NOW);
    const questions = toClientQuestions([], assets, {
      properties: [PROP_A],
      reviewAnswers: answers,
    });
    assert.equal(questions.filter((q) => q.code === "PROPERTY_BULK_CONFIRM").length, 0);
    assert.equal(questions.filter((q) => q.code === "PROPERTY_MATCH_REQUIRED").length, 0);
  });
});

describe("Classification compact review", () => {
  it("A — 1 actif → 1 CLASSIFICATION_COMPACT_REVIEW avec 1 ligne", () => {
    const assets = [asset({ key: "u1", label: "MacBook Pro", classification: "missing" })];
    const questions = toClientQuestions(classificationExceptions(["u1"]), assets);
    assert.equal(questions.length, 1);
    assert.equal(questions[0]!.code, "CLASSIFICATION_COMPACT_REVIEW");
    if (questions[0]!.code !== "CLASSIFICATION_COMPACT_REVIEW") return;
    assert.equal(questions[0].items.length, 1);
    assert.equal(questions[0].items[0]!.suggested, undefined);
  });

  it("suggestions dans la section compacte ; unknown sans pré-sélection", () => {
    const assets = [
      asset({ key: "m1", label: "Canapé convertible", classification: "missing" }),
      asset({ key: "m2", label: "Lit double", classification: "missing" }),
      asset({ key: "u1", label: "MacBook Pro", classification: "missing" }),
      asset({ key: "u2", label: "Matériel", classification: "missing" }),
    ];
    const questions = toClientQuestions(
      classificationExceptions(assets.map((a) => a.candidateKey)),
      assets,
    );
    assert.equal(questions.length, 1);
    assert.equal(questions[0]!.code, "CLASSIFICATION_COMPACT_REVIEW");
    if (questions[0]!.code !== "CLASSIFICATION_COMPACT_REVIEW") return;
    assert.equal(questions[0].items.length, 4);
    const suggested = questions[0].items.filter((i) => i.suggested);
    const unknown = questions[0].items.filter((i) => !i.suggested);
    assert.equal(suggested.length, 2);
    assert.ok(suggested.every((i) => i.suggested === "mobilier"));
    assert.equal(unknown.length, 2);
    assert.equal(countOpenClientQuestions(questions), 4);
  });

  it("H — suggestion non confirmée ne devient pas present sur le candidate", () => {
    const assets = [
      asset({ key: "m1", label: "Canapé", classification: "missing" }),
    ];
    toClientQuestions(classificationExceptions(["m1"]), assets);
    assert.ok(isCandidateAbsent(assets[0]!.classification));
  });

  it("confirm bulk classification → explicit answers par clé", () => {
    const answers = withBulkClassificationAnswer(
      undefined,
      [
        { candidateKey: "m1", classification: "mobilier" },
        { candidateKey: "m2", classification: "mobilier" },
      ],
      NOW,
    );
    assert.equal(answers.byCandidateKey?.m1?.classification?.value, "mobilier");
    assert.equal(
      answers.byCandidateKey?.m1?.classification?.reason,
      "bulk_classification_confirmation",
    );
    assert.ok(isExplicitAnswer(answers.byCandidateKey?.m1?.classification));
  });

  it("F — modification manuelle gagne sur une suggestion confirmable", () => {
    const answers = withAssetClassificationAnswer(
      undefined,
      "m1",
      "autre",
      NOW,
      "per_asset_classification",
    );
    assert.equal(answers.byCandidateKey?.m1?.classification?.value, "autre");
    assert.equal(answers.byCandidateKey?.m1?.classification?.reason, "per_asset_classification");
  });

  it("G — réponses partielles persistent dans byCandidateKey", () => {
    let answers = withAssetClassificationAnswer(undefined, "a1", "mobilier", NOW);
    answers = withAssetClassificationAnswer(answers, "a2", "autre", NOW);
    assert.equal(answers.byCandidateKey?.a1?.classification?.value, "mobilier");
    assert.equal(answers.byCandidateKey?.a2?.classification?.value, "autre");
    assert.equal(answers.byCandidateKey?.a3?.classification, undefined);
  });

  it("decline suggestions → compact sans badge proposé", () => {
    const assets = [
      asset({ key: "m1", label: "Canapé", classification: "missing" }),
      asset({ key: "m2", label: "Lit", classification: "missing" }),
    ];
    const declined = withClassificationSuggestionsDeclined(undefined, NOW);
    const questions = toClientQuestions(
      classificationExceptions(["m1", "m2"]),
      assets,
      { reviewAnswers: declined },
    );
    assert.equal(questions.length, 1);
    assert.equal(questions[0]!.code, "CLASSIFICATION_COMPACT_REVIEW");
    if (questions[0]!.code !== "CLASSIFICATION_COMPACT_REVIEW") return;
    assert.equal(questions[0].items.length, 2);
    assert.ok(questions[0].items.every((i) => i.suggested === undefined));
  });

  it("D — options copy : placeholder À vérifier, pas de pré-sélection domaine", () => {
    assert.ok(CLASSIFICATION_OPTIONS.every((o) => o.value !== ("" as never)));
    assert.equal(
      CLASSIFICATION_OPTIONS.some((o) => o.label.toLowerCase() === "à vérifier"),
      false,
    );
  });

  it("I — merge de toutes les classifications → plus d'exception CLASSIFICATION_REQUIRED côté questions", () => {
    const assets = [
      asset({ key: "a1", label: "MacBook", classification: "missing" }),
      asset({ key: "a2", label: "Ponceuse", classification: "missing" }),
    ];
    const answers = withBulkClassificationAnswer(
      undefined,
      [
        { candidateKey: "a1", classification: "autre" },
        { candidateKey: "a2", classification: "autre" },
      ],
      NOW,
    );
    const merged = mergeTakeoverReviewAnswers({
      assets,
      stocks: {
        deficits: missingCandidate(),
        amortissementsReportes: missingCandidate(),
      },
      reviewAnswers: answers,
    });
    assert.ok(merged.assets.every((a) => isCandidatePresent(a.classification)));
    // Sans exceptions classification → pas de section compacte
    const questions = toClientQuestions([], merged.assets);
    assert.equal(
      questions.filter((q) => q.code === "CLASSIFICATION_COMPACT_REVIEW").length,
      0,
    );
  });

  it("C — 50 actifs → une seule section compacte structurellement", () => {
    const assets = Array.from({ length: 50 }, (_, i) =>
      asset({ key: `k${i}`, label: `Actif ${i}`, classification: "missing" }),
    );
    const questions = toClientQuestions(
      classificationExceptions(assets.map((a) => a.candidateKey)),
      assets,
    );
    assert.equal(questions.length, 1);
    assert.equal(questions[0]!.code, "CLASSIFICATION_COMPACT_REVIEW");
    if (questions[0]!.code !== "CLASSIFICATION_COMPACT_REVIEW") return;
    assert.equal(questions[0].items.length, 50);
    assert.equal(countOpenClientQuestions(questions), 50);
  });
});

describe("GEFFROY oracle — mesures questions (sans hardcode métier)", () => {
  // Transcription des 22 candidats GEFFROY (hors sortie B71200) — labels réels.
  const GEFFROY_LABELS: Array<{ key: string; label: string; cumul: number | "missing" }> = [
    { key: "B70500", label: "Teletower telescopique Jefco", cumul: 1292.81 },
    { key: "B80400", label: "JEFCO ponceuse", cumul: "missing" },
    { key: "B80700", label: "LA PLATEFORME karcher novipro", cumul: 470.81 },
    { key: "B81100", label: "ZOLPAN echaffaudage", cumul: 919.37 },
    { key: "B90100", label: "ZOLPAN graco pisto", cumul: 1182.88 },
    { key: "B91100", label: "ZOLPAN planex lhs 225", cumul: 894.35 },
    { key: "C01000", label: "Défonceuse OF 1010 EBQ-Plus", cumul: 249.29 },
    { key: "C01001", label: "Fraiseuse Df 500 Q set DOMINO", cumul: 387.21 },
    { key: "C01100", label: "Scie semi stationnaire CS 50 E", cumul: 367.16 },
    { key: "C01101", label: "Table mobile de sciage", cumul: 356.47 },
    { key: "C11200", label: "Lève plaque de platre", cumul: 129.02 },
    { key: "C20700", label: "scie à onglets", cumul: 61.45 },
    { key: "C30300", label: "pONCEUSE EXCENTRIQUE ETS EC150", cumul: "missing" },
    { key: "C31000", label: "SCIE A ONGLET RADIALE KAPEX", cumul: "missing" },
    { key: "C40200", label: "PONCEUSE ROTO EXCENTRIQUE RO", cumul: "missing" },
    { key: "B80200", label: "PEUGEOT EXPERT VU", cumul: 9246.66 },
    { key: "B90800", label: "RENAULT TRAFIC EE-286-XG", cumul: 5212.56 },
    { key: "C10200", label: "MASTER III EY-332-ND RENAULT", cumul: 5945.23 },
    { key: "C00900", label: "PC portable HP spectrex360", cumul: 1398.44 },
    { key: "C11100", label: "APPLE MACBOOK", cumul: 371.29 },
    { key: "C21100", label: "APPLE ORDINATEUR", cumul: 67.05 },
    { key: "C21200", label: "IPHONE 14 APPLE", cumul: 22.35 },
  ];

  const assets = GEFFROY_LABELS.map((row) =>
    asset({
      key: row.key,
      label: row.label,
      classification: "missing",
      propertyId: "missing",
      cumul: row.cumul,
    }),
  );
  const keys = assets.map((a) => a.candidateKey);

  it("J — sortie absente de la liste (B71200 jamais candidate)", () => {
    assert.ok(!keys.includes("B71200"));
  });

  it("K — B80400 cumulOuverture reste missing après classification", () => {
    const b80400 = assets.find((a) => a.candidateKey === "B80400");
    assert.ok(b80400);
    assert.ok(isCandidateAbsent(b80400!.cumulOuverture));
    const answers = withAssetClassificationAnswer(undefined, "B80400", "autre", NOW);
    const merged = mergeTakeoverReviewAnswers({
      assets: [b80400!],
      stocks: {
        deficits: missingCandidate(),
        amortissementsReportes: missingCandidate(),
      },
      reviewAnswers: answers,
    });
    assert.ok(isCandidatePresent(merged.assets[0]!.classification));
    assert.ok(isCandidateAbsent(merged.assets[0]!.cumulOuverture));
  });

  it("mesures compact review GEFFROY", () => {
    const afterProperty = toClientQuestions(propertyExceptions(keys), assets, {
      properties: [PROP_A],
    });
    assert.equal(afterProperty.length, 1);
    assert.equal(afterProperty[0]!.code, "PROPERTY_BULK_CONFIRM");

    const afterClass = toClientQuestions(classificationExceptions(keys), assets, {
      properties: [PROP_A],
    });
    assert.equal(afterClass.length, 1);
    assert.equal(afterClass[0]!.code, "CLASSIFICATION_COMPACT_REVIEW");
    if (afterClass[0]!.code !== "CLASSIFICATION_COMPACT_REVIEW") return;
    assert.equal(afterClass[0].items.length, 22);
    const suggested = afterClass[0].items.filter((i) => i.suggested);
    const unknown = afterClass[0].items.filter((i) => !i.suggested);
    assert.equal(suggested.length, 0);
    assert.equal(unknown.length, 22);
    assert.equal(countOpenClientQuestions(afterClass), 22);

    // Après bulk YES property : 0 property questions
    const afterBulkYes = withBulkPropertyAnswer(undefined, keys, "prop-a", NOW);
    const propertyAfterConfirm = toClientQuestions([], assets, {
      properties: [PROP_A],
      reviewAnswers: afterBulkYes,
    });
    assert.equal(
      propertyAfterConfirm.filter(
        (q) => q.code === "PROPERTY_BULK_CONFIRM" || q.code === "PROPERTY_MATCH_REQUIRED",
      ).length,
      0,
    );

    console.log(
      JSON.stringify({
        ASSET_COUNT: 22,
        PROPERTY_QUESTIONS_AFTER_BULK_UI: 1,
        CLASSIFICATION_ITEMS: 22,
        CLASSIFICATION_SECTIONS: 1,
        CLASSIFICATION_AUTO_SUGGESTED: 0,
        CLASSIFICATION_STILL_UNKNOWN: 22,
        PRESELECTED_WITHOUT_PROOF: 0,
      }),
    );
  });
});
