/**
 * P0-2F — la classification « mobilier » prouvée à la reprise survit jusqu'à la
 * RFS / 2033-C (case 476), la clôture, N+1 et N+2. Chemin production réel :
 * candidat → Opening (buildExternalTakeoverFiscalYearOpening) → génération →
 * RFS → liasse → clôture (prepareFiscalYearTransitionCandidate) → N+1 → N+2.
 * Run: npx tsx --test src/lib/lmnp/services/takeover/p0-2f-mobilier-classification.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createConfidenceScore } from "@/lib/documents/types/confidence-score";
import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import { resolveDeclarationOutOfDate } from "@/lib/lmnp/services/declaration/declaration-freshness";
import { resolveImmobilisationsContinuityForGeneration } from "@/lib/lmnp/services/dossier/fiscal-year-cycle";
import type { FiscalYearOpening } from "@/lib/lmnp/services/fiscal-year-opening/types";
import { prepareFiscalYearTransitionCandidate } from "@/lib/lmnp/services/fiscal-year-transition/prepare-transition";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { DeclarationDraft, FiscalYear } from "@/lib/lmnp/types";
import type { ComposantNouveau } from "@/runtime/capabilities/f012/types";
import type { CandidateAssetClassification, CandidateHistoricalAsset } from "./asset-candidates";
import { buildExternalTakeoverFiscalYearOpening } from "./build-external-takeover-opening";
import { missingCandidate, presentCandidate, type CandidateProvenance } from "./candidate-value";
import type { CandidateFiscalStocks } from "./fiscal-stocks-candidates";
import { createHistoricalControlReconciliation } from "./historical-control-reconciliation";
import { createTaxPackageControlFact, type TaxPackageControlFactDraft } from "./tax-package-control-facts";

const FY = 2026;
const NOW = "2026-12-31T00:00:00.000Z";
const PROP = "prop-1";
const DOSSIER = "dossier-p0-2f";
const PROPERTY = { id: PROP, label: "Bien", address: "1 rue X", city: "Lyon", postalCode: "69000" };

function prov(ref: string): CandidateProvenance {
  return {
    documentId: "doc-reg", documentRole: "depreciation_register", fieldLabel: ref, sourceRef: ref,
    extractionMethod: "fixture_structured", confidence: createConfidenceScore(0.9, ["fixture"]),
    evidence: { snippet: ref, page: 1 }, fieldSource: "extracted",
  };
}
function taxProv(ref: string): CandidateProvenance {
  return { ...prov(ref), documentId: "doc-liasse", documentRole: "prior_tax_package" };
}
function fact(draft: TaxPackageControlFactDraft) {
  const created = createTaxPackageControlFact(draft);
  assert.equal(created.status, "created", JSON.stringify(created));
  if (created.status !== "created") throw new Error("unreachable");
  return created.fact;
}
function controls(gross: number, cumul: number) {
  const g = createHistoricalControlReconciliation({
    kind: "total_gross",
    left: [fact({ formType: "2033A", sourceCase: "028", kind: "total_gross", formYear: FY, fiscalYear: FY - 1, periodPosition: "closing", value: presentCandidate(gross, "direct", taxProv("028")) })],
    right: [fact({ formType: "2033C", sourceCase: "496", kind: "total_gross", formYear: FY, fiscalYear: FY - 1, periodPosition: "closing", value: presentCandidate(gross, "direct", taxProv("496")) })],
  });
  const d = createHistoricalControlReconciliation({
    kind: "total_cumulative_depreciation",
    left: [fact({ formType: "2033A", sourceCase: "030", kind: "total_cumulative_depreciation", formYear: FY, fiscalYear: FY - 1, periodPosition: "closing", value: presentCandidate(cumul, "direct", taxProv("030")) })],
    right: [fact({ formType: "2033C", sourceCase: "576", kind: "total_cumulative_depreciation", formYear: FY, fiscalYear: FY - 1, periodPosition: "closing", value: presentCandidate(cumul, "direct", taxProv("576")) })],
  });
  if (g.status !== "created" || d.status !== "created") throw new Error("controls");
  return { packageId: "pkg-p0-2f", totalGross: g.result, totalCumulativeDepreciation: d.result };
}
const stocks = (): CandidateFiscalStocks => ({
  deficits: presentCandidate([], "direct", taxProv("stocks:deficits")),
  amortissementsReportes: presentCandidate(0, "direct", taxProv("stocks:ard")),
});

function cand(key: string, brut: number, cumul: number, classification: CandidateAssetClassification | "missing", years = 20, start = "2010-01-01", nonAmortizable = false): CandidateHistoricalAsset {
  return {
    candidateKey: key, sourceAssetRef: key,
    label: presentCandidate(`Actif ${key}`, "direct", prov("label")),
    coutBrut: presentCandidate(brut, "direct", prov("brut")),
    cumulOuverture: presentCandidate(cumul, "direct", prov("cumul")),
    startDate: nonAmortizable ? missingCandidate("terrain") : presentCandidate(start, "direct", prov("start")),
    durationYears: nonAmortizable ? missingCandidate("terrain") : presentCandidate(years, "direct", prov("duration")),
    method: presentCandidate("lineaire", "direct", prov("method")),
    prorataConvention: missingCandidate("absente"),
    classification: classification === "missing" ? missingCandidate("absente") : presentCandidate(classification, "direct", prov("classification")),
    nonAmortizable: presentCandidate(nonAmortizable, "direct", prov("nonAmortizable")),
    propertyId: presentCandidate(PROP, "direct", prov("propertyId")),
  };
}

/** Bâti 100 000 (cumul 20 000), mobilier prouvé 6 000 / 5 ans (cumul 3 600), « autre » 4 000 / 5 ans, terrain 30 000. */
function candidates(mobilierClass: CandidateAssetClassification | "missing" = "mobilier") {
  return [
    cand("BAT", 100_000, 20_000, "batiment"),
    cand("MOB", 6_000, 3_600, mobilierClass, 5, "2023-01-01"),
    cand("AUT", 4_000, 2_400, "autre", 5, "2023-01-01"),
    cand("TER", 30_000, 0, "terrain", 0, "", true),
  ];
}

