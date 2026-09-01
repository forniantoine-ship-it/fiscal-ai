import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F011FinancementAssistant } from "./assistant";
import type { F011Deps, F011PersistedState, F011State } from "./types";
import { toF011PersistedState } from "./types";
import { mapCreditExtractionToF011Prefill } from "@/lib/lmnp/services/f011/credit-bridge";
import type { CreditAmortizationExtraction } from "@/lib/documents/gpt/schemas/credit-amortization.schema";
import type { CreditLoanOfferExtraction } from "@/lib/documents/gpt/schemas/credit-loan-offer.schema";

const ctx = { dossierId: "test", fiscalYear: 2022, route: "/assistants/financement" };
const DEPS_OK: F011Deps = { dateMiseEnService: "2021-01-01" };
const TS = "2024-07-01T09:00:00.000Z";

/** 4 champs cœur + type déjà extraits — pour atteindre `loan_insurance` sans loan_collect. */
const AMORTIZATION_FULL: CreditAmortizationExtraction = {
  loanAmount: 100000,
  loanDurationMonths: 240,
  firstPaymentDate: "2022-01-01",
};

function offerWithGuaranteeFees(fees: number | undefined): CreditLoanOfferExtraction {
  return { loanType: "Prêt amortissable", interestRate: 2, guaranteeFees: fees };
}

/** Avance jusqu'à `loan_guarantee` pour un unique prêt document, avec ou sans `guaranteeFees` détecté. */
async function driveToGuaranteeStep(
  assistant: F011FinancementAssistant,
  guaranteeFees: number | undefined,
  documentId = "doc-g",
): Promise<{ state: F011State; guaranteeMessages: string[] }> {
  const prefill = mapCreditExtractionToF011Prefill(
    { amortization: AMORTIZATION_FULL, loanOffer: offerWithGuaranteeFees(guaranteeFees) },
    documentId,
    TS,
  );
  let turn = await assistant.handle(assistant.start().state, { type: "set_presence_emprunt", presence: true });
  turn = await assistant.handle(turn.state, { type: "set_nombre_prets", count: 1 });
  turn = await assistant.handle(turn.state, { type: "choose_loan_source", source: "document" });
  turn = await assistant.handle(turn.state, { type: "upload_document", documentId });
  turn = await assistant.handle(turn.state, { type: "analysis_success", documentId, prefill });
  turn = await assistant.handle(turn.state, { type: "confirm_extraction" }); // -> loan_insurance (type + 4 champs déjà connus)
  assert.equal(turn.state.step, "loan_insurance");
  turn = await assistant.handle(turn.state, { type: "set_insurance", assuranceType: "bancaire" }); // -> loan_guarantee
  assert.equal(turn.state.step, "loan_guarantee");
  return { state: turn.state, guaranteeMessages: turn.messages.map((m) => m.content) };
}

