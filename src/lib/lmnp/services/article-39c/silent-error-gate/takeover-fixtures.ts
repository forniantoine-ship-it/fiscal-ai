/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures de brouillons hétérogènes (test) */
/**
 * GATE-1 §8 — reprise comptable (EXTERNAL_HISTORY) : Opening externe validée construite par le VRAI constructeur (4F.1), copiée du
 * montage du lot 5.3 (les entrées ne contiennent aucune valeur attendue : stocks et immobilisations reprises sont des FAITS d'entrée).
 */
import { createConfidenceScore } from "@/lib/documents/types/confidence-score";
import { buildExternalTakeoverFiscalYearOpening, selectBuiltExternalTakeoverOpening, type BuildExternalTakeoverFiscalYearOpeningInput } from "@/lib/lmnp/services/takeover";
import type { CandidateHistoricalAsset } from "@/lib/lmnp/services/takeover/asset-candidates";
import type { CandidateFiscalStocks } from "@/lib/lmnp/services/takeover/fiscal-stocks-candidates";
import { missingCandidate, presentCandidate, type CandidateProvenance, type CandidateValue } from "@/lib/lmnp/services/takeover/candidate-value";
import { createHistoricalControlReconciliation } from "@/lib/lmnp/services/takeover/historical-control-reconciliation";
import { createTaxPackageControlFact, type TaxPackageControlFact, type TaxPackageControlFactDraft } from "@/lib/lmnp/services/takeover/tax-package-control-facts";
import type { HistoricalTaxPackageControlsReconciliation } from "@/lib/lmnp/services/takeover/reconcile-historical-tax-package-controls";
import type { FiscalYearOpening } from "@/lib/lmnp/services/fiscal-year-opening";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { caseDossier, type Case } from "./fixtures.test";

const NOW = "2026-01-15T00:00:00.000Z";
export const FY = 2025;
export const TARGET = 2026;

const prov = (documentId: string, sourceRef: string): CandidateProvenance => ({
  documentId, documentRole: "depreciation_register", fieldLabel: sourceRef, sourceRef, extractionMethod: "fixture_structured",
  confidence: createConfidenceScore(0.9, ["fixture"]), evidence: { snippet: sourceRef, page: 1 }, fieldSource: "extracted",
});
const taxProv = (sourceRef: string): CandidateProvenance => ({
  documentId: "doc-liasse", documentRole: "prior_tax_package", fieldLabel: sourceRef, sourceRef, extractionMethod: "fixture_structured",
  confidence: createConfidenceScore(0.92, ["fixture"]), evidence: { snippet: sourceRef, page: 1 }, fieldSource: "extracted",
});
function mustFact(draft: TaxPackageControlFactDraft): TaxPackageControlFact {
  const created = createTaxPackageControlFact(draft);
  if (created.status !== "created") throw new Error(JSON.stringify(created));
  return created.fact;
}
const controlFact = (formType: "2033A" | "2033C", sourceCase: "028" | "030" | "496" | "576", kind: "total_gross" | "total_cumulative_depreciation", amount: number) =>
  mustFact({ formType, sourceCase, kind, formYear: TARGET, fiscalYear: FY, periodPosition: "closing", value: presentCandidate(amount, "direct", taxProv(`${formType}:${sourceCase}`)) });

function controls(gross: number, cumul: number): HistoricalTaxPackageControlsReconciliation {
  const g = createHistoricalControlReconciliation({ kind: "total_gross", left: [controlFact("2033A", "028", "total_gross", gross)], right: [controlFact("2033C", "496", "total_gross", gross)] });
  const d = createHistoricalControlReconciliation({ kind: "total_cumulative_depreciation", left: [controlFact("2033A", "030", "total_cumulative_depreciation", cumul)], right: [controlFact("2033C", "576", "total_cumulative_depreciation", cumul)] });
  if (g.status !== "created" || d.status !== "created") throw new Error("controls");
  return { packageId: "pkg-gate1", totalGross: g.result, totalCumulativeDepreciation: d.result };
}

