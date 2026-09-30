/**
 * R15.5 — accessor pur de la date de mise en service : known / pending / conflict / absent, sans repli.
 * Run: npx tsx --test src/lab/v2-dossier/property-service-date.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { PropertyAmortissementBase } from "@/lib/lmnp/types/dossier";
import { resolveV3PropertyServiceDate } from "./property-service-date";
import { property, stateOf, workspaceOf } from "./housing-test-support";
import type { F009PersistedState } from "@/runtime/assistants/f009-activite/types";

const base = (dateMiseEnService?: string): PropertyAmortissementBase => ({ composants: [], dateMiseEnService });
const inProgress = (dateMiseEnService: string): F009PersistedState => ({ step: "service_date", dateMiseEnService, updatedAt: "now" });

test("E. date globale du draft, base vide : connue depuis le draft en mono-bien", () => {
  const result = resolveV3PropertyServiceDate(workspaceOf(stateOf({ draft: { dateMiseEnService: "2025-06-01" } })), "home-1");
  assert.equal(result.status, "known");
  if (result.status === "known") assert.deepEqual([result.value, result.origins], ["2025-06-01", ["draft"]]);
});

test("base seule (propre au bien) : connue, origine property_base", () => {
  const result = resolveV3PropertyServiceDate(workspaceOf(stateOf({ properties: [property("home-1", { amortissementBase: base("2024-05-02") })] })), "home-1");
  assert.deepEqual(result.status === "known" && [result.value, result.origins], ["2024-05-02", ["property_base"]]);
});

test("draft et base concordent : connue, deux origines", () => {
  const ws = workspaceOf(stateOf({ properties: [property("home-1", { amortissementBase: base("2025-06-01") })], draft: { dateMiseEnService: "2025-06-01" } }));
  const result = resolveV3PropertyServiceDate(ws, "home-1");
  assert.deepEqual(result.status === "known" && result.origins, ["property_base", "draft"]);
});

test("F. draft et base divergent : conflit, aucune valeur retenue, candidats exposés", () => {
  const ws = workspaceOf(stateOf({ properties: [property("home-1", { amortissementBase: base("2024-05-02") })], draft: { dateMiseEnService: "2025-06-01" } }));
  const result = resolveV3PropertyServiceDate(ws, "home-1");
  assert.equal(result.status, "conflict");
  assert.equal("value" in result, false, "aucune date retenue");
  if (result.status === "conflict") assert.deepEqual(result.candidates.map(item => [item.source, item.value]), [["property_base", "2024-05-02"], ["draft", "2025-06-01"]]);
});

test("pending : seule une réponse F009 non encore devenue donnée métier existe", () => {
  const ws = workspaceOf(stateOf({ draft: { activiteAssistantState: inProgress("2025-07-01") } }));
  const result = resolveV3PropertyServiceDate(ws, "home-1");
  assert.deepEqual(result.status === "pending" && [result.value, result.origin], ["2025-07-01", "assistant_in_progress"]);
});

test("valeur confirmée + modification F009 en cours qui diffère : la modification n'est jamais retenue", () => {
  const ws = workspaceOf(stateOf({ draft: { dateMiseEnService: "2025-06-01", activiteAssistantState: inProgress("2025-08-01") } }));
  const result = resolveV3PropertyServiceDate(ws, "home-1");
  assert.equal(result.status === "known" && result.value, "2025-06-01");
  assert.equal(result.status === "known" && result.unconfirmedChange, "2025-08-01");
});

test("absent : aucune source ; aucun repli acquisitionDate / activityStartDate / exercice", () => {
  const ws = workspaceOf(stateOf({
    properties: [property("home-1", { acquisitionDate: "2025-03-10" })],
    draft: { activityStartDate: "2024-01-01" },
  }));
  const result = resolveV3PropertyServiceDate(ws, "home-1");
  assert.equal(result.status, "absent");
  assert.equal("value" in result, false);
});

test("multi-biens : la valeur globale n'est attribuée à aucun bien ; la base du bien l'est", () => {
  const ws = workspaceOf(stateOf({
    properties: [property("A", { amortissementBase: base("2023-03-01") }), property("B")],
    draft: { dateMiseEnService: "2025-06-01" },
  }));
  const a = resolveV3PropertyServiceDate(ws, "A");
  assert.deepEqual(a.status === "known" && [a.value, a.origins], ["2023-03-01", ["property_base"]]);
  assert.deepEqual(a.ignored, [{ source: "draft", value: "2025-06-01", reason: "not_attributable" }]);
  const b = resolveV3PropertyServiceDate(ws, "B");
  assert.equal(b.status, "absent");
  assert.deepEqual(b.ignored, [{ source: "draft", value: "2025-06-01", reason: "not_attributable" }]);
});

test("format invalide : ignoré et signalé, jamais converti", () => {
  const ws = workspaceOf(stateOf({ draft: { dateMiseEnService: "01/06/2025" } }));
  const result = resolveV3PropertyServiceDate(ws, "home-1");
  assert.equal(result.status, "absent");
  assert.deepEqual(result.ignored, [{ source: "draft", value: "01/06/2025", reason: "invalid_format" }]);
});

test("propertyId inconnu : la base n'est pas lue, la valeur globale n'est pas attribuée", () => {
  const result = resolveV3PropertyServiceDate(workspaceOf(stateOf({ draft: { dateMiseEnService: "2025-06-01" } })), "ghost");
  assert.equal(result.status, "absent");
});

test("aucune mutation du workspace", () => {
  const ws = workspaceOf(stateOf({ draft: { dateMiseEnService: "2025-06-01" } }));
  const before = structuredClone(ws);
  resolveV3PropertyServiceDate(ws, "home-1");
  assert.deepEqual(ws, before);
});
