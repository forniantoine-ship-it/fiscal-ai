import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F011FinancementAssistant } from "./assistant";
import type { F011Deps, F011PersistedState, F011State } from "./types";
import { toF011PersistedState } from "./types";

const ctx = { dossierId: "test", fiscalYear: 2022, route: "/assistants/financement" };
const DEPS_OK: F011Deps = { dateMiseEnService: "2021-01-01" };
const TS = "2024-07-01T09:00:00.000Z";

/** Un prêt manuel amortissable minimal, jusqu'à `confirm_loan`. */
async function submitLoanAndConfirm(
  assistant: F011FinancementAssistant,
  state: F011State,
  capitalInitial: number,
): Promise<F011State> {
  let turn = await assistant.handle(state, { type: "choose_loan_source", source: "manual" });
  turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
  turn = await assistant.handle(turn.state, {
    type: "submit_loan_terms",
    capitalInitial,
    tauxNominal: 0.02,
    dureeMois: 240,
    datePremiereMensualite: "2022-01-01",
  });
  turn = await assistant.handle(turn.state, { type: "set_insurance", assuranceType: "bancaire" });
  turn = await assistant.handle(turn.state, { type: "set_guarantee", typeGarantie: "aucune" });
  turn = await assistant.handle(turn.state, { type: "set_fees", souscritCetExercice: false });
  turn = await assistant.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
  turn = await assistant.handle(turn.state, { type: "confirm_loan" });
  return turn.state;
}

/** N prêts manuels amortissables confirmés, avec des capitaux distincts (100000, 200000, ...). */
async function driveToNConfirmedLoans(assistant: F011FinancementAssistant, count: number): Promise<F011State> {
  let turn = await assistant.handle(assistant.start().state, { type: "set_presence_emprunt", presence: true });
  turn = await assistant.handle(turn.state, { type: "set_nombre_prets", count });
  let state = turn.state;
  for (let i = 1; i <= count; i += 1) {
    state = await submitLoanAndConfirm(assistant, state, i * 100000);
  }
  return state;
}

/**
 * Édite un prêt existant en resoumettant exactement les mêmes valeurs.
 * `edit_loan` place `pendingLoan = {...target}` : les 4 champs cœur et le
 * type sont donc déjà connus, et `set_loan_type` route directement vers
 * `loan_insurance` (le resolver saute `loan_collect`, comme confirmé en QA
 * navigateur) — ne jamais soumettre `submit_loan_terms` dans ce chemin.
 */
async function editLoanKeepingSameValues(
  assistant: F011FinancementAssistant,
  state: F011State,
  pretId: string,
): Promise<F011State> {
  const target = state.loans.find((l) => l.pretId === pretId);
  assert.ok(target, `prêt ${pretId} introuvable avant édition`);
  let turn = await assistant.handle(state, { type: "edit_loan", pretId });
  assert.equal(turn.state.step, "loan_type");
  turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: target!.typePret });
  assert.equal(turn.state.step, "loan_insurance", "les 4 champs cœur déjà connus font sauter loan_collect");
  turn = await assistant.handle(turn.state, {
    type: "set_insurance",
    assuranceType: target!.assuranceType ?? "bancaire",
    assuranceAnnuelle: target!.assuranceAnnuelle,
  });
  turn = await assistant.handle(turn.state, {
    type: "set_guarantee",
    typeGarantie: target!.typeGarantie ?? "aucune",
    commissionCaution: target!.commissionCaution,
  });
  turn = await assistant.handle(turn.state, {
    type: "set_fees",
    souscritCetExercice: target!.souscritCetExercice ?? false,
    fraisDossier: target!.fraisDossier,
  });
  turn = await assistant.handle(turn.state, {
    type: "set_ira",
    remboursementAnticipe: target!.remboursementAnticipeCetExercice ?? false,
    montant: target!.iraMontant,
  });
  turn = await assistant.handle(turn.state, { type: "confirm_loan" });
  return turn.state;
}

