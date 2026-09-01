import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F012ChargesAssistant } from "./assistant";
import { toF012PersistedState } from "./types";
import type { F012Deps } from "./types";
import { aggregateFiscalInputs } from "../../capabilities/f006/aggregate-inputs";

const ctx = { dossierId: "test", fiscalYear: 2024, route: "/assistants/charges" };
const PROFIL_SIMPLE = { copropriete: false, agence: false, travaux: false, vacance: false, comptable: false };
const DEPS: F012Deps = { dateMiseEnService: "2023-01-01" };

/** Amène l'assistant jusqu'à l'écran "Avez-vous d'autres dépenses ?", avec taxe_fonciere=1200 déjà saisie. */
async function reachCompleteness(assistant: F012ChargesAssistant) {
  let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
  turn = await assistant.handle(turn.state, { type: "submit_taxe_fonciere", montant: 1200 });
  turn = await assistant.handle(turn.state, { type: "skip_category" }); // assurance_pno
  turn = await assistant.handle(turn.state, { type: "skip_category" }); // frais_bancaires
  turn = await assistant.handle(turn.state, { type: "skip_category" }); // divers
  assert.equal(turn.state.step, "completeness");
  return turn;
}

describe("F-012 — Cycle 4C : « Oui, j'ai d'autres dépenses »", () => {
  it("A — hasOther=false : aggregate_review inchangé", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const reached = await reachCompleteness(assistant);
    const turn = await assistant.handle(reached.state, { type: "confirm_completeness", hasOther: false });
    assert.equal(turn.state.step, "aggregate_review");
    assert.equal(turn.state.result?.charges.totalDeductible, 1200);
  });

  it("B — hasOther=true : réouvre réellement une possibilité d'ajout (catégorie « divers » réutilisée)", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const reached = await reachCompleteness(assistant);
    const turn = await assistant.handle(reached.state, { type: "confirm_completeness", hasOther: true, familyId: "autres" });
    assert.equal(turn.state.step, "category_collect");
    assert.equal(turn.state.familyInventory?.[turn.state.currentFamilyIndex ?? 0], "autres");
  });

  it("C — une charge ajoutée après « oui » apparaît bien dans collected.divers", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const reached = await reachCompleteness(assistant);
    let turn = await assistant.handle(reached.state, { type: "confirm_completeness", hasOther: true, familyId: "autres" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_autres",
      diversDescription: "Frais de déplacement",
      diversMontant: 80,
    });
    assert.deepEqual(
      turn.state.collected.divers.map((d) => ({ description: d.description, montant: d.montant })),
      [{ description: "Frais de déplacement", montant: 80 }],
    );
    // Retombe naturellement sur la même question — "divers" est la dernière
    // catégorie de l'inventaire, advanceCategory (inchangé) la redemande.
    assert.equal(turn.state.step, "completeness");
  });

  it("D — plusieurs charges ajoutées via plusieurs « oui » successifs : toutes conservées", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const reached = await reachCompleteness(assistant);

    let turn = await assistant.handle(reached.state, { type: "confirm_completeness", hasOther: true, familyId: "autres" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_autres",
      diversDescription: "Premier poste",
      diversMontant: 40,
    });
    assert.equal(turn.state.step, "completeness");

    turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: true, familyId: "autres" });
    assert.equal(turn.state.familyInventory?.[turn.state.currentFamilyIndex ?? 0], "autres");
    turn = await assistant.handle(turn.state, {
      type: "submit_family_autres",
      diversDescription: "Second poste",
      diversMontant: 60,
    });

    assert.deepEqual(
      turn.state.collected.divers.map((d) => ({ description: d.description, montant: d.montant })),
      [
        { description: "Premier poste", montant: 40 },
        { description: "Second poste", montant: 60 },
      ],
    );
  });

  it("E — aucune duplication des charges déjà collectées après un ou plusieurs « oui »", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const reached = await reachCompleteness(assistant);
    assert.equal(reached.state.collected.taxeFonciere, 1200);

    let turn = await assistant.handle(reached.state, { type: "confirm_completeness", hasOther: true, familyId: "autres" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_autres",
      diversDescription: "Nouvelle dépense",
      diversMontant: 25,
    });
    turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: true, familyId: "autres" });
    turn = await assistant.handle(turn.state, { type: "none_family" });

    assert.equal(turn.state.collected.taxeFonciere, 1200, "la taxe foncière déjà saisie n'est ni rejouée ni dupliquée");
    assert.equal(turn.state.collected.divers.length, 1, "un seul item ajouté, pas de doublon");
  });

  it("F — refresh juste après « oui » : la reprise retombe exactement sur la catégorie divers", async () => {
    const before = new F012ChargesAssistant(ctx, DEPS);
    const reached = await reachCompleteness(before);
    const turn = await before.handle(reached.state, { type: "confirm_completeness", hasOther: true, familyId: "autres" });
    const persisted = toF012PersistedState(turn.state, "2024-03-01T10:00:00.000Z");

    const after = new F012ChargesAssistant(ctx, DEPS);
    const resumed = after.resume(persisted);
    assert.equal(resumed.state.step, "category_collect");
    assert.equal(resumed.state.familyInventory?.[resumed.state.currentFamilyIndex ?? 0], "autres");
  });

  it("G — refresh juste après l'ajout d'une nouvelle charge : reprise avec la charge conservée, question reposée", async () => {
    const before = new F012ChargesAssistant(ctx, DEPS);
    const reached = await reachCompleteness(before);
    let turn = await before.handle(reached.state, { type: "confirm_completeness", hasOther: true, familyId: "autres" });
    turn = await before.handle(turn.state, {
      type: "submit_family_autres",
      diversDescription: "Abonnement logiciel",
      diversMontant: 49,
    });
    const persisted = toF012PersistedState(turn.state, "2024-03-01T10:00:00.000Z");

    const after = new F012ChargesAssistant(ctx, DEPS);
    const resumed = after.resume(persisted);
    assert.equal(resumed.state.step, "completeness");
    assert.deepEqual(
      resumed.state.collected.divers.map((d) => d.description),
      ["Abonnement logiciel"],
    );
    assert.ok(resumed.messages.some((m) => m.content.includes("Avez-vous payé quelque chose")));
  });

  it("H — reprise correcte de bout en bout : parcours interrompu puis repris aboutit au même total qu'un parcours continu", async () => {
    const reference = new F012ChargesAssistant(ctx, DEPS);
    let refTurn = await reachCompleteness(reference);
    refTurn = await reference.handle(refTurn.state, { type: "confirm_completeness", hasOther: true, familyId: "autres" });
    refTurn = await reference.handle(refTurn.state, {
      type: "submit_family_autres",
      diversDescription: "Frais divers",
      diversMontant: 30,
    });
    refTurn = await reference.handle(refTurn.state, { type: "confirm_completeness", hasOther: false });
    refTurn = await reference.handle(refTurn.state, { type: "confirm_all" });
    const referenceTotal = refTurn.state.result?.charges.totalDeductible;
    assert.equal(referenceTotal, 1230);

    const before = new F012ChargesAssistant(ctx, DEPS);
    const reached = await reachCompleteness(before);
    const midTurn = await before.handle(reached.state, { type: "confirm_completeness", hasOther: true, familyId: "autres" });
    const persisted = toF012PersistedState(midTurn.state, "2024-03-01T10:00:00.000Z");

    const after = new F012ChargesAssistant(ctx, DEPS);
    let turn = after.resume(persisted);
    turn = await after.handle(turn.state, {
      type: "submit_family_autres",
      diversDescription: "Frais divers",
      diversMontant: 30,
    });
    turn = await after.handle(turn.state, { type: "confirm_completeness", hasOther: false });
    turn = await after.handle(turn.state, { type: "confirm_all" });

    assert.equal(turn.state.result?.charges.totalDeductible, referenceTotal, "reprise transparente, même total final");
  });

  it("I — skip d'une catégorie après « oui » : aucune charge ajoutée, question reposée normalement", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const reached = await reachCompleteness(assistant);
    let turn = await assistant.handle(reached.state, { type: "confirm_completeness", hasOther: true, familyId: "autres" });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    assert.equal(turn.state.step, "completeness");
    assert.deepEqual(turn.state.collected.divers, []);
  });

  it("J — total final correct après ajout via « oui »", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const reached = await reachCompleteness(assistant);
    let turn = await assistant.handle(reached.state, { type: "confirm_completeness", hasOther: true, familyId: "autres" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_autres",
      diversDescription: "Frais de déplacement",
      diversMontant: 80,
    });
    turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: false });
    turn = await assistant.handle(turn.state, { type: "confirm_all" });
    assert.equal(turn.completed, true);
    assert.equal(turn.state.result?.charges.totalDeductible, 1280, "1200 (taxe foncière) + 80 (ajout via « oui »)");
  });

  it("K — F-006 reçoit le bon total, sans duplication", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const reached = await reachCompleteness(assistant);
    let turn = await assistant.handle(reached.state, { type: "confirm_completeness", hasOther: true, familyId: "autres" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_autres",
      diversDescription: "Frais de déplacement",
      diversMontant: 80,
    });
    turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: false });
    turn = await assistant.handle(turn.state, { type: "confirm_all" });
    const charges = turn.state.result!.charges;

    const aggregated = aggregateFiscalInputs({
      exerciceFiscal: 2024,
      activite: { dateMiseEnService: "2023-01-01" },
      revenusAssistant: { exerciceFiscal: 2024, totalRecettes: 9000 },
      chargesAssistant: {
        exerciceFiscal: 2024,
        totalDeductible: charges.totalDeductible,
        totalPreExploitation: charges.totalPreExploitation,
        parCategorie: charges.parCategorie,
      },
      amortissementAssistant: { exerciceFiscal: 2024, totalDotations: 0, status: "validated" },
    });
    assert.equal(aggregated.data?.totalChargesDeductibles, 1280);
  });

  it("M — montant 0 sur une charge ajoutée via « oui » : comportement inchangé (auto-skip existant)", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const reached = await reachCompleteness(assistant);
    let turn = await assistant.handle(reached.state, { type: "confirm_completeness", hasOther: true, familyId: "autres" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_autres",
      diversDescription: "Sans montant",
      diversMontant: 0,
    });
    assert.deepEqual(turn.state.collected.divers, [], "montant 0 auto-sauté, règle Cycle 1 inchangée");
  });

  it("N — anti-doublon F-011 toujours actif sur une charge ajoutée via « oui »", async () => {
    const depsWithF011: F012Deps = { ...DEPS, financementCharges: { totalAssurance: 300, totalCapitalRembourse: 0 } };
    const assistant = new F012ChargesAssistant(ctx, depsWithF011);
    const reached = await reachCompleteness(assistant);
    let turn = await assistant.handle(reached.state, { type: "confirm_completeness", hasOther: true, familyId: "autres" });
    turn = await assistant.handle(turn.state, {
      type: "submit_divers",
      description: "Assurance emprunteur",
      montant: 300,
    });
    const item = turn.state.collected.divers.find((d) => d.description === "Assurance emprunteur");
    assert.equal(item?.financementOverlap, "assurance_emprunteur", "le garde-fou Cycle 3 s'applique aussi ici");

    turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: false });
    turn = await assistant.handle(turn.state, { type: "confirm_all" });
    assert.equal(turn.state.result?.charges.totalDeductible, 1200, "l'assurance emprunteur reste exclue du total");
  });
});
