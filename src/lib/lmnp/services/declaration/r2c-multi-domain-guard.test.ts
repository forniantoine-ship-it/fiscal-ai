/**
 * MB-MULTI-DOMAIN-GUARD-1 — garde de domaine multi-bien (ADR-011), capacités d'activation indépendantes et oracles multi
 * PERSISTANTS (issus des probes de MB-ACTIVATION-AUDIT-2). USER ACTIVATION = OFF : rien ici n'active le multi.
 *
 * Valeurs attendues posées À LA MAIN avant code :
 *   MULTI-2 simple profit : A 6 000 − 1 000 ; B 5 000 − 2 000 → 8 000 avant amortissement ; dotations 1 000 + 2 000 = 3 000, déduites
 *     intégralement ; résultat avant déficits 5 000 → 312 = 350 = 5 000, 352 = 0, 7a = 5NA = 5 000.
 *   Profit + loss : A 10 000 − 1 000 = 9 000 ; B 1 000 − 3 000 = −2 000 → 7 000 ; dotations 1 000 + 500 = 1 500 déduites → 5 500.
 *   Two losses sans dotation : A 2 000 − 3 000 = −1 000 ; B 1 000 − 3 000 = −2 000 → déficit 3 000 → 7b = 5NY = 3 000.
 *   Two losses avec dotations : −3 000 avant amortissement, dotations 1 000 → ARD généré 1 000 → BLOQUÉ (allocation 39 C).
 *
 * Run: npx tsx --test src/lib/lmnp/services/declaration/r2c-multi-domain-guard.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, mock } from "node:test";

import { handleAide2042PdfRequest } from "@/app/api/lmnp/declaration/aide-2042-pdf/handler";
import { handleCerfaPdfRequest } from "@/app/api/lmnp/declaration/cerfa-pdf/handler";
import {
  MULTI_PROPERTY_CAPABILITIES,
  MULTI_PROPERTY_NEVER_OPEN_CAPABILITIES,
  isMultiPropertyCapabilityOpen,
  isMultiPropertyClosingBlocked,
  isMultiPropertyDeliveryBlocked,
  isMultiPropertyGenerationBlocked,
  isMultiPropertyNextYearBlocked,
  type MultiPropertyCapabilities,
  type MultiPropertyCapability,
} from "@/lib/lmnp/dossier/multi-property-activation";
import {
  MULTI_PROPERTY_DOMAIN_REASON_CODES as REASON,
  evaluateMultiPropertyDomain,
  resolveMultiPropertyDeliveryAdmission,
} from "@/lib/lmnp/dossier/multi-property-domain";
import { resolveDocumentScope } from "@/lib/lmnp/dossier/property-scope";
import { runDeclarationGenerationFromWorkspace, runDeclarationGenerationFromWorkspaceTechnical } from "@/lib/lmnp/services/declaration/generation-workspace";
import { buildClientSummaryDocument } from "@/lib/lmnp/services/declaration/build-client-summary-document";
import { isMultiPropertyBarrierActive } from "@/lib/lmnp/services/server-workspace-snapshot";
import { GENERATION_PRICE_TTC, GENERATION_PRICE_CENTS } from "@/lib/lmnp/services/payment/price";
import { produceFiscalResult } from "@/runtime/capabilities/f006/produce-fiscal-result";
import type { FiscalEngineInputs } from "@/runtime/capabilities/f006/types";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";
import { lmnpReducer, type LmnpAction, type LmnpState } from "@/lib/lmnp/store/reducer";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";

import { A, B, SPEC_A, SPEC_B, STOCKS, T, Y, multiWorkspace, oracleBien, type BienSpec } from "./multi-property-test-support";

const ROOT = process.cwd();
const source = (relative: string) => readFileSync(path.join(ROOT, relative), "utf8");
const FIXED = Date.parse("2026-06-01T12:00:00.000Z");
const clone = <V>(value: V): V => JSON.parse(JSON.stringify(value));
const ALL: MultiPropertyCapability[] = ["edition", "generation", "delivery", "payment", "closing", "nextYear"];
const caps = (open: MultiPropertyCapability[]): MultiPropertyCapabilities =>
  Object.fromEntries(ALL.map((capability) => [capability, open.includes(capability)])) as unknown as MultiPropertyCapabilities;

function withFixedClock<V>(run: () => V): V {
  mock.timers.enable({ apis: ["Date"], now: FIXED });
  try {
    return run();
  } finally {
    mock.timers.reset();
  }
}

/** Génération de PRODUCTION (garde de domaine appliquée), moteur instrumenté (comptage des appels F-006). */
function produce(workspace: PersistedWorkspace, options: Record<string, unknown> = {}, technical = false) {
  const calls: FiscalEngineInputs[] = [];
  const entry = technical ? runDeclarationGenerationFromWorkspaceTechnical : runDeclarationGenerationFromWorkspace;
  const result = withFixedClock(() =>
    entry(workspace, {
      ...options,
      engine: { produceFiscalResult: (input: FiscalEngineInputs) => { calls.push(clone(input)); return produceFiscalResult(input); } },
    } as never),
  );
  return { result, calls };
}
type Generated = Extract<ReturnType<typeof produce>["result"], { status: "generated" }>;
function generated(workspace: PersistedWorkspace, options: Record<string, unknown> = {}, technical = false) {
  const { result, calls } = produce(workspace, options, technical);
  assert.equal(result.status, "generated", JSON.stringify((result as { blockingReasons?: unknown }).blockingReasons));
  return { result: result as Generated, calls };
}
const blockedCodes = (result: ReturnType<typeof produce>["result"]): string[] =>
  result.status === "blocked" ? ((result as { blockingReasons?: Array<{ code: string }> }).blockingReasons ?? []).map((reason) => reason.code) : [];
