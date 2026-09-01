import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F011FinancementAssistant } from "./assistant";
import type { F011Deps, F011PersistedState, F011State } from "./types";
import { toF011PersistedState } from "./types";
import { mapCreditExtractionToF011Prefill } from "@/lib/lmnp/services/f011/credit-bridge";
import type { CreditAmortizationExtraction } from "@/lib/documents/gpt/schemas/credit-amortization.schema";
import type { CreditLoanOfferExtraction } from "@/lib/documents/gpt/schemas/credit-loan-offer.schema";
import {
  F011_CORE_LOAN_FIELD_ORDER,
  resolveNextF011LoanStepAfterReview,
  resolveNextMissingF011Field,
} from "./resolve-next-f011-loan-step";

const ctx = { dossierId: "test", fiscalYear: 2022, route: "/assistants/financement" };
const DEPS_OK: F011Deps = { dateMiseEnService: "2021-01-01" };
const TS = "2024-07-01T09:00:00.000Z";

/** Scénario QA réel navigateur — tableau d'amortissement + métadonnées documentaires. */
const QA_AMORTIZATION: CreditAmortizationExtraction = {
  loanAmount: 131481.96,
  loanDurationMonths: 317,
  firstPaymentDate: "2024-06-24",
};
const QA_DOCUMENTARY: CreditLoanOfferExtraction = {
  interestRate: 3.84,
};

const FULL_AMORTIZATION: CreditAmortizationExtraction = {
  loanAmount: 120000,
  loanDurationMonths: 240,
  firstPaymentDate: "2022-01-01",
  yearlyInsuranceTotal: 240,
};
const FULL_LOAN_OFFER: CreditLoanOfferExtraction = {
  loanType: "Prêt amortissable",
  interestRate: 2,
  applicationFees: 500,
};

function fullPrefill(documentId = "doc-1") {
  return mapCreditExtractionToF011Prefill(
    { amortization: FULL_AMORTIZATION, loanOffer: FULL_LOAN_OFFER },
    documentId,
    TS,
  );
}

function qaPrefill(documentId = "qa-doc") {
  return mapCreditExtractionToF011Prefill(
    { amortization: QA_AMORTIZATION, loanOffer: QA_DOCUMENTARY },
    documentId,
    TS,
  );
}

/** Même scénario QA réel navigateur, avec l'assurance annuelle bancaire extraite du tableau (661 €). */
const QA_AMORTIZATION_WITH_INSURANCE: CreditAmortizationExtraction = {
  ...QA_AMORTIZATION,
  yearlyInsuranceTotal: 661,
};

function qaPrefillWithInsurance(documentId = "qa-doc-insurance") {
  return mapCreditExtractionToF011Prefill(
    { amortization: QA_AMORTIZATION_WITH_INSURANCE, loanOffer: QA_DOCUMENTARY },
    documentId,
    TS,
  );
}

async function driveToSourceChoice(assistant: F011FinancementAssistant, count = 1): Promise<F011State> {
  let turn = await assistant.handle(assistant.start().state, { type: "set_presence_emprunt", presence: true });
  turn = await assistant.handle(turn.state, { type: "set_nombre_prets", count });
  return turn.state;
}

async function driveToReviewExtraction(
  assistant: F011FinancementAssistant,
  prefill = fullPrefill(),
  documentId = "doc-1",
): Promise<F011State> {
  const state = await driveToSourceChoice(assistant);
  let turn = await assistant.handle(state, { type: "choose_loan_source", source: "document" });
  turn = await assistant.handle(turn.state, { type: "upload_document", documentId });
  turn = await assistant.handle(turn.state, { type: "analysis_success", documentId, prefill });
  return turn.state;
}

async function finishComplements(assistant: F011FinancementAssistant, state: F011State): Promise<F011State> {
  let turn = await assistant.handle(state, { type: "set_insurance", assuranceType: "bancaire" });
  turn = await assistant.handle(turn.state, { type: "set_guarantee", typeGarantie: "aucune" });
  turn = await assistant.handle(turn.state, { type: "set_fees", souscritCetExercice: false });
  turn = await assistant.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
  return turn.state;
}

