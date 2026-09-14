import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F011FinancementAssistant } from "./assistant";
import type { F011Deps, F011State } from "./types";

/**
 * F011-3 — assurance bancaire sans montant extrait. Avant ce correctif,
 * "Bancaire" ne pouvait jamais recevoir de montant sauf extraction
 * documentaire : sans document, F011 retenait silencieusement 0 € sans
 * jamais permettre à l'utilisateur de le saisir (contraire à "ne jamais
 * transformer silencieusement une donnée inconnue en 0 €"). Le panel ouvre
 * désormais la même saisie que pour "externe" quand `pendingLoan.assuranceAnnuelle`
 * est inconnu (`F011FinancementAssistantPanel.handleSuggestion` — non
 * testable ici, pas d'infrastructure DOM dans ce projet, voir
 * `f011-loan-form-state.test.ts`) ; ces tests couvrent le mécanisme runtime
 * qu'elle déclenche : `set_insurance` accepte désormais un montant pour
 * "bancaire" au même titre que pour "externe".
 */

const ctx = { dossierId: "test", fiscalYear: 2022, route: "/assistants/financement" };
const DEPS_OK: F011Deps = { dateMiseEnService: "2021-01-01" };

/** État synthétique positionné sur `loan_insurance`, comme l'atteindrait un vrai parcours. */
async function driveToInsuranceStep(
  assistant: F011FinancementAssistant,
  pendingOverrides: Partial<F011State["pendingLoan"]> = {},
): Promise<F011State> {
  let turn = await assistant.handle(assistant.start().state, { type: "set_presence_emprunt", presence: true });
  turn = await assistant.handle(turn.state, { type: "set_nombre_prets", count: 1 });
  turn = await assistant.handle(turn.state, { type: "choose_loan_source", source: "manual" });
  turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
  turn = await assistant.handle(turn.state, {
    type: "submit_loan_terms",
    capitalInitial: 100000,
    tauxNominal: 0.02,
    dureeMois: 240,
    datePremiereMensualite: "2022-01-01",
  });
  assert.equal(turn.state.step, "loan_insurance");
  return {
    ...turn.state,
    pendingLoan: { ...turn.state.pendingLoan, ...pendingOverrides },
  };
}

async function finishLoan(assistant: F011FinancementAssistant, afterInsurance: F011State): Promise<F011State> {
  let turn = await assistant.handle(afterInsurance, { type: "set_guarantee", typeGarantie: "aucune" });
  turn = await assistant.handle(turn.state, { type: "set_fees", souscritCetExercice: false });
  turn = await assistant.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
  turn = await assistant.handle(turn.state, { type: "confirm_loan" });
  return turn.state;
}

