/**
 * F013 v2.3 — import/OCR : paiement ≠ période économique ; IMPORT-01 → IMPORT-15.
 * Run: npx tsx --test src/lib/lmnp/services/f013/v2/f013-v2-import.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { representativeMonoWorkspaces } from "@/lab/v2-dossier/bien-read-test-support";
import { resolveDocumentScope } from "@/lib/lmnp/dossier/property-scope";
import { processRawFinancialLines } from "@/lib/lmnp/services/revenue-transaction-pipeline";
import { buildRevenusAssistantFromSession } from "@/lib/lmnp/services/revenus-upload-to-assistant-bridge";
import { lmnpReducer } from "@/lib/lmnp/store/reducer";
import { parseWorkspaceSnapshot, serializeWorkspaceSnapshot } from "@/lib/lmnp/store/workspace-snapshot";
import type { RevenueGptSession, RevenuePropertySession, RevenueRawLine, RevenueTransaction } from "@/lib/lmnp/types";

import {
  acceptProposedFact,
  applyDocumentaryProposals,
  chooseSourceForProperty,
  observationsForProperty,
  proposeDocumentCoverage,
  proposeFactsFromObservations,
  selectPropertySessions,
} from "./f013-v2-documentary-bridge";
import {
  applyObservationCorrection,
  observationFromRevenueTransaction,
  parseRentalPeriodFromLabel,
  parseRentObservation,
  type ObservationPropertyAttribution,
  type RentObservation,
} from "./f013-v2-observation";
import { answerBalance, answerCollections, answerCoverage, answerExceptions } from "./f013-v2-manual-flow";
import { createRentReconciliationState, evaluateRentReconciliation, parseRentReconciliationState, type RentReconciliationV2State } from "./f013-v2-state";

const Y = 2025;
const NOW = "2026-03-01T10:00:00.000Z";
const eur = (n: number) => Math.round(n * 100);
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  assert.equal(r.ok, true);
  return r as Extract<T, { ok: true }>;
};
const asProperty = (propertyId: string): ObservationPropertyAttribution => ({ kind: "property", propertyId });

function line(label: string, amount: number, date: string | null, doc = "doc1", direction: "credit" | "debit" = "credit"): RevenueRawLine {
  return { label, amount, date, direction, sourceDocumentId: doc, sourceType: "bank_statement", confidence: 90 };
}
/** Passe par le VRAI pipeline v1 (normalisation, catégorie, dates) avant la couche observation. */
function transactions(lines: RevenueRawLine[], year = Y): RevenueTransaction[] {
  return processRawFinancialLines(lines, year);
}
function observe(lines: RevenueRawLine[], attribution: ObservationPropertyAttribution = asProperty("A"), year = Y): RentObservation[] {
  const counts = new Map<string, number>();
  return transactions(lines, year).map((tx) => {
    const key = `${tx.sourceDocumentId}|${tx.label}|${tx.amount}|${tx.date}`;
    const ordinal = counts.get(key) ?? 0;
    counts.set(key, ordinal + 1);
    return ok(observationFromRevenueTransaction(tx, { fiscalYear: year, attribution, ordinal })).observation;
  });
}
const proposals = (observations: RentObservation[], propertyId = "A", year = Y, spans?: Parameters<typeof proposeFactsFromObservations>[0]["documentSpans"]) =>
  proposeFactsFromObservations({ scope: { propertyId, fiscalYear: year }, observations, documentSpans: spans });
const total = (s: RentReconciliationV2State, propertyId = "A", year = Y) => {
  const r = evaluateRentReconciliation(s, { propertyId, fiscalYear: year }).result;
  return r.status === "SUPPORTED" ? r.loyersAcquisCents : null;
};

/** Validation utilisateur complète : encaissements, couverture, soldes (avec montants), exceptions. */
function userValidate(scope: { propertyId: string; fiscalYear: number }, e: number, o: Partial<Record<"openingReceivables" | "closingReceivables" | "openingAdvances" | "closingAdvances", number>> = {}) {
  let s = createRentReconciliationState(scope);
  s = ok(answerCollections(s, eur(e))).state;
  s = answerCoverage(s, "all");
  for (const k of ["openingReceivables", "closingReceivables", "openingAdvances", "closingAdvances"] as const) {
    const a = o[k];
    s = ok(answerBalance(s, k, a ? { answer: "some", amountCents: eur(a) } : { answer: "none" })).state;
  }
  return ok(answerExceptions(s, { answer: "none" })).state;
}

