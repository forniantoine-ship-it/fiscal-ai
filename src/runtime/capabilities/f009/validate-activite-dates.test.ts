/**
 * Régression — terminologie "disponibilité à la location" (RAI-003), pas
 * "mise en location" (qui laisse entendre la première location effective).
 * Run: npx tsx --test src/runtime/capabilities/f009/validate-activite-dates.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { validateActiviteDates } from "./validate-activite-dates";

test("disponibilité avant début d'activité : message utilise « disponibilité », pas « mise en location »", () => {
  const result = validateActiviteDates({ dateDebutActivite: "2024-06-01", dateMiseEnService: "2024-01-01" });
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.includes("disponibilité")));
});

test("disponibilité avant l'acte notarié : message utilise « disponibilité à la location », jamais « mise en location »", () => {
  const result = validateActiviteDates({
    dateDebutActivite: "2024-01-01",
    dateMiseEnService: "2024-01-10",
    acteNotarieDate: "2024-02-01",
  });
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.includes("disponibilité à la location")));
  assert.ok(result.issues.every((issue) => !issue.includes("mise en location")));
});

test("dates cohérentes : aucune erreur", () => {
  const result = validateActiviteDates({ dateDebutActivite: "2024-01-01", dateMiseEnService: "2024-02-01" });
  assert.equal(result.valid, true);
  assert.deepEqual(result.issues, []);
});