function openingFrom(assets: CandidateHistoricalAsset[]): FiscalYearOpening {
  const idMap: Record<string, string> = {};
  for (const a of assets) idMap[a.candidateKey] = `asset-${a.candidateKey}`;
  const brut = assets.reduce((s, a) => s + (a.coutBrut.status === "present" ? (a.coutBrut as { value: number }).value : 0), 0);
  const cumul = assets.reduce((s, a) => s + (a.cumulOuverture.status === "present" ? (a.cumulOuverture as { value: number }).value : 0), 0);
  const built = buildExternalTakeoverFiscalYearOpening({
    openingId: "opening-p0-2f", dossierId: DOSSIER, takeoverId: "tk-p0-2f", targetFiscalYear: FY, sourceFiscalYear: FY - 1,
    assets, stableAssetIdByCandidateKey: idMap, stocks: stocks(), controls: controls(brut, cumul),
    validatedAt: NOW, validator: "p0-2f-test",
  });
  assert.equal(built.status, "built", JSON.stringify(built));
  if (built.status !== "built") throw new Error("unreachable");
  return built.opening;
}

const ACQ_D: ComposantNouveau = {
  id: "asset-d", label: "Acquisition D", montant: 3_000, dureeAnnees: 12, dotationAnnuelle: 250,
  nature: "amélioration", dateDebut: `${FY}-01-01`, origin: "f012_travaux",
};