describe("Période depuis un libellé (proposition déterministe)", () => {
  it("mois nommés, abréviations, listes, plages ; jamais d'année devinée", () => {
    assert.deepEqual(parseRentalPeriodFromLabel("Loyer décembre 2025")?.months, ["2025-12"]);
    assert.deepEqual(parseRentalPeriodFromLabel("LOYER DEC 25")?.months, ["2025-12"]);
    assert.deepEqual(parseRentalPeriodFromLabel("Loyer avr. 2025")?.months, ["2025-04"]);
    assert.deepEqual(parseRentalPeriodFromLabel("Loyers novembre + décembre 2025 + janvier 2026")?.months, ["2025-11", "2025-12", "2026-01"]);
    assert.deepEqual(parseRentalPeriodFromLabel("de septembre à novembre 2025")?.months, ["2025-09", "2025-10", "2025-11"]);
    assert.equal(parseRentalPeriodFromLabel("Loyer décembre"), null, "sans année : aucune année devinée");
    assert.equal(parseRentalPeriodFromLabel("VIREMENT DUPONT 05/01/2026"), null, "une date de paiement n'est pas une période");
    assert.equal(parseRentalPeriodFromLabel("maison marseille"), null);
  });
});

describe("IMPORT-01 → 06 : paiement ≠ période", () => {
  it("IMPORT-01 décembre 2025 payé le 05/01/2026 : les deux dimensions conservées", () => {
    const [o] = observe([line("Loyer décembre 2025", 1000, "05/01/2026")]);
    assert.equal(o!.paymentDate.status === "EXPLICIT" && o!.paymentDate.value, "2026-01-05");
    assert.deepEqual(o!.rentalPeriod.status !== "UNKNOWN" && o!.rentalPeriod.value.months, ["2025-12"]);
    assert.equal(o!.rentalPeriod.status, "PROPOSED", "une proposition, jamais un fait validé");
    assert.equal(o!.amountCents, 100000);
    assert.equal(o!.propertyId.status !== "UNKNOWN" && o!.propertyId.value, "A");
    // 2025 : aucun encaissement, créance de clôture proposée (lower bound), pas de produit 2026 fabriqué.
    const p25 = proposals([o!]);
    assert.equal(p25.collections, undefined);
    assert.equal(p25.closingReceivables?.amountCents, 100000);
    let s = applyDocumentaryProposals(createRentReconciliationState({ propertyId: "A", fiscalYear: Y }), p25, [o!]).state;
    assert.equal(s.facts.closingReceivables.status, "PROPOSED");
    assert.equal(evaluateRentReconciliation(s, { propertyId: "A", fiscalYear: Y }).result.status, "NEEDS_CONFIRMATION");
    s = ok(answerCollections(s, 0)).state;
    s = answerCoverage(s, "all");
    for (const k of ["openingReceivables", "openingAdvances", "closingAdvances"] as const) s = ok(answerBalance(s, k, { answer: "none" })).state;
    s = ok(answerExceptions(s, { answer: "none" })).state;
    s = acceptProposedFact(s, "closingReceivables");
    assert.equal(total(s), eur(1000), "loyers acquis 2025 = 1 000 € (rapprochement complet validé)");
    // 2026 : paiement = encaissement 2026 + règlement d'une créance d'ouverture ; aucun produit économique 2026.
    const p26 = proposals([o!], "A", 2026);
    assert.equal(p26.collections?.amountCents, 100000);
    assert.equal(p26.openingReceivables?.amountCents, 100000);
    const s26 = userValidate({ propertyId: "A", fiscalYear: 2026 }, 1000, { openingReceivables: 1000 });
    assert.equal(total(s26, "A", 2026), 0, "le règlement de la créance 2025 ne crée pas de produit 2026");
  });
  it("IMPORT-02 janvier 2026 payé le 20/12/2025 : encaissé 2025, rattaché 2026 (avance)", () => {
    const [o] = observe([line("Loyer janvier 2026", 1000, "20/12/2025")]);
    assert.equal(o!.paymentDate.status === "EXPLICIT" && o!.paymentDate.value, "2025-12-20");
    assert.deepEqual(o!.rentalPeriod.status !== "UNKNOWN" && o!.rentalPeriod.value.months, ["2026-01"]);
    const p = proposals([o!]);
    assert.equal(p.collections?.amountCents, 100000);
    assert.equal(p.closingAdvances?.amountCents, 100000);
    assert.equal(total(userValidate({ propertyId: "A", fiscalYear: Y }, 1000, { closingAdvances: 1000 })), 0, "pas un produit 2025");
  });
  it("IMPORT-03 novembre 2025 payé le 05/11/2025 : deux dimensions, aucune divergence cross-year", () => {
    const [o] = observe([line("Loyer novembre 2025", 1000, "05/11/2025")]);
    assert.equal(o!.paymentDate.status === "EXPLICIT" && o!.paymentDate.value, "2025-11-05");
    assert.deepEqual(o!.rentalPeriod.status !== "UNKNOWN" && o!.rentalPeriod.value.months, ["2025-11"]);
    const p = proposals([o!]);
    assert.equal(p.collections?.amountCents, 100000);
    for (const k of ["openingReceivables", "closingReceivables", "openingAdvances", "closingAdvances"] as const) assert.equal(p[k], undefined);
  });
  it("IMPORT-04 période inconnue : paiement connu, période UNKNOWN (jamais le mois du paiement), rien de validé", () => {
    const [o] = observe([line("VIREMENT DUPONT", 1000, "05/11/2025")]);
    assert.equal(o!.paymentDate.status, "EXPLICIT");
    assert.equal(o!.rentalPeriod.status, "UNKNOWN");
    assert.equal(o!.nature.status, "UNKNOWN");
    assert.equal(proposals([o!]).collections, undefined, "nature inconnue : aucun encaissement proposé");
    const rent = ok(applyObservationCorrection(o!, { field: "nature", value: "rent" }, NOW)).observation;
    assert.equal(rent.rentalPeriod.status, "UNKNOWN", "qualifier la nature ne fabrique pas de période");
    assert.equal(proposals([rent]).collections?.amountCents, 100000);
    const [lbl] = observe([line("LOYER", 500, "02/02/2025")]);
    assert.equal(lbl!.rentalPeriod.status, "UNKNOWN");
  });
  it("IMPORT-05 paiement groupé : un seul paiement, période composite, aucune ventilation devinée", () => {
    const obs = observe([line("Loyers novembre + décembre 2025 + janvier 2026", 3000, "15/12/2025")]);
    assert.equal(obs.length, 1, "pas trois paiements bancaires");
    const [o] = obs;
    assert.deepEqual(o!.rentalPeriod.status !== "UNKNOWN" && o!.rentalPeriod.value.months, ["2025-11", "2025-12", "2026-01"]);
    assert.equal(o!.allocations, undefined);
    const p = proposals([o!]);
    assert.equal(p.collections?.amountCents, 300000);
    assert.equal(p.closingAdvances, undefined);
    assert.ok(p.withheld.some((w) => w.fact === "closingAdvances" && w.reason === "allocation_unknown"));
    // Ventilation EXPLICITE (fille du paiement d'origine) : somme obligatoirement égale à 3 000 €.
    const bad = applyObservationCorrection(o!, { field: "allocations", value: [{ month: "2025-11", amountCents: 100000 }, { month: "2025-12", amountCents: 100000 }] }, NOW);
    assert.deepEqual(bad, { ok: false, reason: "allocations_sum_mismatch" });
    const good = ok(applyObservationCorrection(o!, { field: "allocations", value: [
      { month: "2025-11", amountCents: 100000 }, { month: "2025-12", amountCents: 100000 }, { month: "2026-01", amountCents: 100000 }] }, NOW)).observation;
    assert.equal(proposals([good]).closingAdvances?.amountCents, 100000);
    assert.equal(proposals([good]).collections?.amountCents, 300000);
  });
  it("IMPORT-06 dépôt de garantie : jamais un loyer", () => {
    const [o] = observe([line("Dépôt de garantie appartement", 800, "10/03/2025")]);
    assert.equal(o!.nature.status !== "UNKNOWN" && o!.nature.value, "deposit");
    const p = proposals([o!]);
    assert.equal(p.collections, undefined);
    assert.deepEqual(p.excluded, [{ observationId: o!.observationId, reason: "security_deposit" }]);
  });
});

