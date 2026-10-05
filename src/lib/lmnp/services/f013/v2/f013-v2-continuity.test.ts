/**
 * F013 v2.6 — continuité locative N → N+1 : CONT-01 → CONT-25.
 * Run: npx tsx --test src/lib/lmnp/services/f013/v2/f013-v2-continuity.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

import { MULTI_PROPERTY_CAPABILITIES } from "@/lib/lmnp/dossier/multi-property-activation";
import { runDeclarationGenerationFromWorkspace } from "@/lib/lmnp/services/declaration/generation-workspace";
import { bien as exactBienDraft, collected as exactCollected } from "@/lib/lmnp/services/article-39c/article-39c-test-fixtures";
import { canCloseFiscalYear, planNextDeclarationDraft } from "@/lib/lmnp/services/dossier/fiscal-year-cycle";
import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import { createInMemoryFiscalYearTransitionStore } from "@/lib/lmnp/services/fiscal-year-transition/in-memory-store";
import { prepareFiscalYearTransitionCandidate } from "@/lib/lmnp/services/fiscal-year-transition/prepare-transition";
import { createStoreBackedTransitionHandlerDeps, handleFiscalYearTransitionRequest } from "@/lib/lmnp/services/fiscal-year-transition/transition-handler";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { lmnpReducer, type LmnpState } from "@/lib/lmnp/store/reducer";
import { parseWorkspaceSnapshot, serializeWorkspaceSnapshot } from "@/lib/lmnp/store/workspace-snapshot";
import type { DeclarationDraft, FiscalYear, RevenueRawLine } from "@/lib/lmnp/types";
import { processRawFinancialLines } from "@/lib/lmnp/services/revenue-transaction-pipeline";

import { applyDocumentaryProposals, proposeFactsFromObservations } from "./f013-v2-documentary-bridge";
import { planRentContinuity, verifyOpeningContinuity } from "./f013-v2-continuity";
import { answerBalance, answerCollections, answerCoverage, answerExceptions, type BalanceKey } from "./f013-v2-manual-flow";
import { observationFromRevenueTransaction } from "./f013-v2-observation";
import { projectRentalInventoryToBilan, readRentalInventory } from "./f013-v2-rental-inventory";
import {
  confirmRentReconciliation,
  createRentReconciliationState,
  evaluateRentReconciliation,
  parseRentReconciliationState,
  type RentReconciliationV2State,
} from "./f013-v2-state";
import { evaluateF013V2Continuity } from "./f013-v2-transition-guard";

const NOW = "2026-09-21T20:00:00.000Z";
const N = 2026;
const DOSSIER = "dossier-1";
const eur = (n: number) => Math.round(n * 100);
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  assert.equal(r.ok, true);
  return r as Extract<T, { ok: true }>;
};
type Bal = Partial<Record<BalanceKey, number>>;

function rent(propertyId: string, e: number, o: Bal = {}, year = N, confirm = true): RentReconciliationV2State {
  const scope = { propertyId, fiscalYear: year };
  let s = createRentReconciliationState(scope);
  s = ok(answerCollections(s, eur(e))).state;
  s = answerCoverage(s, "all");
  for (const k of ["openingReceivables", "closingReceivables", "openingAdvances", "closingAdvances"] as BalanceKey[]) {
    const a = o[k];
    s = ok(answerBalance(s, k, a ? { answer: "some", amountCents: eur(a) } : { answer: "none" })).state;
  }
  s = ok(answerExceptions(s, { answer: "none" })).state;
  return confirm ? ok(confirmRentReconciliation(s, scope, NOW)).state : s;
}
const acquired = (s: RentReconciliationV2State) => {
  const r = evaluateRentReconciliation(s, { propertyId: s.facts.propertyId, fiscalYear: s.facts.fiscalYear }).result;
  return r.status === "SUPPORTED" ? r.loyersAcquisCents : null;
};

// --- Fixture mono clôturable --------------------------------------------------------------------------------------
const baseFy = (over: Partial<FiscalYear> = {}): FiscalYear => ({
  id: "fy-1", year: N, status: "ready_to_close", regime: "reel", propertyIds: ["prop-1"], dossierId: DOSSIER,
  declarationGeneratedAt: NOW, priorHistoryDeclaration: { status: "FIRST_REAL_YEAR", declaredAt: NOW },
  closures: [], createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-01T00:00:00.000Z", ...over,
});
function closableDraft(): DeclarationDraft {
  const draft = {
    completedSteps: [], inpiConfirmedAt: NOW, logementConfirmedAt: NOW,
    logementAmortissement: { computedAt: NOW, prixRevient: 200000, valeurTerrain: 40000, valeurBati: 160000, baseAmortissableBati: 160000, montantMobilier: 0, dotationAnnuelle: 5333, dureeMoyenneAnnees: 30, plan: { lignes: [], totalAnnuelExercice: 0, totalBrut: 0 } },
    creditDeclaredNoneAt: NOW, revenusConfirmedAt: NOW, chargesConfirmedAt: NOW, amortissementConfirmedAt: NOW,
    siret: "12345678901234", siren: "123456789", exploitantFirstName: "Marie", exploitantLastName: "Dupont",
    exploitantEmail: "marie.dupont@example.com", exploitantTelephone: "0601020304", personalAddress: "10 rue des Lilas",
    personalCity: "Lyon", personalPostalCode: "69001", dateMiseEnService: "2020-01-01",
    revenusAssistant: { exerciceFiscal: N, totalRecettes: 9000 },
    chargesAssistant: { exerciceFiscal: N, totalDeductible: 2000, totalPreExploitation: 0 },
    amortissementAssistant: { exerciceFiscal: N, totalDotations: 1500, status: "validated" },
  } as DeclarationDraft;
  const g = runDeclarationGeneration(draft, N);
  assert.equal(g.status, "generated");
  if (g.status !== "generated") throw new Error("unreachable");
  return { ...draft, fiscalResult: g.fiscalResult, rfs: g.rfs } as DeclarationDraft;
}
const prop = (id: string) => ({ id, label: id, address: "1 rue X", city: "Lyon", postalCode: "69000" });
/**
 * INT-5 — un dossier portant un état F013 v2 est calculé par le moteur EXACT (jamais le proxy) : sa génération de référence doit
 * donc être exacte. La fixture v2 est un dossier exact complet (F012 confirmé et réconcilié, F010 / F014 validés, première
 * année déclarée) dont la génération de référence est produite par la génération du dossier — comme en production.
 */
