import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F011FinancementAssistant } from "./assistant";
import { shouldResumeF011, toF011PersistedState } from "./types";
import type { F011Deps, F011PersistedState } from "./types";

const ctx = {
  dossierId: "test",
  fiscalYear: 2022,
  route: "/assistants/financement",
};

const DEPS_OK: F011Deps = { dateMiseEnService: "2021-01-01" };
const TS = "2024-03-01T10:00:00.000Z";

describe("F-011 — Cycle 2 : persistance et reprise", () => {
  it("A — persist collect prêt 1 : l'étape et le type choisi sont capturés, rien d'autre", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    let state = assistant.start().state;
    let turn = await assistant.handle(state, { type: "set_presence_emprunt", presence: true });
    state = turn.state;
    turn = await assistant.handle(state, { type: "set_nombre_prets", count: 1 });
    state = turn.state;
    turn = await assistant.handle(state, { type: "set_loan_type", typePret: "amortissable" });
    state = turn.state;

    const persisted = toF011PersistedState(state, TS);
    assert.equal(persisted.step, "loan_collect");
    assert.equal(persisted.currentLoanIndex, 0);
    assert.deepEqual(persisted.loans, []);
    assert.equal(persisted.pendingLoan?.typePret, "amortissable");
    assert.equal("result" in persisted, false);
  });

  it("B — reload prêt 1 : la reprise retombe exactement sur l'écran de saisie des montants", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const persisted: F011PersistedState = {
      step: "loan_collect",
      presenceEmprunt: true,
      nombrePrets: 1,
      currentLoanIndex: 0,
      loans: [],
      pendingLoan: { typePret: "amortissable" },
      fieldSources: {},
      updatedAt: TS,
    };
    const turn = assistant.resume(persisted);
    assert.equal(turn.state.step, "loan_collect");
    assert.equal(turn.completed, false);
    assert.ok(turn.messages.some((m) => m.content.includes("montant emprunté")));
  });

  it("C — persist compléments : les valeurs déjà saisies (dont l'assurance) sont capturées mi-parcours", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    let state = assistant.start().state;
    let turn = await assistant.handle(state, { type: "set_presence_emprunt", presence: true });
    turn = await assistant.handle(turn.state, { type: "set_nombre_prets", count: 1 });
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    turn = await assistant.handle(turn.state, {
      type: "submit_loan_terms",
      capitalInitial: 120000,
      tauxNominal: 0.02,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-01",
    });
    turn = await assistant.handle(turn.state, { type: "set_insurance", assuranceType: "externe", assuranceAnnuelle: 240 });
    state = turn.state;

    const persisted = toF011PersistedState(state, TS);
    assert.equal(persisted.step, "loan_guarantee");
    assert.equal(persisted.pendingLoan?.capitalInitial, 120000);
    assert.equal(persisted.pendingLoan?.assuranceType, "externe");
    assert.equal(persisted.pendingLoan?.assuranceAnnuelle, 240);
  });

  it("D — reload compléments : la reprise redemande la garantie avec ses suggestions", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const persisted: F011PersistedState = {
      step: "loan_guarantee",
      presenceEmprunt: true,
      nombrePrets: 1,
      currentLoanIndex: 0,
      loans: [],
      pendingLoan: {
        typePret: "amortissable",
        capitalInitial: 120000,
        tauxNominal: 0.02,
        dureeMois: 240,
        datePremiereMensualite: "2022-01-01",
        assuranceType: "externe",
        assuranceAnnuelle: 240,
      },
      fieldSources: {},
      updatedAt: TS,
    };
    const turn = assistant.resume(persisted);
    assert.equal(turn.state.step, "loan_guarantee");
    const last = turn.messages.at(-1);
    assert.ok(last?.suggestions?.some((s) => s.id === "garantie_caution"));
    assert.ok(last?.suggestions?.some((s) => s.id === "garantie_hypotheque_ippd"));
  });

  it("E — persist prêt 2 : le prêt 1 confirmé reste dans `loans`, l'index avance", async () => {
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

    const persisted = toF011PersistedState(turn.state, TS);
    assert.equal(persisted.step, "loan_source_choice", "Cycle 5 : chaque prêt recommence par le choix document/manuel");
    assert.equal(persisted.currentLoanIndex, 1);
    assert.equal(persisted.loans.length, 1);
    assert.equal(persisted.loans[0]?.capitalInitial, 100000);
  });

  it("F — reload prêt 2 : la reprise redemande le type du second prêt sans perdre le premier", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const persisted: F011PersistedState = {
      step: "loan_type",
      presenceEmprunt: true,
      nombrePrets: 2,
      currentLoanIndex: 1,
      loans: [
        {
          pretId: "pret-1",
          typePret: "amortissable",
          capitalInitial: 100000,
          tauxNominal: 0.02,
          dureeMois: 240,
          datePremiereMensualite: "2022-01-01",
        },
      ],
      pendingLoan: {},
      fieldSources: {},
      updatedAt: TS,
    };
    const turn = assistant.resume(persisted);
    assert.equal(turn.state.step, "loan_type");
    assert.equal(turn.state.loans.length, 1, "le prêt 1 déjà confirmé n'est jamais perdu");
    assert.ok(turn.messages.some((m) => m.content.includes("Prêt 2 sur 2")));
  });

  it("G — reload review : le récapitulatif du prêt en cours est recalculé à l'identique, pas rejoué", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    let turn = await assistant.handle(assistant.start().state, { type: "set_presence_emprunt", presence: true });
    turn = await assistant.handle(turn.state, { type: "set_nombre_prets", count: 1 });
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
    // turn.state.step === "loan_review" ; le message d'aperçu vient d'être poussé.
    const livePreview = turn.messages.at(-1);
    assert.ok(livePreview);

    const persisted = toF011PersistedState(turn.state, TS);
    assert.equal("result" in persisted, false, "aucun résultat n'est persisté à cette étape");

    const resumed = assistant.resume(persisted);
    assert.equal(resumed.state.step, "loan_review");
    const resumedPreview = resumed.messages.at(-1);
    assert.equal(resumedPreview?.content, livePreview?.content, "le recalcul à la reprise reproduit exactement le calcul initial");
  });

  it("H — reload aggregate : le résultat agrégé est recalculé, jamais lu depuis un blob figé", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    let turn = await assistant.handle(assistant.start().state, { type: "set_presence_emprunt", presence: true });
    turn = await assistant.handle(turn.state, { type: "set_nombre_prets", count: 1 });
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "in_fine" });
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
    assert.equal(turn.state.step, "aggregate_review");
    const liveTotal = turn.state.result?.charges.totalChargesFinancementExercice;
    assert.equal(liveTotal, 2400);

    const persisted = toF011PersistedState(turn.state, TS);
    assert.equal("result" in persisted, false);

    const resumed = assistant.resume(persisted);
    assert.equal(resumed.state.step, "aggregate_review");
    assert.equal(resumed.state.result?.charges.totalChargesFinancementExercice, liveTotal);
  });

  it("I — complete : un état terminal ne déclenche jamais la reprise (relève du raccourci legacy)", () => {
    assert.equal(shouldResumeF011({ step: "complete", currentLoanIndex: 0, loans: [], fieldSources: {}, updatedAt: TS }), false);
    assert.equal(shouldResumeF011({ step: "skipped", currentLoanIndex: 0, loans: [], fieldSources: {}, updatedAt: TS }), false);
    assert.equal(
      shouldResumeF011({ step: "presence_emprunt", currentLoanIndex: 0, loans: [], fieldSources: {}, updatedAt: TS }),
      false,
      "aucune progression réelle n'a encore été faite",
    );
  });

  it("K — données inconnues ignorées : un blob historique avec des champs étrangers ne fait pas planter la reprise", () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const persistedWithJunk = {
      step: "loan_insurance",
      presenceEmprunt: true,
      nombrePrets: 1,
      currentLoanIndex: 0,
      loans: [],
      pendingLoan: { typePret: "amortissable", capitalInitial: 50000, tauxNominal: 0.01, dureeMois: 120, datePremiereMensualite: "2022-01-01" },
      fieldSources: {},
      updatedAt: TS,
      // Champs d'un format futur/étranger — doivent être ignorés silencieusement.
      unknownFutureField: { anything: true },
      legacyDocumentBlob: "some-old-shape",
    } as unknown as F011PersistedState;

    const turn = assistant.resume(persistedWithJunk);
    assert.equal(turn.state.step, "loan_insurance");
    assert.equal(turn.completed, false);
  });

  it("L — aucun résultat calculé n'est jamais persisté, même si l'état vivant en porte un", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    let turn = await assistant.handle(assistant.start().state, { type: "set_presence_emprunt", presence: true });
    turn = await assistant.handle(turn.state, { type: "set_nombre_prets", count: 1 });
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
    assert.ok(turn.state.result, "l'état vivant porte bien un résultat calculé à ce stade");

    const persisted = toF011PersistedState(turn.state, TS);
    assert.equal(Object.prototype.hasOwnProperty.call(persisted, "result"), false);
  });

  it("M — calcul refait après reprise : la valeur recalculée est fiscalement correcte, pas juste cohérente avec elle-même", () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const persisted: F011PersistedState = {
      step: "aggregate_review",
      presenceEmprunt: true,
      nombrePrets: 1,
      currentLoanIndex: 0,
      loans: [
        {
          pretId: "pret-1",
          typePret: "in_fine",
          capitalInitial: 120000,
          tauxNominal: 0.02,
          dureeMois: 240,
          datePremiereMensualite: "2022-01-01",
        },
      ],
      fieldSources: {},
      updatedAt: TS,
    };
    const resumed = assistant.resume(persisted);
    assert.equal(
      resumed.state.result?.charges.totalChargesFinancementExercice,
      2400,
      "120000 × 2% = 2400, recalculé depuis les seuls prêts persistés",
    );
  });

  it("J bis — pas de blob persisté : la décision de reprise est un simple départ", () => {
    assert.equal(shouldResumeF011(undefined), false);
  });
});
