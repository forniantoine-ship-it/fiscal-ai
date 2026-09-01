import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F012ChargesAssistant } from "./assistant";
import { shouldResumeF012, toF012PersistedState } from "./types";
import type { F012Deps, F012PersistedState } from "./types";

const ctx = { dossierId: "test", fiscalYear: 2024, route: "/assistants/charges" };
const DEPS: F012Deps = { dateMiseEnService: "2023-01-01" };
const TS = "2024-03-01T10:00:00.000Z";

const PROFIL_LARGE = { copropriete: true, agence: true, travaux: true, vacance: false, comptable: false };
const PROFIL_SIMPLE = { copropriete: false, agence: false, travaux: false, vacance: false, comptable: false };

describe("F-012 — Cycle 2 : persistance et reprise", () => {
  it("A — profilage non soumis : rien à reprendre, une reprise éventuelle retomberait sur un simple départ", () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const state = assistant.start().state;
    const persisted = toF012PersistedState(state, TS);
    assert.equal(persisted.step, "profilage");
    assert.equal(shouldResumeF012(persisted), false);
  });

  it("B — après la première catégorie : la reprise retombe exactement sur le prompt taxe foncière", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const turn = await assistant.handle(assistant.start().state, {
      type: "submit_profilage",
      ...PROFIL_LARGE,
    });
    assert.equal(turn.state.step, "category_collect");
    assert.equal(turn.state.currentCategoryIndex, 0);

    const persisted = toF012PersistedState(turn.state, TS);
    assert.deepEqual(persisted.categoryInventory, [
      "taxe_fonciere",
      "assurance_pno",
      "copropriete",
      "honoraires_gestion",
      "travaux",
      "frais_bancaires",
      "divers",
    ]);
    assert.equal("result" in persisted, false);

    const resumed = assistant.resume(persisted);
    assert.equal(resumed.state.step, "category_collect");
    assert.equal(resumed.completed, false);
    assert.ok(resumed.messages.some((m) => m.content.includes("taxe foncière")));
    assert.ok(resumed.messages.some((m) => m.content.includes("une ou plusieurs taxes")));
  });

  it("C — plusieurs catégories renseignées : rien n'est perdu, la reprise redemande la 3e catégorie (copropriété)", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_LARGE });
    turn = await assistant.handle(turn.state, { type: "submit_taxe_fonciere", montant: 1200 });
    turn = await assistant.handle(turn.state, { type: "submit_assurance_pno", montant: 300 });
    assert.equal(turn.state.currentCategoryIndex, 2);

    const persisted = toF012PersistedState(turn.state, TS);
    assert.equal(persisted.collected.taxeFonciere, 1200);
    assert.equal(persisted.collected.assurancePno, 300);
    assert.equal(persisted.currentCategoryIndex, 2);

    const resumed = assistant.resume(persisted);
    assert.equal(resumed.state.step, "category_collect");
    assert.equal(resumed.state.collected.taxeFonciere, 1200, "la taxe foncière déjà saisie n'est jamais perdue");
    assert.equal(resumed.state.collected.assurancePno, 300, "l'assurance PNO déjà saisie n'est jamais perdue");
    assert.ok(resumed.messages.some((m) => /syndic|décompte annuel/i.test(m.content)));
  });

  it("D — travail en cours (description non soumise) : la reprise redemande la description", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_LARGE });
    turn = await assistant.handle(turn.state, { type: "skip_category" }); // taxe_fonciere
    turn = await assistant.handle(turn.state, { type: "skip_category" }); // assurance_pno
    turn = await assistant.handle(turn.state, { type: "skip_category" }); // copropriete
    turn = await assistant.handle(turn.state, { type: "skip_category" }); // honoraires_gestion
    assert.equal(turn.state.categoryInventory[turn.state.currentCategoryIndex], "travaux");
    turn = await assistant.handle(turn.state, { type: "start_travaux" });
    assert.equal(turn.state.travauxSubStep, "description");

    const persisted = toF012PersistedState(turn.state, TS);
    assert.equal(persisted.travauxSubStep, "description");

    const resumed = assistant.resume(persisted);
    assert.equal(resumed.state.travauxSubStep, "description");
    assert.ok(resumed.messages.some((m) => m.content.includes("Décrivez la dépense")));
  });

  it("E — qualification en attente : la reprise redemande la qualification, description et montant préservés", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_LARGE });
    for (let i = 0; i < 4; i++) turn = await assistant.handle(turn.state, { type: "skip_category" });
    turn = await assistant.handle(turn.state, { type: "start_travaux" });
    turn = await assistant.handle(turn.state, {
      type: "submit_travaux_description",
      description: "Remplacement chauffe-eau",
      montant: 900,
    });
    assert.equal(turn.state.travauxSubStep, "qualification");

    const persisted = toF012PersistedState(turn.state, TS);
    assert.equal(persisted.pendingTravaux?.description, "Remplacement chauffe-eau");
    assert.equal(persisted.pendingTravaux?.montant, 900);

    const resumed = assistant.resume(persisted);
    assert.equal(resumed.state.travauxSubStep, "qualification");
    assert.equal(resumed.state.pendingTravaux?.montant, 900, "le montant décrit avant le refresh n'est jamais perdu");
    const last = resumed.messages.at(-1);
    assert.ok(last?.suggestions?.some((s) => s.id === "amelioration"));
    assert.ok(last?.suggestions?.some((s) => s.id === "incertain"));
  });

  it("F — split en attente (facture mixte) : la reprise redemande la part remise en état", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_LARGE });
    for (let i = 0; i < 4; i++) turn = await assistant.handle(turn.state, { type: "skip_category" });
    turn = await assistant.handle(turn.state, { type: "start_travaux" });
    turn = await assistant.handle(turn.state, {
      type: "submit_travaux_description",
      description: "Rénovation salle de bain",
      montant: 12000,
    });
    turn = await assistant.handle(turn.state, { type: "submit_travaux_qualification", choix: "mixte" });
    assert.equal(turn.state.travauxSubStep, "split");

    const persisted = toF012PersistedState(turn.state, TS);
    assert.equal(persisted.pendingTravaux?.choix, "mixte");
    assert.equal("result" in persisted, false);

    const resumed = assistant.resume(persisted);
    assert.equal(resumed.state.travauxSubStep, "split");
    assert.equal(resumed.state.pendingTravaux?.description, "Rénovation salle de bain");
    assert.ok(resumed.messages.some((m) => m.content.includes("part remise en état")));
  });

  it("G — aggregate_review : le résultat est recalculé à l'identique, jamais rejoué depuis un blob figé", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "submit_taxe_fonciere", montant: 1200 });
    turn = await assistant.handle(turn.state, { type: "submit_assurance_pno", montant: 300 });
    turn = await assistant.handle(turn.state, { type: "skip_category" }); // frais_bancaires
    turn = await assistant.handle(turn.state, { type: "skip_category" }); // divers
    assert.equal(turn.state.step, "completeness");
    turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: false });
    assert.equal(turn.state.step, "aggregate_review");
    const liveTotal = turn.state.result?.charges.totalDeductible;
    assert.equal(liveTotal, 1500);

    const persisted = toF012PersistedState(turn.state, TS);
    assert.equal("result" in persisted, false, "aucun résultat n'est jamais persisté à cette étape");

    const resumed = assistant.resume(persisted);
    assert.equal(resumed.state.step, "aggregate_review");
    assert.equal(resumed.state.result?.charges.totalDeductible, liveTotal, "recalcul identique au tour vivant");
    assert.ok(resumed.messages.some((m) => m.suggestions?.some((s) => s.id === "confirm_all")));
  });

  it("H — complete : un état terminal ne déclenche jamais la reprise (relève du raccourci legacy)", () => {
    assert.equal(
      shouldResumeF012({
        step: "complete",
        categoryInventory: [],
        currentCategoryIndex: 0,
        collected: { coproLignes: [], travaux: [], divers: [], skippedCategories: [] },
        fieldSources: {},
        updatedAt: TS,
      }),
      false,
    );
  });

  it("I — ancien blob sans `chargesAssistantState` (dossier F-011 ou antérieur) : pas de crash, simple départ", () => {
    assert.equal(shouldResumeF012(undefined), false);
  });

  it("J — données inconnues ignorées : un blob avec des champs étrangers ne fait pas planter la reprise", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_LARGE });
    const persistedWithJunk = {
      ...toF012PersistedState(turn.state, TS),
      unknownFutureField: { anything: true },
      legacyDocumentBlob: "some-old-shape",
    } as unknown as F012PersistedState;

    const resumed = assistant.resume(persistedWithJunk);
    assert.equal(resumed.state.step, "category_collect");
    assert.equal(resumed.completed, false);
  });

  it("M — abandon puis reprise : le total final est identique à un parcours sans interruption", async () => {
    // Parcours de référence, sans aucune interruption.
    const reference = new F012ChargesAssistant(ctx, DEPS);
    let refTurn = await reference.handle(reference.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    refTurn = await reference.handle(refTurn.state, { type: "submit_taxe_fonciere", montant: 1200 });
    refTurn = await reference.handle(refTurn.state, { type: "submit_assurance_pno", montant: 300 });
    refTurn = await reference.handle(refTurn.state, { type: "skip_category" });
    refTurn = await reference.handle(refTurn.state, { type: "skip_category" });
    refTurn = await reference.handle(refTurn.state, { type: "confirm_completeness", hasOther: false });
    refTurn = await reference.handle(refTurn.state, { type: "confirm_all" });
    const referenceTotal = refTurn.state.result?.charges.totalDeductible;
    assert.equal(referenceTotal, 1500);

    // Même parcours, interrompu après la 2e catégorie ("abandon"), repris ("reprise"),
    // puis terminé — sur une nouvelle instance d'assistant, comme après un vrai refresh.
    const before = new F012ChargesAssistant(ctx, DEPS);
    let turn = await before.handle(before.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await before.handle(turn.state, { type: "submit_taxe_fonciere", montant: 1200 });
    turn = await before.handle(turn.state, { type: "submit_assurance_pno", montant: 300 });
    const persisted = toF012PersistedState(turn.state, TS); // "abandon" — refresh ici

    const after = new F012ChargesAssistant(ctx, DEPS);
    let resumedTurn = after.resume(persisted); // "reprise"
    resumedTurn = await after.handle(resumedTurn.state, { type: "skip_category" });
    resumedTurn = await after.handle(resumedTurn.state, { type: "skip_category" });
    resumedTurn = await after.handle(resumedTurn.state, { type: "confirm_completeness", hasOther: false });
    resumedTurn = await after.handle(resumedTurn.state, { type: "confirm_all" });

    assert.equal(resumedTurn.completed, true);
    assert.equal(resumedTurn.event, "CHARGES_TERMINE");
    assert.equal(
      resumedTurn.state.result?.charges.totalDeductible,
      referenceTotal,
      "reprendre mi-parcours ne corrompt jamais le total final",
    );
  });

  it("N — aucun résultat calculé n'est jamais persisté, même si l'état vivant en porte un", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "submit_taxe_fonciere", montant: 1200 });
    turn = await assistant.handle(turn.state, { type: "submit_assurance_pno", montant: 300 });
    turn = await assistant.handle(turn.state, { type: "skip_category" });
    turn = await assistant.handle(turn.state, { type: "skip_category" });
    turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: false });
    assert.ok(turn.state.result, "l'état vivant porte bien un résultat calculé à ce stade");

    const persisted = toF012PersistedState(turn.state, TS);
    assert.equal(Object.prototype.hasOwnProperty.call(persisted, "result"), false);
  });
});
