import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  CHARGE_FAMILY_IDS,
  coproChargeId,
  createRecordedCharge,
  emptyChargeRegistry,
  familyIdForCategory,
  scalarChargeId,
  type Charge,
  type FamilyCoverage,
} from "./charge";

describe("F-012 Cycle 5 — modèle Charge / FamilyCoverage", () => {
  it("0 est une valeur valide ; unknown n'est pas une Charge à 0", () => {
    const charge = createRecordedCharge({
      id: scalarChargeId("taxe-fonciere", 2024),
      familyId: "impots",
      category: "taxe_fonciere",
      amount: 0,
      exercise: 2024,
    });
    assert.equal(charge.amount, 0);
    assert.equal(charge.status, "recorded");
    assert.equal(charge.source, "manual");
    assert.equal(charge.provenance, "manual");
    assert.equal("totalDeductible" in charge, false);
    assert.equal("result" in charge, false);
  });

  it("createRecordedCharge n'invente ni paidAt, ni pré-exploitation, ni document", () => {
    const charge = createRecordedCharge({
      id: "divers-1",
      familyId: "autres",
      category: "divers",
      amount: 12,
      exercise: 2024,
    });
    assert.equal(charge.paidAt, undefined);
    assert.equal(charge.preExploitation, undefined);
    assert.equal(charge.documentIds, undefined);
    assert.equal(charge.qualification, undefined);
  });

  it("familyIdForCategory suit le grain des 6 familles", () => {
    assert.equal(familyIdForCategory("taxe_fonciere"), "impots");
    assert.equal(familyIdForCategory("copropriete"), "syndic");
    assert.equal(familyIdForCategory("assurance_pno"), "assurances");
    assert.equal(familyIdForCategory("assurance_gli"), "assurances");
    assert.equal(familyIdForCategory("honoraires_gestion"), "gestion");
    assert.equal(familyIdForCategory("honoraires_comptable"), "gestion");
    assert.equal(familyIdForCategory("travaux"), "travaux");
    assert.equal(familyIdForCategory("frais_bancaires"), "autres");
    assert.equal(familyIdForCategory("divers"), "autres");
  });

  it("IDs scalaires et copro sont déterministes", () => {
    assert.equal(scalarChargeId("taxe-fonciere", 2024), "taxe-fonciere:2024");
    assert.equal(scalarChargeId("taxe-fonciere", 2024), scalarChargeId("taxe-fonciere", 2024));
    assert.equal(coproChargeId(2024, "provisions", 0), "copro:2024:provisions:0");
    assert.notEqual(coproChargeId(2024, "provisions", 0), coproChargeId(2024, "provisions", 1));
  });

  it("FamilyCoverage distingue none, unknown, not_applicable et reviewed_empty (pas de Charge fantôme)", () => {
    const none: FamilyCoverage = {
      familyId: "syndic",
      exercise: 2024,
      status: "none",
      chargeIds: [],
      documentIds: [],
    };
    const unknown: FamilyCoverage = { ...none, status: "unknown" };
    const notApplicable: FamilyCoverage = { ...none, status: "not_applicable" };
    const reviewedEmpty: FamilyCoverage = { ...none, status: "reviewed_empty" };
    assert.notEqual(none.status, unknown.status);
    assert.notEqual(none.status, notApplicable.status);
    assert.notEqual(none.status, reviewedEmpty.status);
    assert.notEqual(reviewedEmpty.status, "pending");
    assert.deepEqual(none.chargeIds, []);
    assert.deepEqual(unknown.chargeIds, []);
    assert.deepEqual(reviewedEmpty.chargeIds, []);
  });

  it("emptyChargeRegistry n'invente aucune Charge", () => {
    const registry = emptyChargeRegistry(2024);
    assert.equal(registry.charges.length, 0);
    assert.deepEqual(
      registry.familyCoverage.map((f) => f.familyId),
      [...CHARGE_FAMILY_IDS],
    );
    assert.ok(registry.familyCoverage.every((f) => f.status === "pending" && f.chargeIds.length === 0));
  });

  it("une Charge n'embarque pas le résultat fiscal", () => {
    const charge: Charge = createRecordedCharge({
      id: "travaux-1",
      familyId: "travaux",
      category: "travaux",
      amount: 800,
      exercise: 2024,
      qualification: "entretien",
      travaux: { choix: "reparation_identique", natureIntervention: "entretien" },
    });
    const keys = Object.keys(charge);
    assert.equal(keys.includes("totalDeductible"), false);
    assert.equal(keys.includes("lignes"), false);
  });
});
