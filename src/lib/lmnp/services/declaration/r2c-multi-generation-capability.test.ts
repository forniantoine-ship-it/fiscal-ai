/**
 * MB-MULTI-CAPABILITY-WIRING-1 — Phase 1, GÉNÉRATION SEULE. La capacité `generation` est le SEUL levier ouvert ; elle ne suffit
 * jamais : admission = capacité ∧ domaine ADR-011 supporté ∧ preview généré ∧ readiness technique. Chaque dimension refuse seule.
 * Livraison, paiement, édition de production, clôture et N+1 restent fermés. Aucune règle fiscale n'est ajoutée : les oracles
 * traversent l'entrée de PRODUCTION (`runDeclarationGenerationFromWorkspace`), un seul F-006, une seule RFS d'activité.
 *
 * Valeurs posées à la main (cf. MB-MULTI-DOMAIN-GUARD-1) : simple profit 8 000 / 3 000 / 5 000 ; profit + perte 5 500 ; deux
 * pertes sans dotation : déficit 3 000 ; deux pertes avec dotations : ARD généré → refus 39 C.
 *
 * Run: npx tsx --test src/lib/lmnp/services/declaration/r2c-multi-generation-capability.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, mock } from "node:test";

import { handleAide2042PdfRequest } from "@/app/api/lmnp/declaration/aide-2042-pdf/handler";
import { handleCerfaPdfRequest } from "@/app/api/lmnp/declaration/cerfa-pdf/handler";
import {
  MULTI_PROPERTY_CAPABILITIES,
  isMultiPropertyCapabilityOpen,
  isMultiPropertyClosingBlocked,
  isMultiPropertyDeliveryBlocked,
  isMultiPropertyGenerationBlocked,
  isMultiPropertyNextYearBlocked,
  type MultiPropertyCapabilities,
  type MultiPropertyCapability,
} from "@/lib/lmnp/dossier/multi-property-activation";
import { MULTI_PROPERTY_DOMAIN_REASON_CODES as REASON, resolveMultiPropertyGenerationAdmission } from "@/lib/lmnp/dossier/multi-property-domain";
import { buildClientSummaryDocument } from "@/lib/lmnp/services/declaration/build-client-summary-document";
import { resolveDeclarationGenerationGate } from "@/lib/lmnp/services/declaration/declaration-generation-gate";
import { runDeclarationGenerationFromWorkspace } from "@/lib/lmnp/services/declaration/generation-workspace";
import { resolveImmobilisationsContinuityForGeneration } from "@/lib/lmnp/services/dossier/fiscal-year-cycle";
import { resolvePersistedExternalTakeoverOpening } from "@/lib/lmnp/services/declaration/prior-history-eligibility";
import { GENERATION_PRICE_TTC } from "@/lib/lmnp/services/payment/price";
import { isMultiPropertyBarrierActive } from "@/lib/lmnp/services/server-workspace-snapshot";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { produceFiscalResult } from "@/runtime/capabilities/f006/produce-fiscal-result";
import type { FiscalEngineInputs } from "@/runtime/capabilities/f006/types";

import { A, B, CONFIRMED_ATTESTATIONS, STOCKS, T, Y, monoWorkspace, multiWorkspace, oracleBien, type BienSpec } from "./multi-property-test-support";
import { callDelivery } from "@/lib/lmnp/services/declaration/delivery-test-support";

const ROOT = process.cwd();
const FIXED = Date.parse("2026-06-01T12:00:00.000Z");
const clone = <V>(value: V): V => JSON.parse(JSON.stringify(value));
const ALL: MultiPropertyCapability[] = ["edition", "generation", "delivery", "payment", "closing", "nextYear"];
const caps = (open: MultiPropertyCapability[]): MultiPropertyCapabilities =>
  Object.fromEntries(ALL.map((capability) => [capability, open.includes(capability)])) as unknown as MultiPropertyCapabilities;
const GENERATION_ONLY = caps(["generation"]);
const GENERATION_OFF = caps([]);

function withFixedClock<V>(run: () => V): V {
  mock.timers.enable({ apis: ["Date"], now: FIXED });
  try {
    return run();
  } finally {
    mock.timers.reset();
  }
}

/** Entrée de PRODUCTION de génération, moteur instrumenté (comptage des appels F-006). */
function produce(workspace: PersistedWorkspace, options: Record<string, unknown> = {}) {
  const calls: FiscalEngineInputs[] = [];
  const result = withFixedClock(() =>
    runDeclarationGenerationFromWorkspace(workspace, {
      ...options,
      engine: { produceFiscalResult: (input: FiscalEngineInputs) => { calls.push(clone(input)); return produceFiscalResult(input); } },
    } as never),
  );
  return { result, calls };
}
type Generated = Extract<ReturnType<typeof produce>["result"], { status: "generated" }>;
function generated(workspace: PersistedWorkspace, options: Record<string, unknown> = {}) {
  const { result, calls } = produce(workspace, options);
  assert.equal(result.status, "generated", JSON.stringify((result as { blockingReasons?: unknown }).blockingReasons));
  return { result: result as Generated, calls };
}
const blockedCodes = (result: ReturnType<typeof produce>["result"]): string[] =>
  result.status === "blocked" ? ((result as { blockingReasons?: Array<{ code: string }> }).blockingReasons ?? []).map((reason) => reason.code) : [];