function monoWs(state?: RentReconciliationV2State): PersistedWorkspace {
  const d = closableDraft();
  const base = (draft: DeclarationDraft): PersistedWorkspace => ({
    fiscalYear: baseFy(), properties: [prop("prop-1")], documents: [], extractions: [], validationItems: [], ledgerEntries: [],
    declarationDraft: draft, aiActivityFeed: [],
  });
  if (!state) return base(d);
  const { propertyId: _id, completedSteps: _steps, ...exactFields } = exactBienDraft("prop-1", { rent: state, collected: exactCollected({ taxeFonciere: 2000 }), logement: {}, dotation: 1500 });
  void _id; void _steps;
  const draft = {
    ...d,
    ...exactFields,
    logementAmortissement: { ...d.logementAmortissement!, exerciceFiscal: N },
    amortissementAssistant: { exerciceFiscal: N, totalDotations: 1500, status: "validated" },
    revenusAssistant: undefined,
    revenusConfirmedAt: undefined,
    rentReconciliationV2: state,
  } as DeclarationDraft;
  delete (draft as { fiscalResult?: unknown }).fiscalResult;
  delete (draft as { rfs?: unknown }).rfs;
  const generated = runDeclarationGenerationFromWorkspace(base(draft), {});
  // État F013 non définitif (UNKNOWN / PROPOSED / confirmation périmée…) : le calcul exact REFUSE (aucun repli sur le proxy) ;
  // le dossier garde alors une génération de référence ancienne, et la clôture doit être refusée (tests de refus ci-dessous).
  if (generated.status !== "generated") return base({ ...draft, fiscalResult: d.fiscalResult, rfs: d.rfs } as DeclarationDraft);
  return base({ ...draft, fiscalResult: generated.fiscalResult, rfs: generated.rfs } as DeclarationDraft);
}
const prepare = (ws: PersistedWorkspace) => prepareFiscalYearTransitionCandidate({ workspace: ws, dossierId: DOSSIER, now: NOW, nextFiscalYearId: "fy-next" });
const mono = (state?: RentReconciliationV2State) => ({ fiscalYear: { year: N, propertyIds: ["prop-1"] }, declarationDraft: state ? { completedSteps: [], rentReconciliationV2: state } : undefined });
const planOf = (state: RentReconciliationV2State) => {
  const p = planRentContinuity(mono(state));
  assert.equal(p.ok, true);
  if (!p.ok || !p.applicable) throw new Error("plan attendu");
  return p;
};
const next1 = (state: RentReconciliationV2State) => planOf(state).nextStates["prop-1"]!;