const caseValue = (form: { cases: Array<{ caseId: string; value: unknown }> }, id: string) => form.cases.find((item) => item.caseId === id)?.value;

const SIMPLE = (): PersistedWorkspace => multiWorkspace({ specs: [[A, oracleBien(6000, 1000, 1000)], [B, oracleBien(5000, 2000, 2000)]] });
const PROFIT_LOSS = (): PersistedWorkspace => multiWorkspace({ specs: [[A, oracleBien(10000, 1000, 1000)], [B, oracleBien(1000, 3000, 500)]] });
const LOSSES_NO_DEPRECIATION = (): PersistedWorkspace => multiWorkspace({ specs: [[A, oracleBien(2000, 3000, 0)], [B, oracleBien(1000, 3000, 0)]] });
const LOSSES_WITH_DEPRECIATION = (): PersistedWorkspace => multiWorkspace({ specs: [[A, oracleBien(2000, 3000, 500)], [B, oracleBien(1000, 3000, 500)]] });

// ---------------------------------------------------------------------------
// 1. Capacités d'activation : toutes fermées, indépendantes ; clôture et N+1 jamais ouvrables par ce seul objet
// ---------------------------------------------------------------------------

describe("MB-MULTI-DOMAIN-GUARD-1 — capacités d'activation multi", () => {
  it("valeurs finales : génération = ON (seul levier) ; édition, livraison, paiement, clôture, N+1 = OFF", () => {
    for (const capability of ALL) {
      assert.equal(MULTI_PROPERTY_CAPABILITIES[capability], capability === "generation", capability);
      assert.equal(isMultiPropertyCapabilityOpen(capability), capability === "generation", capability);
    }
  });

  it("ancien flag unique supprimé : aucun MULTI_PROPERTY_USER_ENABLED / isMultiPropertyBlocked dans le code de production", () => {
    const files = execSync("git ls-files 'src/**/*.ts' 'src/**/*.tsx'", { cwd: ROOT, encoding: "utf8" }).split("\n")
      .filter((file) => file && !/\.test\.tsx?$/.test(file));
    const offenders = files.filter((file) => /MULTI_PROPERTY_USER_ENABLED|\bisMultiPropertyBlocked\b/.test(readFileSync(path.join(ROOT, file), "utf8")));
    assert.deepEqual(offenders, []);
  });

  it("indépendance : ouvrir UNE capacité n'en ouvre aucune autre", () => {
    for (const capability of ["edition", "generation", "delivery", "payment"] as const) {
      const only = caps([capability]);
      for (const other of ALL) assert.equal(isMultiPropertyCapabilityOpen(other, only), other === capability, `${capability} → ${other}`);
    }
  });

  it("MULTI CLOSING = BLOCKED et MULTI N+1 = BLOCKED même si édition, génération, livraison et paiement sont ouverts — voire si closing/nextYear sont forcés à true", () => {
    const everything = caps(ALL);
    assert.equal(isMultiPropertyCapabilityOpen("closing", everything), false);
    assert.equal(isMultiPropertyCapabilityOpen("nextYear", everything), false);
    assert.deepEqual([...MULTI_PROPERTY_NEVER_OPEN_CAPABILITIES].sort(), ["closing", "nextYear"]);
    for (const capability of ["edition", "generation", "delivery", "payment"] as const) assert.equal(isMultiPropertyCapabilityOpen(capability, everything), true);
    const workspace = SIMPLE();
    assert.equal(isMultiPropertyGenerationBlocked(workspace, everything), false);
    assert.equal(isMultiPropertyDeliveryBlocked(workspace, everything), false);
    assert.equal(isMultiPropertyClosingBlocked(workspace, everything), true);
    assert.equal(isMultiPropertyNextYearBlocked(workspace, everything), true);
  });

  it("barrière serveur : le paiement ne s'ouvre jamais par la génération ; clôture/N+1 jamais par le paiement", async () => {
    const row = { schemaVersion: 2, payload: { workspace: SIMPLE() } };
    const read = async () => row;
    const input = { dossierId: "d", fiscalYear: Y };
    assert.equal(await isMultiPropertyBarrierActive(read, input, "payment"), true, "défaut : fermé");
    assert.equal(await isMultiPropertyBarrierActive(read, input, "payment", caps(["generation"])), true);
    assert.equal(await isMultiPropertyBarrierActive(read, input, "payment", caps(["payment"])), false);
    assert.equal(await isMultiPropertyBarrierActive(read, input, "closing", caps(["payment", "generation", "delivery"])), true);
    assert.equal(await isMultiPropertyBarrierActive(read, input, "nextYear", caps(ALL)), true);
  });

  it("les prédicats de clôture/N+1 ne lisent aucune autre capacité (source)", () => {
    const code = source("src/lib/lmnp/dossier/multi-property-activation.ts");
    assert.match(code, /MULTI_PROPERTY_NEVER_OPEN_CAPABILITIES\.has\(capability\)\) return false/);
    assert.doesNotMatch(code, /process\.env|localStorage|sessionStorage|supabase|fetch\(/i);
  });

  it("tarif inchangé : 149 € / dossier / exercice, indépendant du nombre de biens", () => {
    assert.equal(GENERATION_PRICE_TTC, 149);
    assert.equal(GENERATION_PRICE_CENTS, 14900);
    assert.doesNotMatch(source("src/lib/lmnp/services/payment/price.ts"), /propertyIds|properties\.length|multi/i);
  });
});