type Cases = { cases: Array<{ caseId: string; value: unknown }> };
const caseValue = (form: Cases, id: string) => form.cases.find((item) => item.caseId === id)?.value;
const form2031Of = (result: Generated) => (result.liasseRfs as unknown as { form2031: Cases }).form2031;
const aideCases = (result: Generated) => buildClientSummaryDocument(result.rfs, { activityStartDate: "2026-03-01" }).aide2042.cases;

const SIMPLE = (): PersistedWorkspace => multiWorkspace({ specs: [[A, oracleBien(6000, 1000, 1000)], [B, oracleBien(5000, 2000, 2000)]] });
const PROFIT_LOSS = (): PersistedWorkspace => multiWorkspace({ specs: [[A, oracleBien(10000, 1000, 1000)], [B, oracleBien(1000, 3000, 500)]] });
const LOSSES_NO_DEPRECIATION = (): PersistedWorkspace => multiWorkspace({ specs: [[A, oracleBien(2000, 3000, 0)], [B, oracleBien(1000, 3000, 0)]] });
const LOSSES_WITH_DEPRECIATION = (): PersistedWorkspace => multiWorkspace({ specs: [[A, oracleBien(2000, 3000, 500)], [B, oracleBien(1000, 3000, 500)]] });

/** Dossier confirmé comme l'écran de validation le présente à la gate (readiness technique atteignable). */
function confirmed(workspace: PersistedWorkspace): PersistedWorkspace {
  const ws = clone(workspace);
  const draft = ws.declarationDraft as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  draft.inpiConfirmedAt = T;
  for (const bien of Object.values<Record<string, unknown>>(draft.biens ?? {})) {
    bien.revenusConfirmedAt ??= T;
    if (bien.financementCharges !== undefined) bien.creditConfirmedAt ??= T;
  }
  return ws;
}

function gateOf(ws: PersistedWorkspace, capabilities?: MultiPropertyCapabilities, options: { paid?: boolean } = {}) {
  return withFixedClock(() => resolveDeclarationGenerationGate({
    draft: ws.declarationDraft, properties: ws.properties, fiscalYear: ws.fiscalYear.year, paid: options.paid ?? false, generated: false,
    stocksOuverture: ws.fiscalYear.stocksOuverture?.stocks,
    continuity: resolveImmobilisationsContinuityForGeneration({
      draft: ws.declarationDraft, properties: ws.properties, propertyIds: ws.fiscalYear.propertyIds,
      immobilisationsOuverture: ws.fiscalYear.immobilisationsOuverture, repriseHistoriqueEnContinuite: ws.fiscalYear.repriseHistoriqueEnContinuite,
      previousFiscalYearId: ws.fiscalYear.previousFiscalYearId, continuiteNativeVerifiee: ws.fiscalYear.continuiteNativeVerifiee,
    }),
    fiscalYearOpening: resolvePersistedExternalTakeoverOpening(ws.fiscalYear),
    workspace: { fiscalYear: ws.fiscalYear, properties: ws.properties, documents: ws.documents, declarationDraft: ws.declarationDraft },
    ...(capabilities ? { multiPropertyCapabilities: capabilities } : {}),
  }));
}

// ---------------------------------------------------------------------------
// 1–3. Admission : capacité et domaine sont deux dimensions distinctes
// ---------------------------------------------------------------------------