describe("IMPORT-07 → 10 : plateforme, correction, couverture, double comptage", () => {
  it("IMPORT-07 payout plateforme net : insuffisant, aucun produit brut reconstruit", () => {
    const [o] = observe([line("AIRBNB PAYOUT", 540, "02/06/2025")]);
    assert.ok(o!.flags.includes("insufficient_for_rent_reconciliation"));
    const p = proposals([o!]);
    assert.equal(p.collections, undefined);
    assert.ok(p.withheld.some((w) => w.reason === "platform_payout_insufficient"));
  });
  it("IMPORT-08 correction utilisateur : valeur extraite originale, proposée et retenue conservées", () => {
    const [o] = observe([line("Loyer décembre 2025", 1000, "05/01/2026")]);
    const fixed = ok(applyObservationCorrection(o!, { field: "rentalPeriod", value: { months: ["2025-11"] } }, NOW)).observation;
    assert.deepEqual(fixed.extracted, o!.extracted, "l'extrait original n'est jamais réécrit");
    assert.equal(fixed.rentalPeriod.status, "VALIDATED");
    const c = fixed.corrections[0]!;
    assert.deepEqual(c.original, o!.extracted.rentalPeriod);
    assert.deepEqual(c.proposed, o!.rentalPeriod);
    assert.deepEqual(c.retained, { months: ["2025-11"] });
    assert.equal(c.by, "user");
    assert.equal(fixed.observationId, o!.observationId, "identité inchangée");
    assert.equal(fixed.evidence.documentId, o!.evidence.documentId);
    const date = ok(applyObservationCorrection(fixed, { field: "paymentDate", value: "2026-01-06" }, NOW)).observation;
    assert.deepEqual(date.extracted.paymentDate, o!.extracted.paymentDate);
    assert.equal(date.corrections.length, 2);
    assert.equal(applyObservationCorrection(o!, { field: "paymentDate", value: "pas une date" }, NOW).ok, false);
  });
  it("IMPORT-09 couverture : trois relevés sur douze → PARTIAL ; douze → COMPLETE seulement PROPOSED ; sans étendue → inconnue", () => {
    const span = (id: string, from: string, to: string) => ({ documentId: id, coveredFrom: from, coveredTo: to });
    assert.equal(proposeDocumentCoverage(Y, []), undefined, "aucune étendue connue : UNKNOWN");
    const partial = proposeDocumentCoverage(Y, [span("d1", "2025-01-01", "2025-01-31"), span("d2", "2025-02-01", "2025-02-28"), span("d3", "2025-03-01", "2025-03-31")]);
    assert.equal(partial?.completeness, "PARTIAL");
    const full = proposeDocumentCoverage(Y, [span("d", "2025-01-01", "2025-12-31")]);
    assert.equal(full?.completeness, "COMPLETE");
    const obs = observe([line("Loyer novembre 2025", 1000, "05/11/2025")]);
    const p = proposals(obs, "A", Y, [span("d1", "2025-01-01", "2025-03-31")]);
    const s = applyDocumentaryProposals(createRentReconciliationState({ propertyId: "A", fiscalYear: Y }), p, obs).state;
    assert.equal(s.facts.collectionsCoverage.completeness, "PARTIAL");
    const sFull = applyDocumentaryProposals(createRentReconciliationState({ propertyId: "A", fiscalYear: Y }), proposals(obs, "A", Y, [span("d", "2025-01-01", "2025-12-31")]), obs).state;
    assert.deepEqual(
      sFull.facts.collectionsCoverage.completeness === "UNKNOWN" ? null : [sFull.facts.collectionsCoverage.completeness, sFull.facts.collectionsCoverage.validation],
      ["COMPLETE", "PROPOSED"], "des documents ne valident jamais la couverture",
    );
    const full12 = acceptProposedFact(sFull, "collectionsCoverage");
    assert.equal(full12.facts.collectionsCoverage.completeness !== "UNKNOWN" && full12.facts.collectionsCoverage.validation, "VALIDATED");
  });
  it("IMPORT-10 même revenu manuel + documentaire : 12 000 €, jamais 24 000 €", () => {
    const manual = userValidate({ propertyId: "A", fiscalYear: Y }, 12000);
    const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
    const obs = observe(months.map((m) => line(`Loyer ${m}/2025 mensuel`, 1000, `05/${m}/2025`)));
    const p = proposals(obs);
    assert.equal(p.collections?.amountCents, 1200000);
    const { state, report } = applyDocumentaryProposals(manual, p, obs);
    assert.deepEqual(report.corroborated, ["collections"]);
    assert.equal(state.facts.collections.status === "VALIDATED" && state.facts.collections.amountCents, 1200000);
    assert.equal(state.facts.revision, manual.facts.revision, "corroboration : aucun fait modifié");
    assert.equal(total(state), eur(12000));
    // Écart : conservé tel quel, signalé — jamais additionné.
    const short = applyDocumentaryProposals(manual, proposals(obs.slice(0, 11)), obs.slice(0, 11));
    assert.equal(short.report.conflicts.length, 1);
    assert.equal(total(short.state), eur(12000));
    // Ré-import identique : même identité, comptée une fois ; deux documents → chevauchement non prouvable.
    const twice = proposals([...obs, ...obs]);
    assert.equal(twice.collections?.amountCents, 1200000);
    const otherDoc = observe(months.map((m) => line(`Loyer ${m}/2025 mensuel`, 1000, `05/${m}/2025`, "doc2")));
    const dup = proposals([...obs, ...otherDoc]);
    assert.equal(dup.collections, undefined);
    assert.ok(dup.withheld.some((w) => w.reason === "possible_duplicate_across_documents"));
  });
});

