import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F011FinancementAssistant } from "./assistant";
import type { F011Deps, F011State } from "./types";

const ctx = {
  dossierId: "test",
  fiscalYear: 2022,
  route: "/assistants/financement",
};

const DEPS_OK: F011Deps = { dateMiseEnService: "2021-01-01" };

/** Amène l'assistant jusqu'à la fin de la saisie des montants (étape assurance) pour un seul prêt. */
async function startSingleLoan(
  assistant: F011FinancementAssistant,
  typePret: "amortissable" | "in_fine",
  terms: { capitalInitial: number; tauxNominal: number; dureeMois: number; datePremiereMensualite: string },
): Promise<F011State> {
  let state = assistant.start().state;
  let turn = await assistant.handle(state, { type: "set_presence_emprunt", presence: true });
  state = turn.state;
  turn = await assistant.handle(state, { type: "set_nombre_prets", count: 1 });
  state = turn.state;
  turn = await assistant.handle(state, { type: "set_loan_type", typePret });
  state = turn.state;
  turn = await assistant.handle(state, { type: "submit_loan_terms", ...terms });
  return turn.state;
}

/** Complète assurance / garantie / frais / IRA avec des réponses "non" par défaut, puis confirme le prêt unique. */
async function finishWithDefaults(
  assistant: F011FinancementAssistant,
  state: F011State,
  overrides: {
    insurance?: { assuranceType: "bancaire" | "externe"; assuranceAnnuelle?: number };
    guarantee?: { typeGarantie: "caution" | "hypotheque_ippd" | "aucune"; commissionCaution?: number };
    fees?: { souscritCetExercice: boolean; fraisDossier?: number };
    ira?: { remboursementAnticipe: boolean; montant?: number };
  } = {},
): Promise<F011State> {
  let turn = await assistant.handle(
    state,
    overrides.insurance
      ? { type: "set_insurance", ...overrides.insurance }
      : { type: "set_insurance", assuranceType: "bancaire" },
  );
  turn = await assistant.handle(
    turn.state,
    overrides.guarantee
      ? { type: "set_guarantee", ...overrides.guarantee }
      : { type: "set_guarantee", typeGarantie: "aucune" },
  );
  turn = await assistant.handle(
    turn.state,
    overrides.fees ? { type: "set_fees", ...overrides.fees } : { type: "set_fees", souscritCetExercice: false },
  );
  turn = await assistant.handle(
    turn.state,
    overrides.ira
      ? { type: "set_ira", ...overrides.ira }
      : { type: "set_ira", remboursementAnticipe: false },
  );
  // turn.state.step === "loan_review"
  turn = await assistant.handle(turn.state, { type: "confirm_loan" });
  // single loan → "aggregate_review"
  turn = await assistant.handle(turn.state, { type: "confirm_all" });
  return turn.state;
}