function draft(f010Mobilier = 0): DeclarationDraft {
  return {
    completedSteps: [], inpiConfirmedAt: NOW, logementConfirmedAt: NOW,
    logementAmortissement: {
      computedAt: NOW, prixRevient: 200_000, valeurTerrain: 40_000, valeurBati: 160_000,
      baseAmortissableBati: 160_000, montantMobilier: f010Mobilier, dotationAnnuelle: 7_000, dureeMoyenneAnnees: 30,
      plan: {
        lignes: [{ label: "F-010 divergent", montant: 200_000, dureeAnnees: 30, dotationExercice: 7_000, amortissementsCumules: 7_000, vnc: 193_000, id: "f010-0" }],
        totalAnnuelExercice: 7_000, totalBrut: 200_000,
      },
    } as DeclarationDraft["logementAmortissement"],
    creditDeclaredNoneAt: NOW, revenusConfirmedAt: NOW, chargesConfirmedAt: NOW, amortissementConfirmedAt: NOW,
    siret: "12345678901234", siren: "123456789", exploitantFirstName: "Marie", exploitantLastName: "Dupont",
    exploitantEmail: "marie.dupont@example.com", exploitantTelephone: "0601020304",
    personalAddress: "10 rue des Lilas", personalCity: "Lyon", personalPostalCode: "69001",
    dateMiseEnService: "1999-09-09", declaration: { currentVersionId: "ver", versions: [] },
    revenusAssistant: { exerciceFiscal: FY, totalRecettes: 18_000 },
    chargesAssistant: { exerciceFiscal: FY, totalDeductible: 4_000, totalPreExploitation: 0, composantsNouveaux: [ACQ_D] },
    amortissementAssistant: { exerciceFiscal: FY, totalDotations: 9_999, status: "validated" },
  } as DeclarationDraft;
}

function fiscalYear(op: FiscalYearOpening): FiscalYear {
  return {
    id: "fy-p0-2f", year: FY, status: "ready_to_close", regime: "reel", propertyIds: [PROP], dossierId: DOSSIER,
    declarationGeneratedAt: NOW, closures: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: NOW,
    priorHistoryDeclaration: { status: "EXTERNAL_HISTORY", declaredAt: NOW },
    externalTakeoverOpening: { sourceRef: "tk-p0-2f", opening: op },
  } as FiscalYear;
}

function generateN(d: DeclarationDraft, op: FiscalYearOpening) {
  const gen = runDeclarationGeneration(d, FY, undefined, undefined, undefined, { propertyId: PROP, composantsF012Merged: [ACQ_D] }, op);
  assert.equal(gen.status, "generated", JSON.stringify(gen));
  if (gen.status !== "generated") throw new Error("unreachable");
  return gen;
}

function workspaceN(d: DeclarationDraft, op: FiscalYearOpening): PersistedWorkspace {
  const gen = generateN(d, op);
  return {
    fiscalYear: fiscalYear(op), properties: [{ ...PROPERTY }], documents: [], extractions: [], validationItems: [], ledgerEntries: [],
    declarationDraft: { ...d, fiscalResult: gen.fiscalResult, rfs: gen.rfs, liasseResult: gen.liasseResult, liasseRfs: gen.liasseRfs } as DeclarationDraft,
    aiActivityFeed: [],
  };
}

const cs = (r: { liasseRfs: { form2033C: { cases: { caseId: string; value?: unknown }[] } } }, id: string) =>
  r.liasseRfs.form2033C.cases.find((c) => c.caseId === id)?.value;