// ---------------------------------------------------------------------------
// 2. Garde de domaine — évaluateur pur, motifs stables
// ---------------------------------------------------------------------------

describe("MB-MULTI-DOMAIN-GUARD-1 — évaluateur de domaine", () => {
  const base = { propertyCount: 2 } as const;
  const reasonsOf = (facts: Parameters<typeof evaluateMultiPropertyDomain>[0]) => {
    const verdict = evaluateMultiPropertyDomain(facts);
    return verdict.status === "UNSUPPORTED" ? verdict.reasons.map((reason) => reason.code) : verdict.status;
  };

  it("moins de 2 biens : NOT_MULTI (chemin mono hors garde) ; 2 biens sans aucun fait défavorable : SUPPORTED", () => {
    assert.deepEqual(evaluateMultiPropertyDomain({ propertyCount: 1 }), { status: "NOT_MULTI" });
    assert.deepEqual(evaluateMultiPropertyDomain({ ...base, regime: "reel", activityType: "LMNP", priorYearIndicia: [], takeoverIndicia: [], openingDeficits: [], openingArd: 0, generatedArd: 0 }), { status: "SUPPORTED" });
  });

  it("chaque motif hors domaine produit SON code stable", () => {
    assert.deepEqual(reasonsOf({ ...base, regime: "micro" }), [REASON.regimeNotSupported]);
    assert.deepEqual(reasonsOf({ ...base, activityType: "LMP" }), [REASON.lmpNotSupported]);
    assert.deepEqual(reasonsOf({ ...base, declared: { ssi: true } }), [REASON.ssiNotSupported]);
    assert.deepEqual(reasonsOf({ ...base, declared: { indirectHolding: true } }), [REASON.indirectHoldingNotSupported]);
    assert.deepEqual(reasonsOf({ ...base, priorYearIndicia: ["previousFiscalYearId"] }), [REASON.notFirstYear]);
    assert.deepEqual(reasonsOf({ ...base, takeoverIndicia: ["x"] }), [REASON.takeoverNotSupported]);
    assert.deepEqual(reasonsOf({ ...base, openingDeficits: [{ millesime: 2024, montant: 100 }] }), [REASON.priorDeficitNotSupported]);
    assert.deepEqual(reasonsOf({ ...base, openingArd: 50 }), [REASON.historicalArdNotSupported]);
    assert.deepEqual(reasonsOf({ ...base, generatedArd: 50 }), ["multi_property_39c_allocation_not_supported"]);
    assert.deepEqual(reasonsOf({ ...base, unverifiable: ["rfs.deficitsOuverture"] }), [REASON.domainUnverifiable]);
    assert.deepEqual(reasonsOf({ ...base, seamBlocks: [{ code: "common_charges_not_supported" }] }), [REASON.commonChargesNotSupported]);
    assert.deepEqual(reasonsOf({ ...base, seamBlocks: [{ code: "unsupported_shared_loan" }] }), [REASON.sharedLoanNotSupported]);
    assert.deepEqual(reasonsOf({ ...base, seamBlocks: [{ code: "service_date_missing", propertyId: B }] }), [REASON.serviceDateMissing]);
    assert.deepEqual(reasonsOf({ ...base, seamBlocks: [{ code: "unattributed_documents" }] }), [REASON.unattributedDocument]);
  });

  it("un stock d'ouverture à montant nul ne bloque pas ; un motif de seam hors domaine (donnée incomplète) n'est pas un motif de domaine", () => {
    assert.equal(reasonsOf({ ...base, openingDeficits: [{ millesime: 2024, montant: 0 }], openingArd: 0 }), "SUPPORTED");
    assert.equal(reasonsOf({ ...base, seamBlocks: [{ code: "credit_state_unknown", propertyId: A }] }), "SUPPORTED");
  });

  it("les codes historiques du moteur (G21/G22) sont conservés à l'identique", () => {
    assert.equal(REASON.allocation39cNotSupported, "multi_property_39c_allocation_not_supported");
    assert.equal(REASON.historicalArdNotSupported, "multi_property_historical_ard_not_supported");
  });
});