function asset(p: { key: string; label: string; brut: number; cumul: number; cls: "batiment" | "mobilier"; start: string; years: number }): CandidateHistoricalAsset {
  const doc = `doc-${p.key}`;
  const propertyId: CandidateValue<string> = presentCandidate("prop-1", "direct", prov(doc, "propertyId"));
  return {
    candidateKey: p.key, sourceAssetRef: p.key, label: presentCandidate(p.label, "direct", prov(doc, "label")), coutBrut: presentCandidate(p.brut, "direct", prov(doc, "coutBrut")),
    cumulOuverture: presentCandidate(p.cumul, "direct", prov(doc, "cumulOuverture")), startDate: presentCandidate(p.start, "direct", prov(doc, "startDate")),
    durationYears: presentCandidate(p.years, "direct", prov(doc, "duration")), method: presentCandidate("lineaire", "direct", prov(doc, "method")),
    prorataConvention: presentCandidate("annuel_plein", "direct", prov(doc, "prorata")), classification: presentCandidate(p.cls, "direct", prov(doc, "classification")),
    nonAmortizable: presentCandidate(false, "direct", prov(doc, "nonAmortizable")), propertyId,
  };
}

/** Immeuble 120 000 / 40 ans (cumul 30 000 : 10 ans × 3 000) + mobilier 12 000 / 10 ans (cumul 5 000) : annuité d'un exercice plein = 3 000 + 1 200. */
export const TAKEOVER_ASSETS = () => [
  asset({ key: "cand-immeuble", label: "Immeuble", brut: 120_000, cumul: 30_000, cls: "batiment", start: "2015-01-01", years: 40 }),
  asset({ key: "cand-mobilier", label: "Mobilier", brut: 12_000, cumul: 5_000, cls: "mobilier", start: "2018-06-01", years: 10 }),
];
export const TAKEOVER_ANNUITY_EUROS = 4200;

export function stocksCandidate(s: { deficits: { millesime: number; montant: number }[] | "UNKNOWN"; ard: number | "UNKNOWN" }): CandidateFiscalStocks {
  return {
    deficits: s.deficits === "UNKNOWN" ? (missingCandidate("deficits") as any) : presentCandidate(s.deficits, "direct", taxProv("stocks:deficits")),
    amortissementsReportes: s.ard === "UNKNOWN" ? (missingCandidate("ard") as any) : presentCandidate(s.ard, "direct", taxProv("stocks:ard")),
    amortissementsReportesSource: "manual_entry",
  } as CandidateFiscalStocks;
}

export function takeoverOpening(stocks: CandidateFiscalStocks): FiscalYearOpening {
  const assets = TAKEOVER_ASSETS();
  const idMap: Record<string, string> = {};
  for (const a of assets) idMap[a.candidateKey] = `asset-${a.candidateKey}`;
  const input: BuildExternalTakeoverFiscalYearOpeningInput = {
    openingId: "opening-gate1", dossierId: "dossier-1", takeoverId: "takeover-gate1", targetFiscalYear: TARGET, sourceFiscalYear: FY, assets,
    stableAssetIdByCandidateKey: idMap, stocks, controls: controls(132_000, 35_000), validatedAt: NOW, validator: "gate1",
  };
  const built = buildExternalTakeoverFiscalYearOpening(input);
  if (built.status !== "built") throw new Error(JSON.stringify(built));
  const selected = selectBuiltExternalTakeoverOpening({ buildResult: built, requestedFiscalYear: TARGET });
  if (selected.status !== "ready") throw new Error(JSON.stringify(selected));
  return selected.opening;
}

/** Dossier exact dont l'ouverture est une REPRISE externe : stocks et immobilisations viennent de l'Opening, la dotation de son plan. */
export function takeoverDossier(c: Case, opening: FiscalYearOpening): PersistedWorkspace {
  const ws: any = caseDossier({ ...c, dotation: TAKEOVER_ANNUITY_EUROS, ardOpen: 0, deficits: [] });
  const { stocksOuverture: _s, previousFiscalYearId: _p, priorHistoryDeclaration: _h, ...fy } = ws.fiscalYear;
  void _s; void _p; void _h;
  return { ...ws, fiscalYear: { ...fy, priorHistoryDeclaration: { status: "EXTERNAL_HISTORY", declaredAt: NOW }, externalTakeoverOpening: { sourceRef: "takeover-gate1", opening } } };
}