describe("F-011 — correctif stabilité pretId (Cycle 10)", () => {
  it("A — deux prêts confirmés : pretId distincts", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToNConfirmedLoans(assistant, 2);
    assert.equal(state.step, "aggregate_review");
    const ids = state.loans.map((l) => l.pretId);
    assert.equal(new Set(ids).size, 2, "deux pretId distincts attendus");
  });

  it("B — trois prêts confirmés : pretId distincts", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToNConfirmedLoans(assistant, 3);
    const ids = state.loans.map((l) => l.pretId);
    assert.equal(new Set(ids).size, 3, "trois pretId distincts attendus");
  });

  it("C — éditer le prêt 1 (non-terminal) conserve son pretId d'origine", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToNConfirmedLoans(assistant, 3);
    const pret1Id = state.loans.find((l) => l.capitalInitial === 100000)!.pretId;

    const after = await editLoanKeepingSameValues(assistant, state, pret1Id);
    assert.equal(after.step, "aggregate_review");
    const edited = after.loans.find((l) => l.capitalInitial === 100000);
    assert.equal(edited?.pretId, pret1Id, "le pretId ne doit jamais changer après édition");
  });

  it("D — éditer le prêt 2 (au milieu) conserve son pretId d'origine", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToNConfirmedLoans(assistant, 3);
    const pret2Id = state.loans.find((l) => l.capitalInitial === 200000)!.pretId;

    const after = await editLoanKeepingSameValues(assistant, state, pret2Id);
    const edited = after.loans.find((l) => l.capitalInitial === 200000);
    assert.equal(edited?.pretId, pret2Id);
  });

  it("E — éditer le prêt 3 (dernier) conserve son pretId d'origine", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToNConfirmedLoans(assistant, 3);
    const pret3Id = state.loans.find((l) => l.capitalInitial === 300000)!.pretId;

    const after = await editLoanKeepingSameValues(assistant, state, pret3Id);
    const edited = after.loans.find((l) => l.capitalInitial === 300000);
    assert.equal(edited?.pretId, pret3Id);
  });

  it("F — aucun doublon de pretId après édition de chaque prêt, l'un après l'autre", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    let state = await driveToNConfirmedLoans(assistant, 3);
    const originalIds = state.loans.map((l) => l.pretId);

    for (const pretId of originalIds) {
      state = await editLoanKeepingSameValues(assistant, state, pretId);
      const ids = state.loans.map((l) => l.pretId);
      assert.equal(new Set(ids).size, 3, `aucun doublon après édition de ${pretId}`);
      assert.deepEqual(new Set(ids), new Set(originalIds), "les mêmes trois identités survivent à chaque édition");
    }
  });

  it("G — find par pretId retrouve bien le prêt réellement modifié après édition", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToNConfirmedLoans(assistant, 2);
    const pret1Id = state.loans.find((l) => l.capitalInitial === 100000)!.pretId;

    // Édite le prêt 1 avec une vraie modification cette fois (durée changée).
    let turn = await assistant.handle(state, { type: "edit_loan", pretId: pret1Id });
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    assert.equal(turn.state.step, "loan_insurance");
    turn = await assistant.handle(turn.state, { type: "set_insurance", assuranceType: "bancaire" });
    turn = await assistant.handle(turn.state, { type: "set_guarantee", typeGarantie: "aucune" });
    turn = await assistant.handle(turn.state, { type: "set_fees", souscritCetExercice: false });
    turn = await assistant.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
    turn = await assistant.handle(turn.state, { type: "confirm_loan" });

    const foundByOriginalId = turn.state.loans.find((l) => l.pretId === pret1Id);
    assert.ok(foundByOriginalId, "le pretId d'origine doit toujours retrouver un prêt");
    assert.equal(foundByOriginalId?.capitalInitial, 100000, "c'est bien le prêt 1 (pas le 2) qui est retrouvé");
    const pret2 = turn.state.loans.find((l) => l.capitalInitial === 200000);
    assert.notEqual(pret2?.pretId, pret1Id, "le prêt 2 garde une identité distincte");
  });

  it("H — totaux inchangés après édition d'un prêt sans aucune modification de valeur", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToNConfirmedLoans(assistant, 3);
    const totalBefore = state.result?.charges.totalChargesFinancementExercice;
    assert.ok(totalBefore !== undefined);

    const pret2Id = state.loans.find((l) => l.capitalInitial === 200000)!.pretId;
    const afterEdit = await editLoanKeepingSameValues(assistant, state, pret2Id);
    assert.equal(afterEdit.result?.charges.totalChargesFinancementExercice, totalBefore, "total recalculé identique");
  });

  it("Intégration — 3 prêts, éditer chacun successivement, jamais de perte ni de mélange", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    let state = await driveToNConfirmedLoans(assistant, 3);
    assert.equal(state.loans.length, 3);

    const [id1, id2, id3] = state.loans.map((l) => l.pretId);

    state = await editLoanKeepingSameValues(assistant, state, id1!);
    assert.equal(state.loans.length, 3, "toujours 3 prêts après édition du 1er");

    state = await editLoanKeepingSameValues(assistant, state, id2!);
    assert.equal(state.loans.length, 3, "toujours 3 prêts après édition du 2e");

    state = await editLoanKeepingSameValues(assistant, state, id3!);
    assert.equal(state.loans.length, 3, "toujours 3 prêts après édition du 3e");

    const finalIds = state.loans.map((l) => l.pretId);
    assert.deepEqual(new Set(finalIds), new Set([id1, id2, id3]), "les trois identités d'origine survivent intactes");
    assert.equal(
      state.loans.find((l) => l.pretId === id1)?.capitalInitial,
      100000,
      "chaque pretId pointe toujours vers le bon capital",
    );
    assert.equal(state.loans.find((l) => l.pretId === id2)?.capitalInitial, 200000);
    assert.equal(state.loans.find((l) => l.pretId === id3)?.capitalInitial, 300000);
  });
});

