/**
 * F013 v2.2 — parcours manuel : MANUAL-01 → MANUAL-12, persistance/reload, multi, schéma de snapshot.
 * Run: npx tsx --test src/lib/lmnp/services/f013/v2/f013-v2-manual.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { representativeMonoWorkspaces } from "@/lab/v2-dossier/bien-read-test-support";
import { scopedInvariantViolation } from "@/lib/lmnp/dossier/bien-draft";
import { lmnpReducer, type LmnpState } from "@/lib/lmnp/store/reducer";
import {
  parseWorkspaceSnapshot,
  serializeWorkspaceSnapshot,
  workspaceSnapshotSchemaVersion,
} from "@/lib/lmnp/store/workspace-snapshot";
import { snapshotWriteRejection } from "@/lib/lmnp/store/workspace-snapshot-client";
import type { Property } from "@/lib/lmnp/types";

import { classifyF013Contract } from "./f013-v2-contract";
import {
  answerBalance,
  answerCollections,
  answerCoverage,
  answerExceptions,
  buildManualSummary,
  clearBalance,
  nextManualStep,
  parseEurosToCents,
  type BalanceKey,
} from "./f013-v2-manual-flow";
import {
  confirmRentReconciliation,
  createRentReconciliationState,
  evaluateRentReconciliation,
  parseRentReconciliationState,
  type RentReconciliationV2State,
} from "./f013-v2-state";

const eur = (n: number) => Math.round(n * 100);
const NOW = "2026-03-01T10:00:00.000Z";
const YEAR = 2025;
const scopeOf = (propertyId: string) => ({ propertyId, fiscalYear: YEAR });
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  assert.equal(r.ok, true);
  return r as Extract<T, { ok: true }>;
};
const BALANCES: BalanceKey[] = ["openingReceivables", "closingReceivables", "openingAdvances", "closingAdvances"];

/** Parcours complet : encaissements, couverture, quatre soldes (par défaut « non » explicite), exceptions « aucune ». */
function fill(
  propertyId: string,
  e: number,
  o: Partial<Record<BalanceKey, number>> = {},
): RentReconciliationV2State {
  let s = createRentReconciliationState(scopeOf(propertyId));
  s = ok(answerCollections(s, eur(e))).state;
  s = answerCoverage(s, "all");
  for (const key of BALANCES) {
    const amount = o[key];
    s = ok(answerBalance(s, key, amount ? { answer: "some", amountCents: eur(amount) } : { answer: "none" })).state;
  }
  return ok(answerExceptions(s, { answer: "none" })).state;
}
const total = (s: RentReconciliationV2State) => {
  const r = evaluateRentReconciliation(s, scopeOf(s.facts.propertyId)).result;
  return r.status === "SUPPORTED" ? r.loyersAcquisCents : null;
};

describe("F013 v2.2 — MANUAL-01 → 04 : cas nominaux", () => {
  it("MANUAL-01 cas simple : bloqué avant couverture/soldes, SUPPORTED après zéros explicites", () => {
    let s = createRentReconciliationState(scopeOf("A"));
    s = ok(answerCollections(s, eur(12000))).state;
    const before = evaluateRentReconciliation(s, scopeOf("A")).result;
    assert.equal(before.status, "NEEDS_CONFIRMATION");
    assert.equal("loyersAcquisCents" in before, false);
    assert.equal(nextManualStep(s), "coverage");
    const full = fill("A", 12000);
    assert.equal(total(full), eur(12000));
    assert.equal(nextManualStep(full), "summary");
    assert.equal(ok(confirmRentReconciliation(full, scopeOf("A"), NOW)).state.confirmation?.confirmedLoyersAcquisCents, eur(12000));
  });
  it("MANUAL-02 créance de clôture", () => assert.equal(total(fill("A", 11000, { closingReceivables: 1000 })), eur(12000)));
  it("MANUAL-03 créance d'ouverture", () => assert.equal(total(fill("A", 13000, { openingReceivables: 1000 })), eur(12000)));
  it("MANUAL-04 avance de clôture", () => assert.equal(total(fill("A", 13000, { closingAdvances: 1000 })), eur(12000)));
  it("récapitulatif : total du moteur uniquement, absent si bloqué", () => {
    const supported = buildManualSummary(fill("A", 11000, { closingReceivables: 1000 }), scopeOf("A"));
    assert.equal(supported.totalCents, eur(12000));
    assert.equal(supported.lines.at(-1)?.amountCents, eur(12000));
    const blocked = buildManualSummary(createRentReconciliationState(scopeOf("A")), scopeOf("A"));
    assert.equal(blocked.totalCents, null);
    assert.equal(blocked.lines.at(-1)?.amountCents, null);
  });
});