describe("F-011 — correctif type de prêt + garantie (Cycle 9)", () => {
  it("F — montant de garantie détecté : conservé en état et annoncé dans le message, jamais appliqué", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const { state, guaranteeMessages } = await driveToGuaranteeStep(assistant, 77);
    assert.equal(state.detectedGuaranteeFees, 77);
    assert.equal(state.pendingLoan?.commissionCaution, undefined, "jamais appliqué automatiquement");
    assert.equal(state.pendingLoan?.typeGarantie, undefined, "la nature reste à choisir");
    const guaranteeMsg = guaranteeMessages.find((c) => c.includes("Quelle garantie"));
    assert.ok(guaranteeMsg?.includes("77"), "le montant vu doit être annoncé");
    assert.ok(guaranteeMsg?.includes("frais de garantie"));
  });

  it("G — aucun montant détecté : comportement actuel, rien n'est inventé ni annoncé", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const { state, guaranteeMessages } = await driveToGuaranteeStep(assistant, undefined);
    assert.equal(state.detectedGuaranteeFees, undefined);
    const guaranteeMsg = guaranteeMessages.find((c) => c.includes("Quelle garantie"));
    assert.equal(guaranteeMsg, "Quelle garantie avez-vous fournie pour ce prêt ?");
  });

  it("H — 77 € + caution confirmée telle quelle : 77 utilisé, provenance 'extracted'", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const { state } = await driveToGuaranteeStep(assistant, 77);
    const turn = await assistant.handle(state, { type: "set_guarantee", typeGarantie: "caution", commissionCaution: 77 });
    assert.equal(turn.state.pendingLoan?.commissionCaution, 77);
    assert.equal(turn.state.fieldSources.commissionCaution, "extracted");
  });

  it("I — 77 € + hypothèque/IPPD : aucune déduction en caution, aucune donnée inventée", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const { state } = await driveToGuaranteeStep(assistant, 77);
    const turn = await assistant.handle(state, { type: "set_guarantee", typeGarantie: "hypotheque_ippd" });
    assert.equal(turn.state.pendingLoan?.commissionCaution, undefined);
    assert.equal(turn.state.pendingLoan?.typeGarantie, "hypotheque_ippd");
    assert.equal(turn.state.fieldSources.commissionCaution, undefined);
  });

  it("J — 77 € + Autre/je ne sais pas : aucune déduction automatique", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const { state } = await driveToGuaranteeStep(assistant, 77);
    const turn = await assistant.handle(state, { type: "set_guarantee", typeGarantie: "autre" });
    assert.equal(turn.state.pendingLoan?.commissionCaution, undefined);
    assert.equal(turn.state.pendingLoan?.typeGarantie, "autre");
  });

  it("K — correction manuelle du montant préaffiché : provenance 'user_correction'", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const { state } = await driveToGuaranteeStep(assistant, 77);
    const turn = await assistant.handle(state, { type: "set_guarantee", typeGarantie: "caution", commissionCaution: 90 });
    assert.equal(turn.state.pendingLoan?.commissionCaution, 90);
    assert.equal(turn.state.fieldSources.commissionCaution, "user_correction");
  });

  it("K bis — aucun montant détecté, saisie manuelle : provenance 'manual' (jamais 'extracted')", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const { state } = await driveToGuaranteeStep(assistant, undefined);
    const turn = await assistant.handle(state, { type: "set_guarantee", typeGarantie: "caution", commissionCaution: 500 });
    assert.equal(turn.state.fieldSources.commissionCaution, "manual");
  });

  it("L — refresh/reprise : le montant détecté et le message associé survivent", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const { state } = await driveToGuaranteeStep(assistant, 77);
    const persisted: F011PersistedState = toF011PersistedState(state, TS);
    assert.equal(persisted.detectedGuaranteeFees, 77);

    const resumed = assistant.resume(persisted);
    assert.equal(resumed.state.step, "loan_guarantee");
    assert.equal(resumed.state.detectedGuaranteeFees, 77);
    assert.ok(
      resumed.messages.some((m) => m.content.includes("77")),
      "la reprise réaffiche le montant déjà trouvé, jamais une question vierge",
    );
  });

  it("M — multi-prêts : le montant détecté pour le prêt 1 ne fuit jamais vers le prêt 2", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    let turn = await assistant.handle(assistant.start().state, { type: "set_presence_emprunt", presence: true });
    turn = await assistant.handle(turn.state, { type: "set_nombre_prets", count: 2 });

    // Prêt 1 — document avec frais de garantie détectés.
    turn = await assistant.handle(turn.state, { type: "choose_loan_source", source: "document" });
    turn = await assistant.handle(turn.state, { type: "upload_document", documentId: "doc-m1" });
    const prefill1 = mapCreditExtractionToF011Prefill(
      { amortization: AMORTIZATION_FULL, loanOffer: offerWithGuaranteeFees(77) },
      "doc-m1",
      TS,
    );
    turn = await assistant.handle(turn.state, { type: "analysis_success", documentId: "doc-m1", prefill: prefill1 });
    turn = await assistant.handle(turn.state, { type: "confirm_extraction" });
    turn = await assistant.handle(turn.state, { type: "set_insurance", assuranceType: "bancaire" });
    assert.equal(turn.state.detectedGuaranteeFees, 77);
    turn = await assistant.handle(turn.state, { type: "set_guarantee", typeGarantie: "aucune" });
    turn = await assistant.handle(turn.state, { type: "set_fees", souscritCetExercice: false });
    turn = await assistant.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
    turn = await assistant.handle(turn.state, { type: "confirm_loan" });
    assert.equal(turn.state.step, "loan_source_choice");
    assert.equal(turn.state.detectedGuaranteeFees, undefined, "réinitialisé à la frontière de prêt");

    // Prêt 2 — manuel, jamais aucune extraction.
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
    assert.equal(turn.state.detectedGuaranteeFees, undefined, "aucune fuite du prêt 1");
    const guaranteeMsg = turn.messages.find((m) => m.content.includes("Quelle garantie"));
    assert.equal(guaranteeMsg?.content, "Quelle garantie avez-vous fournie pour ce prêt ?");
  });
});
