/**
 * Reprise externe ancrée — la convention historique de prorata n'est plus exigée.
 * Run: npx tsx --test src/lib/lmnp/services/takeover/anchored-historical-prorata.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createConfidenceScore } from "@/lib/documents/types/confidence-score";
import { toClientQuestions } from "@/components/lmnp/validation-workflow/external-takeover/external-takeover-view-model";
import { prorataPremiereAnnee } from "@/runtime/capabilities/f010/prorata-premiere-annee";
import { computeAmortizationPlan } from "@/runtime/capabilities/f010/compute-amortization-plan";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { adaptInternalOpening } from "@/lib/lmnp/services/fiscal-year-opening/adapt-internal-opening";
import { computeOpeningContentHash } from "@/lib/lmnp/services/fiscal-year-opening/content-hash";
import {
  fixtureClosedFiscalYear,
  fixtureClosure,
} from "@/lib/lmnp/services/fiscal-year-opening/fixtures";
import { isAvailable } from "@/lib/lmnp/services/fiscal-year-opening/opening-fact";
import { propagateAnchoredDepreciation } from "@/lib/lmnp/services/fiscal-year-opening/propagate-anchored-depreciation";
import {
  applyResolvedOpeningDepreciation,
  resolveOpeningDepreciation,
} from "@/lib/lmnp/services/fiscal-year-opening/resolve-opening-depreciation";
import type { FiscalYearOpening, OpeningProrataConvention } from "@/lib/lmnp/services/fiscal-year-opening/types";
import { canOmitHistoricalProrata } from "./anchored-historical-prorata";
import type {
  CandidateAssetClassification,
  CandidateDepreciationMethod,
  CandidateHistoricalAsset,
} from "./asset-candidates";
import {
  extractionImpossibleCandidate,
  missingCandidate,
  presentCandidate,
  type CandidateProvenance,
} from "./candidate-value";
import {
  buildExternalTakeoverFiscalYearOpening,
  type BuildExternalTakeoverFiscalYearOpeningInput,
} from "./build-external-takeover-opening";
import type { CandidateFiscalStocks } from "./fiscal-stocks-candidates";
import { createHistoricalControlReconciliation } from "./historical-control-reconciliation";
import { mapAcceptedCandidateAssetsToOpening } from "./map-accepted-to-opening";
import { prepareExternalTakeover } from "./prepare-external-takeover";
import { explicitAnswer } from "./review-answers";
import {
  createTaxPackageControlFact,
  createTaxPackageControlFacts,
  type TaxPackageControlFactDraft,
} from "./tax-package-control-facts";
import type { HistoricalTaxPackageControlsReconciliation } from "./reconcile-historical-tax-package-controls";

const FY = 2025;
const TARGET = 2026;
const FORM_YEAR = 2026;
const DOSSIER = "dossier-anchored-prorata";
const PROP = "prop-1";

function prov(documentId: string, sourceRef: string): CandidateProvenance {
  return {
    documentId,
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

function concordantControls(): HistoricalTaxPackageControlsReconciliation {
  const gross = createHistoricalControlReconciliation({
    kind: "total_gross",
    left: [mustFact({ formType: "2033A", sourceCase: "028", kind: "total_gross", formYear: FORM_YEAR, fiscalYear: FY, periodPosition: "closing", value: presentCandidate(100, "direct", taxProv("028")) })],
    right: [mustFact({ formType: "2033C", sourceCase: "496", kind: "total_gross", formYear: FORM_YEAR, fiscalYear: FY, periodPosition: "closing", value: presentCandidate(100, "direct", taxProv("496")) })],
  });
  const dep = createHistoricalControlReconciliation({
    kind: "total_cumulative_depreciation",
    left: [mustFact({ formType: "2033A", sourceCase: "030", kind: "total_cumulative_depreciation", formYear: FORM_YEAR, fiscalYear: FY, periodPosition: "closing", value: presentCandidate(40, "direct", taxProv("030")) })],
    right: [mustFact({ formType: "2033C", sourceCase: "576", kind: "total_cumulative_depreciation", formYear: FORM_YEAR, fiscalYear: FY, periodPosition: "closing", value: presentCandidate(40, "direct", taxProv("576")) })],
  });
  assert.equal(gross.status, "created");
  assert.equal(dep.status, "created");
  if (gross.status !== "created" || dep.status !== "created") throw new Error("unreachable");
  return {
    packageId: "pkg-anchored-prorata",
    totalGross: gross.result,
    totalCumulativeDepreciation: dep.result,
  };
}

function explicitStocks(): CandidateFiscalStocks {
  return {
    deficits: presentCandidate([], "direct", taxProv("stocks:deficits")),
    amortissementsReportes: presentCandidate(0, "direct", taxProv("stocks:ard")),
  };
}

function candidate(params: {
  key: string;
  label: string;
  coutBrut: number;
  cumul: number | "missing";
  startDate?: string | "missing";
  durationYears?: number | "missing" | "impossible";
  method?: CandidateDepreciationMethod | "missing";
  classification?: CandidateAssetClassification | "missing";
  prorata?: OpeningProrataConvention | "missing";
  propertyId?: string | "missing";
  nonAmortizable?: boolean;
}): CandidateHistoricalAsset {
  const documentId = `doc-${params.key}`;
  const method = params.method ?? "lineaire";
  const classification = params.classification ?? "batiment";
  return {
    candidateKey: params.key,
    sourceAssetRef: params.key,
    label: presentCandidate(params.label, "direct", prov(documentId, "label")),
    coutBrut: presentCandidate(params.coutBrut, "direct", prov(documentId, "coutBrut")),
    cumulOuverture:
      params.cumul === "missing"
        ? missingCandidate("cumul absent")
        : presentCandidate(params.cumul, "direct", prov(documentId, "cumul")),
    startDate:
      params.startDate === "missing" || params.startDate === undefined
        ? params.startDate === undefined
          ? presentCandidate("2020-01-01", "direct", prov(documentId, "start"))
          : missingCandidate("date absente")
        : presentCandidate(params.startDate, "direct", prov(documentId, "start")),
    durationYears:
      params.durationYears === "impossible"
        ? extractionImpossibleCandidate("durée 00-00")
        : params.durationYears === "missing"
          ? missingCandidate("durée absente")
          : presentCandidate(params.durationYears ?? 10, "direct", prov(documentId, "duration")),
    method:
      method === "missing"
        ? missingCandidate("méthode absente")
        : presentCandidate(method, "direct", prov(documentId, "method")),
    prorataConvention:
      params.prorata === undefined || params.prorata === "missing"
        ? missingCandidate("convention de prorata absente du registre — non inférée")
        : presentCandidate(params.prorata, "direct", prov(documentId, "prorata")),
    classification:
      classification === "missing"
        ? missingCandidate("classification absente")
        : presentCandidate(classification, "direct", prov(documentId, "classification")),
    nonAmortizable: presentCandidate(
      params.nonAmortizable ?? false,
      "direct",
      prov(documentId, "nonAmortizable"),
    ),
    propertyId:
      params.propertyId === "missing"
        ? missingCandidate("propertyId absent")
        : presentCandidate(params.propertyId ?? PROP, "direct", prov(documentId, "propertyId")),
  };
}

function buildInput(
  assets: CandidateHistoricalAsset[],
): BuildExternalTakeoverFiscalYearOpeningInput {
  const idMap: Record<string, string> = {};
  for (const asset of assets) idMap[asset.candidateKey] = `asset-${asset.candidateKey}`;
  return {
    openingId: "opening-anchored-prorata",
    dossierId: DOSSIER,
    takeoverId: "takeover-anchored-prorata",
    targetFiscalYear: TARGET,
    sourceFiscalYear: FY,
    assets,
    stableAssetIdByCandidateKey: idMap,
    stocks: explicitStocks(),
    controls: concordantControls(),
    validatedAt: "2026-01-15T00:00:00.000Z",
    validator: "anchored-prorata-test",
  };
}

function amortizablePlan(opening: FiscalYearOpening, assetId: string) {
  assert.ok(isAvailable(opening.assets));
  if (!isAvailable(opening.assets)) throw new Error("assets");
  const asset = opening.assets.value.find((item) => item.id === assetId);
  assert.ok(asset);
  if (!asset || !isAvailable(asset.plan) || asset.plan.value.kind !== "amortizable") {
    throw new Error(`plan amortissable attendu pour ${assetId}`);
  }
  return asset.plan.value;
}

function dotationOf(opening: FiscalYearOpening): number {
  const resolved = resolveOpeningDepreciation({
    opening,
    expectedDossierId: DOSSIER,
    expectedExerciceFiscal: opening.targetFiscalYear,
  });
  assert.equal(resolved.status, "ready", JSON.stringify(resolved));
  if (resolved.status !== "ready") throw new Error("resolve");
  const applied = applyResolvedOpeningDepreciation({ resolved });
  assert.equal(applied.ok, true, JSON.stringify(applied));
  if (!applied.ok) throw new Error("apply");
  assert.equal(applied.lignes.length, 1);
  return applied.lignes[0]!.dotationExercice;
}

describe("reprise ancrée — prorata historique non exigé", () => {
  const anchored = candidate({
    key: "ancre",
    label: "Immeuble",
    coutBrut: 12_000,
    cumul: 4_000,
    startDate: "2020-01-01",
    durationYears: 10,
    classification: "batiment",
  });

  it("TEST 1 — actif ancré sans convention : pas de PRORATA_REQUIRED, Opening sans valeur inventée", async () => {
    assert.equal(canOmitHistoricalProrata(anchored), true);
    const built = buildExternalTakeoverFiscalYearOpening(buildInput([anchored]));
    assert.equal(built.status, "built", JSON.stringify(built));
    if (built.status !== "built") return;
    const plan = amortizablePlan(built.opening, "asset-ancre");
    assert.equal(plan.prorataConvention, undefined);
    assert.equal("prorataConvention" in plan, false);
    assert.equal(JSON.stringify(plan).includes("jours_reels"), false);
    assert.equal(JSON.stringify(plan).includes("mensuel"), false);
    assert.equal(JSON.stringify(plan).includes("annuel_plein"), false);

    const prepared = await prepareExternalTakeover({
      openingId: "opening-anchored-prorata",
      dossierId: DOSSIER,
      takeoverId: "takeover-anchored-prorata",
      targetFiscalYear: TARGET,
      sourceFiscalYear: FY,
      formYear: FORM_YEAR,
      register: {
        role: "prior_depreciation_register",
        documentId: "doc-register",
        candidates: [anchored],
      },
      taxPackage: {
        role: "prior_tax_package",
        documentId: "doc-liasse",
        package: packageFromControls(),
      },
      reviewAnswers: {
        deficits: explicitAnswer([], { answeredAt: "2026-01-10T00:00:00.000Z" }),
        amortissementsReportes: explicitAnswer(0, { answeredAt: "2026-01-10T00:00:00.000Z" }),
        amortissementsReportesSource: "manual_entry",
      },
      validatedAt: "2026-01-15T00:00:00.000Z",
    });
    assert.equal(prepared.status, "built", JSON.stringify(prepared));
    if (prepared.status !== "built") return;
    assert.equal(
      prepared.exceptions.filter((item) => item.code === "PRORATA_REQUIRED").length,
      0,
    );
  });

  it("TEST 2 et 3 — dotation N identique, conventions legacy encore lisibles", () => {
    const without = buildExternalTakeoverFiscalYearOpening(buildInput([anchored]));
    assert.equal(without.status, "built");
    if (without.status !== "built") return;
    const dotationWithout = dotationOf(without.opening);

    for (const convention of ["jours_reels", "mensuel", "annuel_plein"] as const) {
      const withConvention = candidate({
        key: "ancre",
        label: "Immeuble",
        coutBrut: 12_000,
        cumul: 4_000,
        startDate: "2020-01-01",
        durationYears: 10,
        prorata: convention,
      });
      const built = buildExternalTakeoverFiscalYearOpening(buildInput([withConvention]));
      assert.equal(built.status, "built", convention);
      if (built.status !== "built") return;
      const plan = amortizablePlan(built.opening, "asset-ancre");
      assert.equal(plan.prorataConvention, convention);
      assert.equal(dotationOf(built.opening), dotationWithout);
    }

    assert.equal(dotationWithout, 1_200);
  });

  it("TEST 4 — cumul manquant reste fail-closed, jamais 0", () => {
    const missing = candidate({
      key: "C30300",
      label: "pONCEUSE EXCENTRIQUE ETS EC150",
      coutBrut: 507.38,
      cumul: "missing",
      startDate: "2023-03-23",
      durationYears: 5,
      classification: "autre",
    });
    assert.equal(canOmitHistoricalProrata(missing), false);
    const mapped = mapAcceptedCandidateAssetsToOpening({
      assets: [missing],
      stableAssetIdByCandidateKey: { C30300: "asset-C30300" },
    });
    assert.equal(mapped.status, "mapped");
    if (mapped.status !== "mapped") return;
    assert.equal(mapped.assets[0]!.cumulOuverture.status, "unavailable");
    assert.equal("value" in mapped.assets[0]!.cumulOuverture, false);

    const built = buildExternalTakeoverFiscalYearOpening(buildInput([missing]));
    assert.notEqual(built.status, "built");
    if (built.status === "blocked") {
      assert.ok(built.issues.some((issue) => issue.code === "ASSET_CUMUL_OUVERTURE_UNAVAILABLE"));
    }

    const withFakeConvention = candidate({
      key: "C30300",
      label: "pONCEUSE EXCENTRIQUE ETS EC150",
      coutBrut: 507.38,
      cumul: "missing",
      startDate: "2023-03-23",
      durationYears: 5,
      classification: "autre",
      prorata: "jours_reels",
    });
    const stillBlocked = buildExternalTakeoverFiscalYearOpening(buildInput([withFakeConvention]));
    assert.notEqual(stillBlocked.status, "built");
  });

  it("TEST 5 — B80400 reste hors Opening", () => {
    const b80400 = candidate({
      key: "B80400",
      label: "JEFCO ponceuse",
      coutBrut: 1559.91,
      cumul: "missing",
      startDate: "2018-04-30",
      durationYears: "impossible",
      method: "autre",
      classification: "autre",
      prorata: "annuel_plein",
    });
    assert.equal(canOmitHistoricalProrata(b80400), false);
    const built = buildExternalTakeoverFiscalYearOpening(buildInput([b80400]));
    assert.equal(built.status, "blocked");
    if (built.status !== "blocked") return;
    assert.ok(built.issues.some((issue) => issue.code === "METHOD_UNSUPPORTED"));
    assert.equal(
      built.issues.some((issue) => issue.message.includes("asset-B80400") && issue.code === "ASSET_CUMUL_OUVERTURE_UNAVAILABLE"),
      false,
    );
  });

  it("TEST 6 — N+1 sans convention : pas de jours_reels, C0 conservé, pas de reconstruction", () => {
    const built = buildExternalTakeoverFiscalYearOpening(buildInput([anchored]));
    assert.equal(built.status, "built");
    if (built.status !== "built") return;

    const yearN = propagateAnchoredDepreciation({
      opening: built.opening,
      expectedDossierId: DOSSIER,
      expectedExerciceFiscal: TARGET,
      dateMiseEnService: "2020-01-01",
    });
    assert.equal(yearN.status, "ready", JSON.stringify(yearN));
    if (yearN.status !== "ready") return;
    assert.equal(yearN.dotationExercice, 1_200);
    assert.equal(yearN.cumulAmortissable, 5_200);
    const f014 = yearN.f014.composants.find((item) => item.id === "asset-ancre");
    assert.ok(f014);
    assert.equal(f014!.plan_pluriannuel.length, 1);

    const snap = yearN.snapshot.actifs.find((item) => item.id === "asset-ancre");
    assert.ok(snap);
    assert.equal(snap!.amortissementCumule, 5_200);
    assert.equal(snap!.prorataConvention, undefined);
    assert.equal("prorataConvention" in snap!, false);

    const closure = fixtureClosure({
      id: "closure-2026",
      fiscalYearId: "fy-2026",
      dossierId: DOSSIER,
      immobilisationsComptables: yearN.snapshot,
    });
    const closed = fixtureClosedFiscalYear({
      id: "fy-2026",
      year: 2026,
      dossierId: DOSSIER,
      propertyIds: [PROP],
      status: "closed",
      closures: [closure],
    });
    const archived: PersistedWorkspace = {
      fiscalYear: closed,
      properties: [
        {
          id: PROP,
          label: "Bien",
          address: "1 rue Test",
          city: "Lyon",
          postalCode: "69001",
        },
      ],
      documents: [],
      extractions: [],
      validationItems: [],
      ledgerEntries: [],
      declarationDraft: { completedSteps: [], dateMiseEnService: "2020-01-01" },
    };

    const adapted = adaptInternalOpening({
      targetFiscalYear: 2027,
      openingId: "opening-2027",
      revision: 1,
      closedFiscalYear: closed,
      archivedWorkspace: archived,
    });
    assert.ok(adapted.opening, JSON.stringify(adapted.issues));
    if (!adapted.opening) return;
    const plan = amortizablePlan(adapted.opening, "asset-ancre");
    assert.equal(plan.prorataConvention, undefined);
    assert.notEqual(plan.prorataConvention, "jours_reels");
    assert.equal("prorataConvention" in plan, false);
    assert.ok(isAvailable(adapted.opening.assets));
    if (!isAvailable(adapted.opening.assets)) return;
    const next = adapted.opening.assets.value.find((item) => item.id === "asset-ancre");
    assert.ok(next && isAvailable(next.cumulOuverture));
    if (!next || !isAvailable(next.cumulOuverture)) return;
    assert.equal(next.cumulOuverture.value, 5_200);

    const opening2027: FiscalYearOpening = {
      ...adapted.opening,
      validation: { status: "pending" },
    };
    opening2027.validation = {
      status: "validated",
      openingRevision: opening2027.revision,
      contentHash: computeOpeningContentHash(opening2027),
      validatedAt: "2027-01-01T00:00:00.000Z",
      validator: "anchored-prorata-test",
    };
    const yearN1 = propagateAnchoredDepreciation({
      opening: opening2027,
      expectedDossierId: DOSSIER,
      expectedExerciceFiscal: 2027,
    });
    assert.equal(yearN1.status, "ready", JSON.stringify(yearN1));
    if (yearN1.status !== "ready") return;
    assert.equal(yearN1.dotationExercice, 1_200);
    assert.equal(yearN1.cumulAmortissable, 6_400);
    const snapN1 = yearN1.snapshot.actifs.find((item) => item.id === "asset-ancre");
    assert.equal(snapN1?.prorataConvention, undefined);
  });

  it("TEST 7 — actif acquis pendant N : le prorata jours/mois reste distinct", () => {
    const base = {
      prixAcquisition: 200_000,
      mobilierInclus: false,
      fraisNotaire: 0,
      choixTraitementFrais: "integration" as const,
      typeBien: "appartement" as const,
      ratioTerrain: 0.15,
      dateMiseEnService: "2026-07-01",
      exerciceFiscal: 2026,
    };
    const byDefault = computeAmortizationPlan(base);
    const byJours = computeAmortizationPlan({ ...base, methodeProrata: "jours" });
    const byMois = computeAmortizationPlan({ ...base, methodeProrata: "mois" });
    assert.equal(byDefault.prorataRatio, byJours.prorataRatio);
    assert.notEqual(byJours.prorataRatio, byMois.prorataRatio);
    assert.ok(byJours.prorataRatio > 0 && byJours.prorataRatio < 1);
    assert.ok(byMois.prorataRatio > 0 && byMois.prorataRatio < 1);

    const premiere = {
      composantsBati: [
        { label: "Gros œuvre", montant: 10_000, dureeAnnees: 40, dotationAnnuelle: 250 },
      ],
      composantsMobilier: [],
      dateDebutAmortissement: "2026-07-01",
      exerciceFiscal: 2026,
    };
    const direct = prorataPremiereAnnee({ ...premiere, methodeProrata: "jours" });
    const directMois = prorataPremiereAnnee({ ...premiere, methodeProrata: "mois" });
    assert.notEqual(direct.ratio, directMois.ratio);
  });
});

type GeffroyRow = {
  key: string;
  label: string;
  gross: number;
  cumul: number | "missing";
  startDate: string;
  durationYears: number | "impossible";
  method: CandidateDepreciationMethod;
};

const GEFFROY_ROWS: GeffroyRow[] = [
  { key: "B70500", label: "Teletower telescopique Jefco", gross: 1292.81, cumul: 1292.81, startDate: "2017-05-31", durationYears: 5, method: "lineaire" },
  { key: "B80400", label: "JEFCO ponceuse", gross: 1559.91, cumul: "missing", startDate: "2018-04-30", durationYears: "impossible", method: "autre" },
  { key: "B80700", label: "LA PLATEFORME karcher novipro", gross: 529, cumul: 470.81, startDate: "2018-07-19", durationYears: 5, method: "lineaire" },
  { key: "B81100", label: "ZOLPAN echaffaudage", gross: 1125, cumul: 919.37, startDate: "2018-11-30", durationYears: 5, method: "lineaire" },
  { key: "B90100", label: "ZOLPAN graco pisto", gross: 1506.85, cumul: 1182.88, startDate: "2019-01-28", durationYears: 5, method: "lineaire" },
  { key: "B91100", label: "ZOLPAN planex lhs 225", gross: 1449, cumul: 894.35, startDate: "2019-11-30", durationYears: 5, method: "lineaire" },
  { key: "C01000", label: "Défonceuse OF 1010 EBQ-Plus", gross: 570.9, cumul: 249.29, startDate: "2020-10-25", durationYears: 5, method: "lineaire" },
  { key: "C01001", label: "Fraiseuse Df 500 Q set DOMINO", gross: 886.75, cumul: 387.21, startDate: "2020-10-25", durationYears: 5, method: "lineaire" },
  { key: "C01100", label: "Scie semi stationnaire CS 50 E", gross: 880, cumul: 367.16, startDate: "2020-11-30", durationYears: 5, method: "lineaire" },
  { key: "C01101", label: "Table mobile de sciage", gross: 854.4, cumul: 356.47, startDate: "2020-11-30", durationYears: 5, method: "lineaire" },
  { key: "C11200", label: "Lève plaque de platre", gross: 598.55, cumul: 129.02, startDate: "2021-12-03", durationYears: 5, method: "lineaire" },
  { key: "C20700", label: "scie à onglets", gross: 643.03, cumul: 61.45, startDate: "2022-07-09", durationYears: 5, method: "lineaire" },
  { key: "C30300", label: "pONCEUSE EXCENTRIQUE ETS EC150", gross: 507.38, cumul: "missing", startDate: "2023-03-23", durationYears: 5, method: "lineaire" },
  { key: "C31000", label: "SCIE A ONGLET RADIALE KAPEX", gross: 666.89, cumul: "missing", startDate: "2023-10-02", durationYears: 5, method: "lineaire" },
  { key: "C40200", label: "PONCEUSE ROTO EXCENTRIQUE RO", gross: 591.88, cumul: "missing", startDate: "2023-02-22", durationYears: 5, method: "lineaire" },
  { key: "B80200", label: "PEUGEOT EXPERT VU", gross: 9500, cumul: 9246.66, startDate: "2018-02-19", durationYears: 5, method: "lineaire" },
  { key: "B90800", label: "RENAULT TRAFIC EE-286-XG", gross: 7799.37, cumul: 5212.56, startDate: "2019-08-28", durationYears: 5, method: "lineaire" },
  { key: "C10200", label: "MASTER III EY-332-ND RENAULT", gross: 15668.24, cumul: 5945.23, startDate: "2021-02-08", durationYears: 5, method: "lineaire" },
  { key: "C00900", label: "PC portable HP spectrex360", gross: 1832.91, cumul: 1398.44, startDate: "2020-09-17", durationYears: 3, method: "lineaire" },
  { key: "C11100", label: "APPLE MACBOOK", gross: 999.99, cumul: 371.29, startDate: "2021-11-20", durationYears: 3, method: "lineaire" },
  { key: "C21100", label: "APPLE ORDINATEUR", gross: 1540.83, cumul: 67.05, startDate: "2022-11-14", durationYears: 3, method: "lineaire" },
  { key: "C21200", label: "IPHONE 14 APPLE", gross: 1340.83, cumul: 22.35, startDate: "2022-12-13", durationYears: 3, method: "lineaire" },
];

function geffroyCandidates(property: string | "missing"): CandidateHistoricalAsset[] {
  return GEFFROY_ROWS.map((row) =>
    candidate({
      key: row.key,
      label: row.label,
      coutBrut: row.gross,
      cumul: row.cumul,
      startDate: row.startDate,
      durationYears: row.durationYears,
      method: row.method,
      classification: "autre",
      propertyId: property,
    }),
  );
}

function packageFromControls() {
  const facts = [
    mustFact({ formType: "2033A", sourceCase: "028", kind: "total_gross", formYear: FORM_YEAR, fiscalYear: FY, periodPosition: "closing", value: presentCandidate(100, "direct", taxProv("028")) }),
    mustFact({ formType: "2033C", sourceCase: "496", kind: "total_gross", formYear: FORM_YEAR, fiscalYear: FY, periodPosition: "closing", value: presentCandidate(100, "direct", taxProv("496")) }),
    mustFact({ formType: "2033A", sourceCase: "030", kind: "total_cumulative_depreciation", formYear: FORM_YEAR, fiscalYear: FY, periodPosition: "closing", value: presentCandidate(40, "direct", taxProv("030")) }),
    mustFact({ formType: "2033C", sourceCase: "576", kind: "total_cumulative_depreciation", formYear: FORM_YEAR, fiscalYear: FY, periodPosition: "closing", value: presentCandidate(40, "direct", taxProv("576")) }),
  ];
  const pkg = createTaxPackageControlFacts("pkg-geffroy-measure", facts);
  assert.equal(pkg.status, "created", JSON.stringify(pkg));
  if (pkg.status !== "created") throw new Error("unreachable");
  return pkg.package;
}

describe("GEFFROY — questions prorata après ancrage", () => {
  it("TEST 8 — les actifs ancrés ne posent plus PRORATA_REQUIRED", async () => {
    const assets = geffroyCandidates("missing");
    assert.equal(assets.length, 22);
    const anchored = assets.filter(canOmitHistoricalProrata);
    assert.equal(anchored.length, 18);

    const result = await prepareExternalTakeover({
      openingId: "opening-geffroy",
      dossierId: DOSSIER,
      takeoverId: "takeover-geffroy",
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
    const questions = toClientQuestions(result.exceptions, result.assets).filter(
      (question) => question.code === "PRORATA_REQUIRED",
    );
    // Les 4 actifs sans cumul / méthode non supportée ne doivent plus
    // générer de question prorata leurre — la réponse ne lève pas le blocage.
    assert.deepEqual(questions, []);
    assert.equal(
      result.exceptions.some((e) => e.code === "PRORATA_REQUIRED"),
      false,
    );

    const missingC0 = ["C30300", "C31000", "C40200"].map((key) =>
      assets.find((asset) => asset.candidateKey === key)!,
    );
    const missingBuild = buildExternalTakeoverFiscalYearOpening(
      buildInput(missingC0.map((asset) => ({ ...asset, propertyId: presentCandidate(PROP, "direct", prov(asset.candidateKey, "property")) }))),
    );
    assert.notEqual(missingBuild.status, "built");
    if (missingBuild.status === "blocked") {
      assert.equal(
        missingBuild.issues.filter((issue) => issue.code === "ASSET_CUMUL_OUVERTURE_UNAVAILABLE").length,
        3,
      );
    }

    const anchoredOnly = assets
      .filter(canOmitHistoricalProrata)
      .map((asset) => ({
        ...asset,
        propertyId: presentCandidate(PROP, "direct", prov(asset.candidateKey, "property")),
      }));
    const anchoredBuild = buildExternalTakeoverFiscalYearOpening(buildInput(anchoredOnly));
    assert.equal(anchoredBuild.status, "built", JSON.stringify(anchoredBuild));
    if (anchoredBuild.status !== "built") return;
    assert.ok(isAvailable(anchoredBuild.opening.assets));
    if (!isAvailable(anchoredBuild.opening.assets)) return;
    assert.equal(anchoredBuild.opening.assets.value.length, 18);
    for (const asset of anchoredBuild.opening.assets.value) {
      assert.ok(isAvailable(asset.plan));
      if (!isAvailable(asset.plan) || asset.plan.value.kind !== "amortizable") continue;
      assert.equal(asset.plan.value.prorataConvention, undefined);
    }
  });

  it("durée non entière ou méthode non linéaire restent bloquées", () => {
    const fractional = candidate({
      key: "frac",
      label: "Durée fractionnaire",
      coutBrut: 1000,
      cumul: 100,
      durationYears: 5.5,
    });
    assert.equal(canOmitHistoricalProrata(fractional), false);
    const fractionalBuild = buildExternalTakeoverFiscalYearOpening(buildInput([fractional]));
    assert.notEqual(fractionalBuild.status, "built");

    const degressif = candidate({
      key: "deg",
      label: "Dégressif",
      coutBrut: 1000,
      cumul: 100,
      method: "degressif",
    });
    assert.equal(canOmitHistoricalProrata(degressif), false);
    const degressifBuild = buildExternalTakeoverFiscalYearOpening(buildInput([degressif]));
    assert.equal(degressifBuild.status, "blocked");
    if (degressifBuild.status === "blocked") {
      assert.ok(degressifBuild.issues.some((issue) => issue.code === "METHOD_UNSUPPORTED"));
    }
  });
});
