import assert from "node:assert/strict";
import test from "node:test";
import { DEMO, MONTHLY_SCHEDULE } from "./fixtures";
import {
  chargesDeductibles, domainStatus, illustrativeResult, initialState, interventionPosition, pendingInterventions, reduceLab,
} from "./model";

test("le détail mois par mois se somme exactement aux totaux affichés", () => {
  const total = (key: "mensualite" | "interets" | "assurance" | "capital" | "deductible") => MONTHLY_SCHEDULE.reduce((sum, row) => sum + row[key], 0);
  assert.equal(MONTHLY_SCHEDULE.length, 12);
  assert.equal(total("mensualite"), 9_840);
  assert.equal(total("interets"), DEMO.financement.interets);
  assert.equal(total("assurance"), DEMO.financement.assurance);
  assert.equal(total("capital"), 7_390);
  assert.equal(total("deductible"), DEMO.financement.total);
  for (const row of MONTHLY_SCHEDULE) assert.equal(row.interets + row.assurance + row.capital, row.mensualite);
});

test("scénario analysé : 2 interventions, résultat de démonstration 4 030 €", () => {
  let state = initialState("analysed");
  assert.deepEqual(pendingInterventions(state), ["logement-date", "charges-taxe"]);
  assert.deepEqual(interventionPosition(state), { index: 1, total: 2 });
  assert.equal(chargesDeductibles(state), 3_720);
  assert.equal(illustrativeResult(state).resultat, 4_030);
  assert.equal(domainStatus(state, "logement").tone, "attention");
  assert.equal(domainStatus(state, "financement").tone, "ok");

  state = reduceLab(state, { type: "answer-date", value: "2026-01-10" });
  assert.equal(state.resolution?.intervention, "logement-date");
  state = reduceLab(state, { type: "settle" });
  assert.deepEqual(interventionPosition(state), { index: 2, total: 2 });
  assert.equal(domainStatus(state, "logement").tone, "ok");

  state = reduceLab(state, { type: "answer-tax", value: DEMO.taxeFonciere.releve });
  state = reduceLab(state, { type: "settle" });
  assert.equal(pendingInterventions(state).length, 0);
  assert.equal(chargesDeductibles(state), 3_650);
});

test("pièces de prêt manquantes : la lecture simulée complète le financement sans changer de vue", () => {
  let state = initialState("loan-missing");
  assert.equal(pendingInterventions(state).length, 3);
  assert.equal(domainStatus(state, "financement").tone, "attention");
  state = reduceLab(state, { type: "loan-reading", reading: "reading" });
  assert.equal(state.view, "dossier");
  state = reduceLab(state, { type: "loan-reading", reading: "done" });
  assert.equal(state.view, "dossier");
  assert.ok(state.resolution?.findings?.includes("12 échéances retrouvées"));
  assert.equal(domainStatus(state, "financement").tone, "ok");
  assert.equal(chargesDeductibles(state), 3_720);
});

test("« Je n'ai pas de prêt » clôt Financement sans charge de financement", () => {
  let state = initialState("loan-missing");
  state = reduceLab(state, { type: "loan-none", none: true });
  assert.equal(domainStatus(state, "financement").tone, "ok");
  assert.equal(chargesDeductibles(state), DEMO.autresCharges + DEMO.taxeFonciere.avis);
});

test("corriger ouvre l'espace de travail sur le champ, sans toucher aux montants lus dans l'échéancier", () => {
  let state = reduceLab(initialState(), { type: "open-domain", id: "financement" });
  state = reduceLab(state, { type: "open-workspace", focus: "capital" });
  assert.equal(state.view, "workspace");
  assert.equal(state.openDomain, null);
  assert.equal(state.workspaceFocus, "capital");
  state = reduceLab(state, { type: "correct", field: "capital", correction: { value: "145 000 €", source: "manual" } });
  assert.equal(state.corrections.capital?.value, "145 000 €");
  assert.equal(chargesDeductibles(state), 3_720);
  state = reduceLab(state, { type: "view", view: "dossier" });
  assert.equal(state.view, "dossier");
  assert.equal(state.workspaceFocus, null);
});
