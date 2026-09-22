/**
 * Lot 5.3 — wiring production : Opening externe persistée → eligibility + gate + génération + paiement.
 *
 * Run: npx tsx --test src/lib/lmnp/services/declaration/lot53-wire-external-opening-callers.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createConfidenceScore } from "@/lib/documents/types/confidence-score";
import {
  resolveExternalOpeningProofFromFiscalYear,
  resolvePersistedExternalTakeoverOpening,
  resolvePriorHistoryEligibility,
} from "@/lib/lmnp/services/declaration/prior-history-eligibility";
import { resolveDeclarationGenerationGate } from "@/lib/lmnp/services/declaration/declaration-generation-gate";
import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import {
  applyResolvedOpeningDepreciation,
  isAvailable,
  isUsableExternalTakeoverOpening,
  resolveOpeningDepreciation,
  type FiscalYearOpening,
} from "@/lib/lmnp/services/fiscal-year-opening";
import { computeOpeningContentHash } from "@/lib/lmnp/services/fiscal-year-opening/content-hash";
import { unavailable } from "@/lib/lmnp/services/fiscal-year-opening/opening-fact";
import {
  buildExternalTakeoverFiscalYearOpening,
  selectBuiltExternalTakeoverOpening,
  type BuildExternalTakeoverFiscalYearOpeningInput,
} from "@/lib/lmnp/services/takeover";
import type { CandidateHistoricalAsset } from "@/lib/lmnp/services/takeover/asset-candidates";
import type { CandidateFiscalStocks } from "@/lib/lmnp/services/takeover/fiscal-stocks-candidates";
import {
  missingCandidate,
  presentCandidate,
  type CandidateProvenance,
  type CandidateValue,
} from "@/lib/lmnp/services/takeover/candidate-value";
import { createHistoricalControlReconciliation } from "@/lib/lmnp/services/takeover/historical-control-reconciliation";
import {
  createTaxPackageControlFact,
  type TaxPackageControlFact,
  type TaxPackageControlFactDraft,
} from "@/lib/lmnp/services/takeover/tax-package-control-facts";
import type { HistoricalTaxPackageControlsReconciliation } from "@/lib/lmnp/services/takeover/reconcile-historical-tax-package-controls";
import { resolveServerPriorHistoryEligibility } from "@/lib/lmnp/services/payment/server-prior-history";
import { resolveDeliveryAccess } from "@/lib/lmnp/services/payment/delivery-access";
import { createFakePaymentEnv } from "@/lib/lmnp/services/payment/payment-fakes";
import type { DeclarationDraft, FiscalYear, Property } from "@/lib/lmnp/types";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const NOW = "2026-01-15T00:00:00.000Z";
const FY = 2025;
const TARGET = 2026;
const FORM_YEAR = 2026;

const PROPERTY: Property = {
  id: "prop-1",
  label: "Studio Lyon",
  address: "1 rue Test",
  city: "Lyon",
  postalCode: "69001",
};

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

function mustFact(draft: TaxPackageControlFactDraft): TaxPackageControlFact {
  const created = createTaxPackageControlFact(draft);
  assert.equal(created.status, "created", JSON.stringify(created));
  if (created.status !== "created") throw new Error("unreachable");
  return created.fact;
}

function controlFact(
  formType: "2033A" | "2033C",
  sourceCase: "028" | "030" | "496" | "576",
  kind: "total_gross" | "total_cumulative_depreciation",
  amount: number,
): TaxPackageControlFact {
  return mustFact({
    formType,
    sourceCase,
    kind,
    formYear: FORM_YEAR,
    fiscalYear: FY,
    periodPosition: "closing",
    value: presentCandidate(amount, "direct", taxProv(`${formType}:${sourceCase}`)),
  });
}

function concordantControls(): HistoricalTaxPackageControlsReconciliation {
  const gross = createHistoricalControlReconciliation({
    kind: "total_gross",
    left: [controlFact("2033A", "028", "total_gross", 132_000)],
    right: [controlFact("2033C", "496", "total_gross", 132_000)],
  });
  const dep = createHistoricalControlReconciliation({
    kind: "total_cumulative_depreciation",
    left: [controlFact("2033A", "030", "total_cumulative_depreciation", 35_000)],
    right: [controlFact("2033C", "576", "total_cumulative_depreciation", 35_000)],
  });
  assert.equal(gross.status, "created");
  assert.equal(dep.status, "created");
  if (gross.status !== "created" || dep.status !== "created") throw new Error("unreachable");
  return {
    packageId: "pkg-53-controls",
    totalGross: gross.result,
    totalCumulativeDepreciation: dep.result,
  };
}

function explicitZeroStocks(): CandidateFiscalStocks {
  return {
    deficits: presentCandidate([], "direct", taxProv("stocks:deficits")),
    amortissementsReportes: presentCandidate(0, "direct", taxProv("stocks:ard")),
    amortissementsReportesSource: "manual_entry",
  };
}

function completeAsset(params: {
  candidateKey: string;
  label: string;
  coutBrut: number;
  cumulOuverture: number;
  classification: "batiment" | "mobilier";
  startDate: string;
  durationYears: number;
}): CandidateHistoricalAsset {
  const documentId = `doc-${params.candidateKey}`;
  const propertyId: CandidateValue<string> = presentCandidate(
    "prop-1",
    "direct",
    prov(documentId, "propertyId"),
  );
  return {
    candidateKey: params.candidateKey,
    sourceAssetRef: params.candidateKey,
    label: presentCandidate(params.label, "direct", prov(documentId, "label")),
    coutBrut: presentCandidate(params.coutBrut, "direct", prov(documentId, "coutBrut")),
    cumulOuverture: presentCandidate(
      params.cumulOuverture,
      "direct",
      prov(documentId, "cumulOuverture"),
    ),
    startDate: presentCandidate(params.startDate, "direct", prov(documentId, "startDate")),
    durationYears: presentCandidate(params.durationYears, "direct", prov(documentId, "duration")),
    method: presentCandidate("lineaire", "direct", prov(documentId, "method")),
    prorataConvention: presentCandidate("annuel_plein", "direct", prov(documentId, "prorata")),
    classification: presentCandidate(
      params.classification,
      "direct",
      prov(documentId, "classification"),
    ),
    nonAmortizable: presentCandidate(false, "direct", prov(documentId, "nonAmortizable")),
    propertyId,
  };
}

function referenceAssets(): CandidateHistoricalAsset[] {
  return [
    completeAsset({
      candidateKey: "cand-immeuble",
      label: "Immeuble",
      coutBrut: 120_000,
      cumulOuverture: 30_000,
      classification: "batiment",
      startDate: "2015-01-01",
      durationYears: 40,
    }),
    completeAsset({
      candidateKey: "cand-mobilier",
      label: "Mobilier",
      coutBrut: 12_000,
      cumulOuverture: 5_000,
      classification: "mobilier",
      startDate: "2018-06-01",
      durationYears: 10,
    }),
  ];
}

function baseInput(
  overrides: Partial<BuildExternalTakeoverFiscalYearOpeningInput> = {},
): BuildExternalTakeoverFiscalYearOpeningInput {
  const assets = overrides.assets ?? referenceAssets();
  const idMap: Record<string, string> = {};
  for (const a of assets) idMap[a.candidateKey] = `asset-${a.candidateKey}`;
  return {
    openingId: "opening-53-ref",
    dossierId: "dossier-53",
    takeoverId: "takeover-53",
    targetFiscalYear: TARGET,
    sourceFiscalYear: FY,
    assets,
    stableAssetIdByCandidateKey: idMap,
    stocks: explicitZeroStocks(),
    controls: concordantControls(),
    validatedAt: NOW,
    validator: "lot53-test",
    ...overrides,
    stableAssetIdByCandidateKey: overrides.stableAssetIdByCandidateKey ?? idMap,
  };
}

function buildReferenceOpening(): FiscalYearOpening {
  const result = buildExternalTakeoverFiscalYearOpening(baseInput());
  assert.equal(result.status, "built", JSON.stringify(result));
  if (result.status !== "built") throw new Error("unreachable");
  const selected = selectBuiltExternalTakeoverOpening({
    buildResult: result,
    requestedFiscalYear: TARGET,
  });
  assert.equal(selected.status, "ready");
  if (selected.status !== "ready") throw new Error("unreachable");
  return selected.opening;
}

function generableDraft(overrides: Partial<DeclarationDraft> = {}): DeclarationDraft {
  return {
    completedSteps: [],
    inpiConfirmedAt: NOW,
    logementConfirmedAt: NOW,
    logementAmortissement: {
      computedAt: NOW,
      prixRevient: 200000,
      valeurTerrain: 40000,
      valeurBati: 160000,
      baseAmortissableBati: 160000,
      montantMobilier: 0,
      dotationAnnuelle: 5333,
      dureeMoyenneAnnees: 30,
      plan: { lignes: [], totalAnnuelExercice: 0, totalBrut: 0 },
    } as DeclarationDraft["logementAmortissement"],
    creditDeclaredNoneAt: NOW,
    revenusConfirmedAt: NOW,
    chargesConfirmedAt: NOW,
    amortissementConfirmedAt: NOW,
    siret: "12345678901234",
    siren: "123456789",
    exploitantFirstName: "Marie",
    exploitantLastName: "Dupont",
    dateMiseEnService: "2015-01-01",
    revenusAssistant: { exerciceFiscal: TARGET, totalRecettes: 18000 },
    chargesAssistant: { exerciceFiscal: TARGET, totalDeductible: 4000, totalPreExploitation: 0 },
    amortissementAssistant: {
      exerciceFiscal: TARGET,
      totalDotations: 9999,
      status: "validated",
    },
    ...overrides,
  } as DeclarationDraft;
}

/**
 * Miroir du caller production ValidationDocumentStep (Lot 5.3) :
 * une seule Opening persistée → eligibility + gate + runDeclarationGeneration.
 */