// ---------------------------------------------------------------------------
// 3. FAIL-CLOSED oracles — entrée de PRODUCTION : chaque cas hors domaine bloque avec un motif identifiable
// ---------------------------------------------------------------------------

describe("MB-MULTI-DOMAIN-GUARD-1 — fail-closed oracles (génération de production)", () => {
  it("nominal : deux biens dans le domaine → généré, UN appel F-006", () => {
    const { result, calls } = generated(SIMPLE());
    assert.equal(calls.length, 1);
    assert.equal(result.rfs.deficitsOuverture?.source, "none");
  });

  it("déficit antérieur (stock d'ouverture) → BLOQUÉ AVANT F-006 : prior_deficit + not_first_year", () => {
    const workspace = multiWorkspace({ specs: [[A, oracleBien(6000, 1000, 1000)], [B, oracleBien(5000, 2000, 2000)]], fiscalYear: { stocksOuverture: STOCKS } });
    const { result, calls } = produce(workspace);
    assert.equal(result.status, "blocked");
    assert.equal(calls.length, 0, "F-006 non appelé");
    assert.ok(blockedCodes(result).includes(REASON.priorDeficitNotSupported));
    assert.ok(blockedCodes(result).includes(REASON.notFirstYear));
  });

  it("déficit antérieur fourni par l'APPELANT (options.stocksOuverture) alors que l'exercice n'en porte pas → BLOQUÉ (jamais seulement l'absence de donnée)", () => {
    const { result, calls } = produce(SIMPLE(), { stocksOuverture: STOCKS.stocks });
    assert.equal(result.status, "blocked");
    assert.equal(calls.length, 0);
    assert.ok(blockedCodes(result).includes(REASON.priorDeficitNotSupported));
  });

  it("ARD historique → BLOQUÉ AVANT F-006 : historical_ard (code historique conservé)", () => {
    const workspace = multiWorkspace({
      specs: [[A, oracleBien(6000, 1000, 1000)], [B, oracleBien(5000, 2000, 2000)]],
      fiscalYear: { stocksOuverture: { ...STOCKS, stocks: { deficits: [], amortissementsReportes: 500, deficitsExpires: [] } } },
    });
    const { result, calls } = produce(workspace);
    assert.equal(result.status, "blocked");
    assert.equal(calls.length, 0);
    assert.ok(blockedCodes(result).includes("multi_property_historical_ard_not_supported"));
  });

  it("ARD GÉNÉRÉ (dotation non intégralement déductible) → BLOQUÉ APRÈS F-006 : multi_property_39c_allocation_not_supported, aucune allocation", () => {
    const { result, calls } = produce(LOSSES_WITH_DEPRECIATION());
    assert.equal(result.status, "blocked");
    assert.equal(calls.length, 1);
    assert.deepEqual(blockedCodes(result), ["multi_property_39c_allocation_not_supported"]);
  });

  it("reprise (historique externe) → BLOQUÉ : takeover_not_supported", () => {
    const workspace = multiWorkspace({ specs: [[A, oracleBien(6000, 1000, 1000)], [B, oracleBien(5000, 2000, 2000)]], fiscalYear: { repriseHistoriqueEnContinuite: true } });
    const { result, calls } = produce(workspace);
    assert.equal(result.status, "blocked");
    assert.equal(calls.length, 0);
    assert.ok(blockedCodes(result).includes(REASON.takeoverNotSupported));
  });

  it("exercice non initial (prédécesseur Fiscal AI) → BLOQUÉ : not_first_year", () => {
    const workspace = multiWorkspace({ specs: [[A, oracleBien(6000, 1000, 1000)], [B, oracleBien(5000, 2000, 2000)]], fiscalYear: { previousFiscalYearId: "fy-2025" } });
    const { result, calls } = produce(workspace);
    assert.equal(result.status, "blocked");
    assert.equal(calls.length, 0);
    assert.ok(blockedCodes(result).includes(REASON.notFirstYear));
  });

  it("ouverture d'exercice scalaire fournie (continuité) → BLOQUÉ : opening_not_supported (+ not_first_year)", () => {
    const { result } = produce(SIMPLE(), { continuity: { previousFiscalYearId: "fy-2025" } });
    assert.equal(result.status, "blocked");
    assert.ok(blockedCodes(result).includes(REASON.openingNotSupported));
    assert.ok(blockedCodes(result).includes(REASON.notFirstYear));
  });

  it("charge commune → BLOQUÉ : common_charges_not_supported, F-006 non appelé", () => {
    const { result, calls } = produce(SIMPLE(), { commonCharges: [{ label: "syndic commun" }] });
    assert.equal(result.status, "blocked");
    assert.equal(calls.length, 0);
    assert.ok(blockedCodes(result).includes(REASON.commonChargesNotSupported));
  });

  it("prêt partagé (même document de crédit sur deux biens) → BLOQUÉ : shared_loan_not_supported", () => {
    const withLoan = (spec: BienSpec): BienSpec => ({ ...spec, creditDocumentId: "doc-pret-commun", credit: "present" });
    const workspace = multiWorkspace({ specs: [[A, withLoan(SPEC_A)], [B, withLoan({ ...SPEC_B, pretIds: ["loan-2"] })]] });
    const { result, calls } = produce(workspace);
    assert.equal(result.status, "blocked");
    assert.equal(calls.length, 0);
    assert.ok(blockedCodes(result).includes(REASON.sharedLoanNotSupported));
  });

  it("date de mise en service manquante sur un bien → BLOQUÉ : service_date_missing@B", () => {
    const workspace = multiWorkspace({ specs: [[A, oracleBien(6000, 1000, 1000)], [B, { ...oracleBien(5000, 2000, 2000), date: undefined }]] });
    const { result, calls } = produce(workspace);
    assert.equal(result.status, "blocked");
    assert.equal(calls.length, 0);
    const reasons = (result as { blockingReasons: Array<{ code: string; propertyId?: string }> }).blockingReasons;
    assert.ok(reasons.some((reason) => reason.code === REASON.serviceDateMissing && reason.propertyId === B));
  });

  it("document sans propertyId → BLOQUÉ : unattributed_document (jamais promu document commun)", () => {
    const workspace = SIMPLE();
    workspace.documents = [{ id: "doc-x", fiscalYearId: "fy-2026", fileName: "x.pdf", mimeType: "application/pdf", sizeBytes: 1, category: "charges", documentType: "unknown", status: "analyzed", uploadedAt: T } as never];
    const { result, calls } = produce(workspace);
    assert.equal(result.status, "blocked");
    assert.equal(calls.length, 0);
    assert.ok(blockedCodes(result).includes(REASON.unattributedDocument));
  });

  it("LMP → BLOQUÉ : lmp_not_supported, F-006 non appelé", () => {
    const { result, calls } = produce(multiWorkspace({ specs: [[A, oracleBien(6000, 1000, 1000)], [B, oracleBien(5000, 2000, 2000)]], root: { activityType: "LMP" } }));
    assert.equal(result.status, "blocked");
    assert.equal(calls.length, 0);
    assert.ok(blockedCodes(result).includes(REASON.lmpNotSupported));
  });

  it("l'entrée TECHNIQUE (moteur seul, hors produit) reste capable : même cas déficit antérieur → généré ; elle n'est importée par aucun fichier de production", () => {
    const workspace = multiWorkspace({ specs: [[A, oracleBien(6000, 1000, 1000)], [B, oracleBien(5000, 2000, 2000)]], fiscalYear: { stocksOuverture: STOCKS } });
    assert.equal(produce(workspace, {}, true).result.status, "generated");
    const files = execSync("git ls-files 'src/**/*.ts' 'src/**/*.tsx'", { cwd: ROOT, encoding: "utf8" }).split("\n")
      .filter((file) => file && !/\.test\.tsx?$/.test(file) && !file.endsWith("generation-workspace.ts"));
    const offenders = files.filter((file) => /runDeclarationGenerationFromWorkspaceTechnical/.test(readFileSync(path.join(ROOT, file), "utf8")));
    assert.deepEqual(offenders, []);
  });
});