describe("F013 v2.2 — MANUAL-05, 09, 10, 11, 12", () => {
  it("MANUAL-05 modification après confirmation : même total, confirmation invalidée", () => {
    const confirmed = ok(confirmRentReconciliation(fill("A", 12000), scopeOf("A"), NOW)).state;
    assert.equal(evaluateRentReconciliation(confirmed, scopeOf("A")).confirmationFresh, true);
    let edited = ok(answerCollections(confirmed, eur(11000))).state;
    edited = ok(answerBalance(edited, "closingReceivables", { answer: "some", amountCents: eur(1000) })).state;
    assert.equal(total(edited), eur(12000));
    const ev = evaluateRentReconciliation(edited, scopeOf("A"));
    assert.equal(edited.confirmation, undefined);
    assert.equal(ev.confirmationFresh, false);
    assert.ok(edited.facts.revision > confirmed.facts.revision);
  });
  it("confirmation persistée mais altérée (révision/empreinte/total) : périmée", () => {
    const confirmed = ok(confirmRentReconciliation(fill("A", 12000), scopeOf("A"), NOW)).state;
    const tampered: RentReconciliationV2State = {
      ...confirmed,
      facts: { ...confirmed.facts, collections: { status: "VALIDATED", amountCents: eur(9999) } },
    };
    const ev = evaluateRentReconciliation(tampered, scopeOf("A"));
    assert.equal(ev.confirmationFresh, false);
    assert.equal(ev.confirmationStale, true);
  });
  it("confirmation refusée tant que le moteur ne conclut pas", () => {
    const r = confirmRentReconciliation(createRentReconciliationState(scopeOf("A")), scopeOf("A"), NOW);
    assert.equal(r.ok, false);
  });
  it("MANUAL-09 sans réponse : UNKNOWN, jamais zéro", () => {
    let s = createRentReconciliationState(scopeOf("A"));
    s = ok(answerCollections(s, eur(12000))).state;
    s = answerCoverage(s, "all");
    assert.equal(s.facts.closingReceivables.status, "UNKNOWN");
    assert.equal("amountCents" in s.facts.closingReceivables, false);
    assert.equal(total(s), null);
    const cleared = clearBalance(ok(answerBalance(s, "closingReceivables", { answer: "none" })).state, "closingReceivables");
    assert.equal(cleared.facts.closingReceivables.status, "UNKNOWN");
  });
  it("MANUAL-10 « non » explicite : VALIDATED(0)", () => {
    const s = ok(answerBalance(createRentReconciliationState(scopeOf("A")), "closingReceivables", { answer: "none" })).state;
    assert.deepEqual(
      { status: s.facts.closingReceivables.status, amount: (s.facts.closingReceivables as { amountCents: number }).amountCents },
      { status: "VALIDATED", amount: 0 },
    );
  });
  it("« oui » sans montant valide refusé (jamais zéro implicite)", () => {
    const s = createRentReconciliationState(scopeOf("A"));
    for (const bad of [0, -5, 1.5, Number.NaN]) {
      assert.equal(answerBalance(s, "openingAdvances", { answer: "some", amountCents: bad }).ok, false);
    }
  });
  it("MANUAL-11 exception hors domaine : bloqué, aucun calcul", () => {
    for (const t of ["gli", "dispute", "complex_cancellation", "doubtful_receivable_provision", "security_deposit", "insurance_indemnity", "refund"] as const) {
      const s = ok(answerExceptions(fill("A", 12000), { answer: "some", treatments: [t] })).state;
      const r = evaluateRentReconciliation(s, scopeOf("A")).result;
      assert.equal(r.status, "OUT_OF_DOMAIN", t);
      assert.equal("loyersAcquisCents" in r, false);
      assert.equal(confirmRentReconciliation(s, scopeOf("A"), NOW).ok, false);
    }
    assert.equal(answerExceptions(createRentReconciliationState(scopeOf("A")), { answer: "some", treatments: [] }).ok, false);
  });
  it("exceptions non passées en revue : pas de confirmation (F013-11 résolu seulement par réponses explicites)", () => {
    let s = createRentReconciliationState(scopeOf("A"));
    s = ok(answerCollections(s, eur(12000))).state;
    s = answerCoverage(s, "all");
    for (const k of BALANCES) s = ok(answerBalance(s, k, { answer: "none" })).state;
    assert.equal(nextManualStep(s), "exceptions");
    assert.equal(evaluateRentReconciliation(s, scopeOf("A")).result.status, "NEEDS_CONFIRMATION");
    assert.equal(total(ok(answerExceptions(s, { answer: "none" })).state), eur(12000));
  });
  it("couverture partielle : bloquée", () => {
    const s = answerCoverage(fill("A", 12000), "not_all");
    assert.equal(total(s), null);
    assert.equal(nextManualStep(s), "coverage");
  });
  it("MANUAL-12 même total, faits différents : révisions, empreintes et confirmations distinctes", () => {
    const a = ok(confirmRentReconciliation(fill("A", 12000), scopeOf("A"), NOW)).state;
    const b = ok(confirmRentReconciliation(fill("A", 11000, { closingReceivables: 1000 }), scopeOf("A"), NOW)).state;
    assert.equal(total(a), total(b));
    assert.notEqual(a.confirmation?.factsDigest, b.confirmation?.factsDigest);
    const crossed: RentReconciliationV2State = { ...b, confirmation: a.confirmation };
    assert.equal(evaluateRentReconciliation(crossed, scopeOf("A")).confirmationFresh, false);
  });
  it("une réponse identique ne change ni la révision ni la confirmation", () => {
    const confirmed = ok(confirmRentReconciliation(fill("A", 12000), scopeOf("A"), NOW)).state;
    assert.equal(ok(answerCollections(confirmed, eur(12000))).state, confirmed);
  });
  it("saisie en euros : centimes exacts, vide jamais zéro", () => {
    assert.equal(parseEurosToCents("12 000,50"), 1200050);
    assert.equal(parseEurosToCents("0,1"), 10);
    assert.equal(parseEurosToCents("1234.56"), 123456);
    for (const bad of ["", "  ", "-5", "12,345", "abc", "1e3"]) assert.equal(parseEurosToCents(bad), null, JSON.stringify(bad));
  });
});

