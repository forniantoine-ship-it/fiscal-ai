import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F012ChargesAssistant } from "./assistant";
import { toF012PersistedState } from "./types";
import type { F012Deps } from "./types";

const ctx = { dossierId: "test", fiscalYear: 2024, route: "/assistants/charges" };
const DEPS: F012Deps = { dateMiseEnService: "2023-01-01" };
const PROFIL_TRAVAUX = { copropriete: false, agence: false, travaux: true, vacance: false, comptable: false };
const PROFIL_SIMPLE = { copropriete: false, agence: false, travaux: false, vacance: false, comptable: false };

describe("F-012 — Cycle 4E : GO_BACK", () => {
  it("A — catégorie simple : précédent revient exactement sur la catégorie précédente", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_TRAVAUX });
    turn = await assistant.handle(turn.state, { type: "submit_taxe_fonciere", montant: 1200 });
    assert.equal(turn.state.categoryInventory[turn.state.currentCategoryIndex], "assurance_pno");

    const back = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(back.state.categoryInventory[back.state.currentCategoryIndex], "taxe_fonciere");
    assert.equal(back.state.collected.taxeFonciere, undefined, "la soumission annulée par le retour n'est plus présente");
    assert.equal(back.completed, false);
  });

  it("B — plusieurs catégories : les retours successifs déroulent l'historique une étape à la fois", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_TRAVAUX });
    turn = await assistant.handle(turn.state, { type: "submit_taxe_fonciere", montant: 1200 });
    turn = await assistant.handle(turn.state, { type: "submit_assurance_pno", montant: 300 });
    turn = await assistant.handle(turn.state, { type: "skip_category" }); // travaux
    assert.equal(turn.state.categoryInventory[turn.state.currentCategoryIndex], "frais_bancaires");

    let back = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(back.state.categoryInventory[back.state.currentCategoryIndex], "travaux", "1er retour : travaux (skip annulé)");
    assert.deepEqual(back.state.collected.skippedCategories, []);

    back = await assistant.handle(back.state, { type: "go_back" });
    assert.equal(back.state.categoryInventory[back.state.currentCategoryIndex], "assurance_pno", "2e retour : assurance_pno");
    assert.equal(back.state.collected.assurancePno, undefined);
    assert.equal(back.state.collected.taxeFonciere, 1200, "la taxe foncière (catégorie encore antérieure) n'est jamais perdue");

    back = await assistant.handle(back.state, { type: "go_back" });
    assert.equal(back.state.categoryInventory[back.state.currentCategoryIndex], "taxe_fonciere", "3e retour : taxe_fonciere");
    assert.equal(back.state.collected.taxeFonciere, undefined);

    back = await assistant.handle(back.state, { type: "go_back" });
    assert.equal(back.state.step, "profilage", "4e retour : profilage");
  });

  it("C — retour depuis completeness : revient sur la dernière catégorie (divers)", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "skip_category" }); // taxe_fonciere
    turn = await assistant.handle(turn.state, { type: "skip_category" }); // assurance_pno
    turn = await assistant.handle(turn.state, { type: "skip_category" }); // frais_bancaires
    turn = await assistant.handle(turn.state, { type: "skip_category" }); // divers
    assert.equal(turn.state.step, "completeness");

    const back = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(back.state.step, "category_collect");
    assert.equal(back.state.categoryInventory[back.state.currentCategoryIndex], "divers");
  });

  it("D — retour depuis aggregate_review : revient sur completeness, le résultat n'est jamais réutilisé en cache", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "submit_taxe_fonciere", montant: 1200 });
    turn = await assistant.handle(turn.state, { type: "skip_category" }); // assurance_pno
    turn = await assistant.handle(turn.state, { type: "skip_category" }); // frais_bancaires
    turn = await assistant.handle(turn.state, { type: "skip_category" }); // divers
    assert.equal(turn.state.step, "completeness");
    turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: false });
    assert.equal(turn.state.step, "aggregate_review");
    assert.ok(turn.state.result);

    const back = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(back.state.step, "completeness");
    assert.ok(back.messages.some((m) => m.content.includes("Avez-vous payé quelque chose")));
  });

  it("E — retour pendant la description travaux : revient sur l'écran travaux initial", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_TRAVAUX });
    turn = await assistant.handle(turn.state, { type: "skip_category" });
    turn = await assistant.handle(turn.state, { type: "skip_category" });
    turn = await assistant.handle(turn.state, { type: "start_travaux" });
    assert.equal(turn.state.travauxSubStep, "description");

    const back = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(back.state.travauxSubStep, undefined);
    assert.equal(back.state.categoryInventory[back.state.currentCategoryIndex], "travaux");
  });

  it("F — retour pendant la qualification : revient sur la description, pas de perte de collected", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_TRAVAUX });
    turn = await assistant.handle(turn.state, { type: "skip_category" });
    turn = await assistant.handle(turn.state, { type: "skip_category" });
    turn = await assistant.handle(turn.state, { type: "start_travaux" });
    turn = await assistant.handle(turn.state, {
      type: "submit_travaux_description",
      description: "Chauffe-eau",
      montant: 900,
    });
    assert.equal(turn.state.travauxSubStep, "qualification");

    const back = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(back.state.travauxSubStep, "description");
    assert.deepEqual(back.state.pendingTravaux, {});
    assert.equal(back.state.collected.travaux.length, 0);
  });

  it("G — retour pendant le split : revient sur la qualification", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_TRAVAUX });
    turn = await assistant.handle(turn.state, { type: "skip_category" });
    turn = await assistant.handle(turn.state, { type: "skip_category" });
    turn = await assistant.handle(turn.state, { type: "start_travaux" });
    turn = await assistant.handle(turn.state, {
      type: "submit_travaux_description",
      description: "Rénovation mixte",
      montant: 12000,
    });
    turn = await assistant.handle(turn.state, { type: "submit_travaux_qualification", choix: "mixte" });
    assert.equal(turn.state.travauxSubStep, "split");

    const back = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(back.state.travauxSubStep, "qualification");
    assert.equal(back.state.pendingTravaux?.choix, undefined);
    assert.equal(back.state.pendingTravaux?.description, "Rénovation mixte");
  });

  it("H — données déjà collectées conservées à travers plusieurs retours", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_TRAVAUX });
    turn = await assistant.handle(turn.state, { type: "submit_taxe_fonciere", montant: 1200 });
    turn = await assistant.handle(turn.state, { type: "submit_assurance_pno", montant: 300 });
    turn = await assistant.handle(turn.state, { type: "start_travaux" });
    turn = await assistant.handle(turn.state, { type: "submit_travaux_description", description: "Peinture", montant: 500 });
    turn = await assistant.handle(turn.state, { type: "submit_travaux_qualification", choix: "reparation_identique" });
    turn = await assistant.handle(turn.state, { type: "finish_travaux_category" });
    turn = await assistant.handle(turn.state, { type: "submit_frais_bancaires", montant: 20 });
    assert.equal(turn.state.categoryInventory[turn.state.currentCategoryIndex], "divers");

    const back = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(back.state.collected.taxeFonciere, 1200);
    assert.equal(back.state.collected.assurancePno, 300);
    assert.equal(back.state.collected.travaux.length, 1);
    assert.equal(back.state.collected.travaux[0]?.montant, 500);
  });

  it("I — provenance (fieldSources) reste cohérente, jamais périmée après un retour puis une resaisie", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "submit_taxe_fonciere", montant: 1200, source: "extracted" });
    assert.equal(turn.state.fieldSources.taxe_fonciere, "extracted");

    const back = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(back.state.fieldSources.taxe_fonciere, undefined, "la provenance de la saisie annulée ne reste jamais collée");

    const resubmitted = await assistant.handle(back.state, { type: "submit_taxe_fonciere", montant: 1200, source: "manual" });
    assert.equal(resubmitted.state.fieldSources.taxe_fonciere, "manual", "la nouvelle provenance est correcte, pas un résidu de l'ancienne");
  });

  it("J — anti-doublon F-011 (Cycle 3) reste actif après un retour puis une resaisie", async () => {
    const depsWithF011: F012Deps = { ...DEPS, financementCharges: { totalAssurance: 300, totalCapitalRembourse: 0 } };
    const assistant = new F012ChargesAssistant(ctx, depsWithF011);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "skip_category" });
    turn = await assistant.handle(turn.state, { type: "skip_category" });
    turn = await assistant.handle(turn.state, {
      type: "submit_divers",
      description: "Assurance emprunteur",
      montant: 300,
    });
    assert.equal(turn.state.collected.divers[0]?.financementOverlap, "assurance_emprunteur");

    const back = await assistant.handle(turn.state, { type: "go_back" });
    assert.deepEqual(back.state.collected.divers, [], "la ligne annulée par le retour disparaît bien de collected");

    const resubmitted = await assistant.handle(back.state, {
      type: "submit_divers",
      description: "Assurance emprunteur",
      montant: 300,
    });
    assert.equal(
      resubmitted.state.collected.divers[0]?.financementOverlap,
      "assurance_emprunteur",
      "toujours détectée après une resaisie post-retour",
    );
  });

  it("K — refresh après GO_BACK : la reprise retombe exactement sur l'état post-retour", async () => {
    const before = new F012ChargesAssistant(ctx, DEPS);
    let turn = await before.handle(before.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await before.handle(turn.state, { type: "submit_taxe_fonciere", montant: 1200 });
    const back = await before.handle(turn.state, { type: "go_back" });
    const persisted = toF012PersistedState(back.state, "2024-03-01T10:00:00.000Z");

    const after = new F012ChargesAssistant(ctx, DEPS);
    const resumed = after.resume(persisted);
    assert.equal(resumed.state.categoryInventory[resumed.state.currentCategoryIndex], "taxe_fonciere");
    assert.equal(resumed.state.collected.taxeFonciere, undefined);
  });

  it("L — resume après refresh : l'historique lui-même survit, un nouveau retour reste possible", async () => {
    const before = new F012ChargesAssistant(ctx, DEPS);
    let turn = await before.handle(before.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await before.handle(turn.state, { type: "submit_taxe_fonciere", montant: 1200 });
    turn = await before.handle(turn.state, { type: "submit_assurance_pno", montant: 300 });
    const persisted = toF012PersistedState(turn.state, "2024-03-01T10:00:00.000Z");
    // 3 transitions ont eu lieu : submit_profilage, submit_taxe_fonciere, submit_assurance_pno.
    assert.equal(persisted.history?.length, 3, "l'historique complet est bien persisté");

    const after = new F012ChargesAssistant(ctx, DEPS);
    const resumed = after.resume(persisted);
    assert.equal(resumed.state.categoryInventory[resumed.state.currentCategoryIndex], "frais_bancaires");

    // Un seul retour annule la dernière transition (submit_assurance_pno) —
    // la catégorie encore antérieure (taxe_fonciere) n'est pas perdue pour autant.
    const back = await after.handle(resumed.state, { type: "go_back" });
    assert.equal(back.state.categoryInventory[back.state.currentCategoryIndex], "assurance_pno");
    assert.equal(back.state.collected.assurancePno, undefined);
    assert.equal(back.state.collected.taxeFonciere, 1200, "la catégorie encore antérieure n'est pas perdue");

    // Un second retour, après reprise, continue de dérouler le même historique.
    const back2 = await after.handle(back.state, { type: "go_back" });
    assert.equal(back2.state.categoryInventory[back2.state.currentCategoryIndex], "taxe_fonciere");
    assert.equal(back2.state.collected.taxeFonciere, undefined);
  });

  it("M — un retour suivi d'une resaisie différente ne mélange jamais l'ancienne et la nouvelle valeur", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "submit_taxe_fonciere", montant: 1200 });
    turn = await assistant.handle(turn.state, { type: "submit_assurance_pno", montant: 300 });

    let back = await assistant.handle(turn.state, { type: "go_back" }); // annule assurance_pno=300
    back = await assistant.handle(back.state, { type: "go_back" }); // annule taxe_fonciere=1200
    assert.equal(back.state.collected.taxeFonciere, undefined);
    assert.equal(back.state.collected.assurancePno, undefined);

    let forward = await assistant.handle(back.state, { type: "submit_taxe_fonciere", montant: 999 });
    forward = await assistant.handle(forward.state, { type: "submit_assurance_pno", montant: 450 });
    assert.equal(forward.state.collected.taxeFonciere, 999, "jamais 1200, jamais une combinaison des deux");
    assert.equal(forward.state.collected.assurancePno, 450, "jamais 300, jamais une combinaison des deux");
  });

  it("N — aucune donnée fantôme : changer le profil après un retour à profilage repart d'un inventaire et d'un collected propres", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_TRAVAUX });
    turn = await assistant.handle(turn.state, { type: "skip_category" }); // taxe_fonciere
    turn = await assistant.handle(turn.state, { type: "skip_category" }); // assurance_pno
    turn = await assistant.handle(turn.state, { type: "start_travaux" });
    turn = await assistant.handle(turn.state, { type: "submit_travaux_description", description: "Toiture", montant: 3000 });
    turn = await assistant.handle(turn.state, { type: "submit_travaux_qualification", choix: "reparation_identique" });
    assert.equal(turn.state.collected.travaux.length, 1);

    let back = turn;
    for (let i = 0; i < 10 && back.state.step !== "profilage"; i++) {
      back = await assistant.handle(back.state, { type: "go_back" });
    }
    assert.equal(back.state.step, "profilage");

    const restarted = await assistant.handle(back.state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    assert.equal(restarted.state.categoryInventory.includes("travaux"), false, "le nouveau profil ne demande plus travaux");
    assert.deepEqual(restarted.state.collected.travaux, [], "aucune trace fantôme de la dépense travaux abandonnée");
  });

  it("O — restart reste destructif et inchangé : aucun historique conservé", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "submit_taxe_fonciere", montant: 1200 });
    assert.ok(turn.state.history && turn.state.history.length > 0);

    const restarted = await assistant.handle(turn.state, { type: "restart" });
    assert.equal(restarted.state.step, "profilage");
    assert.deepEqual(restarted.state.collected, { coproLignes: [], travaux: [], divers: [], skippedCategories: [] });
    assert.equal(restarted.state.history, undefined, "restart repart bien de zéro, sans historique");
  });

  it("aucun historique → GO_BACK est un no-op sûr (jamais de crash)", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const turn = await assistant.handle(assistant.start().state, { type: "go_back" });
    assert.equal(turn.state.step, "profilage");
    assert.equal(turn.completed, false);
  });
});