describe("F-011 — Assistant Financement (Cycle 1 — fiabilité fiscale)", () => {
  it("N — non-régression : skip immédiat si pas d'emprunt", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const start = assistant.start();
    const turn = await assistant.handle(start.state, { type: "set_presence_emprunt", presence: false });
    assert.equal(turn.completed, true);
    assert.equal(turn.event, "FINANCEMENT_SKIP");
    assert.equal(turn.state.result?.skipped, true);
  });

  it("N — non-régression : prêt amortissable simple sans compléments reproduit le calcul existant", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    let state = await startSingleLoan(assistant, "amortissable", {
      capitalInitial: 200000,
      tauxNominal: 0.0185,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-15",
    });
    state = await finishWithDefaults(assistant, state);
    const pret = state.result?.charges.prets[0];
    assert.ok(pret);
    assert.ok(pret!.interetsEmpruntExercice > 0);
    assert.equal(
      state.result?.charges.totalChargesFinancementExercice,
      state.result?.charges.totalInteretsEmprunt,
      "sans assurance/garantie/frais/IRA, le total = les seuls intérêts",
    );
  });

  it("A — type amortissable : le capital se rembourse au fil de l'exercice", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    let state = await startSingleLoan(assistant, "amortissable", {
      capitalInitial: 100000,
      tauxNominal: 0.02,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-15",
    });
    state = await finishWithDefaults(assistant, state);
    const pret = state.result?.charges.prets[0];
    assert.equal(pret?.typePret, "amortissable");
    assert.ok(pret!.capitalRembourseExercice > 0, "un prêt amortissable rembourse du capital chaque année");
  });

  it("B — type in fine : aucun capital remboursé, intérêts constants = capital × taux", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    let state = await startSingleLoan(assistant, "in_fine", {
      capitalInitial: 120000,
      tauxNominal: 0.02,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-01",
    });
    state = await finishWithDefaults(assistant, state);
    const pret = state.result?.charges.prets[0];
    assert.equal(pret?.typePret, "in_fine");
    assert.equal(pret?.capitalRembourseExercice, 0, "un prêt in fine ne rembourse jamais de capital");
    assert.equal(pret?.interetsEmpruntExercice, 2400, "intérêts in fine = capital × taux = 120000 × 2%");
  });

  it("C — assurance bancaire : jamais isolée sans tableau importé, reste à 0 sans être ignorée silencieusement", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    let state = await startSingleLoan(assistant, "amortissable", {
      capitalInitial: 100000,
      tauxNominal: 0.02,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-01",
    });
    state = await finishWithDefaults(assistant, state, {
      insurance: { assuranceType: "bancaire" },
    });
    assert.equal(state.loans[0]?.assuranceType, "bancaire", "le choix de l'utilisateur est bien mémorisé");
    assert.equal(state.result?.charges.prets[0]?.assuranceEmpruntExercice, 0);
  });

  it("D — assurance externe : montant annuel saisi devient une charge déductible", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    let state = await startSingleLoan(assistant, "amortissable", {
      capitalInitial: 100000,
      tauxNominal: 0.02,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-01",
    });
    state = await finishWithDefaults(assistant, state, {
      insurance: { assuranceType: "externe", assuranceAnnuelle: 300 },
    });
    assert.equal(state.result?.charges.prets[0]?.assuranceEmpruntExercice, 300);
  });

  it("E — frais de dossier : déductibles uniquement si le prêt est souscrit cette année", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    let state = await startSingleLoan(assistant, "amortissable", {
      capitalInitial: 100000,
      tauxNominal: 0.02,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-01",
    });
    state = await finishWithDefaults(assistant, state, {
      fees: { souscritCetExercice: true, fraisDossier: 1200 },
    });
    assert.equal(state.result?.charges.prets[0]?.fraisDossierDeductibles, 1200);
  });

  it("E bis — frais de dossier non demandés si le prêt n'est pas souscrit cette année", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    let state = await startSingleLoan(assistant, "amortissable", {
      capitalInitial: 100000,
      tauxNominal: 0.02,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-01",
    });
    state = await finishWithDefaults(assistant, state, {
      fees: { souscritCetExercice: false },
    });
    assert.equal(state.loans[0]?.fraisDossier, undefined);
    assert.equal(state.result?.charges.prets[0]?.fraisDossierDeductibles, 0);
  });

  it("F — garantie caution : la commission saisie devient une charge déductible", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    let state = await startSingleLoan(assistant, "amortissable", {
      capitalInitial: 100000,
      tauxNominal: 0.02,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-01",
    });
    state = await finishWithDefaults(assistant, state, {
      guarantee: { typeGarantie: "caution", commissionCaution: 800 },
      fees: { souscritCetExercice: true },
    });
    assert.equal(state.result?.charges.prets[0]?.garantieDeductible, 800);
  });

  it("G — garantie hypothèque/IPPD : le moteur ne sait pas représenter cette distinction fiscale, donc aucun montant n'est demandé ni déduit", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await startSingleLoan(assistant, "amortissable", {
      capitalInitial: 100000,
      tauxNominal: 0.02,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-01",
    });
    let turn = await assistant.handle(state, { type: "set_insurance", assuranceType: "bancaire" });
    turn = await assistant.handle(turn.state, { type: "set_guarantee", typeGarantie: "hypotheque_ippd" });

    // Le message doit expliquer pourquoi, pas juste rester silencieux.
    const explanation = turn.messages.find((m) => m.content.includes("prix de revient"));
    assert.ok(explanation, "l'assistant doit signaler que ce cas relève de F-010, pas d'un montant F-011");
    assert.equal(
      turn.state.pendingLoan?.commissionCaution,
      undefined,
      "aucun montant ne doit être associé à typeGarantie=hypotheque_ippd",
    );

    turn = await assistant.handle(turn.state, { type: "set_fees", souscritCetExercice: false });
    turn = await assistant.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
    turn = await assistant.handle(turn.state, { type: "confirm_loan" });
    turn = await assistant.handle(turn.state, { type: "confirm_all" });

    assert.equal(
      turn.state.result?.charges.prets[0]?.garantieDeductible,
      0,
      "STOP confirmé : le moteur actuel ne permet pas de représenter hypothèque/IPPD comme une charge F-011 " +
        "sans risquer un double comptage avec le prix de revient F-010 — nécessite un arbitrage métier séparé.",
    );
  });

  it("H — IRA : remboursement anticipé dans l'exercice devient une charge déductible", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    let state = await startSingleLoan(assistant, "amortissable", {
      capitalInitial: 100000,
      tauxNominal: 0.02,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-01",
    });
    state = await finishWithDefaults(assistant, state, {
      ira: { remboursementAnticipe: true, montant: 500 },
    });
    assert.equal(state.result?.charges.prets[0]?.iraDeductible, 500);
  });

  it("H bis — pas d'IRA si aucun remboursement anticipé n'est déclaré", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    let state = await startSingleLoan(assistant, "amortissable", {
      capitalInitial: 100000,
      tauxNominal: 0.02,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-01",
    });
    state = await finishWithDefaults(assistant, state, { ira: { remboursementAnticipe: false } });
    assert.equal(state.loans[0]?.iraMontant, undefined);
    assert.equal(state.result?.charges.prets[0]?.iraDeductible, 0);
  });

  it("I — dateMiseEnService présente : le parcours avance normalement", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const start = assistant.start();
    const turn = await assistant.handle(start.state, { type: "set_presence_emprunt", presence: true });
    assert.equal(turn.state.step, "nombre_prets");
    assert.notEqual(turn.event, "FINANCEMENT_BLOQUE");
  });

  it("J — dateMiseEnService absente : le calcul est bloqué, jamais une date n'est inventée", async () => {
    const assistant = new F011FinancementAssistant(ctx, {});
    const start = assistant.start();
    const turn = await assistant.handle(start.state, { type: "set_presence_emprunt", presence: true });
    assert.equal(turn.state.step, "blocked_missing_date");
    assert.equal(turn.event, "FINANCEMENT_BLOQUE");
    assert.equal(turn.completed, false);
    assert.equal(turn.state.result, undefined);
  });

  it("K — aucune valeur fiscale n'est inventée quand l'utilisateur ne fournit aucun complément", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    let state = await startSingleLoan(assistant, "amortissable", {
      capitalInitial: 100000,
      tauxNominal: 0.02,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-01",
    });
    state = await finishWithDefaults(assistant, state); // bancaire / aucune garantie / pas souscrit / pas d'IRA
    const pret = state.result?.charges.prets[0];
    assert.equal(pret?.assuranceEmpruntExercice, 0);
    assert.equal(pret?.fraisDossierDeductibles, 0);
    assert.equal(pret?.garantieDeductible, 0);
    assert.equal(pret?.iraDeductible, 0);
  });

  it("L — plusieurs prêts : chaque prêt garde ses propres compléments, le total agrège les deux", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    let state = assistant.start().state;
    let turn = await assistant.handle(state, { type: "set_presence_emprunt", presence: true });
    state = turn.state;
    turn = await assistant.handle(state, { type: "set_nombre_prets", count: 2 });
    state = turn.state;
    assert.equal(state.step, "loan_source_choice", "Cycle 5 : chaque prêt choisit d'abord document/manuel");

    // Prêt 1 — amortissable, assurance externe (chemin manuel).
    turn = await assistant.handle(state, { type: "choose_loan_source", source: "manual" });
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    turn = await assistant.handle(turn.state, {
      type: "submit_loan_terms",
      capitalInitial: 100000,
      tauxNominal: 0.02,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-01",
    });
    turn = await assistant.handle(turn.state, {
      type: "set_insurance",
      assuranceType: "externe",
      assuranceAnnuelle: 240,
    });
    turn = await assistant.handle(turn.state, { type: "set_guarantee", typeGarantie: "aucune" });
    turn = await assistant.handle(turn.state, { type: "set_fees", souscritCetExercice: false });
    turn = await assistant.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
    turn = await assistant.handle(turn.state, { type: "confirm_loan" });
    assert.equal(turn.state.step, "loan_source_choice", "chaque prêt recommence par le choix document/manuel (Cycle 5)");
    assert.equal(turn.state.currentLoanIndex, 1);

    // Prêt 2 — in fine, IRA (chemin manuel).
    turn = await assistant.handle(turn.state, { type: "choose_loan_source", source: "manual" });
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
    turn = await assistant.handle(turn.state, { type: "set_ira", remboursementAnticipe: true, montant: 400 });
    turn = await assistant.handle(turn.state, { type: "confirm_loan" });
    assert.equal(turn.state.step, "aggregate_review");
    turn = await assistant.handle(turn.state, { type: "confirm_all" });

    assert.equal(turn.state.loans.length, 2);
    assert.equal(turn.state.result?.charges.prets.length, 2);
    assert.equal(turn.state.result?.charges.prets[0]?.typePret, "amortissable");
    assert.equal(turn.state.result?.charges.prets[1]?.typePret, "in_fine");
    assert.equal(turn.state.result?.charges.prets[1]?.iraDeductible, 400);
    assert.equal(
      turn.state.result?.charges.totalAssurance,
      turn.state.result!.charges.prets[0].assuranceEmpruntExercice + turn.state.result!.charges.prets[1].assuranceEmpruntExercice,
    );
  });

  it("M — financementCharges agrège correctement intérêts, assurance, frais, garantie et IRA", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    let state = await startSingleLoan(assistant, "in_fine", {
      capitalInitial: 120000,
      tauxNominal: 0.02,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-01",
    });
    state = await finishWithDefaults(assistant, state, {
      insurance: { assuranceType: "externe", assuranceAnnuelle: 120 },
      guarantee: { typeGarantie: "caution", commissionCaution: 800 },
      fees: { souscritCetExercice: true, fraisDossier: 300 },
      ira: { remboursementAnticipe: true, montant: 500 },
    });
    const charges = state.result?.charges;
    assert.ok(charges);
    const expectedTotal =
      charges!.totalInteretsEmprunt +
      charges!.totalAssurance +
      (charges!.prets[0].fraisDossierDeductibles + charges!.prets[0].garantieDeductible + charges!.prets[0].iraDeductible);
    assert.equal(charges!.totalChargesFinancementExercice, expectedTotal);
    assert.equal(charges!.totalChargesFinancementExercice, 2400 + 120 + 300 + 800 + 500);
  });
});
