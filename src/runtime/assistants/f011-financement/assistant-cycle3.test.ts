import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F011FinancementAssistant } from "./assistant";
import type { F011Deps, F011PersistedState, F011State, F011Step } from "./types";
import { toF011PersistedState } from "./types";

const ctx = {
  dossierId: "test",
  fiscalYear: 2022,
  route: "/assistants/financement",
};

const DEPS_OK: F011Deps = { dateMiseEnService: "2021-01-01" };
const TS = "2024-05-01T09:00:00.000Z";

/** Un seul prêt amortissable, jusqu'à `loan_review` — aucun complément. */
async function driveToLoanReview(assistant: F011FinancementAssistant, count = 1): Promise<F011State> {
  let turn = await assistant.handle(assistant.start().state, { type: "set_presence_emprunt", presence: true });
  turn = await assistant.handle(turn.state, { type: "set_nombre_prets", count });
  turn = await assistant.handle(turn.state, { type: "choose_loan_source", source: "manual" });
  turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
  turn = await assistant.handle(turn.state, {
    type: "submit_loan_terms",
    capitalInitial: 100000,
    tauxNominal: 0.02,
    dureeMois: 240,
    datePremiereMensualite: "2022-01-01",
  });
  turn = await assistant.handle(turn.state, { type: "set_insurance", assuranceType: "bancaire" });
  turn = await assistant.handle(turn.state, { type: "set_guarantee", typeGarantie: "aucune" });
  turn = await assistant.handle(turn.state, { type: "set_fees", souscritCetExercice: false });
  turn = await assistant.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
  return turn.state;
}

/** Un prêt amortissable confirmé jusqu'à `aggregate_review`, avec des paramètres personnalisables. */
async function driveToConfirmedLoan(
  assistant: F011FinancementAssistant,
  overrides: {
    typePret?: "amortissable" | "in_fine";
    capitalInitial?: number;
    tauxNominal?: number;
    dureeMois?: number;
    assuranceType?: "bancaire" | "externe";
    assuranceAnnuelle?: number;
  } = {},
): Promise<F011State> {
  let turn = await assistant.handle(assistant.start().state, { type: "set_presence_emprunt", presence: true });
  turn = await assistant.handle(turn.state, { type: "set_nombre_prets", count: 1 });
  turn = await assistant.handle(turn.state, { type: "choose_loan_source", source: "manual" });
  turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: overrides.typePret ?? "amortissable" });
  turn = await assistant.handle(turn.state, {
    type: "submit_loan_terms",
    capitalInitial: overrides.capitalInitial ?? 100000,
    tauxNominal: overrides.tauxNominal ?? 0.02,
    dureeMois: overrides.dureeMois ?? 240,
    datePremiereMensualite: "2022-01-01",
  });
  turn = await assistant.handle(
    turn.state,
    overrides.assuranceType === "externe"
      ? { type: "set_insurance", assuranceType: "externe", assuranceAnnuelle: overrides.assuranceAnnuelle }
      : { type: "set_insurance", assuranceType: "bancaire" },
  );
  turn = await assistant.handle(turn.state, { type: "set_guarantee", typeGarantie: "aucune" });
  turn = await assistant.handle(turn.state, { type: "set_fees", souscritCetExercice: false });
  turn = await assistant.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
  turn = await assistant.handle(turn.state, { type: "confirm_loan" });
  return turn.state;
}