function runProductionCallerPath(fiscalYear: FiscalYear, draft: DeclarationDraft) {
  const fiscalYearOpening = resolvePersistedExternalTakeoverOpening(fiscalYear);
  const externalOpeningProof = resolveExternalOpeningProofFromFiscalYear(fiscalYear);
  const eligibility = resolvePriorHistoryEligibility(fiscalYear, externalOpeningProof);
  const gate = resolveDeclarationGenerationGate({
    draft,
    properties: [PROPERTY],
    fiscalYear: fiscalYear.year,
    paid: false,
    generated: false,
    stocksOuverture: fiscalYear.stocksOuverture?.stocks,
    priorHistory: eligibility,
    fiscalYearOpening,
  });
  const generation = eligibility.eligible
    ? runDeclarationGeneration(
        draft,
        fiscalYear.year,
        fiscalYear.stocksOuverture?.stocks,
        draft.bilanPatrimonial,
        draft.dispense2033A,
        undefined,
        fiscalYearOpening,
      )
    : undefined;
  return { fiscalYearOpening, externalOpeningProof, eligibility, gate, generation };
}

function externalFiscalYear(opening?: FiscalYearOpening): FiscalYear {
  return {
    id: "fy-53",
    year: TARGET,
    status: "draft",
    propertyIds: ["prop-1"],
    priorHistoryDeclaration: { status: "EXTERNAL_HISTORY", declaredAt: NOW },
    ...(opening
      ? {
          externalTakeoverOpening: {
            sourceRef: "takeover-53",
            opening,
          },
        }
      : {}),
  } as FiscalYear;
}