describe("ADMISSION — capacité ET domaine, chacun refuse seul", () => {
  it("1. capacité OFF + domaine SUPPORTÉ → REFUS (multi_property_not_enabled) : admission, blocage UI, gate", () => {
    assert.deepEqual(resolveMultiPropertyGenerationAdmission(SIMPLE(), {}, GENERATION_OFF), { allowed: false, reason: "multi_property_not_enabled" });
    assert.equal(isMultiPropertyGenerationBlocked(SIMPLE(), GENERATION_OFF), true);
    const gate = gateOf(confirmed(SIMPLE()), GENERATION_OFF);
    assert.equal(gate.workspaceReadiness?.technicalReady, true, "le dossier est techniquement prêt…");
    assert.equal(gate.canGenerate, false, "…mais la capacité fermée refuse");
  });

  it("2. capacité ON + domaine SUPPORTÉ → admis ; la gate l'autorise ; l'entrée de production génère", () => {
    assert.deepEqual(resolveMultiPropertyGenerationAdmission(SIMPLE(), {}, GENERATION_ONLY), { allowed: true });
    assert.equal(isMultiPropertyGenerationBlocked(SIMPLE(), GENERATION_ONLY), false);
    const gate = gateOf(confirmed(SIMPLE()), GENERATION_ONLY);
    assert.equal(gate.canGenerate, true);
    assert.equal(generated(SIMPLE()).result.status, "generated");
  });

  it("3. capacité ON + domaine NON supporté → REFUS (multi_property_domain_unsupported + motif stable), gate fermée, entrée bloquée", () => {
    const outside = multiWorkspace({ specs: [[A, oracleBien(6000, 1000, 1000)], [B, oracleBien(5000, 2000, 2000)]], fiscalYear: { stocksOuverture: STOCKS } });
    const admission = resolveMultiPropertyGenerationAdmission(outside, {}, GENERATION_ONLY);
    assert.equal(admission.allowed, false);
    if (!admission.allowed && admission.reason === "multi_property_domain_unsupported") {
      assert.ok(admission.domainReasons.some((reason) => reason.code === REASON.priorDeficitNotSupported));
    } else assert.fail("refus de domaine attendu");
    assert.equal(gateOf(confirmed(outside), GENERATION_ONLY).canGenerate, false);
    const { result, calls } = produce(outside);
    assert.equal(result.status, "blocked");
    assert.equal(calls.length, 0, "F-006 non appelé : motif connu avant calcul");
  });

  it("capacité OFF + domaine NON supporté → refus de capacité (la capacité est évaluée en premier)", () => {
    const outside = multiWorkspace({ fiscalYear: { stocksOuverture: STOCKS } });
    assert.deepEqual(resolveMultiPropertyGenerationAdmission(outside, {}, GENERATION_OFF), { allowed: false, reason: "multi_property_not_enabled" });
  });

  it("l'admission n'est jamais suffisante seule : un motif connu après consolidation / calcul bloque l'entrée même quand l'admission passe", () => {
    const withCommonCharge = SIMPLE();
    assert.deepEqual(resolveMultiPropertyGenerationAdmission(withCommonCharge, {}, GENERATION_ONLY), { allowed: true });
    assert.equal(blockedCodes(produce(withCommonCharge, { commonCharges: [{ label: "syndic" }] }).result).includes(REASON.commonChargesNotSupported), true);
    const lossesWithDepreciation = LOSSES_WITH_DEPRECIATION();
    assert.deepEqual(resolveMultiPropertyGenerationAdmission(lossesWithDepreciation, {}, GENERATION_ONLY), { allowed: true });
    assert.equal(gateOf(confirmed(lossesWithDepreciation), GENERATION_ONLY).canGenerate, false, "preview bloqué (39 C) ⇒ gate fermée");
  });

  it("mono : jamais concerné par l'admission multi (chemin historique inchangé)", () => {
    for (const capabilities of [GENERATION_OFF, GENERATION_ONLY]) {
      assert.deepEqual(resolveMultiPropertyGenerationAdmission(monoWorkspace(), {}, capabilities), { allowed: true });
      assert.equal(isMultiPropertyGenerationBlocked(monoWorkspace(), capabilities), false);
    }
  });

  it("la gate multi n'accorde jamais paiement : canCheckout / canRetryAfterPayment restent false, payé ou non", () => {
    for (const paid of [false, true]) {
      const gate = gateOf(confirmed(SIMPLE()), GENERATION_ONLY, { paid });
      assert.equal(gate.canCheckout, false);
      assert.equal(gate.canRetryAfterPayment, false);
    }
  });
});

// ---------------------------------------------------------------------------
// 4–6. Oracles fiscaux — entrée de production, UNE activité, UNE génération
// ---------------------------------------------------------------------------