// ---------------------------------------------------------------------------
// 4. ORACLES multi persistants — activité consolidée, une seule liasse, une seule aide
// ---------------------------------------------------------------------------

describe("MB-MULTI-DOMAIN-GUARD-1 — oracles multi (entrée de production)", () => {
  it("A. MULTI-2 SIMPLE PROFIT — 8 000 / 3 000 / 5 000 ; 2033-B 312 = 350 = 5 000, 352 = 0, BALANCED ; 2031 7a = 5 000 ; 2042 5NA = 5 000 ; une seule liasse", () => {
    const { result, calls } = generated(SIMPLE());
    const fiscal = result.rfs.fiscalResult;
    assert.equal(calls.length, 1, "un seul calcul d'activité");
    assert.equal(calls[0]!.revenusAssistant?.totalRecettes, 11000);
    assert.equal(calls[0]!.chargesAssistant?.totalDeductible, 3000);
    assert.equal(calls[0]!.amortissementAssistant?.totalDotations, 3000);
    assert.equal(fiscal.resultatAvantAmort, 8000);
    assert.equal(fiscal.amortDeduct, 3000);
    assert.equal(fiscal.amortNonDeduitExercice, 0);
    assert.equal(fiscal.resultatFiscalAvantDeficits, 5000);
    assert.equal(fiscal.resultatFiscal, 5000);
    const form2033B = result.liasseRfs.form2033B;
    assert.equal(caseValue(form2033B, "312"), 5000);
    assert.equal(caseValue(form2033B, "350"), 5000);
    assert.equal(caseValue(form2033B, "352"), 0);
    assert.equal(form2033B.balancing.status, "BALANCED");
    const form2031 = (result.liasseRfs as unknown as { form2031: { cases: Array<{ caseId: string; value: unknown }> } }).form2031;
    assert.equal(caseValue(form2031, "I_7A"), 5000);
    assert.equal(caseValue(form2031, "I_7B"), undefined);
    const aide = buildClientSummaryDocument(result.rfs, { activityStartDate: "2026-03-01" });
    assert.equal(aide.aide2042.cases.find((item) => item.case === "5NA")?.montant, 5000);
    assert.equal(aide.aide2042.cases.some((item) => item.case === "5NY"), false);
    assert.equal(result.rfs.immobilisationsParBien?.length, 2, "les biens alimentent UNE seule RFS d'activité");
  });

  it("B. PROFIT + LOSS — résultat consolidé 5 500 au niveau activité ; 2033-B, 2031, 2042 ; aucune déclaration par bien", () => {
    const { result, calls } = generated(PROFIT_LOSS());
    const fiscal = result.rfs.fiscalResult;
    assert.equal(calls.length, 1);
    assert.equal(fiscal.resultatAvantAmort, 7000, "9 000 − 2 000");
    assert.equal(fiscal.amortDeduct, 1500);
    assert.equal(fiscal.resultatFiscalAvantDeficits, 5500);
    assert.equal(fiscal.deficitNouveau, 0, "le déficit du bien B est absorbé par l'activité, jamais déclaré seul");
    assert.equal(caseValue(result.liasseRfs.form2033B, "350"), 5500);
    assert.equal(result.liasseRfs.form2033B.balancing.status, "BALANCED");
    const form2031 = (result.liasseRfs as unknown as { form2031: { cases: Array<{ caseId: string; value: unknown }> } }).form2031;
    assert.equal(caseValue(form2031, "I_7A"), 5500);
    const cases = buildClientSummaryDocument(result.rfs, { activityStartDate: "2026-03-01" }).aide2042.cases;
    assert.equal(cases.find((item) => item.case === "5NA")?.montant, 5500);
    assert.equal(cases.some((item) => item.case === "5NY"), false);
  });

  it("C1. TWO LOSSES SANS DOTATION — déficit d'activité 3 000 : 7b = 5NY = 3 000, aucune 5NA", () => {
    const { result } = generated(LOSSES_NO_DEPRECIATION());
    const fiscal = result.rfs.fiscalResult;
    assert.equal(fiscal.resultatAvantAmort, -3000);
    assert.equal(fiscal.deficitNouveau, 3000);
    assert.equal(fiscal.amortNonDeduitExercice, 0);
    assert.equal(result.liasseRfs.form2033B.balancing.status, "BALANCED");
    const form2031 = (result.liasseRfs as unknown as { form2031: { cases: Array<{ caseId: string; value: unknown }> } }).form2031;
    assert.equal(caseValue(form2031, "I_7B"), 3000);
    const cases = buildClientSummaryDocument(result.rfs, { activityStartDate: "2026-03-01" }).aide2042.cases;
    assert.equal(cases.find((item) => item.case === "5NY")?.montant, 3000);
    assert.equal(cases.some((item) => item.case === "5NA"), false);
  });

  it("C2. TWO LOSSES AVEC DOTATIONS — ARD généré : BLOQUÉ, motif multi_property_39c_allocation_not_supported (aucune répartition proportionnelle)", () => {
    const { result } = produce(LOSSES_WITH_DEPRECIATION());
    assert.equal(result.status, "blocked");
    assert.deepEqual(blockedCodes(result), [REASON.allocation39cNotSupported]);
  });

  it("D. PROPERTY ISOLATION (réducteur) — modifier le revenu du bien A ne mute pas les données sources du bien B (même référence)", () => {
    const workspace = SIMPLE();
    const state = { ...workspace, fileRegistry: new Map() } as unknown as LmnpState;
    const before = state.declarationDraft!.biens![B]!;
    const beforeJson = JSON.stringify(before);
    const next = lmnpReducer(state, {
      type: "DECLARATION_PATCH_DRAFT",
      propertyId: A,
      patch: { revenusAssistant: { ...(state.declarationDraft!.biens![A]!.revenusAssistant as object), totalRecettes: 7777 } },
    } as unknown as LmnpAction);
    assert.notEqual(next, state, "l'écriture du bien A est acceptée");
    assert.equal((next.declarationDraft!.biens![A]!.revenusAssistant as { totalRecettes: number }).totalRecettes, 7777);
    assert.equal(next.declarationDraft!.biens![B], before, "bien B : même référence");
    assert.equal(JSON.stringify(next.declarationDraft!.biens![B]), beforeJson);
  });

  it("D. PROPERTY ISOLATION (génération) — +1 000 de revenus sur A : +1 000 sur l'activité, sources et blocs du bien B inchangés", () => {
    const base = generated(SIMPLE());
    const modified = SIMPLE();
    const sourceB = JSON.stringify((modified.declarationDraft as { biens: Record<string, unknown> }).biens[B]);
    const bienA = (modified.declarationDraft as { biens: Record<string, { revenusAssistant: { totalRecettes: number; loyersEncaisses: number } }> }).biens[A]!;
    bienA.revenusAssistant.totalRecettes += 1000;
    bienA.revenusAssistant.loyersEncaisses += 1000;
    const next = generated(modified);
    assert.equal(next.result.rfs.fiscalResult.resultatAvantAmort, base.result.rfs.fiscalResult.resultatAvantAmort + 1000);
    assert.equal(JSON.stringify((modified.declarationDraft as { biens: Record<string, unknown> }).biens[B]), sourceB, "source du bien B non mutée par la génération");
    const blockB = (rfs: FiscalRepresentation) => JSON.stringify(rfs.immobilisationsParBien!.find((bloc) => bloc.propertyId === B));
    assert.equal(blockB(next.result.rfs), blockB(base.result.rfs), "bloc d'immobilisations du bien B identique");
  });

  it("E. CONSOLIDATED 2042 — plusieurs biens → UNE RFS → UNE aide → UNE valeur 5NA ; aucune valeur ni identifiant par bien", () => {
    const { result } = generated(PROFIT_LOSS());
    const document = buildClientSummaryDocument(result.rfs, { activityStartDate: "2026-03-01" });
    const cases = document.aide2042.cases;
    assert.equal(cases.filter((item) => item.case === "5NA" || item.case === "5NY").length, 1);
    assert.equal(new Set(cases.map((item) => item.case)).size, cases.length, "chaque case apparaît une fois");
    assert.equal(cases.find((item) => item.case === "5NA")?.montant, result.rfs.fiscalResult.resultatFiscalAvantDeficits);
    assert.equal(document.syntheseFiscale.resultatAvantImputationDeficits, 5500);
    const serialized = JSON.stringify(document);
    assert.ok(!serialized.includes(A) && !serialized.includes(B), "aucun identifiant de bien dans l'aide");
  });
});