describe("Contrat de continuité : CONT-01 → CONT-04", () => {
  it("CONT-01 CC(N) = 1 000 VALIDATED → CO(N+1) = 1 000, provenance continuity avec chaîne de preuve", () => {
    const src = rent("prop-1", 11000, { closingReceivables: 1000 });
    const nx = next1(src);
    const co = nx.facts.openingReceivables;
    assert.equal(co.status === "VALIDATED" && co.amountCents, eur(1000));
    const prov = co.status === "VALIDATED" ? co.provenance : undefined;
    assert.equal(prov?.kind, "prior_year_continuity");
    if (prov?.kind !== "prior_year_continuity") return;
    assert.equal(prov.fromFiscalYear, N);
    assert.equal(prov.sourcePropertyId, "prop-1");
    assert.equal(prov.sourceNature, "closing_receivable");
    assert.equal(prov.sourceStatus, "VALIDATED");
    assert.equal(prov.sourceRevision, src.facts.revision);
    assert.equal(typeof prov.sourceFactsDigest, "string");
    assert.equal(nx.facts.fiscalYear, N + 1);
    assert.equal(nx.openingContinuity?.sourceConfirmation.revision, src.confirmation!.revision);
    assert.equal(nx.openingContinuity?.sourceFactsDigest, prov.sourceFactsDigest);
  });
  it("CONT-02 AC(N) = 1 000 VALIDATED → AO(N+1) = 1 000 (nature avance, jamais interverties)", () => {
    const nx = next1(rent("prop-1", 13000, { closingAdvances: 1000 }));
    const ao = nx.facts.openingAdvances;
    assert.equal(ao.status === "VALIDATED" && ao.amountCents, eur(1000));
    assert.equal(ao.status === "VALIDATED" && ao.provenance?.kind === "prior_year_continuity" && ao.provenance.sourceNature, "closing_advance");
    const co = nx.facts.openingReceivables;
    assert.equal(co.status === "VALIDATED" && co.amountCents, 0, "CC = 0 validé : CO = VALIDATED(0), pas l'avance");
  });
  it("CONT-03 CC = 0 VALIDATED → CO = VALIDATED(0) explicite (pas UNKNOWN)", () => {
    const co = next1(rent("prop-1", 12000)).facts.openingReceivables;
    assert.deepEqual([co.status, co.status === "VALIDATED" ? co.amountCents : null], ["VALIDATED", 0]);
  });
  it("CONT-04 AC = 0 VALIDATED → AO = VALIDATED(0) explicite", () => {
    const ao = next1(rent("prop-1", 12000)).facts.openingAdvances;
    assert.deepEqual([ao.status, ao.status === "VALIDATED" ? ao.amountCents : null], ["VALIDATED", 0]);
  });
});

