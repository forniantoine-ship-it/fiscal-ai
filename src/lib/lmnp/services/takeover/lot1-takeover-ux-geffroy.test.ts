/**
 * Takeover UX Lot 1 — métriques GEFFROY BEFORE → AFTER.
 * Run: npx tsx --test src/lib/lmnp/services/takeover/lot1-takeover-ux-geffroy.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createConfidenceScore } from "@/lib/documents/types/confidence-score";
import {
  buildProgress,
  clientExceptionsFromResult,
  clientVisibleBlockReasons,
  countOpenClientQuestions,
  hasUnresolvedInternalBlock,
  toClientQuestions,
} from "@/components/lmnp/validation-workflow/external-takeover/external-takeover-view-model";
import { EXTERNAL_TAKEOVER_COPY } from "@/components/lmnp/validation-workflow/external-takeover/external-takeover-copy";
import type { CandidateDepreciationMethod, CandidateHistoricalAsset } from "./asset-candidates";
import {
  isCandidateAbsent,
  isCandidatePresent,
  missingCandidate,
  presentCandidate,
  type CandidateProvenance,
} from "./candidate-value";
import { prepareExternalTakeover } from "./prepare-external-takeover";
import { explicitAnswer } from "./review-answers";
import {
  createTaxPackageControlFact,
  createTaxPackageControlFacts,
  type TaxPackageControlFactDraft,
} from "./tax-package-control-facts";

const FY = 2025;
const TARGET = 2026;
const FORM_YEAR = 2026;
const DOSSIER = "dossier-lot1-geffroy";
const PROP = "prop-1";

type GeffroyRow = {
  key: string;
  label: string;
  gross: number;
  cumul: number | "missing";
  startDate: string;
  durationYears: number | "impossible";
  method: CandidateDepreciationMethod;
  pcg: string;
};

/** 22 candidats GEFFROY (hors sortie B71200) — cumul = Amort. fin N-1 (= ouverture N). */
const GEFFROY_ROWS: GeffroyRow[] = [
  { key: "B70500", label: "Teletower telescopique Jefco", gross: 1292.81, cumul: 1292.81, startDate: "2017-05-31", durationYears: 5, method: "lineaire", pcg: "21540000" },
  { key: "B80400", label: "JEFCO ponceuse", gross: 1559.91, cumul: "missing", startDate: "2018-04-30", durationYears: "impossible", method: "autre", pcg: "21540000" },
  { key: "B80700", label: "LA PLATEFORME karcher novipro", gross: 529, cumul: 529, startDate: "2018-07-19", durationYears: 5, method: "lineaire", pcg: "21540000" },
  { key: "B81100", label: "ZOLPAN echaffaudage", gross: 1125, cumul: 1125, startDate: "2018-11-30", durationYears: 5, method: "lineaire", pcg: "21540000" },
  { key: "B90100", label: "ZOLPAN graco pisto", gross: 1506.85, cumul: 1484.25, startDate: "2019-01-28", durationYears: 5, method: "lineaire", pcg: "21540000" },
  { key: "B91100", label: "ZOLPAN planex lhs 225", gross: 1449, cumul: 1184.15, startDate: "2019-11-30", durationYears: 5, method: "lineaire", pcg: "21540000" },
  { key: "C01000", label: "Défonceuse OF 1010 EBQ-Plus", gross: 570.9, cumul: 363.47, startDate: "2020-10-25", durationYears: 5, method: "lineaire", pcg: "21540000" },
  { key: "C01001", label: "Fraiseuse Df 500 Q set DOMINO", gross: 886.75, cumul: 564.56, startDate: "2020-10-25", durationYears: 5, method: "lineaire", pcg: "21540000" },
  { key: "C01100", label: "Scie semi stationnaire CS 50 E", gross: 880, cumul: 543.16, startDate: "2020-11-30", durationYears: 5, method: "lineaire", pcg: "21540000" },
  { key: "C01101", label: "Table mobile de sciage", gross: 854.4, cumul: 527.35, startDate: "2020-11-30", durationYears: 5, method: "lineaire", pcg: "21540000" },
  { key: "C11200", label: "Lève plaque de platre", gross: 598.55, cumul: 248.73, startDate: "2021-12-03", durationYears: 5, method: "lineaire", pcg: "21540000" },
  { key: "C20700", label: "scie à onglets", gross: 643.03, cumul: 190.06, startDate: "2022-07-09", durationYears: 5, method: "lineaire", pcg: "21540000" },
  { key: "C30300", label: "pONCEUSE EXCENTRIQUE ETS EC150", gross: 507.38, cumul: 78.37, startDate: "2023-03-23", durationYears: 5, method: "lineaire", pcg: "21540000" },
  { key: "C31000", label: "SCIE A ONGLET RADIALE KAPEX", gross: 666.89, cumul: 32.97, startDate: "2023-10-02", durationYears: 5, method: "lineaire", pcg: "21540000" },
  { key: "C40200", label: "PONCEUSE ROTO EXCENTRIQUE RO", gross: 591.88, cumul: 101.61, startDate: "2023-02-22", durationYears: 5, method: "lineaire", pcg: "21540000" },
  { key: "B80200", label: "PEUGEOT EXPERT VU", gross: 9500, cumul: 9500, startDate: "2018-02-19", durationYears: 5, method: "lineaire", pcg: "21820000" },
  { key: "B90800", label: "RENAULT TRAFIC EE-286-XG", gross: 7799.37, cumul: 6772.43, startDate: "2019-08-28", durationYears: 5, method: "lineaire", pcg: "21820000" },
  { key: "C10200", label: "MASTER III EY-332-ND RENAULT", gross: 15668.24, cumul: 9078.88, startDate: "2021-02-08", durationYears: 5, method: "lineaire", pcg: "21820000" },
  { key: "C00900", label: "PC portable HP spectrex360", gross: 1832.91, cumul: 1832.91, startDate: "2020-09-17", durationYears: 3, method: "lineaire", pcg: "21830000" },
  { key: "C11100", label: "APPLE MACBOOK", gross: 999.99, cumul: 704.62, startDate: "2021-11-20", durationYears: 3, method: "lineaire", pcg: "21830000" },
  { key: "C21100", label: "APPLE ORDINATEUR", gross: 1540.83, cumul: 580.66, startDate: "2022-11-14", durationYears: 3, method: "lineaire", pcg: "21830000" },
  { key: "C21200", label: "IPHONE 14 APPLE", gross: 1340.83, cumul: 469.29, startDate: "2022-12-13", durationYears: 3, method: "lineaire", pcg: "21830000" },
];