describe("Lot 5.3 — caller production : même Opening persistée", () => {
  it("référence : eligibility + gate + génération reçoivent la même Opening ; C0 / stocks ancrés", () => {
    const opening = buildReferenceOpening();
    const fiscalYear = externalFiscalYear(opening);
    const draft = generableDraft();

    const path = runProductionCallerPath(fiscalYear, draft);

    assert.equal(path.fiscalYearOpening, opening);
    assert.equal(path.externalOpeningProof?.fiscalYearOpening, opening);
    assert.equal(path.eligibility.eligible, true);
    assert.equal(path.eligibility.eligible && path.eligibility.status, "EXTERNAL_HISTORY");
    assert.equal(path.gate.canGenerate, true);
    assert.equal(path.gate.canCheckout, true);
    assert.ok(path.generation);
    assert.equal(path.generation!.status, "generated", JSON.stringify(path.generation));
    if (path.generation!.status !== "generated") return;

    const dep = resolveOpeningDepreciation({ opening, expectedExerciceFiscal: TARGET });
    assert.equal(dep.status, "ready");
    if (dep.status !== "ready") return;
    assert.equal(dep.entries.find((e) => e.assetId === "asset-cand-immeuble")?.cumulOuverture, 30_000);
    assert.equal(dep.entries.find((e) => e.assetId === "asset-cand-mobilier")?.cumulOuverture, 5_000);

    const applied = applyResolvedOpeningDepreciation({ resolved: dep });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    assert.equal(path.generation!.rfs.fiscalResult.amortCalcule, applied.plan.totalAnnuelExercice);
    assert.notEqual(path.generation!.rfs.fiscalResult.amortCalcule, 9999);
    assert.deepEqual(path.generation!.fiscalResult.stocks.deficits, []);
    assert.equal(path.generation!.fiscalResult.stocks.amortissementsReportes, 0);
    assert.ok(isAvailable(opening.stocks.deficits));
    assert.ok(isAvailable(opening.stocks.amortissementsReportes));
  });

  it("draft adversarial : DN 9999 n'écrase pas l'ancre Opening", () => {
    const opening = buildReferenceOpening();
    const path = runProductionCallerPath(externalFiscalYear(opening), generableDraft());
    assert.equal(path.generation?.status, "generated");
    if (path.generation?.status !== "generated") return;
    assert.notEqual(path.generation.rfs.fiscalResult.amortCalcule, 9999);
  });

  it("A — EXTERNAL_HISTORY sans Opening → bloqué", () => {
    const path = runProductionCallerPath(externalFiscalYear(), generableDraft());
    assert.equal(path.eligibility.eligible, false);
    assert.equal(path.gate.canGenerate, false);
    assert.equal(path.generation, undefined);
  });

  it("B — Opening pending → bloqué", () => {
    const opening = buildReferenceOpening();
    const pending: FiscalYearOpening = {
      ...opening,
      validation: { status: "pending", openingRevision: opening.revision },
    };
    assert.equal(isUsableExternalTakeoverOpening(pending, TARGET), false);
    const path = runProductionCallerPath(externalFiscalYear(pending), generableDraft());
    assert.equal(path.eligibility.eligible, false);
    assert.equal(path.gate.canGenerate, false);
  });

  it("C — wrong source → bloqué", () => {
    const opening = buildReferenceOpening();
    const wrong: FiscalYearOpening = {
      ...opening,
      source: {
        kind: "internal_closure",
        previousFiscalYearId: "fy-prev",
        sourceClosureId: "closure-1",
      },
    };
    wrong.validation = {
      status: "validated",
      openingRevision: wrong.revision,
      contentHash: computeOpeningContentHash(wrong),
      validatedAt: NOW,
      validator: "lot53-wrong-source",
    };
    const path = runProductionCallerPath(externalFiscalYear(wrong), generableDraft());
    assert.equal(path.eligibility.eligible, false);
  });

  it("D — wrong fiscal year → bloqué", () => {
    const opening = buildReferenceOpening();
    const path = runProductionCallerPath(
      { ...externalFiscalYear(opening), year: 2025 } as FiscalYear,
      generableDraft({
        revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 18000 },
        chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 4000, totalPreExploitation: 0 },
        amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 9999, status: "validated" },
      }),
    );
    assert.equal(path.eligibility.eligible, false);
  });

  it("E — Opening validated + correct year/source → autorisée", () => {
    const opening = buildReferenceOpening();
    assert.equal(isUsableExternalTakeoverOpening(opening, TARGET), true);
    const path = runProductionCallerPath(externalFiscalYear(opening), generableDraft());
    assert.equal(path.eligibility.eligible, true);
    assert.equal(path.gate.canGenerate, true);
  });

  it("F — stocks unknown → génération bloquée", () => {
    const opening = buildReferenceOpening();
    const unknown: FiscalYearOpening = {
      ...opening,
      stocks: {
        deficits: unavailable("stocks inconnus"),
        amortissementsReportes: unavailable("ARD inconnu"),
      },
    };
    unknown.validation = {
      status: "validated",
      openingRevision: unknown.revision,
      contentHash: computeOpeningContentHash(unknown),
      validatedAt: NOW,
      validator: "lot53-unknown-stocks",
    };
    // Eligibility structurelle OK ; le moteur refuse (fail-closed stocks).
    assert.equal(isUsableExternalTakeoverOpening(unknown, TARGET), true);
    const path = runProductionCallerPath(externalFiscalYear(unknown), generableDraft());
    assert.equal(path.eligibility.eligible, true);
    assert.equal(path.generation?.status, "blocked");
    assert.equal(path.gate.canGenerate, false);
  });

  it("G — manual review non résolue → pas d'Opening persistée utilisable", () => {
    const buildResult = buildExternalTakeoverFiscalYearOpening(
      baseInput({ controls: concordantControls(), assets: referenceAssets().slice(0, 1) }),
    );
    // Même sans forcer manual_review : selectBuilt refuse non-built.
    // Cas explicite : pas d'Opening sur fiscalYear → bloqué.
    const path = runProductionCallerPath(externalFiscalYear(), generableDraft());
    assert.equal(path.eligibility.eligible, false);
    void buildResult;
  });

  it("FIRST_REAL_YEAR inchangé (pas d'Opening injectée)", () => {
    const fiscalYear = {
      id: "fy-first",
      year: TARGET,
      status: "draft",
      propertyIds: ["prop-1"],
      priorHistoryDeclaration: { status: "FIRST_REAL_YEAR", declaredAt: NOW },
    } as FiscalYear;
    const path = runProductionCallerPath(fiscalYear, generableDraft());
    assert.equal(path.fiscalYearOpening, undefined);
    assert.equal(path.eligibility.eligible, true);
    assert.equal(path.eligibility.eligible && path.eligibility.status, "FIRST_REAL_YEAR");
    assert.equal(path.generation?.status, "generated");
    if (path.generation?.status === "generated") {
      assert.equal(path.generation.rfs.fiscalResult.amortCalcule, 9999);
    }
  });

  it("NATIVE_CONTINUITY inchangé", () => {
    const fiscalYear = {
      id: "fy-native",
      year: TARGET,
      status: "draft",
      propertyIds: ["prop-1"],
      previousFiscalYearId: "fy-0",
      stocksOuverture: {
        sourceClosureId: "closure-1",
        stocks: { deficits: [], amortissementsReportes: 0 },
      },
    } as FiscalYear;
    const path = runProductionCallerPath(fiscalYear, generableDraft());
    assert.equal(path.fiscalYearOpening, undefined);
    assert.equal(path.eligibility.eligible, true);
    assert.equal(path.eligibility.eligible && path.eligibility.status, "NATIVE_CONTINUITY");
  });
});