describe("resolveNextMissingF011Field — pure", () => {
  it("ordre stable typePret → capital → taux → durée → date", () => {
    assert.deepEqual(F011_CORE_LOAN_FIELD_ORDER, [
      "typePret",
      "capitalInitial",
      "tauxNominal",
      "dureeMois",
      "datePremiereMensualite",
    ]);
  });

  it("A — 4 champs extraits + type : aucun manquant", () => {
    assert.deepEqual(
      resolveNextMissingF011Field({
        typePret: "amortissable",
        capitalInitial: 131481.96,
        tauxNominal: 0.0384,
        dureeMois: 317,
        datePremiereMensualite: "2024-06-24",
      }),
      { field: null },
    );
    assert.equal(resolveNextF011LoanStepAfterReview({
      typePret: "amortissable",
      capitalInitial: 131481.96,
      tauxNominal: 0.0384,
      dureeMois: 317,
      datePremiereMensualite: "2024-06-24",
    }), "loan_insurance");
  });

  it("B — capital manquant → loan_collect", () => {
    assert.deepEqual(resolveNextMissingF011Field({ typePret: "amortissable", tauxNominal: 0.03, dureeMois: 240, datePremiereMensualite: "2022-01-01" }), { field: "capitalInitial" });
    assert.equal(resolveNextF011LoanStepAfterReview({ typePret: "amortissable", tauxNominal: 0.03, dureeMois: 240, datePremiereMensualite: "2022-01-01" }), "loan_collect");
  });

  it("C — taux manquant → loan_collect", () => {
    assert.deepEqual(resolveNextMissingF011Field({ typePret: "amortissable", capitalInitial: 100000, dureeMois: 240, datePremiereMensualite: "2022-01-01" }), { field: "tauxNominal" });
  });

  it("D — durée manquante → loan_collect", () => {
    assert.deepEqual(resolveNextMissingF011Field({ typePret: "amortissable", capitalInitial: 100000, tauxNominal: 0.02, datePremiereMensualite: "2022-01-01" }), { field: "dureeMois" });
  });

  it("E — date manquante → loan_collect", () => {
    assert.deepEqual(resolveNextMissingF011Field({ typePret: "amortissable", capitalInitial: 100000, tauxNominal: 0.02, dureeMois: 240 }), { field: "datePremiereMensualite" });
  });

  it("F — type connu → pas loan_type (step = loan_insurance si cœur complet)", () => {
    assert.equal(resolveNextF011LoanStepAfterReview({ typePret: "in_fine", capitalInitial: 1, tauxNominal: 0.01, dureeMois: 12, datePremiereMensualite: "2020-01-01" }), "loan_insurance");
  });

  it("G — type manquant → loan_type", () => {
    assert.deepEqual(resolveNextMissingF011Field({ capitalInitial: 100000, tauxNominal: 0.02, dureeMois: 240, datePremiereMensualite: "2022-01-01" }), { field: "typePret" });
    assert.equal(resolveNextF011LoanStepAfterReview({ capitalInitial: 100000, tauxNominal: 0.02, dureeMois: 240, datePremiereMensualite: "2022-01-01" }), "loan_type");
  });

  it("I — zéro n'est pas manquant", () => {
    assert.deepEqual(resolveNextMissingF011Field({ typePret: "amortissable", capitalInitial: 0, tauxNominal: 0, dureeMois: 0, datePremiereMensualite: "2022-01-01" }), { field: null });
  });
});

