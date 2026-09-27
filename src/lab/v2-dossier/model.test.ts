import assert from "node:assert/strict";
import test from "node:test";
import { INITIAL_STATE, illustrativeResult, motionDelay, nextAction, pendingCount, reduceDemo } from "./model";

test("première année : réception, interventions, recalcul puis résultat", () => {
  let state = reduceDemo(INITIAL_STATE, { type: "receive" });
  assert.equal(state.processing, 0);
  state = reduceDemo(state, { type: "processing", step: 4 });
  assert.equal(pendingCount(state), 3);
  assert.equal(nextAction(state), "date");

  state = reduceDemo(state, { type: "date", value: "2026-01-01" });
  assert.equal(state.resolution, "date");
  assert.equal(pendingCount(state), 2);
  state = reduceDemo(state, { type: "settle-resolution" });
  assert.equal(nextAction(state), "conflict");
  state = reduceDemo(state, { type: "conflict", value: "2026-01-10" });
  assert.equal(pendingCount(state), 1);
  state = reduceDemo(state, { type: "settle-resolution" });
  assert.equal(nextAction(state), "tax");

  state = reduceDemo(state, { type: "tax-document-start" });
  assert.equal(state.view, "documents");
  assert.equal(state.taxDocumentStep, 0);
  state = reduceDemo(state, { type: "tax-document-progress", step: 4 });
  assert.equal(state.taxAmount, null);
  state = reduceDemo(state, { type: "tax", value: 1310 });
  assert.equal(pendingCount(state), 0);
  assert.equal(state.resolution, "tax");
  state = reduceDemo(state, { type: "settle-resolution" });
  assert.equal(state.recalculating, true);
  assert.equal(illustrativeResult(0).beforeAmortization - illustrativeResult(1310).beforeAmortization, 1310);

  state = reduceDemo(state, { type: "recalculated" });
  assert.equal(state.recalculating, false);
  assert.equal(state.highlightedResult, true);
  assert.equal(illustrativeResult(1310).fiscal, 1640);
});

test("changer de scénario remet les réponses à zéro", () => {
  const manual = reduceDemo(INITIAL_STATE, { type: "manual" });
  assert.equal(pendingCount(manual), 2);
  const answered = reduceDemo(manual, { type: "tax", value: 1250 });
  const takeover = reduceDemo(answered, { type: "scenario", scenario: "takeover" });
  assert.equal(takeover.scenario, "takeover");
  assert.equal(takeover.received, false);
  assert.equal(takeover.taxAmount, null);
  assert.equal(takeover.recalculating, false);
  assert.equal(takeover.entryStage, "question");
});

test("l’aiguillage guide première déclaration, reprise et doute sans choix arbitraire", () => {
  const unsure = reduceDemo(INITIAL_STATE, { type: "entry-unsure" });
  assert.equal(unsure.entryStage, "unsure");
  assert.equal(unsure.entryChoice, null);

  let first = reduceDemo(unsure, { type: "entry-choice", choice: "first" });
  assert.equal(first.entryStage, "confirm");
  first = reduceDemo(first, { type: "entry-stage", stage: "organize" });
  first = reduceDemo(first, { type: "entry-stage", stage: "invite" });
  assert.equal(first.scenario, "first");
  assert.equal(first.received, false);
  first = reduceDemo(first, { type: "receive" });
  assert.equal(first.entryStage, "done");
  assert.equal(first.processing, 0);

  let takeover = reduceDemo(INITIAL_STATE, { type: "entry-choice", choice: "takeover" });
  takeover = reduceDemo(takeover, { type: "entry-stage", stage: "organize" });
  takeover = reduceDemo(takeover, { type: "entry-stage", stage: "done" });
  assert.equal(takeover.scenario, "takeover");
  assert.equal(takeover.takeoverIntake, false);
  takeover = reduceDemo(takeover, { type: "takeover-intake" });
  takeover = reduceDemo(takeover, { type: "takeover", document: "liasse" });
  takeover = reduceDemo(takeover, { type: "takeover", document: "register" });
  assert.equal(takeover.takeoverLiasse && takeover.takeoverRegister, true);
  assert.equal(takeover.taxAmount, null);
});

test("la réduction du mouvement saute les séquences d’attente", () => {
  for (const phase of ["entry", "organize", "document", "tax-document", "handoff", "resolution", "recalculation"] as const) {
    assert.ok(motionDelay(phase, true) <= 100);
    assert.ok(motionDelay(phase, false) > motionDelay(phase, true));
  }
});