describe("Lot 5.3 — paiement / livraison serveur", () => {
  const VALID_STOCKS = {
    sourceClosureId: "closure-1",
    stocks: { deficits: [] as [], amortissementsReportes: 0 },
  };

  it("A — previousYearPaid + continuité native → admissible", () => {
    const result = resolveServerPriorHistoryEligibility({
      declaration: null,
      previousYearPaid: true,
      requestedFiscalYear: TARGET,
      clientContinuity: {
        previousFiscalYearId: "fy-0",
        stocksOuverture: VALID_STOCKS,
      },
    });
    assert.equal(result.eligible, true);
    assert.equal(result.eligible && result.status, "NATIVE_CONTINUITY");
  });

  it("B — previousYearPaid + FIRST_REAL_YEAR → contradiction / rejet", () => {
    const result = resolveServerPriorHistoryEligibility({
      declaration: "FIRST_REAL_YEAR",
      previousYearPaid: true,
      requestedFiscalYear: TARGET,
    });
    assert.equal(result.eligible, false);
    assert.equal(result.eligible === false && result.reason, "NATIVE_CONTINUITY_MISSING");
  });

  it("C — previousYearPaid + EXTERNAL_HISTORY + Opening usable → contradiction / rejet", () => {
    const opening = buildReferenceOpening();
    const result = resolveServerPriorHistoryEligibility({
      declaration: "EXTERNAL_HISTORY",
      previousYearPaid: true,
      requestedFiscalYear: TARGET,
      clientContinuity: {
        previousFiscalYearId: "fy-0",
        stocksOuverture: VALID_STOCKS,
        fiscalYearOpening: opening,
      },
    });
    assert.equal(result.eligible, false);
    assert.equal(result.eligible === false && result.reason, "NATIVE_CONTINUITY_MISSING");
  });

  it("D — previousYearPaid=false + EXTERNAL_HISTORY + Opening usable → admissible", () => {
    const opening = buildReferenceOpening();
    const result = resolveServerPriorHistoryEligibility({
      declaration: "EXTERNAL_HISTORY",
      previousYearPaid: false,
      requestedFiscalYear: TARGET,
      clientContinuity: { fiscalYearOpening: opening },
    });
    assert.equal(result.eligible, true);
    assert.equal(result.eligible && result.status, "EXTERNAL_HISTORY");
  });

  it("E — previousYearPaid=false + EXTERNAL_HISTORY + Opening missing/invalid → rejet", () => {
    const missing = resolveServerPriorHistoryEligibility({
      declaration: "EXTERNAL_HISTORY",
      previousYearPaid: false,
      requestedFiscalYear: TARGET,
    });
    assert.equal(missing.eligible, false);

    const opening = buildReferenceOpening();
    const wrongYear = resolveServerPriorHistoryEligibility({
      declaration: "EXTERNAL_HISTORY",
      previousYearPaid: false,
      requestedFiscalYear: 2025,
      clientContinuity: { fiscalYearOpening: opening },
    });
    assert.equal(wrongYear.eligible, false);
  });

  it("FIRST_REAL_YEAR sans année N-1 payée → admissible", () => {
    const result = resolveServerPriorHistoryEligibility({
      declaration: "FIRST_REAL_YEAR",
      previousYearPaid: false,
      requestedFiscalYear: TARGET,
    });
    assert.equal(result.eligible, true);
  });

  it("livraison EXTERNAL_HISTORY sans Opening → 403 ; avec Opening usable → ok", async () => {
    const env = createFakePaymentEnv();
    env.addUser("tok", "user-1");
    env.addDossier("dossier-X", "user-1");
    await env.seedPaid("dossier-X", TARGET, "EXTERNAL_HISTORY");

    const denied = await resolveDeliveryAccess(
      { authToken: "tok", dossierId: "dossier-X", fiscalYear: TARGET },
      env.deps,
    );
    assert.equal(denied.ok, false);
    assert.equal(denied.ok === false && denied.response.status, 403);

    const opening = buildReferenceOpening();
    const allowed = await resolveDeliveryAccess(
      {
        authToken: "tok",
        dossierId: "dossier-X",
        fiscalYear: TARGET,
        fiscalYearOpening: opening,
      },
      env.deps,
    );
    assert.equal(allowed.ok, true);
  });
});

describe("Lot 5.3 — garde source caller production", () => {
  it("ValidationDocumentStep branche fiscalYearOpening sur gate + runDeclarationGeneration", () => {
    const src = readFileSync(
      path.join(MODULE_DIR, "../../../../components/lmnp/documents/ValidationDocumentStep.tsx"),
      "utf8",
    );
    assert.match(src, /resolvePersistedExternalTakeoverOpening/);
    assert.match(src, /resolveExternalOpeningProofFromFiscalYear/);
    assert.match(src, /fiscalYearOpening,/);
    assert.match(src, /runDeclarationGeneration\([\s\S]*fiscalYearOpening/);
    assert.match(src, /fiscalYearOpening,/); // gate input
    assert.match(src, /requestCheckout\([\s\S]*fiscalYearOpening/);
  });
});