describe("F013 v2.2 — MANUAL-06 reload / persistance (mono)", () => {
  it("faits, états, couverture, scope, révision, confirmation et résultat identiques après snapshot", async () => {
    const mono = (await representativeMonoWorkspaces()).f013;
    const propertyId = mono.properties[0]!.id;
    const year = mono.fiscalYear.year;
    let s = createRentReconciliationState({ propertyId, fiscalYear: year });
    s = ok(answerCollections(s, eur(11000))).state;
    s = answerCoverage(s, "all");
    s = ok(answerBalance(s, "closingReceivables", { answer: "some", amountCents: eur(1000) })).state;
    for (const k of ["openingReceivables", "openingAdvances", "closingAdvances"] as BalanceKey[]) s = ok(answerBalance(s, k, { answer: "none" })).state;
    s = ok(answerExceptions(s, { answer: "none" })).state;
    s = ok(confirmRentReconciliation(s, { propertyId, fiscalYear: year }, NOW)).state;

    const next = lmnpReducer(mono, { type: "DECLARATION_PATCH_DRAFT", patch: { rentReconciliationV2: s } });
    const serialized = ok(serializeWorkspaceSnapshot(next));
    assert.equal(serialized.envelope.schemaVersion, 3);
    const reloaded = parseWorkspaceSnapshot(JSON.parse(JSON.stringify(serialized.envelope)));
    assert.equal(reloaded.ok, true);
    const restored = parseRentReconciliationState(reloaded.ok ? reloaded.envelope.workspace.declarationDraft.rentReconciliationV2 : undefined);
    assert.deepEqual(restored, s);
    const scope = { propertyId, fiscalYear: year };
    const before = evaluateRentReconciliation(s, scope);
    const after = evaluateRentReconciliation(restored!, scope);
    assert.equal(JSON.stringify(after), JSON.stringify(before));
    assert.equal(after.confirmationFresh, true);
    assert.equal(restored!.facts.revision, s.facts.revision);
    assert.equal(restored!.facts.collections.status, "VALIDATED");
  });
});