describe("F-011-3 — assurance bancaire : saisie manuelle quand aucun montant n'est connu", () => {
  it("A — montant déjà connu (extrait) : réutilisé tel quel, jamais redemandé (aucun montant porté par l'action)", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToInsuranceStep(assistant, { assuranceAnnuelle: 661 });
    const preExisting: F011State = { ...state, fieldSources: { ...state.fieldSources, assuranceAnnuelle: "extracted" } };

    const turn = await assistant.handle(preExisting, { type: "set_insurance", assuranceType: "bancaire" });
    assert.equal(turn.state.pendingLoan?.assuranceAnnuelle, 661, "le montant déjà connu est réutilisé");
    assert.equal(turn.state.fieldSources.assuranceAnnuelle, "extracted", "sa provenance n'est jamais touchée quand rien ne change");
    const ack = turn.messages.find((m) => m.content.includes("Assurance bancaire"));
    assert.ok(ack?.content.includes("661"), "le montant retenu est annoncé");
    assert.ok(!ack!.content.includes("Sans montant indiqué"), "jamais redemandé quand un montant est déjà connu");
  });

  it("B/C — aucun montant connu, saisi manuellement (480 €) : accepté, transporté, provenance 'manual'", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToInsuranceStep(assistant);
    assert.equal(state.pendingLoan?.assuranceAnnuelle, undefined, "précondition : aucun montant connu");

    const turn = await assistant.handle(state, {
      type: "set_insurance",
      assuranceType: "bancaire",
      assuranceAnnuelle: 480,
    });
    assert.equal(turn.state.pendingLoan?.assuranceAnnuelle, 480, "B — le montant saisi est accepté, jamais ignoré");
    assert.equal(turn.state.fieldSources.assuranceAnnuelle, "manual", "provenance correcte pour une saisie manuelle fraîche");
    const ack = turn.messages.find((m) => m.content.includes("Assurance bancaire"));
    assert.ok(ack?.content.includes("480"), "le montant saisi est annoncé");
    assert.ok(!ack!.content.includes("Sans montant indiqué"), "un montant a bien été fourni cette fois");

    // C — transport correct jusqu'au résultat F011 final (480/12 = 40 exactement,
    // aucun résidu d'arrondi mensuel — voir applyLoanInsurance).
    const final = await finishLoan(assistant, turn.state);
    assert.equal(final.step, "aggregate_review");
    assert.equal(
      final.result?.charges.prets[0]?.assuranceEmpruntExercice,
      480,
      "C — le montant saisi manuellement devient bien la charge déductible retenue",
    );
  });

  it("bancaire, montant laissé délibérément vide après avoir été invité à le saisir : reste absent, jamais inventé à 0 silencieusement", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToInsuranceStep(assistant);

    const turn = await assistant.handle(state, {
      type: "set_insurance",
      assuranceType: "bancaire",
      assuranceAnnuelle: undefined,
    });
    assert.equal(turn.state.pendingLoan?.assuranceAnnuelle, undefined);
    const ack = turn.messages.find((m) => m.content.includes("Assurance bancaire"));
    assert.ok(ack?.content.includes("Sans montant indiqué"));
    assert.ok(!ack!.content.includes("non déductible"), "jamais présenté comme une règle fiscale, seulement l'absence de montant connu");

    const final = await finishLoan(assistant, turn.state);
    assert.equal(final.result?.charges.prets[0]?.assuranceEmpruntExercice, 0, "toujours 0 en dernier ressort côté moteur — comportement existant préservé (?? 0 dans compute-financement-exercice.ts)");
  });

  it("D — externe : comportement existant préservé, y compris l'effacement explicite d'un montant déjà connu", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToInsuranceStep(assistant, { assuranceAnnuelle: 300 });
    const preExisting: F011State = { ...state, fieldSources: { ...state.fieldSources, assuranceAnnuelle: "extracted" } };

    // Montant fourni : non-régression, toujours appliqué tel quel.
    const withAmount = await assistant.handle(preExisting, {
      type: "set_insurance",
      assuranceType: "externe",
      assuranceAnnuelle: 450,
    });
    assert.equal(withAmount.state.pendingLoan?.assuranceAnnuelle, 450);
    assert.equal(withAmount.state.fieldSources.assuranceAnnuelle, "user_correction", "correction d'une valeur déjà extraite");

    // Montant explicitement effacé : doit rester effacé, jamais retomber sur l'ancienne valeur connue (300).
    const cleared = await assistant.handle(preExisting, {
      type: "set_insurance",
      assuranceType: "externe",
      assuranceAnnuelle: undefined,
    });
    assert.equal(cleared.state.pendingLoan?.assuranceAnnuelle, undefined, "un effacement explicite reste un effacement, jamais un repli sur l'ancien montant");
    assert.equal(cleared.state.fieldSources.assuranceAnnuelle, undefined, "provenance effacée avec la valeur");
  });

  it("E — aucune assurance connue (externe, jamais précisée) : comportement existant préservé, 0 en dernier ressort", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToInsuranceStep(assistant);
    const turn = await assistant.handle(state, {
      type: "set_insurance",
      assuranceType: "externe",
      assuranceAnnuelle: undefined,
    });
    const final = await finishLoan(assistant, turn.state);
    assert.equal(final.result?.charges.prets[0]?.assuranceEmpruntExercice, 0);
  });

  it("I — F006 reçoit les mêmes montants qu'avant : le calcul (compute-financement-exercice) n'est pas modifié par ce correctif", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToInsuranceStep(assistant, { assuranceAnnuelle: 240 });
    const preExisting: F011State = { ...state, fieldSources: { ...state.fieldSources, assuranceAnnuelle: "extracted" } };
    const turn = await assistant.handle(preExisting, { type: "set_insurance", assuranceType: "bancaire" });
    const final = await finishLoan(assistant, turn.state);
    const pret = final.result!.charges.prets[0]!;
    // Valeurs verrouillées pour ce scénario (capital 100000, taux 2%, 240 mois,
    // 1re mensualité 2022-01-01, assurance bancaire 240€/an, exercice 2022,
    // mise en service 2021-01-01 — aucune part pré-exploitation) : identiques
    // à ce qu'un audit F006 verrait avant comme après ce correctif, puisque
    // `computeFinancementExercice`/`aggregateFiscalInputs` ne sont pas touchés.
    assert.equal(pret.assuranceEmpruntExercice, 240);
    assert.equal(pret.interetsPreExploitation, 0);
    assert.equal(final.result!.charges.totalAssurance, 240);
    assert.equal(final.result!.charges.totalInteretsPreExploitation, 0);
  });
});