describe("Refus : CONT-05 → CONT-08, CONT-25", () => {
  const blocked = (state: RentReconciliationV2State) => {
    const p = planRentContinuity(mono(state));
    assert.equal(p.ok, false);
    return p.ok ? [] : p.reasons;
  };
  const noSideEffects = (ws: PersistedWorkspace) => {
    const before = JSON.stringify(ws);
    const r = prepare(ws);
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.code, "f013_v2_continuity_not_supported");
    assert.equal(JSON.stringify(ws), before, "workspace N non muté : aucun N clôturé partiellement");
    assert.equal(ws.fiscalYear.status, "ready_to_close");
    assert.equal(canCloseFiscalYear({ fiscalYear: ws.fiscalYear, declarationDraft: ws.declarationDraft, properties: ws.properties }).ok, false);
  };
  it("CONT-05 CC UNKNOWN → clôture refusée (jamais zéro)", () => {
    const s = rent("prop-1", 12000, {}, N, false);
    const unknownCc: RentReconciliationV2State = { ...s, facts: { ...s.facts, closingReceivables: { status: "UNKNOWN" } } };
    const reasons = blocked(unknownCc);
    assert.ok(reasons.some((r) => r.code === "SOURCE_NOT_DEFINITIVE" && r.engineCodes?.includes("TERM_UNKNOWN")));
    noSideEffects(monoWs(unknownCc));
  });
  it("CONT-06 AC PROPOSED → clôture refusée (le contrat exige un fait définitif)", () => {
    const s = rent("prop-1", 12000, {}, N, false);
    const proposed: RentReconciliationV2State = { ...s, facts: { ...s.facts, closingAdvances: { status: "PROPOSED", amountCents: eur(500) } } };
    assert.ok(blocked(proposed).some((r) => r.engineCodes?.includes("TERM_PROPOSED_NOT_VALIDATED")));
    noSideEffects(monoWs(proposed));
  });
  it("CONT-07 confirmation F013 N périmée → refus", () => {
    const confirmed = rent("prop-1", 12000);
    const stale: RentReconciliationV2State = { ...confirmed, facts: { ...confirmed.facts, collections: { status: "VALIDATED", amountCents: eur(11000) } } };
    assert.ok(blocked(stale).some((r) => r.code === "CONFIRMATION_STALE"));
    noSideEffects(monoWs(stale));
  });
  it("CONT-08 révision / empreinte incohérentes → refus", () => {
    const confirmed = rent("prop-1", 12000);
    const badRevision: RentReconciliationV2State = { ...confirmed, confirmation: { ...confirmed.confirmation!, revision: confirmed.confirmation!.revision + 5 } };
    const badDigest: RentReconciliationV2State = { ...confirmed, confirmation: { ...confirmed.confirmation!, factsDigest: "00000000" } };
    for (const s of [badRevision, badDigest]) {
      assert.ok(blocked(s).some((r) => r.code === "CONFIRMATION_STALE"));
      noSideEffects(monoWs(s));
    }
  });
  it("refus : exercice incohérent, bien incohérent, état illisible, version future, doublon, états mélangés", () => {
    const good = rent("prop-1", 12000);
    const wrongYear = rent("prop-1", 12000, {}, 2024);
    assert.ok(blocked(wrongYear).some((r) => r.code === "WRONG_FISCAL_YEAR"));
    const wrongProp = rent("autre", 12000);
    assert.ok(blocked(wrongProp).some((r) => r.code === "PROPERTY_MISMATCH"));
    const unreadable = planRentContinuity({ fiscalYear: { year: N, propertyIds: ["prop-1"] }, declarationDraft: { rentReconciliationV2: { n: "importe quoi" } } });
    assert.equal(!unreadable.ok && unreadable.reasons[0]!.code, "STATE_UNREADABLE");
    const future = planRentContinuity({ fiscalYear: { year: N, propertyIds: ["prop-1"] }, declarationDraft: { rentReconciliationV2: { ...good, stateVersion: 2 } } });
    assert.equal(!future.ok && future.reasons[0]!.code, "STATE_UNREADABLE");
    const dup = planRentContinuity({ fiscalYear: { year: N, propertyIds: ["prop-1", "prop-1"] }, declarationDraft: { biens: { "prop-1": { rentReconciliationV2: good } } } });
    assert.ok(!dup.ok && dup.reasons.some((r) => r.code === "DUPLICATE_PROPERTY"));
    const mixed = planRentContinuity({ fiscalYear: { year: N, propertyIds: ["prop-1"] }, declarationDraft: { rentReconciliationV2: good, biens: { "prop-1": { rentReconciliationV2: good } } } });
    assert.equal(!mixed.ok && mixed.reasons[0]!.code, "MIXED_FLAT_AND_SCOPED");
    const noCtx = planRentContinuity({ fiscalYear: undefined, declarationDraft: { rentReconciliationV2: good } });
    assert.equal(!noCtx.ok && noCtx.reasons[0]!.code, "CONTEXT_MISSING");
  });
});