describe("F-011 — QA correctif : ne plus redemander les données extraites", () => {
  it("A/H — 4 champs extraits + type connu : confirm_extraction saute loan_collect → loan_insurance", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToReviewExtraction(assistant);
    const turn = await assistant.handle(state, { type: "confirm_extraction" });
    assert.equal(turn.state.step, "loan_insurance", "loan_collect ne doit pas être imposé");
    assert.ok(turn.messages.at(-1)?.content.includes("assurance"), "premier complément demandé");
    assert.notEqual(turn.messages.at(-1)?.content, "Indiquez le montant emprunté, le taux annuel, la durée en mois et la date de la première mensualité.");
  });

  it("G — type manquant (tableau seul) : confirm_extraction → loan_type", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const prefill = mapCreditExtractionToF011Prefill({ amortization: FULL_AMORTIZATION }, "doc-2", TS);
    const state = await driveToReviewExtraction(assistant, prefill, "doc-2");
    const turn = await assistant.handle(state, { type: "confirm_extraction" });
    assert.equal(turn.state.step, "loan_type");
    assert.equal(turn.state.pendingLoan?.typePret, undefined);
  });

  it("H — type défini puis champs complets : set_loan_type saute loan_collect → loan_insurance", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const prefill = mapCreditExtractionToF011Prefill(
      { amortization: FULL_AMORTIZATION, loanOffer: { interestRate: 2 } },
      "doc-3",
      TS,
    );
    const state = await driveToReviewExtraction(assistant, prefill, "doc-3");
    let turn = await assistant.handle(state, { type: "confirm_extraction" });
    assert.equal(turn.state.step, "loan_type");
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    assert.equal(turn.state.step, "loan_insurance", "loan_collect sauté après type");
    assert.equal(turn.state.pendingLoan?.capitalInitial, 120000);
  });

  it("B — capital manquant après review : confirm_extraction → loan_collect", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const prefill = mapCreditExtractionToF011Prefill(
      { amortization: { loanDurationMonths: 240, firstPaymentDate: "2022-01-01" }, loanOffer: { loanType: "Prêt amortissable", interestRate: 2 } },
      "doc-partial",
      TS,
    );
    const state = await driveToReviewExtraction(assistant, prefill, "doc-partial");
    const turn = await assistant.handle(state, { type: "confirm_extraction" });
    assert.equal(turn.state.step, "loan_collect");
  });

  it("J — fieldSources conservés après saut de loan_collect", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToReviewExtraction(assistant);
    assert.equal(state.fieldSources.capitalInitial, "extracted");
    const turn = await assistant.handle(state, { type: "confirm_extraction" });
    assert.equal(turn.state.fieldSources.capitalInitial, "extracted");
    assert.equal(turn.state.fieldSources.tauxNominal, "extracted");
  });

  it("K — refresh/reprise : reprise sur loan_insurance après saut", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToReviewExtraction(assistant);
    const turn = await assistant.handle(state, { type: "confirm_extraction" });
    assert.equal(turn.state.step, "loan_insurance");
    const persisted: F011PersistedState = toF011PersistedState(turn.state, TS);
    const resumed = assistant.resume(persisted);
    assert.equal(resumed.state.step, "loan_insurance");
    assert.equal(resumed.state.pendingLoan?.capitalInitial, 120000);
  });

  it("L — manuel inchangé : chemin manuel sans extraction passe toujours par loan_type puis loan_collect", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToSourceChoice(assistant);
    let turn = await assistant.handle(state, { type: "choose_loan_source", source: "manual" });
    assert.equal(turn.state.step, "loan_type");
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    assert.equal(turn.state.step, "loan_collect");
  });

  it("M — multi-prêts : document complet saute loan_collect, second prêt inchangé", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    let state = await driveToSourceChoice(assistant, 2);
    let turn = await assistant.handle(state, { type: "choose_loan_source", source: "document" });
    turn = await assistant.handle(turn.state, { type: "upload_document", documentId: "doc-m1" });
    turn = await assistant.handle(turn.state, { type: "analysis_success", documentId: "doc-m1", prefill: fullPrefill("doc-m1") });
    turn = await assistant.handle(turn.state, { type: "confirm_extraction" });
    assert.equal(turn.state.step, "loan_insurance");
    state = await finishComplements(assistant, turn.state);
    turn = await assistant.handle(state, { type: "set_ira", remboursementAnticipe: false });
    turn = await assistant.handle(turn.state, { type: "confirm_loan" });
    assert.equal(turn.state.step, "loan_source_choice");
    turn = await assistant.handle(turn.state, { type: "choose_loan_source", source: "manual" });
    assert.equal(turn.state.step, "loan_type");
  });

  it("O — scénario QA réel 131481.96 / 3.84% / 317 / 2024-06-24 : type puis assurance, jamais loan_collect", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const prefill = qaPrefill();
    assert.equal(prefill.fields.capitalInitial, 131481.96);
    assert.equal(prefill.fields.tauxNominal, 0.0384);
    assert.equal(prefill.fields.dureeMois, 317);
    assert.equal(prefill.fields.datePremiereMensualite, "2024-06-24");
    assert.equal(prefill.fields.typePret, undefined, "CAS B — pas de type fiable sans loanType explicite");

    const state = await driveToReviewExtraction(assistant, prefill, "qa-doc");
    let turn = await assistant.handle(state, { type: "confirm_extraction" });
    assert.equal(turn.state.step, "loan_type");

    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    assert.equal(turn.state.step, "loan_insurance");
    assert.equal(turn.state.pendingLoan?.capitalInitial, 131481.96);
    assert.equal(turn.state.pendingLoan?.tauxNominal, 0.0384);
    assert.equal(turn.state.pendingLoan?.dureeMois, 317);
    assert.equal(turn.state.pendingLoan?.datePremiereMensualite, "2024-06-24");
    assert.ok(turn.messages.at(-1)?.content.includes("assurance"));
  });

  it("document partiel → loan_collect quand un champ cœur manque après type", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const capitalOnly = mapCreditExtractionToF011Prefill({ amortization: { loanAmount: 90000 } }, "doc-4", TS);
    const state = await driveToReviewExtraction(assistant, capitalOnly, "doc-4");
    let turn = await assistant.handle(state, { type: "confirm_extraction" });
    assert.equal(turn.state.step, "loan_type");
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    assert.equal(turn.state.step, "loan_collect", "taux/durée/date encore manquants");
    assert.equal(turn.state.pendingLoan?.capitalInitial, 90000);
  });

  it("parcours document complet jusqu'à aggregate sans submit_loan_terms redondant", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    let state = await driveToReviewExtraction(assistant);
    let turn = await assistant.handle(state, { type: "confirm_extraction" });
    assert.equal(turn.state.step, "loan_insurance");
    state = await finishComplements(assistant, turn.state);
    turn = await assistant.handle(state, { type: "set_ira", remboursementAnticipe: false });
    turn = await assistant.handle(turn.state, { type: "confirm_loan" });
    assert.equal(turn.state.step, "aggregate_review");
    assert.equal(turn.state.loans[0]?.capitalInitial, 120000);
    assert.ok(turn.state.result!.charges.totalChargesFinancementExercice > 0);
  });
});