describe("F013 v2.2 — MANUAL-07 multi isolation", () => {
  async function scopedAB(): Promise<LmnpState> {
    const mono = (await representativeMonoWorkspaces()).f013;
    const B: Property = { id: "bien-b", label: "Studio", address: "3 rue Y", city: "Nantes", postalCode: "44000" };
    const scoped = lmnpReducer(mono, { type: "ADD_PROPERTY", property: B });
    assert.ok(scoped.declarationDraft?.biens);
    return scoped;
  }
  it("A↔B : aucun mélange, modifier A n'altère pas B, invalide les sorties consolidées", async () => {
    let state = await scopedAB();
    const [A, B] = state.fiscalYear.propertyIds as [string, string];
    const year = state.fiscalYear.year;
    const sA = ok(confirmRentReconciliation(fill(A, 12000), { propertyId: A, fiscalYear: year }, NOW)).state;
    const sB = ok(confirmRentReconciliation(fill(B, 7000, { closingReceivables: 1000 }), { propertyId: B, fiscalYear: year }, NOW)).state;
    const write = (propertyId: string, rentReconciliationV2: RentReconciliationV2State) => {
      state = lmnpReducer(state, { type: "DECLARATION_PATCH_DRAFT", propertyId, patch: { rentReconciliationV2 } });
    };
    // Les états sont construits pour l'exercice courant du workspace.
    const rebuild = (s: RentReconciliationV2State, id: string): RentReconciliationV2State => ({ ...s, facts: { ...s.facts, propertyId: id, fiscalYear: year } });
    for (const [id, s] of [[A, sA], [B, sB], [A, sA], [B, sB]] as const) write(id, rebuild(s, id));
    const readBien = (id: string) => state.declarationDraft!.biens![id]!.rentReconciliationV2!;
    assert.equal(readBien(A).facts.propertyId, A);
    assert.equal(readBien(B).facts.propertyId, B);
    const totals = (id: string) => {
      const r = evaluateRentReconciliation(readBien(id), { propertyId: id, fiscalYear: year });
      return { total: r.result.status === "SUPPORTED" ? r.result.loyersAcquisCents : null, fresh: r.confirmationFresh };
    };
    assert.deepEqual(totals(A), { total: eur(12000), fresh: true });
    assert.deepEqual(totals(B), { total: eur(8000), fresh: true });
    assert.equal(state.declarationDraft!.rentReconciliationV2, undefined, "jamais à plat en mode scopé");
    assert.equal(scopedInvariantViolation(state), null);
    assert.equal(workspaceSnapshotSchemaVersion(state), 3);

    // Modification de A : A invalidé, B strictement intact, sorties globales périmées.
    state = { ...state, declarationDraft: { ...state.declarationDraft!, fiscalResult: {} as never } };
    const bBefore = JSON.stringify(readBien(B));
    const editedA = ok(answerCollections(readBien(A), eur(11000))).state;
    write(A, ok(answerBalance(editedA, "closingReceivables", { answer: "some", amountCents: eur(1000) })).state);
    assert.deepEqual(totals(A), { total: eur(12000), fresh: false });
    assert.equal(JSON.stringify(readBien(B)), bBefore);
    assert.deepEqual(totals(B), { total: eur(8000), fresh: true });
    assert.equal(state.declarationDraft!.fiscalResult, undefined, "sortie consolidée invalidée");
  });
  it("écriture refusée sans propertyId explicite en mode scopé", async () => {
    const state = await scopedAB();
    const [A] = state.fiscalYear.propertyIds as [string, string];
    const next = lmnpReducer(state, { type: "DECLARATION_PATCH_DRAFT", patch: { rentReconciliationV2: fill(A, 1000) } });
    assert.equal(next, state);
  });
  it("faits du bien A refusés par le moteur pour B", () => {
    assert.equal(evaluateRentReconciliation(fill("A", 12000), scopeOf("B")).result.status, "NEEDS_CONFIRMATION");
  });
});