describe("État de N+1 : CONT-09 → CONT-11, CONT-19", () => {
  const nx = () => next1(rent("prop-1", 11000, { closingReceivables: 1000 }));
  it("CONT-09 CC(N+1) et AC(N+1) restent UNKNOWN (CC(N) ne devient pas CC(N+1))", () => {
    assert.equal(nx().facts.closingReceivables.status, "UNKNOWN");
    assert.equal(nx().facts.closingAdvances.status, "UNKNOWN");
  });
  it("CONT-10 encaissements et couverture N+1 restent UNKNOWN ; le total de N n'est pas copié", () => {
    const f = nx().facts;
    assert.equal(f.collections.status, "UNKNOWN");
    assert.equal(f.collectionsCoverage.completeness, "UNKNOWN");
    assert.equal(JSON.stringify(nx()).includes("1200000"), false, "aucun total de loyers acquis N dans N+1");
  });
  it("CONT-11 N+1 non confirmé, exceptions non passées en revue, révision cohérente", () => {
    const s = nx();
    assert.equal(s.confirmation, undefined);
    assert.equal(s.facts.exceptionsReviewed, false);
    assert.equal(s.facts.revision, 1);
    assert.equal(evaluateRentReconciliation(s, { propertyId: "prop-1", fiscalYear: N + 1 }).result.status, "NEEDS_CONFIRMATION");
  });
  it("CONT-19 les observations de N ne deviennent ni transactions ni observations de N+1 (seule la référence est conservée)", () => {
    const lines: RevenueRawLine[] = [{ label: "Loyer décembre 2025", amount: 1000, date: "05/01/2026", direction: "credit", sourceDocumentId: "doc1", sourceType: "bank_statement", confidence: 90 }];
    const tx = processRawFinancialLines(lines, N)[0]!;
    const obs = ok(observationFromRevenueTransaction(tx, { fiscalYear: N, attribution: { kind: "property", propertyId: "prop-1" } })).observation;
    let src = applyDocumentaryProposals(createRentReconciliationState({ propertyId: "prop-1", fiscalYear: N }), proposeFactsFromObservations({ scope: { propertyId: "prop-1", fiscalYear: N }, observations: [obs] }), [obs]).state;
    src = ok(answerCollections(src, 0)).state;
    src = answerCoverage(src, "all");
    for (const k of ["openingReceivables", "openingAdvances", "closingAdvances"] as BalanceKey[]) src = ok(answerBalance(src, k, { answer: "none" })).state;
    src = ok(answerExceptions(src, { answer: "none" })).state;
    src = { ...src, facts: { ...src.facts, closingReceivables: { status: "VALIDATED", amountCents: 100000, provenance: { kind: "user_declaration" } } } };
    src = ok(confirmRentReconciliation(src, { propertyId: "prop-1", fiscalYear: N }, NOW)).state;
    assert.equal(src.observations?.length, 1);
    const n1 = next1(src);
    assert.equal(n1.observations, undefined);
    assert.equal(n1.facts.links, undefined);
    assert.equal(n1.facts.collections.status, "UNKNOWN");
    const prov = n1.facts.openingReceivables.status === "VALIDATED" ? n1.facts.openingReceivables.provenance : undefined;
    assert.deepEqual(prov?.kind === "prior_year_continuity" && prov.observationIds, src.facts.links?.observationIds ?? undefined);
  });
});

describe("Oracles arithmétiques : CONT-12, CONT-13", () => {
  function nextYearFlow(nx: RentReconciliationV2State, e: number): RentReconciliationV2State {
    let s = ok(answerCollections(nx, eur(e))).state;
    s = answerCoverage(s, "all");
    s = ok(answerBalance(s, "closingReceivables", { answer: "none" })).state;
    s = ok(answerBalance(s, "closingAdvances", { answer: "none" })).state;
    return ok(answerExceptions(s, { answer: "none" })).state;
  }
  it("CONT-12 créance : N acquis 12 000 ; N+1 E 12 000 (dont le règlement), CO 1 000 → 11 000", () => {
    const src = rent("prop-1", 11000, { closingReceivables: 1000 });
    assert.equal(acquired(src), eur(12000));
    assert.equal(acquired(nextYearFlow(next1(src), 12000)), eur(11000));
  });
  it("CONT-13 avance : N acquis 12 000 ; N+1 E 11 000 (hors l'avance), AO 1 000 → 12 000", () => {
    const src = rent("prop-1", 13000, { closingAdvances: 1000 });
    assert.equal(acquired(src), eur(12000));
    assert.equal(acquired(nextYearFlow(next1(src), 11000)), eur(12000));
  });
});

