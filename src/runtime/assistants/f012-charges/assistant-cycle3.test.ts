import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F012ChargesAssistant } from "./assistant";
import { toF012PersistedState } from "./types";
import type { F012Deps } from "./types";
import { aggregateFiscalInputs } from "../../capabilities/f006/aggregate-inputs";

const ctx = { dossierId: "test", fiscalYear: 2024, route: "/assistants/charges" };
const PROFIL_SIMPLE = { copropriete: false, agence: false, travaux: false, vacance: false, comptable: false };

const DEPS_WITH_F011: F012Deps = {
  dateMiseEnService: "2023-01-01",
  financementCharges: { totalAssurance: 300, totalCapitalRembourse: 5000 },
};

async function reachDivers(assistant: F012ChargesAssistant) {
  let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
  turn = await assistant.handle(turn.state, { type: "skip_category" }); // taxe_fonciere
  turn = await assistant.handle(turn.state, { type: "skip_category" }); // assurance_pno
  turn = await assistant.handle(turn.state, { type: "skip_category" }); // frais_bancaires
  assert.equal(turn.state.categoryInventory[turn.state.currentCategoryIndex], "divers");
  return turn;
}

describe("F-012 — Cycle 3 : anti-doublon financement dans le flux vivant", () => {
  it("A — assurance identique à F-011 : avertie, jamais recomptée dans le total déductible", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS_WITH_F011);
    let turn = await reachDivers(assistant);
    turn = await assistant.handle(turn.state, {
      type: "submit_divers",
      description: "Assurance emprunteur",
      montant: 300,
    });

    assert.ok(turn.messages.some((m) => m.role === "assistant" && m.content.includes("déjà déclaré")));
    const item = turn.state.collected.divers.find((d) => d.description === "Assurance emprunteur");
    assert.ok(item, "l'entrée reste bien présente — jamais supprimée silencieusement");
    assert.equal(item?.financementOverlap, "assurance_emprunteur");
  });

  it("D — capital de prêt : erreur bloquante, jamais ajoutée aux charges, jamais silencieuse", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS_WITH_F011);
    const before = await reachDivers(assistant);
    const countBefore = before.state.collected.divers.length;

    const after = await assistant.handle(before.state, {
      type: "submit_divers",
      description: "Remboursement du capital du prêt",
      montant: 1000,
    });

    assert.equal(after.completed, false);
    assert.equal(after.state.collected.divers.length, countBefore, "aucune ligne ajoutée");
    assert.equal(after.state.currentCategoryIndex, before.state.currentCategoryIndex, "pas d'avancement de catégorie");
    assert.ok(after.messages.some((m) => m.role === "user" && m.content.includes("Remboursement du capital")), "la saisie utilisateur est échoée, jamais effacée sans trace");
    assert.ok(after.messages.some((m) => m.role === "assistant" && m.content.includes("AX-009")), "l'explication de refus est visible");
  });

  it("E — charge normale proche : acceptée normalement, comptée dans le total déductible", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS_WITH_F011);
    let turn = await reachDivers(assistant);
    turn = await assistant.handle(turn.state, {
      type: "submit_divers",
      description: "Assurance habitation du bien",
      montant: 200,
    });

    const item = turn.state.collected.divers.find((d) => d.description === "Assurance habitation du bien");
    assert.ok(item);
    assert.equal(item?.financementOverlap, undefined);
    assert.ok(turn.messages.some((m) => m.content.includes("200")));
  });

  it("G — refresh/reprise : la détection continue de fonctionner après une reprise Cycle 2", async () => {
    const before = new F012ChargesAssistant(ctx, DEPS_WITH_F011);
    const reached = await reachDivers(before);
    const persisted = toF012PersistedState(reached.state, "2024-03-01T10:00:00.000Z");

    // Nouvelle instance, comme après un vrai refresh — les deps F-011 sont
    // refournies par le panel à chaque montage, jamais stockées dans l'état persisté.
    const after = new F012ChargesAssistant(ctx, DEPS_WITH_F011);
    const resumed = after.resume(persisted);
    assert.equal("financementCharges" in persisted, false, "financementCharges n'est jamais un second état persisté (RAI-000)");

    const turn = await after.handle(resumed.state, {
      type: "submit_divers",
      description: "Assurance de prêt",
      montant: 999,
    });
    const item = turn.state.collected.divers.find((d) => d.description === "Assurance de prêt");
    assert.equal(item?.financementOverlap, "assurance_emprunteur", "la détection survit à la reprise");
  });

  it("I — total fiscal sans double comptage : le montant partagé n'est compté qu'une seule fois par F-006", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS_WITH_F011);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "submit_taxe_fonciere", montant: 1200 });
    turn = await assistant.handle(turn.state, { type: "skip_category" }); // assurance_pno
    turn = await assistant.handle(turn.state, { type: "skip_category" }); // frais_bancaires
    turn = await assistant.handle(turn.state, {
      type: "submit_divers",
      description: "Assurance emprunteur",
      montant: 300,
    });
    turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: false });
    turn = await assistant.handle(turn.state, { type: "confirm_all" });
    assert.equal(turn.completed, true);

    const charges = turn.state.result!.charges;
    assert.equal(charges.totalDeductible, 1200, "l'assurance emprunteur signalée n'entre pas dans le total F-012");

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
      financementCharges: {
        exerciceFiscal: 2024,
        totalChargesFinancementExercice: 300, // la même assurance, comptée une seule fois, côté F-011
        totalInteretsPreExploitation: 0,
      },
      amortissementAssistant: { exerciceFiscal: 2024, totalDotations: 0, status: "validated" },
    });

    assert.equal(
      aggregated.data?.totalChargesDeductibles,
      1500,
      "1200 (taxe foncière) + 300 (assurance, comptée une seule fois via F-011) = 1500, jamais 1800",
    );
  });
});