/** Draft N+1 : F-010 volontairement divergent, comme en production tunnel B. */
function draftNext(ws: PersistedWorkspace, next: PersistedWorkspace, year: number, f010Mobilier = 0, acq: ComposantNouveau[] = []): DeclarationDraft {
  return {
    ...ws.declarationDraft, ...next.declarationDraft,
    logementAmortissement: draft(f010Mobilier).logementAmortissement,
    revenusAssistant: { ...ws.declarationDraft?.revenusAssistant, exerciceFiscal: year },
    chargesAssistant: { ...ws.declarationDraft?.chargesAssistant, exerciceFiscal: year, composantsNouveaux: acq },
    amortissementAssistant: { exerciceFiscal: year, totalDotations: 7_000, status: "validated" },
  } as DeclarationDraft;
}
function generateNext(next: PersistedWorkspace, d: DeclarationDraft, year: number) {
  const continuity = resolveImmobilisationsContinuityForGeneration({
    draft: d, properties: next.properties, propertyIds: next.fiscalYear.propertyIds,
    immobilisationsOuverture: next.fiscalYear.immobilisationsOuverture,
    repriseHistoriqueEnContinuite: next.fiscalYear.repriseHistoriqueEnContinuite,
    previousFiscalYearId: next.fiscalYear.previousFiscalYearId,
  });
  const r = runDeclarationGeneration(d, year, next.fiscalYear.stocksOuverture?.stocks, undefined, undefined, continuity);
  assert.equal(r.status, "generated", r.status === "blocked" ? JSON.stringify(r.anomalies) : undefined);
  if (r.status !== "generated") throw new Error("unreachable");
  return r;
}
function closeAndOpen(ws: PersistedWorkspace, now: string) {
  const prepared = prepareFiscalYearTransitionCandidate({ workspace: ws, dossierId: DOSSIER, now });
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  if (!prepared.ok) throw new Error("unreachable");
  return prepared;
}
function asWorkspaceN1(next: PersistedWorkspace, d: DeclarationDraft, gen: ReturnType<typeof generateNext>): PersistedWorkspace {
  return {
    ...next,
    fiscalYear: { ...next.fiscalYear, status: "ready_to_close", declarationGeneratedAt: NOW } as FiscalYear,
    declarationDraft: { ...d, fiscalResult: gen.fiscalResult, rfs: gen.rfs, liasseResult: gen.liasseResult, liasseRfs: gen.liasseRfs } as DeclarationDraft,
  };
}
const natureOf = (snap: { actifs: { id: string; nature?: string }[] } | undefined) =>
  Object.fromEntries((snap?.actifs ?? []).map((a) => [a.id, a.nature]));

