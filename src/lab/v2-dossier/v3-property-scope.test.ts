/**
 * R15.6 — résolution de scope COMMUNE (extraite de R15.5) : mêmes motifs, mêmes règles ; compatibilité Logement par ré-export.
 * Run: npx tsx --test src/lab/v2-dossier/v3-property-scope.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { propertyScopeFor } from "./correction-scope";
import { resolveV3HousingScope } from "./housing-detail-read-model";
import { property, stateOf, workspaceOf } from "./housing-test-support";
import { projectV3PropertyEntry, resolveV3PropertyScope, resolveV3PropertySupport } from "./v3-property-scope";

test("les cinq motifs fail-closed, sans jamais choisir un bien", () => {
  const ws = workspaceOf(stateOf());
  assert.deepEqual(resolveV3PropertyScope(ws, undefined), { ok: false, reason: "no_property_id" });
  assert.deepEqual(resolveV3PropertyScope(ws, null), { ok: false, reason: "no_property_id" });
  assert.deepEqual(resolveV3PropertyScope(ws, " "), { ok: false, reason: "no_property_id" });
  assert.deepEqual(resolveV3PropertyScope(ws, "ghost"), { ok: false, reason: "unknown_property" });
  assert.deepEqual(resolveV3PropertyScope(workspaceOf(stateOf({ properties: [], propertyIds: [] })), "home-1"), { ok: false, reason: "no_property" });
  assert.deepEqual(resolveV3PropertyScope(workspaceOf(stateOf({ properties: [property("a"), property("b")], propertyIds: ["a"] })), "b"), { ok: false, reason: "not_in_fiscal_year" });
  assert.deepEqual(resolveV3PropertyScope(workspaceOf(stateOf({ properties: [property("a"), property("a")], propertyIds: ["a"] })), "a"), { ok: false, reason: "ambiguous" });
  const ok = resolveV3PropertyScope(ws, "home-1");
  assert.ok(ok.ok && ok.property.id === "home-1");
});

test("support : full seulement pour le bien unique cohérent ; facts_only sinon ; propertyScopeFor ne choisit jamais un bien (MB-MULTI-UX-1)", () => {
  assert.equal(resolveV3PropertySupport(workspaceOf(stateOf()), "home-1"), "full");
  const two = workspaceOf(stateOf({ properties: [property("a"), property("b")] }));
  assert.equal(resolveV3PropertySupport(two, "a"), "facts_only");
  // MB-MULTI-UX-1 : le scope multi est étendu mais ne choisit JAMAIS un bien — sans sélection explicite, aucun bien requis.
  assert.deepEqual(propertyScopeFor(two.fiscalYear.propertyIds, two.properties), { kind: "not_applicable" });
  assert.deepEqual(propertyScopeFor(two.fiscalYear.propertyIds, two.properties, "b"), { kind: "required", propertyId: "b" });
  assert.equal(propertyScopeFor(two.fiscalYear.propertyIds, two.properties, "inconnu"), null);
  assert.equal(resolveV3PropertySupport(workspaceOf(stateOf({ properties: [property("a")], propertyIds: ["b"] })), "a"), "facts_only");
});

test("compatibilité R15.5 : l'ancien nom est le même resolver", () => {
  assert.equal(resolveV3HousingScope, resolveV3PropertyScope);
});

test("situation d'entrée : non attribuable hors bien unique ; jamais persistée ni mutante", () => {
  const ws = workspaceOf(stateOf({ fiscalYear: { priorHistoryDeclaration: { status: "FIRST_REAL_YEAR", declaredAt: "x" } } }));
  const before = structuredClone(ws);
  assert.deepEqual(projectV3PropertyEntry(ws, "home-1", "full"), { kind: "first_declaration" });
  assert.deepEqual(projectV3PropertyEntry(ws, "home-1", "facts_only"), { kind: "undetermined", reason: "not_attributable_to_property" });
  assert.deepEqual(ws, before);
});