// ---------------------------------------------------------------------------
// 5. Routes Cerfa ET aide 2042 — MÊME garde de domaine
// ---------------------------------------------------------------------------

describe("MB-MULTI-DOMAIN-GUARD-1 — routes Cerfa et aide 2042-C-PRO", () => {
  const access = (async () => ({ ok: true, fiscalYear: Y })) as never;
  const post = (handler: typeof handleCerfaPdfRequest | typeof handleAide2042PdfRequest, body: unknown, capabilities?: MultiPropertyCapabilities) =>
    handler(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), access, capabilities);
  const aide = (rfs: unknown, capabilities?: MultiPropertyCapabilities) => post(handleAide2042PdfRequest, { rfs, activityStartDate: "2026-03-01" }, capabilities);
  const cerfa = (rfs: unknown, capabilities?: MultiPropertyCapabilities) => post(handleCerfaPdfRequest, { rfs, declarationVersionId: "v1", forms: ["2033-B-SD", "2031-SD"] }, capabilities);
  const supportedRfs = () => generated(SIMPLE()).result.rfs;

  it("multi SUPPORTÉ, activation OFF (défaut) : les deux routes refusent — 422 multi_property_not_enabled, aucun PDF", async () => {
    for (const route of [aide, cerfa]) {
      const response = await route(supportedRfs());
      assert.equal(response.status, 422);
      assert.notEqual(response.headers.get("content-type"), "application/pdf");
      assert.deepEqual(await response.json(), { status: "blocked", reason: "multi_property_not_enabled" });
    }
  });

  it("activation de LIVRAISON simulée + multi SUPPORTÉ : les deux routes livrent (RFS consolidée d'activité), la clôture reste fermée", async () => {
    const open = caps(["delivery"]);
    for (const route of [aide, cerfa]) {
      const response = await route(supportedRfs(), open);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "application/pdf");
    }
    assert.equal(isMultiPropertyCapabilityOpen("closing", open), false);
  });

  it("mono : chemin historique inchangé, aucune garde multi (la RFS mono n'a pas de marqueur multi)", () => {
    assert.deepEqual(resolveMultiPropertyDeliveryAdmission({ exercice: Y, fiscalResult: {} }), { allowed: true });
  });

  describe("multi HORS DOMAINE : refusé même si la livraison est ouverte (activation future simulée)", () => {
    const open = caps(["edition", "generation", "delivery", "payment"]);
    const outOfDomain: Array<[string, () => FiscalRepresentation, string]> = [
      ["déficit antérieur (stock d'ouverture)", () => generated(multiWorkspace({ specs: [[A, oracleBien(6000, 1000, 1000)], [B, oracleBien(5000, 2000, 2000)]], fiscalYear: { stocksOuverture: STOCKS } }), {}, true).result.rfs, REASON.priorDeficitNotSupported],
      ["ARD généré", () => { const rfs = clone(supportedRfs()); rfs.fiscalResult = { ...rfs.fiscalResult, amortNonDeduitExercice: 500 }; return rfs; }, REASON.allocation39cNotSupported],
      ["ARD historique consommé", () => { const rfs = clone(supportedRfs()); rfs.fiscalResult = { ...rfs.fiscalResult, amortReportesUtilises: 300 }; return rfs; }, REASON.historicalArdNotSupported],
      ["reprise / exercice non initial (source d'ouverture portée par la RFS)", () => { const rfs = clone(supportedRfs()); rfs.deficitsOuverture = { source: "fiscal_year_opening", deficits: [] }; return rfs; }, REASON.notFirstYear],
      ["stock d'ouverture non établi par la RFS", () => { const rfs = clone(supportedRfs()); delete rfs.deficitsOuverture; return rfs; }, REASON.domainUnverifiable],
      ["marqueur multi avec un seul bien", () => { const rfs = clone(supportedRfs()); rfs.immobilisationsParBien = rfs.immobilisationsParBien!.slice(0, 1); return rfs; }, REASON.fewerThanTwoProperties],
    ];
    for (const [label, build, code] of outOfDomain) {
      it(`${label} → 422 multi_property_domain_unsupported (${code}) sur Cerfa ET aide`, async () => {
        const rfs = build();
        for (const route of [aide, cerfa]) {
          const response = await route(rfs, open);
          assert.equal(response.status, 422);
          const body = (await response.json()) as { status: string; reason: string; domainReasons: string[] };
          assert.equal(body.status, "blocked");
          assert.equal(body.reason, "multi_property_domain_unsupported");
          assert.ok(body.domainReasons.includes(code), `${code} ∈ ${body.domainReasons}`);
        }
      });
    }
  });

  it("une seule définition du domaine : les deux handlers délèguent à resolveMultiPropertyDeliveryAdmission et ne reproduisent aucune condition de domaine", () => {
    for (const file of ["src/app/api/lmnp/declaration/cerfa-pdf/handler.ts", "src/app/api/lmnp/declaration/aide-2042-pdf/handler.ts"]) {
      const code = source(file);
      assert.match(code, /resolveMultiPropertyDeliveryAdmission/, file);
      assert.doesNotMatch(code, /deficitsOuverture|amortNonDeduitExercice|amortReportesUtilises|openingDeficits/, file);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Contrat documentaire (aucune UX) — portée d'un document
// ---------------------------------------------------------------------------

describe("MB-MULTI-DOMAIN-GUARD-1 — contrat documents", () => {
  const workspace = SIMPLE();
  const document = (extra: Record<string, unknown>) => ({ id: "d", ...extra });

  it("document de bien → propertyId obligatoire (explicite) ; propertyId = null → commun ; sans propertyId → NON attribué (jamais commun) ; bien inconnu → refus", () => {
    assert.deepEqual(resolveDocumentScope(workspace, document({ propertyId: A })), { kind: "property", propertyId: A, via: "explicit" });
    assert.deepEqual(resolveDocumentScope(workspace, document({ propertyId: null })), { kind: "common" });
    assert.equal(resolveDocumentScope(workspace, document({})).kind, "unresolved");
    assert.equal(resolveDocumentScope(workspace, document({ propertyId: "inconnu" })).kind, "unresolved");
  });

  it("seul le document d'activité explicitement lié (F009, inpiDocumentId) est commun sans propertyId", () => {
    const withInpi = clone(workspace);
    (withInpi.declarationDraft as { inpiDocumentId?: string }).inpiDocumentId = "doc-inpi";
    assert.deepEqual(resolveDocumentScope(withInpi, { id: "doc-inpi" }), { kind: "common" });
    assert.equal(resolveDocumentScope(withInpi, { id: "doc-autre" }).kind, "unresolved");
  });
});