describe("F-011 — correctif reset UI après changement du nombre de prêts (Cycle 10)", () => {
  it("I — set_nombre_prets incrémente loanFormGeneration à chaque appel", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    let turn = await assistant.handle(assistant.start().state, { type: "set_presence_emprunt", presence: true });
    assert.equal(turn.state.loanFormGeneration, 0);

    turn = await assistant.handle(turn.state, { type: "set_nombre_prets", count: 1 });
    assert.equal(turn.state.loanFormGeneration, 1);

    // Retour en arrière jusqu'à "Combien de prêts", puis nouveau choix — le
    // scénario exact du bug rapporté : `currentLoanIndex` retombe à 0 les
    // deux fois, seule `loanFormGeneration` distingue les deux tentatives.
    turn = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(turn.state.currentLoanIndex, 0);
    turn = await assistant.handle(turn.state, { type: "set_nombre_prets", count: 2 });
    assert.equal(turn.state.currentLoanIndex, 0, "même index qu'avant — c'est précisément l'ambiguïté à lever");
    assert.equal(turn.state.loanFormGeneration, 2, "génération différente malgré l'index identique");
  });

  it("J — GO_BACK au sein du même prêt ne touche jamais loanFormGeneration", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    let turn = await assistant.handle(assistant.start().state, { type: "set_presence_emprunt", presence: true });
    turn = await assistant.handle(turn.state, { type: "set_nombre_prets", count: 1 });
    const generationAfterCount = turn.state.loanFormGeneration;

    turn = await assistant.handle(turn.state, { type: "choose_loan_source", source: "manual" });
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    turn = await assistant.handle(turn.state, {
      type: "submit_loan_terms",
      capitalInitial: 100000,
      tauxNominal: 0.02,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-01",
    });
    turn = await assistant.handle(turn.state, { type: "go_back" }); // -> loan_collect
    assert.equal(turn.state.step, "loan_collect");
    assert.equal(turn.state.loanFormGeneration, generationAfterCount, "GO_BACK ne fait jamais évoluer la génération");
  });

  it("K — edit_loan : pendingLoan porte des valeurs réelles (préremplissage possible)", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToNConfirmedLoans(assistant, 1);
    const pretId = state.loans[0]!.pretId;
    const turn = await assistant.handle(state, { type: "edit_loan", pretId });
    assert.equal(turn.state.pendingLoan?.capitalInitial, 100000);
    assert.equal(turn.state.pendingLoan?.pretId, pretId, "l'identité d'origine est déjà portée avant même la resoumission");
  });

  it("L — persistence : pretId et loanFormGeneration survivent à toF011PersistedState/resume", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    let turn = await assistant.handle(assistant.start().state, { type: "set_presence_emprunt", presence: true });
    turn = await assistant.handle(turn.state, { type: "set_nombre_prets", count: 2 });
    turn = await assistant.handle(turn.state, { type: "set_nombre_prets", count: 1 });
    assert.equal(turn.state.loanFormGeneration, 2);

    const state = await driveToNConfirmedLoans(assistant, 2);
    const persisted: F011PersistedState = toF011PersistedState(state, TS);
    assert.equal(persisted.loans.map((l) => l.pretId).length, new Set(persisted.loans.map((l) => l.pretId)).size);
    assert.equal(persisted.loanFormGeneration, state.loanFormGeneration);

    const resumed = assistant.resume(persisted);
    assert.equal(resumed.state.loanFormGeneration, state.loanFormGeneration, "génération conservée après reprise");
    assert.deepEqual(
      resumed.state.loans.map((l) => l.pretId),
      state.loans.map((l) => l.pretId),
      "identités des prêts conservées après reprise",
    );
  });

  it("L bis — resume() sur un état persisté avant ce correctif (loanFormGeneration absent) retombe sur 0", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToNConfirmedLoans(assistant, 1);
    const persisted = toF011PersistedState(state, TS);
    const legacyPersisted: F011PersistedState = { ...persisted };
    delete legacyPersisted.loanFormGeneration;
    const resumed = assistant.resume(legacyPersisted);
    assert.equal(resumed.state.loanFormGeneration, 0, "jamais undefined, jamais une erreur — repli explicite sur 0");
  });
});