function prov(sourceRef: string): CandidateProvenance {
  return {
    documentId: "doc-geffroy",
    documentRole: "depreciation_register",
    fieldLabel: sourceRef,
    sourceRef,
    extractionMethod: "fixture_structured",
    confidence: createConfidenceScore(0.9, ["fixture"]),
    evidence: { snippet: sourceRef, page: 1 },
    fieldSource: "extracted",
  };
}

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

function geffroyCandidates(): CandidateHistoricalAsset[] {
  return GEFFROY_ROWS.map((row) => {
    const p = prov(row.key);
    return {
      candidateKey: row.key,
      label: presentCandidate(row.label, "direct", p),
      coutBrut: presentCandidate(row.gross, "direct", p),
      cumulOuverture:
        row.cumul === "missing"
          ? missingCandidate("cumul absent", { documentId: p.documentId, documentRole: p.documentRole, sourceRef: row.key })
          : presentCandidate(row.cumul, "direct", p),
      startDate: presentCandidate(row.startDate, "direct", p),
      durationYears:
        row.durationYears === "impossible"
          ? missingCandidate("durée impossible", { documentId: p.documentId, documentRole: p.documentRole, sourceRef: row.key })
          : presentCandidate(row.durationYears, "direct", p),
      method: presentCandidate(row.method, "direct", p),
      prorataConvention: missingCandidate("prorata absent", {
        documentId: p.documentId,
        documentRole: p.documentRole,
        sourceRef: row.key,
      }),
      classification: missingCandidate("classification absente", {
        documentId: p.documentId,
        documentRole: p.documentRole,
        sourceRef: row.key,
      }),
      nonAmortizable: missingCandidate(),
      propertyId: missingCandidate("propertyId absent", {
        documentId: p.documentId,
        documentRole: p.documentRole,
        sourceRef: row.key,
      }),
      pcgAccountCode: presentCandidate(row.pcg, "direct", p),
    };
  });
}