describe("Multi et biens ajoutés / retirés : CONT-14 → CONT-16, CONT-23", () => {
  const scopedDraft = (a: RentReconciliationV2State, b: RentReconciliationV2State, extra: Record<string, unknown> = {}) =>
    ({ completedSteps: [], biens: { A: { propertyId: "A", completedSteps: [], rentReconciliationV2: a }, B: { propertyId: "B", completedSteps: [], rentReconciliationV2: b }, ...extra } }) as unknown as DeclarationDraft;
  const A = () => rent("A", 11000, { closingReceivables: 1000 });
  const B = () => rent("B", 7700, { closingAdvances: 700 });
  it("CONT-14 A (CC 1 000) et B (AC 700) : continuité par bien, aucune contamination, chaîne de preuve propre à chaque bien", () => {
    const plan = planRentContinuity({ fiscalYear: { year: N, propertyIds: ["A", "B"] }, declarationDraft: scopedDraft(A(), B()) });
    assert.equal(plan.ok && plan.applicable, true);
    if (!plan.ok || !plan.applicable) return;
    const a = plan.nextStates.A!.facts;
    const b = plan.nextStates.B!.facts;
    const amount = (f: typeof a.openingReceivables) => (f.status === "VALIDATED" ? f.amountCents : null);
    assert.deepEqual([amount(a.openingReceivables), amount(a.openingAdvances)], [100000, 0]);
    assert.deepEqual([amount(b.openingReceivables), amount(b.openingAdvances)], [0, 70000]);
    const src = (f: typeof a.openingReceivables) => (f.status === "VALIDATED" && f.provenance?.kind === "prior_year_continuity" ? f.provenance.sourcePropertyId : null);
    assert.deepEqual([src(a.openingReceivables), src(b.openingAdvances)], ["A", "B"]);
    const draft = planNextDeclarationDraft(scopedDraft(A(), B()), { sourceFiscalYear: { year: N, propertyIds: ["A", "B"] } });
    assert.equal(draft.ok, true);
    if (!draft.ok) return;
    assert.equal(draft.draft.rentReconciliationV2, undefined, "jamais à plat en scopé");
    assert.equal(draft.draft.biens?.A?.rentReconciliationV2?.facts.propertyId, "A");
    assert.equal(draft.draft.biens?.B?.rentReconciliationV2?.facts.propertyId, "B");
  });
  it("CONT-15 bien nouveau en N+1 : aucune ouverture héritée d'un autre bien", () => {
    const plan = planRentContinuity({ fiscalYear: { year: N, propertyIds: ["A", "B"] }, declarationDraft: scopedDraft(A(), B()), targetPropertyIds: ["A", "B", "C"] });
    assert.equal(plan.ok && plan.applicable && Object.keys(plan.nextStates).sort().join(), "A,B");
    const draft = planNextDeclarationDraft(scopedDraft(A(), B()), { sourceFiscalYear: { year: N, propertyIds: ["A", "B"] }, targetPropertyIds: ["A", "B"] });
    assert.ok(draft.ok);
  });
  it("CONT-16 bien retiré : solde non nul → fail-closed ; solde nul validé → rien n'est transféré", () => {
    const removed = planRentContinuity({ fiscalYear: { year: N, propertyIds: ["A", "B"] }, declarationDraft: scopedDraft(A(), B()), targetPropertyIds: ["A"] });
    assert.ok(!removed.ok && removed.reasons.some((r) => r.code === "REMOVED_PROPERTY_WITH_BALANCE" && r.propertyId === "B"));
    const zeroB = rent("B", 5000);
    const ok0 = planRentContinuity({ fiscalYear: { year: N, propertyIds: ["A", "B"] }, declarationDraft: scopedDraft(A(), zeroB), targetPropertyIds: ["A"] });
    assert.equal(ok0.ok && ok0.applicable && Object.keys(ok0.nextStates).join(), "A");
    assert.deepEqual(ok0.ok && ok0.droppedZeroBalanceProperties, ["B"]);
  });
  it("CONT-23 les capacités multi ne sont pas ouvertes : closing/nextYear fermés, la barrière multi prime même avec des états définitifs", () => {
    assert.deepEqual({ ...MULTI_PROPERTY_CAPABILITIES }, { edition: true, generation: true, payment: true, delivery: true, closing: false, nextYear: false });
    const ws: PersistedWorkspace = {
      ...monoWs(), fiscalYear: baseFy({ propertyIds: ["A", "B"] }), properties: [prop("A"), prop("B")],
      declarationDraft: scopedDraft(A(), B()),
    };
    const r = prepare(ws);
    assert.equal(!r.ok && r.code, "multi_property_not_enabled");
  });
});