describe("ORACLES — une activité, une génération", () => {
  it("4. SIMPLE PROFIT — 8 000 / 3 000 / 5 000 ; 2033-B 312 = 350 = 5 000, 352 = 0, BALANCED ; 2031 7a ; 2042 5NA = 5 000 ; aucun 5NY / 5GA–5GJ", () => {
    const { result, calls } = generated(SIMPLE());
    const fiscal = result.rfs.fiscalResult;
    assert.equal(calls.length, 1, "11. UN seul calcul F-006 d'activité");
    assert.equal(calls[0]!.revenusAssistant?.totalRecettes, 11000);
    assert.equal(calls[0]!.chargesAssistant?.totalDeductible, 3000);
    assert.equal(fiscal.resultatAvantAmort, 8000);
    assert.equal(fiscal.amortDeduct, 3000);
    assert.equal(fiscal.resultatFiscalAvantDeficits, 5000);
    const form2033B = result.liasseRfs.form2033B;
    assert.equal(caseValue(form2033B, "312"), 5000);
    assert.equal(caseValue(form2033B, "350"), 5000);
    assert.equal(caseValue(form2033B, "352"), 0);
    assert.equal(form2033B.balancing.status, "BALANCED");
    assert.equal(caseValue(form2031Of(result), "I_7A"), 5000);
    assert.equal(caseValue(form2031Of(result), "I_7B"), undefined);
    const cases = aideCases(result);
    assert.equal(cases.find((item) => item.case === "5NA")?.montant, 5000, "15. 5NA consolidé");
    assert.equal(cases.some((item) => item.case === "5NY"), false);
    assert.equal(cases.some((item) => item.case === "5GA–5GJ"), false, "17. aucun historique 5G* dans le domaine première année");
  });

  it("5. PROFIT + LOSS — activité 5 500, aucun 5NY, aucune déclaration séparée du déficit B, aucun résultat final par bien", () => {
    const { result, calls } = generated(PROFIT_LOSS());
    const fiscal = result.rfs.fiscalResult;
    assert.equal(calls.length, 1);
    assert.equal(fiscal.resultatFiscalAvantDeficits, 5500);
    assert.equal(fiscal.deficitNouveau, 0);
    assert.equal(caseValue(result.liasseRfs.form2033B, "350"), 5500);
    assert.equal(result.liasseRfs.form2033B.balancing.status, "BALANCED");
    assert.equal(caseValue(form2031Of(result), "I_7A"), 5500);
    assert.equal(caseValue(form2031Of(result), "I_7B"), undefined);
    const cases = aideCases(result);
    assert.equal(cases.find((item) => item.case === "5NA")?.montant, 5500);
    assert.equal(cases.some((item) => item.case === "5NY"), false);
    // Aucune grandeur fiscale finale par bien n'est portée par la RFS : seuls les blocs d'immobilisations le sont.
    const serialized = JSON.stringify(result.rfs.fiscalResult);
    assert.ok(!serialized.includes(A) && !serialized.includes(B), "le FiscalResult d'activité ne porte aucun identifiant de bien");
    for (const bloc of result.rfs.immobilisationsParBien ?? []) assert.deepEqual(Object.keys(bloc).sort(), ["dotationsExercice", "immobilisations", "propertyId"]);
  });

  it("6. TWO LOSSES SANS DOTATION — déficit d'activité 3 000 : 2031 7b = 3 000, 2042 5NY = 3 000, aucune 5NA ; 330 = −E", () => {
    const { result } = generated(LOSSES_NO_DEPRECIATION());
    const fiscal = result.rfs.fiscalResult;
    assert.equal(fiscal.resultatAvantAmort, -3000);
    assert.equal(fiscal.deficitNouveau, 3000);
    assert.equal(caseValue(result.liasseRfs.form2033B, "330"), 3000);
    assert.equal(caseValue(result.liasseRfs.form2033B, "352"), 0);
    assert.equal(result.liasseRfs.form2033B.balancing.status, "BALANCED");
    assert.equal(caseValue(form2031Of(result), "I_7B"), 3000);
    const cases = aideCases(result);
    assert.equal(cases.find((item) => item.case === "5NY")?.montant, 3000, "16. 5NY consolidé");
    assert.equal(cases.some((item) => item.case === "5NA"), false);
  });

  it("7. 39 C NON SUPPORTÉ — deux pertes AVEC dotations : REFUS multi_property_39c_allocation_not_supported ; aucune RFS, aucune liasse", () => {
    const { result, calls } = produce(LOSSES_WITH_DEPRECIATION());
    assert.equal(result.status, "blocked");
    assert.deepEqual(blockedCodes(result), [REASON.allocation39cNotSupported]);
    assert.equal(calls.length, 1, "le motif n'est établi qu'APRÈS F-006 (ARD généré) : contrat existant, blocage immédiat après détection");
    assert.equal("rfs" in result, false);
    assert.equal("liasseRfs" in result, false);
  });
});