function packageFromControls() {
  const facts = [
    mustFact({ formType: "2033A", sourceCase: "028", kind: "total_gross", formYear: FORM_YEAR, fiscalYear: FY, periodPosition: "closing", value: presentCandidate(100, "direct", taxProv("028")) }),
    mustFact({ formType: "2033C", sourceCase: "496", kind: "total_gross", formYear: FORM_YEAR, fiscalYear: FY, periodPosition: "closing", value: presentCandidate(100, "direct", taxProv("496")) }),
    mustFact({ formType: "2033A", sourceCase: "030", kind: "total_cumulative_depreciation", formYear: FORM_YEAR, fiscalYear: FY, periodPosition: "closing", value: presentCandidate(40, "direct", taxProv("030")) }),
    mustFact({ formType: "2033C", sourceCase: "576", kind: "total_cumulative_depreciation", formYear: FORM_YEAR, fiscalYear: FY, periodPosition: "closing", value: presentCandidate(40, "direct", taxProv("576")) }),
  ];
  const pkg = createTaxPackageControlFacts("pkg-lot1-geffroy", facts);
  assert.equal(pkg.status, "created", JSON.stringify(pkg));
  if (pkg.status !== "created") throw new Error("unreachable");
  return pkg.package;
}

describe("Lot 1 — GEFFROY UX metrics AFTER", () => {
  it("réduit massivement les interactions client et surface les blocages", async () => {
    const assets = geffroyCandidates();
    assert.equal(assets.length, 22);

    const result = await prepareExternalTakeover({
      openingId: "opening-geffroy-lot1",
      dossierId: DOSSIER,
      takeoverId: "takeover-geffroy-lot1",
      targetFiscalYear: TARGET,
      sourceFiscalYear: FY,
      formYear: FORM_YEAR,
      register: {
        role: "prior_depreciation_register",
        documentId: "doc-geffroy",
        candidates: assets,
      },
      taxPackage: {
        role: "prior_tax_package",
        documentId: "doc-liasse",
        package: packageFromControls(),
      },
    });

    assert.notEqual(result.status, "built");
    assert.ok(result.assets);

    const autoClassified = result.assets.filter((a) => isCandidatePresent(a.classification));
    const stillNeedClientClass = result.assets.filter((a) => isCandidateAbsent(a.classification));
    assert.equal(autoClassified.length, 22);
    assert.equal(stillNeedClientClass.length, 0);

    const clientEx = clientExceptionsFromResult(result);
    const questions = toClientQuestions(clientEx, result.assets, {
      properties: [
        {
          id: PROP,
          label: "Bien",
          address: "1 rue Test",
          city: "Lyon",
          postalCode: "69001",
        },
      ],
    });

    const prorataQ = questions.filter((q) => q.code === "PRORATA_REQUIRED");
    const classQ = questions.filter((q) => q.code === "CLASSIFICATION_COMPACT_REVIEW");
    const propertyQ = questions.filter(
      (q) => q.code === "PROPERTY_BULK_CONFIRM" || q.code === "PROPERTY_MATCH_REQUIRED",
    );
    const deficitQ = questions.filter((q) => q.code === "DEFICITS_REQUIRED");
    const ardQ = questions.filter((q) => q.code === "ARD_REQUIRED");

    assert.equal(prorataQ.length, 0, "aucune question prorata leurre");
    assert.equal(classQ.length, 0, "classifications collapsed — plus de question client");
    assert.equal(propertyQ.length, 1, "1 confirmation groupée mono-bien");
    assert.equal(deficitQ.length, 1);
    assert.equal(ardQ.length, 1);

    for (const asset of autoClassified) {
      assert.ok(isCandidatePresent(asset.classification));
      assert.equal(asset.classification.value, "autre");
      assert.equal(asset.classification.nature, "derived");
      assert.equal(
        asset.classification.provenance.fieldLabel,
        "fiscal_equivalence_collapse",
      );
    }

    const openCount = countOpenClientQuestions(questions);
    // 1 bulk property + 1 déficits + 1 ARD = 3 interactions UX
    assert.equal(openCount, 3);

    // Après réponses client (property + stocks), les hard-blocks restent visibles.
    const answered = await prepareExternalTakeover({
      openingId: "opening-geffroy-lot1",
      dossierId: DOSSIER,
      takeoverId: "takeover-geffroy-lot1",
      targetFiscalYear: TARGET,
      sourceFiscalYear: FY,
      formYear: FORM_YEAR,
      register: {
        role: "prior_depreciation_register",
        documentId: "doc-geffroy",
        candidates: assets,
      },
      taxPackage: {
        role: "prior_tax_package",
        documentId: "doc-liasse",
        package: packageFromControls(),
      },
      reviewAnswers: {
        byCandidateKey: Object.fromEntries(
          assets.map((a) => [
            a.candidateKey,
            { propertyId: explicitAnswer(PROP, { answeredAt: "2026-01-01T00:00:00.000Z" }) },
          ]),
        ),
        deficits: explicitAnswer([], {
          answeredAt: "2026-01-01T00:00:00.000Z",
          reason: "client_confirmed_no_remaining_deficit",
        }),
        amortissementsReportes: explicitAnswer(0, {
          answeredAt: "2026-01-01T00:00:00.000Z",
          reason: "client_confirmed_no_remaining_undeducted_depreciation",
        }),
        amortissementsReportesSource: "manual_entry",
      },
    });

    assert.equal(answered.status, "blocked");
    assert.equal(hasUnresolvedInternalBlock(answered), true);
    assert.equal(clientExceptionsFromResult(answered).length, 0);

    const reasons = clientVisibleBlockReasons(answered, EXTERNAL_TAKEOVER_COPY);
    assert.ok(reasons.length >= 1);
    assert.equal(
      reasons.some((r) => /METHOD_UNSUPPORTED|ASSET_CUMUL/i.test(r)),
      false,
      "aucun code technique exposé",
    );

    const steps = buildProgress({
      documentsReady: true,
      analyzing: false,
      hasResult: true,
      clientExceptionCount: 0,
      complete: false,
      unresolvedBlock: true,
      labels: EXTERNAL_TAKEOVER_COPY.progress,
    });
    assert.equal(steps[2]!.done, false);
    assert.doesNotMatch(steps[2]!.detail, /0 restante/);
    assert.match(steps[2]!.detail, /vérification nécessaire/);
    assert.equal(steps[3]!.done, false);

    assert.doesNotMatch(
      EXTERNAL_TAKEOVER_COPY.internalBlockIntro,
      /vérification interne|Aucune action n'est attendue/i,
    );
    assert.match(
      EXTERNAL_TAKEOVER_COPY.internalBlockIntro,
      /ne peuvent pas être reprises automatiquement/,
    );

    // eslint-disable-next-line no-console -- métrique Lot 1 exigée
    console.log(
      JSON.stringify({
        BEFORE: {
          totalInteractions: 28,
          manualClassifications: 22,
          prorataQuestions: 4,
          remainingAccountingQuestions: 2,
          visibleBlocks: 0,
          silentBlocks: 1,
          safeNeutralCollapses: 0,
          stillNeedClientClass: 22,
        },
        AFTER: {
          totalInteractions: openCount,
          manualClassifications: stillNeedClientClass.length,
          prorataQuestions: prorataQ.length,
          remainingAccountingQuestions: deficitQ.length + ardQ.length,
          visibleBlocks: reasons.length,
          silentBlocks: 0,
          safeNeutralCollapses: autoClassified.length,
          precisePcgClassifications: 0,
          stillNeedClientClass: stillNeedClientClass.length,
          whyClassificationRemoved:
            "fiscally irrelevant batiment/mobilier/autre distinctions collapse to Opening composant",
          openClientQuestionsAfterAnswers: countOpenClientQuestions(
            toClientQuestions(clientExceptionsFromResult(answered), answered.assets),
          ),
          statusAfterAnswers: answered.status,
        },
      }),
    );
  });
});
