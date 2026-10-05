/**
 * F013 v2 — 11 oracles validés + tests de frontière du moteur pur.
 * Run: npx tsx --test src/lib/lmnp/services/f013/v2/f013-v2.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  F013_V2_CONTRACT_VERSION,
  classifyF013Contract,
  type CollectionsCoverage,
  type MoneyFact,
  type RentReconciliationV2,
} from "./f013-v2-contract";
import { consolidateRentContributions, reconcileRentV2 } from "./f013-v2-engine";

const eur = (n: number) => Math.round(n * 100);
const V = (euros: number): MoneyFact => ({ status: "VALIDATED", amountCents: eur(euros), provenance: { kind: "user_declaration" } });
const P = (euros: number): MoneyFact => ({ status: "PROPOSED", amountCents: eur(euros) });
const U: MoneyFact = { status: "UNKNOWN" };
const COMPLETE: CollectionsCoverage = { completeness: "COMPLETE", validation: "VALIDATED" };

function facts(
  e: number,
  o: Partial<{ co: number; cc: number; ao: number; ac: number }> = {},
  propertyId = "A",
): RentReconciliationV2 {
  return {
    contractVersion: F013_V2_CONTRACT_VERSION,
    propertyId,
    fiscalYear: 2025,
    revision: 1,
    collections: V(e),
    collectionsCoverage: COMPLETE,
    openingReceivables: V(o.co ?? 0),
    closingReceivables: V(o.cc ?? 0),
    openingAdvances: V(o.ao ?? 0),
    closingAdvances: V(o.ac ?? 0),
    exceptionsReviewed: true,
  };
}
const run = (input: RentReconciliationV2, propertyId = input.propertyId) =>
  reconcileRentV2(input, { propertyId, fiscalYear: 2025 });

function acquired(input: RentReconciliationV2): number {
  const r = run(input);
  assert.equal(r.status, "SUPPORTED");
  return r.status === "SUPPORTED" ? r.loyersAcquisCents : NaN;
}

describe("F013 v2 — oracles", () => {
  it("F013-01 normal", () => assert.equal(acquired(facts(12000)), eur(12000)));
  it("F013-02 décembre payé N+1", () => {
    const r = run(facts(11000, { cc: 1000 }));
    assert.equal(r.status === "SUPPORTED" && r.loyersAcquisCents, eur(12000));
    assert.equal(r.status === "SUPPORTED" && r.inventory.closingReceivablesCents, eur(1000));
  });
  it("F013-03 créance d'ouverture", () => assert.equal(acquired(facts(13000, { co: 1000 })), eur(12000)));
  it("F013-04 avance", () => assert.equal(acquired(facts(13000, { ac: 1000 })), eur(12000)));
  it("F013-05 paiement multi-périodes", () => assert.equal(acquired(facts(3000, { ac: 1000 })), eur(2000)));
  it("F013-06 impayé persistant", () => assert.equal(acquired(facts(11000, { cc: 1000 })), eur(12000)));
  it("F013-07 vacance", () => assert.equal(acquired(facts(11000)), eur(11000)));
  it("F013-08 changement de loyer", () => assert.equal(acquired(facts(11100)), eur(11100)));
  it("F013-09 exercice partiel", () => assert.equal(acquired(facts(8500)), eur(8500)));
  it("F013-10 multi : calculs indépendants + consolidation", () => {
    const a = run(facts(12000, {}, "A"));
    const b = run(facts(7000, { cc: 1000 }, "B"));
    assert.equal(a.status === "SUPPORTED" && a.loyersAcquisCents, eur(12000));
    assert.equal(b.status === "SUPPORTED" && b.loyersAcquisCents, eur(8000));
    const c = consolidateRentContributions([a, b]);
    assert.equal(c.status === "SUPPORTED" && c.totalCents, eur(20000));
  });
  it("F013-11 données insuffisantes", () => {
    const r = run({
      ...facts(12000),
      collectionsCoverage: { completeness: "UNKNOWN" },
      openingReceivables: U,
      closingReceivables: U,
      openingAdvances: U,
      closingAdvances: U,
    });
    assert.equal(r.status, "NEEDS_CONFIRMATION");
    assert.equal("loyersAcquisCents" in r, false);
    assert.ok(r.reasons.some((x) => x.code === "COVERAGE_UNKNOWN"));
    assert.ok(r.reasons.some((x) => x.code === "TERM_UNKNOWN"));
  });
});

describe("F013 v2 — frontières", () => {
  it("UNKNOWN ≠ ZERO", () => {
    assert.equal(run(facts(12000)).status, "SUPPORTED");
    const r = run({ ...facts(12000), closingReceivables: U });
    assert.equal(r.status, "NEEDS_CONFIRMATION");
    assert.equal("loyersAcquisCents" in r, false);
  });
  it("PROPOSED ≠ VALIDATED", () => {
    const r = run({ ...facts(12000), openingAdvances: P(0) });
    assert.equal(r.status, "NEEDS_CONFIRMATION");
    assert.ok(r.reasons.some((x) => x.code === "TERM_PROPOSED_NOT_VALIDATED" && x.term === "openingAdvancesCents"));
  });
  it("COVERAGE : montant validé mais couverture partielle ou seulement proposée", () => {
    const partial = run({ ...facts(12000), collectionsCoverage: { completeness: "PARTIAL", validation: "VALIDATED" } });
    assert.equal(partial.status, "NEEDS_CONFIRMATION");
    assert.ok(partial.reasons.some((x) => x.code === "COVERAGE_PARTIAL"));
    const proposed = run({ ...facts(12000), collectionsCoverage: { completeness: "COMPLETE", validation: "PROPOSED" } });
    assert.equal(proposed.status, "NEEDS_CONFIRMATION");
    assert.equal("loyersAcquisCents" in proposed, false);
  });
  it("NÉGATIF incohérent : diagnostic bloquant, pas de clamp", () => {
    const r = run(facts(1000, { co: 5000 }));
    assert.equal(r.status, "NEEDS_CONFIRMATION");
    assert.equal("loyersAcquisCents" in r, false);
    assert.ok(r.reasons.some((x) => x.code === "NEGATIVE_RENT_INCOHERENT"));
  });
  it("CENTIMES : valeurs non rondes, entiers exacts", () => {
    const input: RentReconciliationV2 = {
      ...facts(0),
      collections: { status: "VALIDATED", amountCents: 1_234_567 },
      closingReceivables: { status: "VALIDATED", amountCents: 89_01 },
      openingReceivables: { status: "VALIDATED", amountCents: 33 },
      closingAdvances: { status: "VALIDATED", amountCents: 7 },
    };
    const r = run(input);
    assert.equal(r.status === "SUPPORTED" && r.loyersAcquisCents, 1_234_567 + 8_901 - 33 - 7);
    assert.ok(Number.isInteger(r.status === "SUPPORTED" ? r.loyersAcquisCents : 0.5));
  });
  it("montant non entier ou négatif : INVALID_AMOUNT bloquant", () => {
    for (const bad of [123.5, -100, Number.NaN]) {
      const r = run({ ...facts(12000), collections: { status: "VALIDATED", amountCents: bad } });
      assert.equal(r.status, "NEEDS_CONFIRMATION");
      assert.ok(r.reasons.some((x) => x.code === "INVALID_AMOUNT"));
    }
  });
  it("DÉTERMINISME : même input → même résultat et trace", () => {
    const input = facts(11000, { cc: 1000 });
    assert.equal(JSON.stringify(run(input)), JSON.stringify(run(structuredClone(input))));
  });
  it("TRACE : cinq termes, états, provenance, version, contrôles", () => {
    const r = run(facts(11000, { cc: 1000 }));
    assert.equal(r.trace.terms.length, 5);
    assert.equal(r.trace.terms[0].provenance?.kind, "user_declaration");
    assert.equal(r.trace.calculationVersion, "f013_v2.rent_reconciliation.1");
    assert.ok(r.trace.controls.every((c) => c.outcome === "PASSED"));
  });
  it("PROPERTY SCOPE : faits de A refusés pour B", () => {
    const r = reconcileRentV2(facts(12000, {}, "A"), { propertyId: "B", fiscalYear: 2025 });
    assert.equal(r.status, "NEEDS_CONFIRMATION");
    assert.ok(r.reasons.some((x) => x.code === "PROPERTY_SCOPE_MISMATCH"));
    assert.equal("loyersAcquisCents" in r, false);
    const y = reconcileRentV2(facts(12000), { propertyId: "A", fiscalYear: 2024 });
    assert.ok(y.reasons.some((x) => x.code === "FISCAL_YEAR_MISMATCH"));
  });
  it("LEGACY : legacy_cash_v1 / sortie v1 jamais acceptés comme v2", () => {
    const v1 = { totalRecettes: 12000, loyersEncaisses: 12000 };
    assert.equal(classifyF013Contract(v1), "legacy_cash_v1");
    assert.equal(classifyF013Contract({ contractVersion: "legacy_cash_v1" }), "legacy_cash_v1");
    assert.equal(classifyF013Contract(facts(1)), "f013_v2");
    const forged = { ...facts(12000), contractVersion: "legacy_cash_v1" } as unknown as RentReconciliationV2;
    const r = run(forged, "A");
    assert.equal(r.status, "NEEDS_CONFIRMATION");
    assert.ok(r.reasons.some((x) => x.code === "LEGACY_CONTRACT_NOT_V2"));
    assert.equal("loyersAcquisCents" in r, false);
    const cast = run(v1 as unknown as RentReconciliationV2, "A");
    assert.notEqual(cast.status, "SUPPORTED");
  });
  it("OUT_OF_DOMAIN : traitement distinct déclaré (GLI, provision…)", () => {
    const r = run({ ...facts(12000), outOfDomain: ["gli"] });
    assert.equal(r.status, "OUT_OF_DOMAIN");
    assert.equal("loyersAcquisCents" in r, false);
  });
  it("V2.2 — exceptions non passées en revue : jamais assimilées à « aucune exception »", () => {
    const r = run({ ...facts(12000), exceptionsReviewed: false });
    assert.equal(r.status, "NEEDS_CONFIRMATION");
    assert.ok(r.reasons.some((x) => x.code === "EXCEPTIONS_NOT_REVIEWED"));
    assert.equal("loyersAcquisCents" in r, false);
  });
  it("consolidation : refuse bien non SUPPORTED, doublon, exercices mixtes", () => {
    const a = run(facts(12000, {}, "A"));
    const bad = run({ ...facts(1, {}, "B"), closingReceivables: U });
    assert.equal(consolidateRentContributions([a, bad]).status, "BLOCKED");
    assert.equal(consolidateRentContributions([a, a]).status, "BLOCKED");
    assert.equal(consolidateRentContributions([]).status, "BLOCKED");
  });
});
