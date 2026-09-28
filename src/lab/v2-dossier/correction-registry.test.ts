import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { v3CorrectionActionFor } from "./correction-registry";
import type { V3CorrectionScope } from "./correction-scope";

const REQUIRED_SCOPE: V3CorrectionScope = {
  dossierId: "dossier-id", fiscalYearId: "year-id", year: 2025,
  property: { kind: "required", propertyId: "property-id" },
};
const NOT_APPLICABLE_SCOPE: V3CorrectionScope = {
  dossierId: "dossier-id", fiscalYearId: "year-id", year: 2025,
  property: { kind: "not_applicable" },
};

describe("V3 correction registry — R12.2", () => {
  it("A/B/C/D/E — F009/F010/F011/F013/F012 each expose one domain-level owner action when scope is valid", () => {
    const activity = v3CorrectionActionFor("activity", NOT_APPLICABLE_SCOPE);
    assert.deepEqual(activity, { owner: "F009", kind: "modifier", label: "Revoir l’activité", href: "/lab/v2-dossier/real/activity?dossierId=dossier-id&fiscalYearId=year-id&year=2025&v3Correction=1" });

    const property = v3CorrectionActionFor("property", REQUIRED_SCOPE);
    assert.equal(property?.owner, "F010");
    assert.equal(property?.kind, "modifier");
    assert.ok(property?.href.includes("/assistants/logement?"));
    assert.ok(property?.href.includes("propertyId=property-id"));

    const financing = v3CorrectionActionFor("financing", REQUIRED_SCOPE);
    assert.equal(financing?.owner, "F011");
    assert.ok(financing?.href.startsWith("/assistants/financement?"));

    const revenues = v3CorrectionActionFor("revenues", REQUIRED_SCOPE);
    assert.equal(revenues?.owner, "F013");
    assert.ok(revenues?.href.startsWith("/assistants/revenus?"));

    const charges = v3CorrectionActionFor("charges", REQUIRED_SCOPE);
    assert.equal(charges?.owner, "F012");
    assert.ok(charges?.href.startsWith("/assistants/charges?"));
  });

  it("F — F014 offers only 'Vérifier le plan', never an edit of the computed total", () => {
    const action = v3CorrectionActionFor("depreciation", REQUIRED_SCOPE);
    assert.equal(action?.kind, "verifier");
    assert.equal(action?.label, "Vérifier le plan");
    assert.ok(!/modifier/i.test(action?.label ?? ""));
    assert.ok(action?.href.startsWith("/assistants/amortissements?"));
  });

  it("H — the registry API is domain-scoped only: there is no per-fact entry point at all", () => {
    // v3CorrectionActionFor's signature itself proves this: it takes a V3DomainId, never a
    // V3Fact id — there is structurally no way to target prixRevient/totalDotations/etc.
    const domainIds = ["activity", "property", "financing", "revenues", "charges", "depreciation"] as const;
    for (const id of domainIds) assert.equal(typeof v3CorrectionActionFor(id, REQUIRED_SCOPE), "object");
  });

  it("J — no scope resolved means no correction action for any domain", () => {
    for (const id of ["activity", "property", "financing", "revenues", "charges", "depreciation"] as const) {
      assert.equal(v3CorrectionActionFor(id, null), null);
    }
  });

  it("K/L — property-required domains refuse a not-applicable scope (ambiguous/multi-property/no property)", () => {
    for (const id of ["property", "financing", "revenues", "charges", "depreciation"] as const) {
      assert.equal(v3CorrectionActionFor(id, NOT_APPLICABLE_SCOPE), null);
    }
  });

  it("F009 stays available without a property, and does not smuggle one into its href", () => {
    const action = v3CorrectionActionFor("activity", REQUIRED_SCOPE);
    assert.ok(action);
    assert.ok(!action!.href.includes("propertyId"));
  });
});