describe("IMPORT-11, 12 : multi-bien", () => {
  const ws = {
    properties: [{ id: "A", label: "A" }, { id: "B", label: "B" }],
    fiscalYear: { id: "fy", year: Y, propertyIds: ["A", "B"] },
    documents: [], declarationDraft: { completedSteps: [] },
  } as never;
  const attribution = (documentId: string | undefined, propertyId?: string | null): ObservationPropertyAttribution => {
    const scope = resolveDocumentScope(ws, { id: documentId, propertyId });
    return scope.kind === "property" ? { kind: "property", propertyId: scope.propertyId, via: scope.via } : scope.kind === "common" ? { kind: "common" } : { kind: "unresolved" };
  };
  it("IMPORT-11 attribution isolée : document commun ou non attribué jamais rattaché au bien actif", () => {
    const a = observe([line("Loyer novembre 2025", 1000, "05/11/2025", "dA")], attribution("dA", "A"));
    const b = observe([line("Loyer novembre 2025", 700, "05/11/2025", "dB")], attribution("dB", "B"));
    const common = observe([line("Loyer novembre 2025", 999, "05/11/2025", "dC")], attribution("dC", null));
    const unresolved = observe([line("Loyer novembre 2025", 998, "05/11/2025", "dU")], attribution("dU", undefined));
    const all = [...a, ...b, ...common, ...unresolved];
    assert.equal(proposals(all, "A").collections?.amountCents, 100000);
    assert.equal(proposals(all, "B").collections?.amountCents, 70000);
    const pa = proposals(all, "A");
    assert.equal(pa.excluded.filter((e) => e.reason === "property_unknown").length, 2);
    assert.equal(pa.excluded.filter((e) => e.reason === "other_property").length, 1);
    assert.equal(proposals([...common, ...unresolved], "A").collections, undefined, "fail closed sans attribution");
  });
  it("IMPORT-12 source par propertyId : A manuel, B documentaire, C vide ; jamais « toutes les grilles »", () => {
    const tx = (label: string, amount: number, documentId: string) => transactions([line(label, amount, "05/11/2025", documentId)])[0]!;
    const grid = (loyers: number) => [{ monthKey: "2025-11", month: "Novembre", loyers, autresRevenus: 0, charges: 0 }];
    const sessionOf = (id: string, propertyId: string | undefined, amount: number, edited = false): RevenuePropertySession => ({
      id, label: id, ...(propertyId ? { propertyId } : {}), rows: grid(amount), transactions: [tx("Loyer novembre 2025", amount, `doc-${id}`)], gridUserEdited: edited,
    });
    const session: RevenueGptSession = { properties: [sessionOf("sA", "A", 1000, true), sessionOf("sB", "B", 700), sessionOf("sX", undefined, 555)] };
    const stateA = userValidate({ propertyId: "A", fiscalYear: Y }, 1000);
    const forA = chooseSourceForProperty({ scope: { propertyId: "A", fiscalYear: Y }, state: stateA, session });
    assert.equal(forA.source, "manual_validated");
    assert.deepEqual(forA.sessions.map((s) => s.id), ["sA"]);
    const forB = chooseSourceForProperty({ scope: { propertyId: "B", fiscalYear: Y }, state: undefined, session });
    assert.equal(forB.source, "documentary");
    assert.deepEqual(forB.sessions.map((s) => s.id), ["sB"]);
    assert.equal(chooseSourceForProperty({ scope: { propertyId: "C", fiscalYear: Y }, state: undefined, session }).source, "none");
    assert.deepEqual(selectPropertySessions(session, { propertyId: "A", fiscalYear: Y }, { monoPropertyId: "A" }).map((s) => s.id), ["sA", "sX"], "mono : session sans bien attribuable");
    const obsB = observationsForProperty({ sessions: forB.sessions, scope: { propertyId: "B", fiscalYear: Y }, attributionOf: () => asProperty("B") });
    assert.equal(proposals(obsB, "B").collections?.amountCents, 70000);
  });
  it("AUDIT bridge v1 (volontairement non corrigé) : une grille corrigée somme les grilles de TOUS les biens de la session", () => {
    const row = (loyers: number) => [{ monthKey: "2025-11", month: "Novembre", loyers, autresRevenus: 0, charges: 0 }];
    const session: RevenueGptSession = { properties: [
      { id: "sA", label: "A", propertyId: "A", rows: row(1000), gridUserEdited: true },
      { id: "sB", label: "B", propertyId: "B", rows: row(700) },
    ] };
    const both = buildRevenusAssistantFromSession(session, Y).revenusAssistant;
    const onlyA = buildRevenusAssistantFromSession({ properties: [session.properties[0]!] }, Y).revenusAssistant;
    assert.equal(onlyA.totalRecettes, 1000);
    assert.equal(both.totalRecettes, 1700, "le bien A (corrigé) entraîne la grille du bien B : bug v1 confirmé, non corrigé (pipeline productif)");
    // Le pont V2 ne reproduit pas ce comportement : sélection par propertyId.
    assert.deepEqual(selectPropertySessions(session, { propertyId: "A", fiscalYear: Y }).map((p) => p.id), ["sA"]);
  });
});

