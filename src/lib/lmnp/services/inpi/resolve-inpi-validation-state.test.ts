/**
 * P1 — résolution de l'état INPI affiché sur la page Validation.
 * Run: npx tsx --test src/lib/lmnp/services/inpi/resolve-inpi-validation-state.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveInpiValidationState } from "./resolve-inpi-validation-state";

describe("P1 — resolveInpiValidationState", () => {
  it("Test 1 — registered → REGISTERED", () => {
    assert.equal(
      resolveInpiValidationState({ inpiStatus: "registered", paidAt: undefined, declarationGeneratedAt: undefined }),
      "REGISTERED",
    );
  });

  it("Test 2 / Test C — in_progress → IN_PROGRESS (wording existant, résolution inchangée par ce correctif)", () => {
    assert.equal(
      resolveInpiValidationState({ inpiStatus: "in_progress", paidAt: undefined, declarationGeneratedAt: undefined }),
      "IN_PROGRESS",
    );
  });

  it("Test 2 (bis) — modification_in_progress → IN_PROGRESS (submitted/regularization_required ont désormais leur propre état, cf. Test A/B ci-dessous)", () => {
    assert.equal(
      resolveInpiValidationState({
        inpiStatus: "modification_in_progress",
        paidAt: undefined,
        declarationGeneratedAt: undefined,
      }),
      "IN_PROGRESS",
    );
  });

  it("Test A — regularization_required → état distinct REGULARIZATION_REQUIRED, jamais IN_PROGRESS", () => {
    assert.equal(
      resolveInpiValidationState({
        inpiStatus: "regularization_required",
        paidAt: undefined,
        declarationGeneratedAt: undefined,
      }),
      "REGULARIZATION_REQUIRED",
    );
  });

  it("Test B — submitted → état distinct SUBMITTED, jamais IN_PROGRESS", () => {
    assert.equal(
      resolveInpiValidationState({ inpiStatus: "submitted", paidAt: undefined, declarationGeneratedAt: undefined }),
      "SUBMITTED",
    );
  });

  it("Test 3 — not_started → NOT_STARTED", () => {
    assert.equal(
      resolveInpiValidationState({ inpiStatus: "not_started", paidAt: undefined, declarationGeneratedAt: undefined }),
      "NOT_STARTED",
    );
  });

  it("Test 3 (bis) — preparing → NOT_STARTED", () => {
    assert.equal(
      resolveInpiValidationState({ inpiStatus: "preparing", paidAt: undefined, declarationGeneratedAt: undefined }),
      "NOT_STARTED",
    );
  });

  it("Test 4 — absence de statut (jamais renseigné) → UNKNOWN, jamais NOT_STARTED inventé", () => {
    assert.equal(
      resolveInpiValidationState({ inpiStatus: undefined, paidAt: undefined, declarationGeneratedAt: undefined }),
      "UNKNOWN",
    );
  });

  it("Test 5 — paidAt présent, declarationGeneratedAt absent, INPI manquant → PAID_WAITING_INPI", () => {
    assert.equal(
      resolveInpiValidationState({
        inpiStatus: "not_started",
        paidAt: "2026-10-01T00:00:00.000Z",
        declarationGeneratedAt: undefined,
      }),
      "PAID_WAITING_INPI",
    );
  });

  it("Test 5 (bis) — même sans aucun statut historique (UNKNOWN sinon), payé+non généré prime → PAID_WAITING_INPI", () => {
    assert.equal(
      resolveInpiValidationState({
        inpiStatus: undefined,
        paidAt: "2026-10-01T00:00:00.000Z",
        declarationGeneratedAt: undefined,
      }),
      "PAID_WAITING_INPI",
    );
  });

  it("registered + payé + non généré → REGISTERED prime (l'INPI n'est pas la cause du blocage)", () => {
    assert.equal(
      resolveInpiValidationState({
        inpiStatus: "registered",
        paidAt: "2026-10-01T00:00:00.000Z",
        declarationGeneratedAt: undefined,
      }),
      "REGISTERED",
    );
  });

  it("payé ET généré (parcours normal, SIREN déjà connu) → jamais PAID_WAITING_INPI", () => {
    assert.equal(
      resolveInpiValidationState({
        inpiStatus: "registered",
        paidAt: "2026-10-01T00:00:00.000Z",
        declarationGeneratedAt: "2026-10-01T00:05:00.000Z",
      }),
      "REGISTERED",
    );
  });
});