describe("F-011 — Cycle 3 : GO_BACK et correction", () => {
  it("A — GO_BACK à chaque étape retrace exactement la séquence inverse", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const atLoanReview = await driveToLoanReview(assistant);
    assert.equal(atLoanReview.step, "loan_review");

    const expectedSequence: F011Step[] = [
      "loan_ira",
      "loan_fees",
      "loan_guarantee",
      "loan_insurance",
      "loan_collect",
      "loan_type",
      "loan_source_choice",
      "nombre_prets",
      "presence_emprunt",
    ];

    let state = atLoanReview;
    const visited: F011Step[] = [];
    for (let i = 0; i < expectedSequence.length; i += 1) {
      const turn = await assistant.handle(state, { type: "go_back" });
      visited.push(turn.state.step);
      state = turn.state;
    }
    assert.deepEqual(visited, expectedSequence);

    // Historique épuisé — un GO_BACK de plus ne fait rien (pas de crash, pas de reset).
    const noop = await assistant.handle(state, { type: "go_back" });
    assert.equal(noop.state.step, "presence_emprunt");
  });

  it("prêt 2 → retour vers prêt 1 : les données du prêt 2 ne sont jamais perdues définitivement", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    let turn = await assistant.handle(assistant.start().state, { type: "set_presence_emprunt", presence: true });
    turn = await assistant.handle(turn.state, { type: "set_nombre_prets", count: 2 });
    turn = await assistant.handle(turn.state, { type: "choose_loan_source", source: "manual" });
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    turn = await assistant.handle(turn.state, {
      type: "submit_loan_terms",
      capitalInitial: 100000,
      tauxNominal: 0.02,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-01",
    });
    turn = await assistant.handle(turn.state, { type: "set_insurance", assuranceType: "bancaire" });
    turn = await assistant.handle(turn.state, { type: "set_guarantee", typeGarantie: "aucune" });
    turn = await assistant.handle(turn.state, { type: "set_fees", souscritCetExercice: false });
    turn = await assistant.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
    turn = await assistant.handle(turn.state, { type: "confirm_loan" });
    assert.equal(turn.state.step, "loan_source_choice", "Cycle 5 : chaque prêt recommence par le choix document/manuel");
    assert.equal(turn.state.currentLoanIndex, 1);
    assert.equal(turn.state.loans.length, 1, "prêt 1 confirmé");

    // Prêt 2 : on avance un peu (choix manuel, type, montants) puis on revient en arrière.
    turn = await assistant.handle(turn.state, { type: "choose_loan_source", source: "manual" });
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "in_fine" });
    turn = await assistant.handle(turn.state, {
      type: "submit_loan_terms",
      capitalInitial: 50000,
      tauxNominal: 0.03,
      dureeMois: 120,
      datePremiereMensualite: "2022-06-01",
    });
    assert.equal(turn.state.step, "loan_insurance");
    assert.equal(turn.state.pendingLoan?.capitalInitial, 50000, "les données du prêt 2 existent bien avant le retour");

    // GO_BACK plusieurs fois jusqu'à revenir sur le prêt 1 (loan_review, non confirmé de nouveau).
    turn = await assistant.handle(turn.state, { type: "go_back" }); // -> loan_collect (prêt 2)
    turn = await assistant.handle(turn.state, { type: "go_back" }); // -> loan_type (prêt 2)
    turn = await assistant.handle(turn.state, { type: "go_back" }); // -> loan_source_choice (prêt 2)
    turn = await assistant.handle(turn.state, { type: "go_back" }); // -> loan_review (prêt 1, "dé-confirmé")

    assert.equal(turn.state.step, "loan_review");
    assert.equal(turn.state.currentLoanIndex, 0);
    assert.equal(turn.state.loans.length, 0, "prêt 1 est ressorti de `loans` pour redevenir modifiable");
    assert.equal(turn.state.pendingLoan?.capitalInitial, 100000, "prêt 1 restauré intact");
  });

  it("B — correction du capital : le résultat change et reflète le nouveau montant", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const before = await driveToConfirmedLoan(assistant, { capitalInitial: 100000 });
    const pretId = before.loans[0]!.pretId;
    const oldTotal = before.result?.charges.totalChargesFinancementExercice;
    assert.ok(oldTotal);

    let turn = await assistant.handle(before, { type: "edit_loan", pretId });
    assert.equal(turn.state.step, "loan_type");
    assert.equal(turn.state.pendingLoan?.capitalInitial, 100000, "les anciennes valeurs sont pré-remplies");

    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    turn = await assistant.handle(turn.state, {
      type: "submit_loan_terms",
      capitalInitial: 200000, // ← correction
      tauxNominal: 0.02,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-01",
    });
    turn = await assistant.handle(turn.state, { type: "set_insurance", assuranceType: "bancaire" });
    turn = await assistant.handle(turn.state, { type: "set_guarantee", typeGarantie: "aucune" });
    turn = await assistant.handle(turn.state, { type: "set_fees", souscritCetExercice: false });
    turn = await assistant.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
    turn = await assistant.handle(turn.state, { type: "confirm_loan" });

    assert.equal(turn.state.step, "aggregate_review");
    assert.equal(turn.state.loans.length, 1, "toujours un seul prêt, corrigé — pas dupliqué");
    const newTotal = turn.state.result?.charges.totalChargesFinancementExercice;
    assert.notEqual(newTotal, oldTotal);
    assert.ok(
      newTotal! > oldTotal! * 1.9,
      "capital doublé → intérêts environ doublés (léger écart d'arrondi mensuel toléré)",
    );
  });

  it("C — correction du taux : le résultat change en conséquence", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const before = await driveToConfirmedLoan(assistant, { typePret: "in_fine", capitalInitial: 120000, tauxNominal: 0.02 });
    const pretId = before.loans[0]!.pretId;
    assert.equal(before.result?.charges.totalChargesFinancementExercice, 2400);

    let turn = await assistant.handle(before, { type: "edit_loan", pretId });
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "in_fine" });
    turn = await assistant.handle(turn.state, {
      type: "submit_loan_terms",
      capitalInitial: 120000,
      tauxNominal: 0.04, // ← correction (doublé)
      dureeMois: 240,
      datePremiereMensualite: "2022-01-01",
    });
    turn = await assistant.handle(turn.state, { type: "set_insurance", assuranceType: "bancaire" });
    turn = await assistant.handle(turn.state, { type: "set_guarantee", typeGarantie: "aucune" });
    turn = await assistant.handle(turn.state, { type: "set_fees", souscritCetExercice: false });
    turn = await assistant.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
    turn = await assistant.handle(turn.state, { type: "confirm_loan" });

    assert.equal(turn.state.result?.charges.totalChargesFinancementExercice, 4800);
  });

  it("D — correction de la durée : recalcule un échéancier différent", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const before = await driveToConfirmedLoan(assistant, { capitalInitial: 100000, tauxNominal: 0.02, dureeMois: 240 });
    const pretId = before.loans[0]!.pretId;
    const oldCrd = before.result?.charges.prets[0]?.capitalRestantDu31_12;

    let turn = await assistant.handle(before, { type: "edit_loan", pretId });
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    turn = await assistant.handle(turn.state, {
      type: "submit_loan_terms",
      capitalInitial: 100000,
      tauxNominal: 0.02,
      dureeMois: 120, // ← correction (durée divisée par 2)
      datePremiereMensualite: "2022-01-01",
    });
    turn = await assistant.handle(turn.state, { type: "set_insurance", assuranceType: "bancaire" });
    turn = await assistant.handle(turn.state, { type: "set_guarantee", typeGarantie: "aucune" });
    turn = await assistant.handle(turn.state, { type: "set_fees", souscritCetExercice: false });
    turn = await assistant.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
    turn = await assistant.handle(turn.state, { type: "confirm_loan" });

    const newCrd = turn.state.result?.charges.prets[0]?.capitalRestantDu31_12;
    assert.notEqual(newCrd, oldCrd, "un prêt sur 120 mois s'amortit plus vite qu'un prêt sur 240 mois");
    assert.ok(newCrd! < oldCrd!);
  });

  it("E — correction du type de prêt (amortissable → in fine) : change la formule appliquée", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const before = await driveToConfirmedLoan(assistant, {
      typePret: "amortissable",
      capitalInitial: 120000,
      tauxNominal: 0.02,
      dureeMois: 240,
    });
    const pretId = before.loans[0]!.pretId;
    assert.ok(
      (before.result?.charges.prets[0]?.capitalRembourseExercice ?? 0) > 0,
      "amortissable : du capital est remboursé",
    );

    let turn = await assistant.handle(before, { type: "edit_loan", pretId });
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "in_fine" }); // ← correction
    turn = await assistant.handle(turn.state, {
      type: "submit_loan_terms",
      capitalInitial: 120000,
      tauxNominal: 0.02,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-01",
    });
    turn = await assistant.handle(turn.state, { type: "set_insurance", assuranceType: "bancaire" });
    turn = await assistant.handle(turn.state, { type: "set_guarantee", typeGarantie: "aucune" });
    turn = await assistant.handle(turn.state, { type: "set_fees", souscritCetExercice: false });
    turn = await assistant.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
    turn = await assistant.handle(turn.state, { type: "confirm_loan" });

    assert.equal(turn.state.result?.charges.prets[0]?.typePret, "in_fine");
    assert.equal(turn.state.result?.charges.prets[0]?.capitalRembourseExercice, 0, "in fine : plus aucun capital remboursé");
    assert.equal(turn.state.result?.charges.prets[0]?.interetsEmpruntExercice, 2400);
  });

  it("F — correction de l'assurance (bancaire → externe) : ajoute la charge déductible manquante", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const before = await driveToConfirmedLoan(assistant, { capitalInitial: 100000, assuranceType: "bancaire" });
    const pretId = before.loans[0]!.pretId;
    assert.equal(before.result?.charges.totalAssurance, 0);

    let turn = await assistant.handle(before, { type: "edit_loan", pretId });
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    turn = await assistant.handle(turn.state, {
      type: "submit_loan_terms",
      capitalInitial: 100000,
      tauxNominal: 0.02,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-01",
    });
    turn = await assistant.handle(turn.state, { type: "set_insurance", assuranceType: "externe", assuranceAnnuelle: 240 }); // ← correction
    turn = await assistant.handle(turn.state, { type: "set_guarantee", typeGarantie: "aucune" });
    turn = await assistant.handle(turn.state, { type: "set_fees", souscritCetExercice: false });
    turn = await assistant.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
    turn = await assistant.handle(turn.state, { type: "confirm_loan" });

    assert.equal(turn.state.result?.charges.totalAssurance, 240);
  });

  it("G — recalcul systématique : jamais le même objet résultat réutilisé après correction", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const before = await driveToConfirmedLoan(assistant, { capitalInitial: 100000 });
    const pretId = before.loans[0]!.pretId;
    const oldResultRef = before.result;

    let turn = await assistant.handle(before, { type: "edit_loan", pretId });
    assert.equal(turn.state.result, undefined, "le résultat est invalidé dès l'ouverture de la correction");
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    turn = await assistant.handle(turn.state, {
      type: "submit_loan_terms",
      capitalInitial: 150000,
      tauxNominal: 0.02,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-01",
    });
    turn = await assistant.handle(turn.state, { type: "set_insurance", assuranceType: "bancaire" });
    turn = await assistant.handle(turn.state, { type: "set_guarantee", typeGarantie: "aucune" });
    turn = await assistant.handle(turn.state, { type: "set_fees", souscritCetExercice: false });
    turn = await assistant.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
    turn = await assistant.handle(turn.state, { type: "confirm_loan" });

    assert.notEqual(turn.state.result, oldResultRef, "nouvel objet résultat, jamais l'ancien réutilisé");
  });

  it("H — conservation des autres prêts : corriger le prêt 1 laisse le prêt 2 intact", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    let turn = await assistant.handle(assistant.start().state, { type: "set_presence_emprunt", presence: true });
    turn = await assistant.handle(turn.state, { type: "set_nombre_prets", count: 2 });
    // Prêt 1
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    turn = await assistant.handle(turn.state, {
      type: "submit_loan_terms",
      capitalInitial: 100000,
      tauxNominal: 0.02,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-01",
    });
    turn = await assistant.handle(turn.state, { type: "set_insurance", assuranceType: "bancaire" });
    turn = await assistant.handle(turn.state, { type: "set_guarantee", typeGarantie: "aucune" });
    turn = await assistant.handle(turn.state, { type: "set_fees", souscritCetExercice: false });
    turn = await assistant.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
    turn = await assistant.handle(turn.state, { type: "confirm_loan" });
    // Prêt 2
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "in_fine" });
    turn = await assistant.handle(turn.state, {
      type: "submit_loan_terms",
      capitalInitial: 50000,
      tauxNominal: 0.03,
      dureeMois: 120,
      datePremiereMensualite: "2022-01-01",
    });
    turn = await assistant.handle(turn.state, { type: "set_insurance", assuranceType: "bancaire" });
    turn = await assistant.handle(turn.state, { type: "set_guarantee", typeGarantie: "aucune" });
    turn = await assistant.handle(turn.state, { type: "set_fees", souscritCetExercice: false });
    turn = await assistant.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
    turn = await assistant.handle(turn.state, { type: "confirm_loan" });
    assert.equal(turn.state.step, "aggregate_review");
    assert.equal(turn.state.loans.length, 2);
    const pret1Id = turn.state.loans.find((l) => l.capitalInitial === 100000)!.pretId;
    const pret2Snapshot = turn.state.loans.find((l) => l.capitalInitial === 50000);
    assert.ok(pret2Snapshot);

    // Corrige uniquement le prêt 1.
    turn = await assistant.handle(turn.state, { type: "edit_loan", pretId: pret1Id });
    assert.equal(turn.state.loans.length, 1, "seul le prêt 1 est retiré pour édition");
    assert.deepEqual(turn.state.loans[0], pret2Snapshot, "le prêt 2 n'est ni modifié ni recréé");

    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    turn = await assistant.handle(turn.state, {
      type: "submit_loan_terms",
      capitalInitial: 999999,
      tauxNominal: 0.02,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-01",
    });
    turn = await assistant.handle(turn.state, { type: "set_insurance", assuranceType: "bancaire" });
    turn = await assistant.handle(turn.state, { type: "set_guarantee", typeGarantie: "aucune" });
    turn = await assistant.handle(turn.state, { type: "set_fees", souscritCetExercice: false });
    turn = await assistant.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
    turn = await assistant.handle(turn.state, { type: "confirm_loan" });

    assert.equal(turn.state.step, "aggregate_review");
    assert.equal(turn.state.loans.length, 2, "les deux prêts sont bien présents après la correction");
    const stillHasPret2 = turn.state.loans.some((l) => l.capitalInitial === 50000 && l.pretId === pret2Snapshot!.pretId);
    assert.ok(stillHasPret2, "le prêt 2 a survécu intact à la correction du prêt 1");
  });

  it("I — correction + refresh : la persistance capture l'état corrigé, pas l'ancien", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const before = await driveToConfirmedLoan(assistant, { capitalInitial: 100000 });
    const pretId = before.loans[0]!.pretId;

    let turn = await assistant.handle(before, { type: "edit_loan", pretId });
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    turn = await assistant.handle(turn.state, {
      type: "submit_loan_terms",
      capitalInitial: 175000,
      tauxNominal: 0.02,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-01",
    });
    // Refresh en plein milieu de la correction, avant la fin des compléments.
    const persisted: F011PersistedState = toF011PersistedState(turn.state, TS);
    assert.equal(persisted.step, "loan_insurance");
    assert.equal(persisted.pendingLoan?.capitalInitial, 175000);
    assert.equal(persisted.loans.length, 0, "le prêt en cours de correction n'est plus dans `loans`");

    const resumed = assistant.resume(persisted);
    assert.equal(resumed.state.step, "loan_insurance");
    assert.equal(resumed.state.pendingLoan?.capitalInitial, 175000, "la correction en cours survit au refresh");
  });

  it("J — GO_BACK + refresh : la persistance capture la position après le retour arrière", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const atLoanReview = await driveToLoanReview(assistant);
    let turn = await assistant.handle(atLoanReview, { type: "go_back" }); // -> loan_ira
    turn = await assistant.handle(turn.state, { type: "go_back" }); // -> loan_fees
    assert.equal(turn.state.step, "loan_fees");

    const persisted = toF011PersistedState(turn.state, TS);
    assert.equal(persisted.step, "loan_fees");
    assert.equal(persisted.history?.length, 7, "7 transitions restent au-dessus de loan_fees dans l'historique");

    const resumed = assistant.resume(persisted);
    assert.equal(resumed.state.step, "loan_fees", "la reprise retombe exactement sur la même position logique");
    assert.equal(resumed.state.history?.length, 7, "l'historique de GO_BACK survit lui aussi au refresh");
  });

  it("K — aucun dead-end : chaque étape non terminale offre une suite (suggestion ou formulaire)", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const stepsWithSuggestions: F011Step[] = [];
    const stepsWithForm: F011Step[] = ["loan_collect"];

    let turn = await assistant.handle(assistant.start().state, { type: "set_presence_emprunt", presence: true });
    stepsWithSuggestions.push(turn.state.step); // nombre_prets
    turn = await assistant.handle(turn.state, { type: "set_nombre_prets", count: 1 });
    stepsWithSuggestions.push(turn.state.step); // loan_source_choice
    turn = await assistant.handle(turn.state, { type: "choose_loan_source", source: "manual" });
    stepsWithSuggestions.push(turn.state.step); // loan_type
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    // loan_collect -> formulaire, pas de suggestions attendues sur ce message précis
    turn = await assistant.handle(turn.state, {
      type: "submit_loan_terms",
      capitalInitial: 100000,
      tauxNominal: 0.02,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-01",
    });
    stepsWithSuggestions.push(turn.state.step); // loan_insurance
    turn = await assistant.handle(turn.state, { type: "set_insurance", assuranceType: "bancaire" });
    stepsWithSuggestions.push(turn.state.step); // loan_guarantee
    turn = await assistant.handle(turn.state, { type: "set_guarantee", typeGarantie: "aucune" });
    stepsWithSuggestions.push(turn.state.step); // loan_fees
    turn = await assistant.handle(turn.state, { type: "set_fees", souscritCetExercice: false });
    stepsWithSuggestions.push(turn.state.step); // loan_ira
    turn = await assistant.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
    // loan_review -> suggestion "Valider ce prêt"
    assert.ok(turn.messages.at(-1)?.suggestions?.some((s) => s.id === "confirm_loan"));
    turn = await assistant.handle(turn.state, { type: "confirm_loan" });
    // aggregate_review -> suggestion "Oui, je valide" (+ modifier)
    assert.ok(turn.messages.at(-1)?.suggestions?.some((s) => s.id === "confirm_all"));

    assert.deepEqual(stepsWithSuggestions, [
      "nombre_prets",
      "loan_source_choice",
      "loan_type",
      "loan_insurance",
      "loan_guarantee",
      "loan_fees",
      "loan_ira",
    ]);
    assert.deepEqual(stepsWithForm, ["loan_collect"], "loan_collect avance via le formulaire numérique, pas une suggestion");
  });

  it("L — date de mise en service absente : GO_BACK depuis le blocage fonctionne sans planter", async () => {
    const assistant = new F011FinancementAssistant(ctx, {});
    const start = assistant.start();
    const blocked = await assistant.handle(start.state, { type: "set_presence_emprunt", presence: true });
    assert.equal(blocked.state.step, "blocked_missing_date");

    const back = await assistant.handle(blocked.state, { type: "go_back" });
    assert.equal(back.state.step, "presence_emprunt", "retour possible même bloqué — non terminal");
  });

  it("M — plusieurs prêts : corriger un prêt sur trois n'affecte que lui dans le total agrégé", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    let turn = await assistant.handle(assistant.start().state, { type: "set_presence_emprunt", presence: true });
    turn = await assistant.handle(turn.state, { type: "set_nombre_prets", count: 2 });

    for (const capital of [100000, 50000]) {
      turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "in_fine" });
      turn = await assistant.handle(turn.state, {
        type: "submit_loan_terms",
        capitalInitial: capital,
        tauxNominal: 0.02,
        dureeMois: 240,
        datePremiereMensualite: "2022-01-01",
      });
      turn = await assistant.handle(turn.state, { type: "set_insurance", assuranceType: "bancaire" });
      turn = await assistant.handle(turn.state, { type: "set_guarantee", typeGarantie: "aucune" });
      turn = await assistant.handle(turn.state, { type: "set_fees", souscritCetExercice: false });
      turn = await assistant.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
      turn = await assistant.handle(turn.state, { type: "confirm_loan" });
    }
    assert.equal(turn.state.step, "aggregate_review");
    // 100000×2% + 50000×2% = 2000 + 1000 = 3000
    assert.equal(turn.state.result?.charges.totalChargesFinancementExercice, 3000);

    const pret2Id = turn.state.loans.find((l) => l.capitalInitial === 50000)!.pretId;
    turn = await assistant.handle(turn.state, { type: "edit_loan", pretId: pret2Id });
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "in_fine" });
    turn = await assistant.handle(turn.state, {
      type: "submit_loan_terms",
      capitalInitial: 200000, // ← correction du prêt 2 uniquement
      tauxNominal: 0.02,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-01",
    });
    turn = await assistant.handle(turn.state, { type: "set_insurance", assuranceType: "bancaire" });
    turn = await assistant.handle(turn.state, { type: "set_guarantee", typeGarantie: "aucune" });
    turn = await assistant.handle(turn.state, { type: "set_fees", souscritCetExercice: false });
    turn = await assistant.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
    turn = await assistant.handle(turn.state, { type: "confirm_loan" });

    // 100000×2% (prêt 1, inchangé) + 200000×2% (prêt 2, corrigé) = 2000 + 4000 = 6000
    assert.equal(turn.state.result?.charges.totalChargesFinancementExercice, 6000);
  });
});