describe("IMPORT-13, 14, 15 : persistance, proposition, autorité", () => {
  async function reloaded(state: RentReconciliationV2State): Promise<RentReconciliationV2State | null> {
    const mono = (await representativeMonoWorkspaces()).f013;
    const next = lmnpReducer(mono, { type: "DECLARATION_PATCH_DRAFT", patch: { rentReconciliationV2: state } });
    const env = ok(serializeWorkspaceSnapshot(next)).envelope;
    assert.equal(env.schemaVersion, 3, "V2.3 enrichit un état déjà v3 : pas de v4");
    const parsed = parseWorkspaceSnapshot(JSON.parse(JSON.stringify(env)));
    assert.equal(parsed.ok, true);
    return parseRentReconciliationState(parsed.ok ? parsed.envelope.workspace.declarationDraft.rentReconciliationV2 : undefined);
  }
  const scope = { propertyId: "A", fiscalYear: Y };
  it("IMPORT-13 save/reload : paymentDate, rentalPeriod, scope, identité et provenance préservés", async () => {
    const obs = observe([line("Loyer décembre 2025", 1000, "05/01/2026")]);
    const { state } = applyDocumentaryProposals(createRentReconciliationState(scope), proposals(obs), obs);
    const back = await reloaded(state);
    assert.deepEqual(back, state);
    const o = back!.observations![0]!;
    assert.equal(o.paymentDate.status === "EXPLICIT" && o.paymentDate.value, "2026-01-05");
    assert.deepEqual(o.rentalPeriod.status !== "UNKNOWN" && o.rentalPeriod.value.months, ["2025-12"]);
    assert.equal(o.observationId, obs[0]!.observationId);
    assert.equal(o.propertyId.status !== "UNKNOWN" && o.propertyId.value, "A");
    assert.equal(o.evidence.documentId, "doc1");
  });
  it("IMPORT-14 PROPOSED reste PROPOSED après reload ; un VALIDATED non justifié n'est jamais promu", async () => {
    const obs = observe([line("Loyer décembre 2025", 1000, "05/01/2026")]);
    const { state } = applyDocumentaryProposals(createRentReconciliationState(scope), proposals(obs), obs);
    const back = await reloaded(state);
    assert.equal(back!.facts.closingReceivables.status, "PROPOSED");
    assert.equal(back!.observations![0]!.rentalPeriod.status, "PROPOSED");
    const forged = JSON.parse(JSON.stringify(state)) as RentReconciliationV2State;
    forged.observations![0]!.rentalPeriod = { status: "VALIDATED", value: { months: ["2025-12"] } };
    assert.equal(parseRentObservation(forged.observations![0]), null);
    assert.equal((await reloaded(forged))!.observations!.length, 0, "observation falsifiée écartée, pas promue");
    const fixed = ok(applyObservationCorrection(obs[0]!, { field: "rentalPeriod", value: { months: ["2025-12"] } }, NOW)).observation;
    assert.notEqual(parseRentObservation(fixed), null);
  });
  it("les observations ne changent ni la révision ni la confirmation des faits", () => {
    const manual = userValidate(scope, 1000);
    const obs = observe([line("Loyer novembre 2025", 1000, "05/11/2025")]);
    const { state } = applyDocumentaryProposals(manual, proposals(obs), obs);
    assert.equal(state.facts.revision, manual.facts.revision);
    assert.equal(state.observations?.length, 1);
  });
  it("IMPORT-15 le moteur reste seule autorité : propositions sans total, faits PROPOSED bloquants, total via moteur seulement", () => {
    const obs = observe([line("Loyer novembre 2025", 1000, "05/11/2025"), line("Loyer décembre 2025", 1000, "05/01/2026")]);
    const p = proposals(obs);
    assert.equal(Object.keys(p).some((k) => /loyersAcquis|totalRecettes|total/i.test(k)), false);
    const { state } = applyDocumentaryProposals(createRentReconciliationState(scope), p, obs);
    assert.equal(state.facts.collections.status, "PROPOSED");
    const ev = evaluateRentReconciliation(state, scope).result;
    assert.equal(ev.status, "NEEDS_CONFIRMATION");
    assert.equal("loyersAcquisCents" in ev, false);
    let s = acceptProposedFact(acceptProposedFact(state, "collections"), "closingReceivables");
    s = acceptProposedFact(s, "collectionsCoverage");
    assert.equal(total(s), null, "inventaire et exceptions encore non établis");
    for (const k of ["openingReceivables", "openingAdvances", "closingAdvances"] as const) s = ok(answerBalance(s, k, { answer: "none" })).state;
    s = answerCoverage(s, "all");
    s = ok(answerExceptions(s, { answer: "none" })).state;
    assert.equal(total(s), eur(2000));
    for (const file of ["f013-v2-observation.ts", "f013-v2-documentary-bridge.ts"]) {
      const code = readFileSync(`src/lib/lmnp/services/f013/v2/${file}`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
      assert.doesNotMatch(code, /reconcileRentV2|evaluateRentReconciliation|loyersAcquis/, `${file} n'appelle ni ne reproduit le moteur (hors commentaires)`);
    }
  });
  it("garde de clôture V2.2.1 toujours actif avec des observations", async () => {
    const { isF013V2ContinuityBlocked } = await import("./f013-v2-transition-guard");
    const obs = observe([line("Loyer novembre 2025", 1000, "05/11/2025")]);
    const { state } = applyDocumentaryProposals(createRentReconciliationState(scope), proposals(obs), obs);
    assert.equal(isF013V2ContinuityBlocked({ declarationDraft: { completedSteps: [], rentReconciliationV2: state } }), true);
  });
});