describe("F-011 — correctif assurance bancaire : ne jamais écraser un montant connu", () => {
  it("A/B/D/I/J — scénario exact navigateur : 661 € bancaire extraits sont conservés, provenance intacte, comptés en charge déductible", async () => {
    // Exercice/date de mise en service alignés sur la première mensualité réelle
    // du scénario (2024-06-24) — un exercice 2022 (comme le `ctx` par défaut de
    // ce fichier) ne contiendrait aucune échéance de ce prêt et fausserait le
    // montant final déductible sans rapport avec le correctif testé ici.
    const assistant = new F011FinancementAssistant(
      { ...ctx, fiscalYear: 2024 },
      { dateMiseEnService: "2024-01-01" },
    );
    const prefill = qaPrefillWithInsurance();
    assert.equal(prefill.fields.assuranceAnnuelle, 661);

    const state = await driveToReviewExtraction(assistant, prefill, "qa-doc-insurance");
    let turn = await assistant.handle(state, { type: "confirm_extraction" });
    assert.equal(turn.state.step, "loan_type");
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    assert.equal(turn.state.step, "loan_insurance");
    assert.equal(turn.state.pendingLoan?.assuranceAnnuelle, 661, "toujours présent avant le choix du type d'assurance");
    assert.equal(turn.state.fieldSources.assuranceAnnuelle, "extracted");

    turn = await assistant.handle(turn.state, { type: "set_insurance", assuranceType: "bancaire" });
    assert.equal(turn.state.pendingLoan?.assuranceAnnuelle, 661, "I — bancaire ne détruit jamais un montant déjà extrait");
    assert.equal(turn.state.fieldSources.assuranceAnnuelle, "extracted", "B — provenance conservée");
    // K — les autres provenances ne sont pas affectées par ce choix.
    assert.equal(turn.state.fieldSources.capitalInitial, "extracted");
    assert.equal(turn.state.fieldSources.tauxNominal, "extracted");

    turn = await assistant.handle(turn.state, { type: "set_guarantee", typeGarantie: "aucune" });
    turn = await assistant.handle(turn.state, { type: "set_fees", souscritCetExercice: false });
    turn = await assistant.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
    turn = await assistant.handle(turn.state, { type: "confirm_loan" });
    assert.equal(turn.state.step, "aggregate_review");
    assert.ok(
      turn.state.result!.charges.prets[0]!.assuranceEmpruntExercice > 0,
      "D/J — l'assurance bancaire extraite du tableau est comptée, pas ignorée",
    );
  });

  it("C — le message annonce le montant retenu, jamais l'absence de tableau quand un montant est connu", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToReviewExtraction(assistant, qaPrefillWithInsurance(), "qa-doc-insurance-msg");
    let turn = await assistant.handle(state, { type: "confirm_extraction" });
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    turn = await assistant.handle(turn.state, { type: "set_insurance", assuranceType: "bancaire" });
    const ack = turn.messages.find((m) => m.content.includes("Assurance bancaire"));
    assert.ok(ack, "un message d'accusé de réception doit être présent");
    assert.ok(ack!.content.includes("661"), "le montant retenu doit être annoncé");
    assert.ok(
      !ack!.content.includes("Sans tableau d'amortissement importé"),
      "ne jamais prétendre l'absence de tableau quand un montant a été extrait",
    );
  });

  it("F — bancaire sans aucun montant connu : le message d'impossibilité reste inchangé, rien n'est inventé", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
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
    turn = await assistant.handle(turn.state, { type: "set_insurance", assuranceType: "bancaire" });
    assert.equal(turn.state.pendingLoan?.assuranceAnnuelle, undefined, "aucun montant n'est inventé");
    const ack = turn.messages.find((m) => m.content.includes("Assurance bancaire"));
    assert.ok(ack?.content.includes("Sans tableau d'amortissement importé"));
  });

  it("H — externe + montant extrait confirmé tel quel : la provenance reste 'extracted', non-régression", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToReviewExtraction(assistant, qaPrefillWithInsurance(), "qa-doc-insurance-externe");
    let turn = await assistant.handle(state, { type: "confirm_extraction" });
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    turn = await assistant.handle(turn.state, {
      type: "set_insurance",
      assuranceType: "externe",
      assuranceAnnuelle: 661,
    });
    assert.equal(turn.state.pendingLoan?.assuranceAnnuelle, 661);
    assert.equal(
      turn.state.fieldSources.assuranceAnnuelle,
      "extracted",
      "confirmer tel quel le montant extrait n'en fait pas une correction",
    );
  });

  it("L — persistance/reprise : le montant bancaire conservé survit à un refresh", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToReviewExtraction(assistant, qaPrefillWithInsurance(), "qa-doc-insurance-resume");
    let turn = await assistant.handle(state, { type: "confirm_extraction" });
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    turn = await assistant.handle(turn.state, { type: "set_insurance", assuranceType: "bancaire" });
    assert.equal(turn.state.step, "loan_guarantee");

    const persisted: F011PersistedState = toF011PersistedState(turn.state, TS);
    const resumed = assistant.resume(persisted);
    assert.equal(resumed.state.pendingLoan?.assuranceAnnuelle, 661, "la reprise ne perd pas le montant conservé");
    assert.equal(resumed.state.fieldSources.assuranceAnnuelle, "extracted");
  });

  it("M — multi-prêts : le montant bancaire du prêt 1 ne fuit jamais vers le prêt 2", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToSourceChoice(assistant, 2);

    // Prêt 1 — document avec assurance bancaire extraite.
    let turn = await assistant.handle(state, { type: "choose_loan_source", source: "document" });
    turn = await assistant.handle(turn.state, { type: "upload_document", documentId: "doc-m-insurance" });
    turn = await assistant.handle(turn.state, {
      type: "analysis_success",
      documentId: "doc-m-insurance",
      prefill: qaPrefillWithInsurance("doc-m-insurance"),
    });
    turn = await assistant.handle(turn.state, { type: "confirm_extraction" });
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    turn = await assistant.handle(turn.state, { type: "set_insurance", assuranceType: "bancaire" });
    assert.equal(turn.state.pendingLoan?.assuranceAnnuelle, 661);
    turn = await assistant.handle(turn.state, { type: "set_guarantee", typeGarantie: "aucune" });
    turn = await assistant.handle(turn.state, { type: "set_fees", souscritCetExercice: false });
    turn = await assistant.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
    turn = await assistant.handle(turn.state, { type: "confirm_loan" });
    assert.equal(turn.state.step, "loan_source_choice");

    // Prêt 2 — manuel, bancaire, jamais aucune extraction : ne doit jamais hériter du montant du prêt 1.
    turn = await assistant.handle(turn.state, { type: "choose_loan_source", source: "manual" });
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    turn = await assistant.handle(turn.state, {
      type: "submit_loan_terms",
      capitalInitial: 50000,
      tauxNominal: 0.02,
      dureeMois: 120,
      datePremiereMensualite: "2022-01-01",
    });
    turn = await assistant.handle(turn.state, { type: "set_insurance", assuranceType: "bancaire" });
    assert.equal(turn.state.pendingLoan?.assuranceAnnuelle, undefined, "aucune fuite d'assurance entre prêts");
  });
});