describe("F013 v2.2 — MANUAL-08 legacy et schéma de snapshot", () => {
  it("MANUAL-08 totalRecettes legacy ne devient jamais un état v2", async () => {
    const mono = (await representativeMonoWorkspaces()).f013;
    const legacy = mono.declarationDraft!.revenusAssistant!;
    assert.equal(classifyF013Contract(legacy), "legacy_cash_v1");
    assert.equal(parseRentReconciliationState(legacy), null);
    assert.equal(parseRentReconciliationState({ stateVersion: 1, facts: { ...legacy } }), null);
    assert.equal(mono.declarationDraft!.rentReconciliationV2, undefined, "aucune conversion implicite");
    const fresh = createRentReconciliationState(scopeOf("A"));
    assert.equal(fresh.facts.collections.status, "UNKNOWN");
    assert.equal(nextManualStep(fresh), "collections");
  });
  it("sans donnée v2 la version de snapshot est inchangée (v1 mono, v2 scopé)", async () => {
    const mono = (await representativeMonoWorkspaces()).f013;
    assert.equal(workspaceSnapshotSchemaVersion(mono), 1);
    const scoped = lmnpReducer(mono, { type: "ADD_PROPERTY", property: { id: "b2", label: "x", address: "y", city: "z", postalCode: "1" } });
    assert.equal(workspaceSnapshotSchemaVersion(scoped), 2);
  });
  it("v3 impose la forme : v1/v2 avec donnée v2 refusés ; version inconnue refusée", async () => {
    const mono = (await representativeMonoWorkspaces()).f013;
    const withV2 = lmnpReducer(mono, { type: "DECLARATION_PATCH_DRAFT", patch: { rentReconciliationV2: fill(mono.properties[0]!.id, 1000) } });
    const env = ok(serializeWorkspaceSnapshot(withV2)).envelope;
    assert.equal(env.schemaVersion, 3);
    for (const forged of [1, 2]) assert.equal(parseWorkspaceSnapshot({ ...env, schemaVersion: forged }).ok, false);
    const unsupported = parseWorkspaceSnapshot({ ...env, schemaVersion: 4 });
    assert.equal(unsupported.ok === false && unsupported.reason, "unsupported_schema_version");
  });
  it("anti-downgrade client : un snapshot v3 ne peut être réécrit en v1/v2", () => {
    assert.ok(snapshotWriteRejection({ schema_version: 3 }, 1));
    assert.ok(snapshotWriteRejection({ schema_version: 3 }, 2));
    assert.equal(snapshotWriteRejection({ schema_version: 3 }, 3), null);
    assert.equal(snapshotWriteRejection({ schema_version: 1 }, 3), null);
  });
});