describe("Snapshot, transaction, reload : CONT-17, CONT-18, CONT-25, reducer", () => {
  it("CONT-17 snapshot N v3 → N+1 v3 (jamais reconstruit en v1/v2)", () => {
    const ws = monoWs(rent("prop-1", 11000, { closingReceivables: 1000 }));
    assert.equal(ok(serializeWorkspaceSnapshot(ws)).envelope.schemaVersion, 3);
    const p = prepare(ws);
    assert.equal(p.ok, true);
    if (!p.ok) return;
    assert.deepEqual([p.closedNSchemaVersion, p.nextSchemaVersion], [3, 3]);
    assert.equal(ok(serializeWorkspaceSnapshot(p.nextWorkspace)).envelope.schemaVersion, 3);
  });
  function storeWith(ws: PersistedWorkspace) {
    const env = ok(serializeWorkspaceSnapshot(ws)).envelope;
    return createInMemoryFiscalYearTransitionStore({
      dossiers: [{ id: DOSSIER, userId: "user-owner", activeFiscalYear: N }],
      snapshots: [{ dossierId: DOSSIER, fiscalYear: N, schemaVersion: env.schemaVersion, revision: 3, payload: env, closedAt: null, successorFiscalYear: null, updatedAt: NOW }],
    });
  }
  const post = (store: ReturnType<typeof storeWith>, body: Record<string, unknown>) =>
    handleFiscalYearTransitionRequest(
      new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ authToken: "tok-owner", dossierId: DOSSIER, fromYear: N, nextYear: N + 1, expectedRevision: 3, now: NOW, ...body }) }),
      () => createStoreBackedTransitionHandlerDeps(store),
    );
  it("CONT-18 clôture réelle (handler + commit transactionnel) puis reload depuis le stockage : état N+1 exact et lignée vérifiable", async () => {
    const src = rent("prop-1", 11000, { closingReceivables: 1000 });
    const ws = monoWs(src);
    const store = storeWith(ws);
    const p = prepare(ws);
    assert.equal(p.ok, true);
    if (!p.ok) return;
    const res = await post(store, { closedNPayload: p.closedNPayload, closedNSchemaVersion: p.closedNSchemaVersion, nextPayload: p.nextPayload, nextSchemaVersion: p.nextSchemaVersion });
    assert.equal(res.status, 200);
    const closed = await store.getSnapshot(DOSSIER, N);
    const next = await store.getSnapshot(DOSSIER, N + 1);
    assert.ok(closed?.closedAt && next);
    assert.deepEqual([closed!.schemaVersion, next!.schemaVersion], [3, 3]);
    const reloaded = parseWorkspaceSnapshot(JSON.parse(JSON.stringify(next!.payload)));
    assert.equal(reloaded.ok, true);
    const nextState = parseRentReconciliationState(reloaded.ok ? reloaded.envelope.workspace.declarationDraft.rentReconciliationV2 : undefined)!;
    assert.deepEqual(nextState, planOf(src).nextStates["prop-1"]);
    const closedWs = parseWorkspaceSnapshot(JSON.parse(JSON.stringify(closed!.payload)));
    const sourceState = parseRentReconciliationState(closedWs.ok ? closedWs.envelope.workspace.declarationDraft.rentReconciliationV2 : undefined)!;
    assert.deepEqual(verifyOpeningContinuity(nextState, sourceState), { ok: true });
    assert.equal(nextState.facts.openingReceivables.status === "VALIDATED" && nextState.facts.openingReceivables.amountCents, 100000);
    assert.equal(nextState.facts.propertyId, "prop-1");
    assert.equal(nextState.facts.fiscalYear, N + 1);
    // Une ouverture altérée n'est plus reliée à sa source.
    const forged = { ...nextState, facts: { ...nextState.facts, openingReceivables: { status: "VALIDATED" as const, amountCents: 5, provenance: { kind: "user_declaration" as const } } } };
    assert.equal(verifyOpeningContinuity(forged, sourceState).ok, false);
  });
  it("CONT-25 N+1 transmis sans continuité / altéré / schéma abaissé : 409, N reste ouvert, aucun N+1, aucun commit partiel", async () => {
    const src = rent("prop-1", 11000, { closingReceivables: 1000 });
    const ws = monoWs(src);
    const p = prepare(ws);
    assert.equal(p.ok, true);
    if (!p.ok) return;
    const tampered = JSON.parse(JSON.stringify(p.nextPayload)) as { workspace: { declarationDraft: { rentReconciliationV2: RentReconciliationV2State } } };
    tampered.workspace.declarationDraft.rentReconciliationV2.facts.openingReceivables = { status: "VALIDATED", amountCents: 1, provenance: { kind: "user_declaration" } };
    const lowered = JSON.parse(JSON.stringify(p.nextPayload));
    const injected = JSON.parse(JSON.stringify(p.nextPayload)) as { workspace: { declarationDraft: { rentReconciliationV2: RentReconciliationV2State } } };
    injected.workspace.declarationDraft.rentReconciliationV2.facts.closingReceivables = { status: "VALIDATED", amountCents: 999, provenance: { kind: "user_declaration" } };
    const cases: Array<[string, Record<string, unknown>]> = [
      ["ouverture altérée", { closedNPayload: p.closedNPayload, closedNSchemaVersion: 3, nextPayload: tampered, nextSchemaVersion: 3 }],
      ["CC N+1 injecté", { closedNPayload: p.closedNPayload, closedNSchemaVersion: 3, nextPayload: injected, nextSchemaVersion: 3 }],
      ["schéma N+1 abaissé", { closedNPayload: p.closedNPayload, closedNSchemaVersion: 3, nextPayload: lowered, nextSchemaVersion: 2 }],
      ["schéma N clos abaissé", { closedNPayload: p.closedNPayload, closedNSchemaVersion: 1, nextPayload: p.nextPayload, nextSchemaVersion: 3 }],
    ];
    for (const [label, body] of cases) {
      const store = storeWith(ws);
      const res = await post(store, body);
      assert.equal(res.status, 409, label);
      assert.equal(((await res.json()) as { code: string }).code, "f013_v2_continuity_not_supported", label);
      const n = await store.getSnapshot(DOSSIER, N);
      assert.equal(n?.closedAt, null, `${label} : N reste ouvert`);
      assert.equal(await store.getSnapshot(DOSSIER, N + 1), null, `${label} : aucun N+1`);
    }
  });
  it("reducer CREATE_NEXT_FISCAL_YEAR : N+1 en mémoire = continuité du serveur ; sans continuité démontrable, aucun N+1", () => {
    const closedFy = baseFy({ status: "closed", closures: [{ id: "c1" } as never] });
    const goodWs = { ...monoWs(rent("prop-1", 11000, { closingReceivables: 1000 })), fiscalYear: closedFy };
    const state = { ...(goodWs as unknown as LmnpState), fileRegistry: new Map() } as LmnpState;
    const nextFy = { ...baseFy({ id: "fy-next", year: N + 1, status: "draft" }), previousFiscalYearId: "fy-1" } as FiscalYear;
    const out = lmnpReducer(state, { type: "CREATE_NEXT_FISCAL_YEAR", nextFiscalYear: nextFy, properties: goodWs.properties });
    assert.equal(out.fiscalYear.year, N + 1);
    assert.deepEqual(out.declarationDraft?.rentReconciliationV2, next1(goodWs.declarationDraft!.rentReconciliationV2!));
    const badWs = { ...monoWs(rent("prop-1", 12000, {}, N, false)), fiscalYear: closedFy };
    const badState = { ...(badWs as unknown as LmnpState), fileRegistry: new Map() } as LmnpState;
    const refused = lmnpReducer(badState, { type: "CREATE_NEXT_FISCAL_YEAR", nextFiscalYear: nextFy, properties: badWs.properties });
    assert.equal(refused, badState, "aucun N+1 sans continuité");
  });
});