describe("P0-2F — classification mobilier de la reprise", () => {
  it("ORACLE A/C/D/G — mobilier prouvé : Opening, RFS, 476 ; terrain/bâti/autre/F-012 intacts ; F-010 divergent ignoré", () => {
    const op = openingFrom(candidates());
    const assets = op.assets.status === "available" ? op.assets.value : [];
    const nat = Object.fromEntries(assets.map((a) => [a.id, (a as { nature?: string }).nature]));
    assert.deepEqual(nat, { "asset-BAT": undefined, "asset-MOB": "mobilier", "asset-AUT": undefined, "asset-TER": undefined });
    assert.equal(assets.find((a) => a.id === "asset-MOB")?.categorie, "composant");
    assert.equal(assets.find((a) => a.id === "asset-TER")?.categorie, "terrain");

    // F-010 dit mobilier = 9 999 : ne doit jamais remplacer la vérité historique.
    const gen = generateN(draft(9_999), op);
    const immo = gen.rfs.immobilisations!;
    assert.equal(immo.montantMobilier, 6_000);
    assert.equal(immo.valeurTerrain, 30_000);
    const mob = immo.lignes.find((l) => l.id === "asset-MOB")!;
    assert.equal(mob.montant, 6_000);
    assert.equal(mob.dureeAnnees, 5);
    assert.equal(mob.dotationExercice, 1_200);
    assert.equal(mob.amortissementsCumules, 4_800);
    assert.equal((mob as { nature?: string }).nature, "mobilier");
    assert.equal((immo.lignes.find((l) => l.id === "asset-AUT") as { nature?: string }).nature, undefined);
    assert.equal((immo.lignes.find((l) => l.id === "asset-BAT") as { nature?: string }).nature, undefined);
    // Totaux inchangés : le mobilier reste dans les lignes (pas de double comptage).
    assert.equal(immo.totalBrut, 110_000);
    assert.equal(cs(gen, "426"), 30_000);
    assert.equal(cs(gen, "476"), 6_000);
    assert.equal(cs(gen, "490"), 140_000);
    assert.equal(cs(gen, "496"), 143_000);
    assert.equal(cs(gen, "576") !== undefined, true);
    assert.equal(gen.liasseRfs.form2033C.casesNonAlimentees.some((c) => c.caseId === "476"), false);
  });

  it("ORACLE B / ATTACK 1 — sans preuve explicite, jamais mobilier (476 non alimentée)", () => {
    for (const cls of ["missing", "autre", "batiment"] as const) {
      const op = openingFrom(candidates(cls === "missing" ? "autre" : cls));
      const gen = generateN(draft(9_999), op);
      assert.equal(gen.rfs.immobilisations?.montantMobilier, undefined, cls);
      assert.equal(cs(gen, "476"), undefined, cls);
      assert.equal(gen.liasseRfs.form2033C.casesNonAlimentees.some((c) => c.caseId === "476"), true, cls);
    }
  });

  it("ORACLE E/F / ATTACK 5 — closing N → N+1 → N+2 : mobilier conservé sans retour à F-010", () => {
    const op = openingFrom(candidates());
    const ws = workspaceN(draft(), op);
    const closedN = closeAndOpen(ws, NOW);
    const snapN = closedN.closedFiscalYear.closures.at(-1)?.immobilisationsComptables;
    assert.deepEqual(natureOf(snapN), { "asset-BAT": undefined, "asset-MOB": "mobilier", "asset-AUT": undefined, terrain: undefined, "asset-d": undefined });
    assert.equal(snapN?.actifs.find((a) => a.id === "terrain")?.categorie, "terrain");

    // N+1 : F-010 divergent (mobilier 777) ; F-012 D devenu historique ; nouvelle acquisition E.
    const next = closedN.nextWorkspace;
    const dN1 = draftNext(ws, next, FY + 1, 777, []);
    const genN1 = generateNext(next, dN1, FY + 1);
    const immoN1 = genN1.rfs.immobilisations!;
    assert.equal(immoN1.montantMobilier, 6_000);
    assert.equal((immoN1.lignes.find((l) => l.id === "asset-MOB") as { nature?: string }).nature, "mobilier");
    assert.equal(immoN1.valeurTerrain, 30_000);
    assert.equal(cs(genN1, "476"), 6_000);
    assert.equal(cs(genN1, "426"), 30_000);
    assert.equal(cs(genN1, "490"), 143_000);

    const wsN1 = asWorkspaceN1(next, dN1, genN1);
    assert.equal(resolveDeclarationOutOfDate({ fiscalYear: wsN1.fiscalYear, declarationDraft: wsN1.declarationDraft, properties: wsN1.properties }), false);
    const closedN1 = closeAndOpen(wsN1, "2027-12-31T00:00:00.000Z");
    assert.equal(natureOf(closedN1.closedFiscalYear.closures.at(-1)?.immobilisationsComptables)["asset-MOB"], "mobilier");

    const dN2 = draftNext(wsN1, closedN1.nextWorkspace, FY + 2, 555, []);
    const genN2 = generateNext(closedN1.nextWorkspace, dN2, FY + 2);
    assert.equal(genN2.rfs.immobilisations?.montantMobilier, 6_000);
    assert.equal(cs(genN2, "476"), 6_000);
    assert.equal(genN2.rfs.immobilisations?.lignes.find((l) => l.id === "asset-MOB")?.amortissementsCumules, 6_000);
  });

  it("ORACLE H / ATTACK 7 — dossier natif sans takeover : 476 = F-010 inchangé", () => {
    const d = draft(4_000);
    const gen = runDeclarationGeneration(d, FY, undefined, undefined, undefined, { propertyId: PROP });
    assert.equal(gen.status, "generated", JSON.stringify(gen));
    if (gen.status !== "generated") return;
    assert.equal(gen.rfs.immobilisations?.montantMobilier, 4_000);
    assert.equal(cs(gen, "476"), 4_000);
    assert.equal(gen.rfs.immobilisations?.lignes.some((l) => (l as { nature?: string }).nature !== undefined), false);
  });

  it("ATTACK 4 — terrain classé « mobilier » + non amortissable : reste terrain, jamais mobilier", () => {
    const odd = cand("TER", 30_000, 0, "mobilier", 0, "", true);
    const op = openingFrom([cand("BAT", 100_000, 20_000, "batiment"), odd]);
    const assets = op.assets.status === "available" ? op.assets.value : [];
    const ter = assets.find((a) => a.id === "asset-TER")!;
    assert.equal(ter.categorie, "terrain");
    assert.equal((ter as { nature?: string }).nature, undefined);
    const gen = generateN(draft(), op);
    assert.equal(gen.rfs.immobilisations?.montantMobilier, undefined);
    assert.equal(cs(gen, "426"), 30_000);
  });
});