// ---------------------------------------------------------------------------
// 8–10. Isolation par bien, ordre, bien actif
// ---------------------------------------------------------------------------

describe("INVARIANCES — isolation, ordre, bien actif", () => {
  it("8. PROPERTY ISOLATION — +1 000 de revenus sur A : +1 000 sur l'activité, B strictement identique, sources non mutées", () => {
    const base = generated(SIMPLE());
    const modified = SIMPLE();
    const biens = (modified.declarationDraft as unknown as { biens: Record<string, { revenusAssistant: { totalRecettes: number; loyersEncaisses: number } }> }).biens;
    const sourceB = JSON.stringify(biens[B]);
    biens[A]!.revenusAssistant.totalRecettes += 1000;
    biens[A]!.revenusAssistant.loyersEncaisses += 1000;
    const next = generated(modified);
    assert.equal(next.result.rfs.fiscalResult.resultatAvantAmort, base.result.rfs.fiscalResult.resultatAvantAmort + 1000);
    assert.equal(JSON.stringify(biens[B]), sourceB, "source du bien B non mutée par la génération");
    const blockOf = (result: Generated, id: string) => JSON.stringify(result.rfs.immobilisationsParBien!.find((bloc) => bloc.propertyId === id));
    assert.equal(blockOf(next.result, B), blockOf(base.result, B));
    assert.equal(blockOf(next.result, A), blockOf(base.result, A), "A ne change pas d'immobilisations : seul son revenu a changé");
  });

  const fiscalFingerprint = (result: Generated) => JSON.stringify({
    fiscalResult: result.rfs.fiscalResult,
    form2033B: result.liasseRfs.form2033B,
    form2031: form2031Of(result),
    aide: aideCases(result),
    deficitsOuverture: result.rfs.deficitsOuverture,
    totalDotations: (result.rfs.immobilisationsParBien ?? []).reduce((sum, bloc) => sum + bloc.dotationsExercice, 0),
  });
  const reversed = (workspace: PersistedWorkspace): PersistedWorkspace => {
    const next = clone(workspace);
    next.properties.reverse();
    next.fiscalYear.propertyIds.reverse();
    const biens = (next.declarationDraft as unknown as { biens: Record<string, unknown> }).biens;
    (next.declarationDraft as unknown as { biens: Record<string, unknown> }).biens = Object.fromEntries(Object.entries(biens).reverse());
    return next;
  };

  it("9. ORDER INVARIANCE — A+B puis B+A : mêmes valeurs fiscales finales (F-006, 2033-B, 2031, 2042, ouverture, dotations)", () => {
    for (const build of [SIMPLE, PROFIT_LOSS, LOSSES_NO_DEPRECIATION]) {
      const forward = generated(build());
      const backward = generated(reversed(build()));
      assert.equal(fiscalFingerprint(backward.result), fiscalFingerprint(forward.result));
      assert.equal(backward.calls.length, 1);
    }
  });

  it("10. ACTIVE-PROPERTY INVARIANCE — bien actif A, B ou absent : déclaration d'activité identique ; le service ignore tout état d'interface", () => {
    const workspace = PROFIT_LOSS();
    const none = generated(workspace);
    for (const activePropertyId of [A, B, "inconnu"]) {
      const withActive = generated(workspace, { activePropertyId });
      assert.equal(fiscalFingerprint(withActive.result), fiscalFingerprint(none.result), String(activePropertyId));
      assert.equal(withActive.calls.length, 1);
    }
    const code = readFileSync(path.join(ROOT, "src/lib/lmnp/services/declaration/generation-workspace.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(code, /activePropertyId|selectedPropertyId|properties\[0\]|propertyIds\[0\]/);
  });
});

// ---------------------------------------------------------------------------
// 11–14. Une activité : un F-006, une RFS, une 2031, une aide 2042
// ---------------------------------------------------------------------------

describe("UNE ACTIVITÉ, UNE GÉNÉRATION", () => {
  it("12–14. une seule RFS d'activité, une seule 2031, une seule aide ; les deux biens y figurent comme blocs d'immobilisations, jamais comme liasses", () => {
    const { result } = generated(PROFIT_LOSS());
    assert.equal(result.rfs.immobilisationsParBien?.length, 2);
    assert.deepEqual(result.rfs.immobilisationsParBien?.map((bloc) => bloc.propertyId).sort(), [A, B].sort());
    assert.equal(result.liasseRfs.formulairesGeneres.filter((id) => /2031/.test(id) && !/bis/i.test(id)).length, 1, "une seule 2031");
    assert.equal(result.liasseRfs.formulairesGeneres.filter((id) => /2033-B/.test(id)).length, 1, "une seule 2033-B");
    const document = buildClientSummaryDocument(result.rfs, { activityStartDate: "2026-03-01" });
    assert.equal(new Set(document.aide2042.cases.map((item) => item.case)).size, document.aide2042.cases.length, "une seule aide : chaque case une fois");
    const serialized = JSON.stringify(document);
    assert.ok(!serialized.includes(A) && !serialized.includes(B), "la source de l'aide 2042 est la RFS consolidée d'activité : aucun identifiant de bien");
    assert.equal(document.aide2042.cases.find((item) => item.case === "5NA")?.montant, result.rfs.fiscalResult.resultatFiscalAvantDeficits);
  });

  it("2033-A et 2033-C représentent l'ACTIVITÉ A+B : 572 = Σ dotations des deux biens ; aucune collision, aucun bien perdu", () => {
    const { result } = generated(SIMPLE());
    const totalDotations = (result.rfs.immobilisationsParBien ?? []).reduce((sum, bloc) => sum + bloc.dotationsExercice, 0);
    assert.equal(totalDotations, 3000);
    const form2033C = (result.liasseRfs as unknown as { form2033C?: Cases }).form2033C;
    assert.ok(form2033C, "2033-C produite");
    assert.equal(caseValue(form2033C!, "572"), 3000);
    const ids = (result.rfs.immobilisationsParBien ?? []).flatMap((bloc) => (bloc.immobilisations?.composants ?? []).map((item: { id?: string }) => `${bloc.propertyId}:${item.id}`));
    assert.equal(new Set(ids).size, ids.length, "aucune collision d'identifiants d'actifs entre biens");
    assert.ok(result.liasseRfs.formulairesGeneres.some((id) => /2033-A/.test(id)), "2033-A produite depuis la RFS d'activité");
  });
});

// ---------------------------------------------------------------------------
// Matrice FAIL-CLOSED — entrée de production, motifs stables, aucune génération partielle
// ---------------------------------------------------------------------------

describe("FAIL-CLOSED — matrice de domaine à l'entrée de production", () => {
  const base = () => [[A, oracleBien(6000, 1000, 1000)], [B, oracleBien(5000, 2000, 2000)]] as Array<[string, BienSpec]>;
  const attestations = (patch: Record<string, unknown>) => ({ ...CONFIRMED_ATTESTATIONS, ...patch });
  const absent = (kind: string) => { const next: Record<string, unknown> = { ...CONFIRMED_ATTESTATIONS }; delete next[kind]; return next; };
  const outOf = (kind: string) => attestations({ [kind]: { answer: "declared_out_of_domain", at: T, wordingVersion: "test" } });

  const matrix: Array<[string, () => PersistedWorkspace, string]> = [
    ["déficit antérieur", () => multiWorkspace({ specs: base(), fiscalYear: { stocksOuverture: STOCKS } }), REASON.priorDeficitNotSupported],
    ["ARD historique", () => multiWorkspace({ specs: base(), fiscalYear: { stocksOuverture: { ...STOCKS, stocks: { deficits: [], amortissementsReportes: 500, deficitsExpires: [] } } } }), REASON.historicalArdNotSupported],
    ["reprise", () => multiWorkspace({ specs: base(), fiscalYear: { repriseHistoriqueEnContinuite: true } }), REASON.takeoverNotSupported],
    ["exercice non initial", () => multiWorkspace({ specs: base(), fiscalYear: { previousFiscalYearId: "fy-2025" } }), REASON.notFirstYear],
    ["stock d'ouverture", () => multiWorkspace({ specs: base(), fiscalYear: { stocksOuverture: { ...STOCKS, stocks: { deficits: [{ millesime: 2025, montant: 10 }], amortissementsReportes: 0, deficitsExpires: [] } } } }), REASON.priorDeficitNotSupported],
    ["date de mise en service manquante", () => multiWorkspace({ specs: [base()[0]!, [B, { ...oracleBien(5000, 2000, 2000), date: undefined }]] }), REASON.serviceDateMissing],
    ["LMP", () => multiWorkspace({ specs: base(), root: { activityType: "LMP" } }), REASON.lmpNotSupported],
    ["SSI : attestation absente", () => multiWorkspace({ specs: base(), root: { multiPropertyAttestations: absent("ssi") } }), REASON.ssiAttestationMissing],
    ["SSI : hors domaine déclaré", () => multiWorkspace({ specs: base(), root: { multiPropertyAttestations: outOf("ssi") } }), REASON.ssiNotSupported],
    ["détention directe : attestation absente", () => multiWorkspace({ specs: base(), root: { multiPropertyAttestations: absent("directHolding") } }), REASON.directHoldingAttestationMissing],
    ["détention indirecte déclarée", () => multiWorkspace({ specs: base(), root: { multiPropertyAttestations: outOf("directHolding") } }), REASON.indirectHoldingNotSupported],
    ["charges communes : attestation absente", () => multiWorkspace({ specs: base(), root: { multiPropertyAttestations: absent("noCommonCharges") } }), REASON.commonChargesAttestationMissing],
    ["charges communes : hors domaine déclaré", () => multiWorkspace({ specs: base(), root: { multiPropertyAttestations: outOf("noCommonCharges") } }), REASON.commonChargesNotSupported],
    ["document non attribué", () => { const ws = multiWorkspace({ specs: base() }); ws.documents = [{ id: "doc-x", fiscalYearId: "fy-2026", fileName: "x.pdf", mimeType: "application/pdf", sizeBytes: 1, category: "charges", documentType: "unknown", status: "analyzed", uploadedAt: T } as never]; return ws; }, REASON.unattributedDocument],
  ];
  for (const [label, build, code] of matrix) {
    it(`${label} → REFUS ${code} ; F-006 non appelé, aucune génération partielle`, () => {
      const { result, calls } = produce(build());
      assert.equal(result.status, "blocked");
      assert.equal(calls.length, 0, "motif connu avant calcul");
      assert.ok(blockedCodes(result).includes(code), `${code} ∈ ${blockedCodes(result)}`);
      assert.equal("rfs" in result, false);
      // L'admission ne voit que les faits établis AVANT consolidation ; la date de mise en service par bien est un motif de consolidation.
      const preCalculation = code !== REASON.serviceDateMissing;
      assert.equal(resolveMultiPropertyGenerationAdmission(build(), {}, GENERATION_ONLY).allowed, !preCalculation, "admission cohérente avec l'entrée (nécessaire, jamais suffisante)");
    });
  }

  it("charge commune explicite et prêt partagé → refus de consolidation (seams existants), F-006 non appelé", () => {
    const common = produce(SIMPLE(), { commonCharges: [{ label: "syndic commun" }] });
    assert.ok(blockedCodes(common.result).includes(REASON.commonChargesNotSupported));
    assert.equal(common.calls.length, 0);
    const loan = (spec: BienSpec): BienSpec => ({ ...spec, creditDocumentId: "doc-pret", credit: "present" });
    const shared = produce(multiWorkspace({ specs: [[A, loan(oracleBien(6000, 1000, 1000))], [B, { ...loan(oracleBien(5000, 2000, 2000)), pretIds: ["loan-2"] }]] }));
    assert.ok(blockedCodes(shared.result).includes(REASON.sharedLoanNotSupported));
    assert.equal(shared.calls.length, 0);
  });

  it("ARD généré (hors domaine, 39 C) → refus après F-006, aucune allocation", () => {
    assert.deepEqual(blockedCodes(produce(LOSSES_WITH_DEPRECIATION()).result), [REASON.allocation39cNotSupported]);
  });
});

// ---------------------------------------------------------------------------
// 15–21. Documents ; livraison, paiement, clôture, N+1 : toujours fermés
// ---------------------------------------------------------------------------

describe("DOCUMENTS — la génération ne mélange ni n'invente de portée", () => {
  it("un document de bien reste attribué à son bien ; un document d'activité (INPI) reste commun ; un document non attribué bloque", () => {
    const ws = SIMPLE();
    const draft = ws.declarationDraft as unknown as Record<string, unknown>;
    draft.inpiDocumentId = "doc-inpi";
    const doc = (id: string, propertyId?: string | null) => ({ id, fiscalYearId: "fy-2026", fileName: `${id}.pdf`, mimeType: "application/pdf", sizeBytes: 1, category: "charges", documentType: "unknown", status: "analyzed", uploadedAt: T, ...(propertyId !== undefined ? { propertyId } : {}) }) as never;
    ws.documents = [doc("doc-a", A), doc("doc-b", B), doc("doc-inpi")];
    assert.equal(produce(ws).result.status, "generated", "A, B et l'activité (INPI) : aucune ambiguïté");
    ws.documents = [...ws.documents, doc("doc-orphan")];
    assert.ok(blockedCodes(produce(ws).result).includes(REASON.unattributedDocument), "jamais promu document commun");
  });
});

describe("CAPACITÉS — génération seule : livraison, paiement, clôture, N+1 restent fermés", () => {
  const access = (async () => ({ ok: true, fiscalYear: Y })) as never;
  const post = (handler: typeof handleCerfaPdfRequest | typeof handleAide2042PdfRequest, body: unknown, capabilities?: MultiPropertyCapabilities) =>
    callDelivery(handler, new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), access, capabilities);

  it("18. LIVRAISON : générer n'autorise pas la livraison — Cerfa ET aide 2042 refusent avec la seule génération ouverte", async () => {
    const { result } = generated(SIMPLE());
    for (const capabilities of [GENERATION_ONLY]) {
      const aide = await post(handleAide2042PdfRequest, { rfs: result.rfs, activityStartDate: "2026-03-01" }, capabilities);
      const cerfa = await post(handleCerfaPdfRequest, { rfs: result.rfs, declarationVersionId: "v1", forms: ["2031-SD"] }, capabilities);
      for (const response of [aide, cerfa]) {
        assert.equal(response.status, 422);
        assert.deepEqual(await response.json(), { status: "blocked", reason: "multi_property_not_enabled" });
      }
    }
    assert.equal(isMultiPropertyDeliveryBlocked(SIMPLE(), GENERATION_ONLY), true);
  });

  it("19. PAIEMENT : barrière serveur fermée avec la seule génération ouverte ; tarif inchangé", async () => {
    const read = async () => ({ schemaVersion: 2, payload: { workspace: SIMPLE() } });
    assert.equal(await isMultiPropertyBarrierActive(read, { dossierId: "d", fiscalYear: Y }, "payment", GENERATION_ONLY), true);
    assert.equal(GENERATION_PRICE_TTC, 149);
  });

  it("20–21. CLÔTURE et N+1 : bloqués, même avec toutes les capacités à true", () => {
    const everything = caps(ALL);
    for (const capabilities of [GENERATION_ONLY, everything]) {
      assert.equal(isMultiPropertyClosingBlocked(SIMPLE(), capabilities), true);
      assert.equal(isMultiPropertyNextYearBlocked(SIMPLE(), capabilities), true);
    }
    assert.equal(isMultiPropertyCapabilityOpen("closing", everything), false);
    assert.equal(isMultiPropertyCapabilityOpen("nextYear", everything), false);
  });

  it("indépendance : ouvrir la génération n'ouvre aucune autre capacité", () => {
    for (const other of ALL) assert.equal(isMultiPropertyCapabilityOpen(other, GENERATION_ONLY), other === "generation", other);
  });

  it("valeurs FINALES de production : génération, livraison et paiement ouverts ; édition, clôture, N+1 fermés (MB-MULTI-PAYMENT-WIRING-1)", () => {
    assert.deepEqual(MULTI_PROPERTY_CAPABILITIES, { edition: true, generation: true, delivery: true, payment: true, closing: false, nextYear: false });
  });
});

describe("MONO — non-régression de la gate et de la génération", () => {
  it("un dossier mono n'est ni concerné par la capacité multi ni par l'admission ; sa gate reste calculée par le chemin historique", () => {
    const mono = confirmed(monoWorkspace());
    for (const capabilities of [GENERATION_OFF, GENERATION_ONLY]) {
      const gate = gateOf(mono, capabilities);
      assert.equal(gate.workspaceReadiness, undefined, "aucune readiness multi pour un mono");
    }
    assert.equal(gateOf(mono, GENERATION_OFF).canGenerate, gateOf(mono, GENERATION_ONLY).canGenerate);
    assert.equal(gateOf(mono, GENERATION_OFF).canCheckout, gateOf(mono, GENERATION_ONLY).canCheckout);
  });
});