describe("Effets en aval et non-régression : CONT-20 → CONT-24", () => {
  it("CONT-20 le bilan N+1 ne présente jamais CO/AO comme inventaire de clôture N+1", () => {
    const src = rent("prop-1", 11000, { closingReceivables: 1000, closingAdvances: 400 });
    const nx = next1(src);
    const view = readRentalInventory(nx);
    assert.equal(view.facts.openingReceivables.side, "opening");
    assert.equal(view.facts.openingReceivables.amountCents, 100000);
    assert.equal(view.facts.closingReceivables.status, "UNKNOWN");
    const p = projectRentalInventoryToBilan({ fiscalYear: N + 1, propertyIds: ["prop-1"], states: [nx] });
    assert.deepEqual(p.postes, []);
    assert.deepEqual(p.providedNatures, []);
    assert.equal(p.unknown.length, 2, "les soldes de clôture N+1 restent inconnus");
    const pn = projectRentalInventoryToBilan({ fiscalYear: N, propertyIds: ["prop-1"], states: [src] });
    assert.deepEqual(pn.postes.map((x) => x.montant).sort((a, b) => a - b), [400, 1000], "le bilan N lit toujours les soldes de clôture N");
  });
  it("CONT-21 clôture V1 inchangée ; CONT-22 dossier sans F013 v2 inchangé", () => {
    const ws = monoWs();
    assert.equal(evaluateF013V2Continuity(ws).status, "NOT_APPLICABLE");
    const p = prepare(ws);
    assert.equal(p.ok, true);
    if (!p.ok) return;
    assert.equal(p.nextWorkspace.declarationDraft?.rentReconciliationV2, undefined);
    assert.equal(p.nextSchemaVersion, 1);
    assert.equal(p.closedNSchemaVersion, 1);
    const plain = planNextDeclarationDraft(ws.declarationDraft, { sourceFiscalYear: { year: N, propertyIds: ["prop-1"] } });
    assert.deepEqual(plain.ok && plain.draft, planNextDeclarationDraft(ws.declarationDraft).ok && (planNextDeclarationDraft(ws.declarationDraft) as { draft: DeclarationDraft }).draft);
  });
  it("CONT-24 aucune dépendance F006 / 39 C vers F013 v2 (ONE F006 inchangé)", () => {
    const dirs = ["src/runtime/capabilities/f006"];
    const files: string[] = ["src/lib/lmnp/dossier/fiscal-consolidation.ts", "src/lib/lmnp/services/declaration/run-declaration-generation.ts"];
    for (const dir of dirs) for (const f of readdirSync(dir)) if (f.endsWith(".ts") && !f.includes(".test.")) files.push(`${dir}/${f}`);
    for (const file of files) assert.doesNotMatch(readFileSync(file, "utf8"), /f013-v2|rentReconciliationV2|rental-inventory|f013-v2-continuity/, `${file} ne consomme pas F013 v2`);
  });
});
