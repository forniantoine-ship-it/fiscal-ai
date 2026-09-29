/**
 * F-011 — provenance persistante par prêt (assistant réel + pont documentaire réel `mapCreditExtractionToF011Prefill`).
 *
 * Modèle : `F011LoanDraft.provenance` = { [champ]: { source: FieldSource; documentId?: string } }, figée à `confirm_loan`,
 * portée par le prêt lui-même. `documentId` = document ayant fourni la valeur, ou l'ayant proposée avant une correction
 * utilisateur (`user_correction` conserve le document d'origine, jamais la valeur écrasée). Une saisie purement manuelle
 * n'a jamais de `documentId`.
 *
 * Run: npx tsx --test src/runtime/assistants/f011-financement/assistant-provenance.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F011FinancementAssistant } from "./assistant";
import { toF011PersistedState, type F011Deps, type F011PersistedState, type F011State } from "./types";
import { mapCreditExtractionToF011Prefill } from "@/lib/lmnp/services/f011/credit-bridge";
import type { CreditAmortizationExtraction } from "@/lib/documents/gpt/schemas/credit-amortization.schema";
import type { CreditLoanOfferExtraction } from "@/lib/documents/gpt/schemas/credit-loan-offer.schema";
import { seedFinancementAssistantForNextYear } from "@/lib/lmnp/services/dossier/n-plus-1-durable-prefill";
import type { DeclarationDraft } from "@/lib/lmnp/types";

const ctx = { dossierId: "test", fiscalYear: 2022, route: "/assistants/financement" };
const DEPS_OK: F011Deps = { dateMiseEnService: "2021-01-01" };
const TS = "2024-07-01T09:00:00.000Z";

const FULL_AMORTIZATION: CreditAmortizationExtraction = {
  loanAmount: 120000, loanDurationMonths: 240, firstPaymentDate: "2022-01-01", yearlyInsuranceTotal: 240,
};
const FULL_LOAN_OFFER: CreditLoanOfferExtraction = { loanType: "Prêt amortissable", interestRate: 2, applicationFees: 500 };

const assistant = () => new F011FinancementAssistant(ctx, DEPS_OK);
const fullPrefill = (documentId: string) =>
  mapCreditExtractionToF011Prefill({ amortization: FULL_AMORTIZATION, loanOffer: FULL_LOAN_OFFER }, documentId, TS);

async function toSourceChoice(a: F011FinancementAssistant, count = 1): Promise<F011State> {
  let turn = await a.handle(a.start().state, { type: "set_presence_emprunt", presence: true });
  turn = await a.handle(turn.state, { type: "set_nombre_prets", count });
  return turn.state;
}

async function importDocument(
  a: F011FinancementAssistant,
  state: F011State,
  documentId: string,
  prefill = fullPrefill(documentId),
): Promise<F011State> {
  let turn = await a.handle(state, { type: "choose_loan_source", source: "document" });
  turn = await a.handle(turn.state, { type: "upload_document", documentId });
  turn = await a.handle(turn.state, { type: "analysis_success", documentId, prefill });
  return turn.state;
}

/** loan_insurance → loan_review (frais de dossier ré-affirmés à l'identique : provenance inchangée) → confirm_loan. */
async function finishAndConfirm(a: F011FinancementAssistant, state: F011State, opts: { fees?: number } = {}): Promise<F011State> {
  let turn = await a.handle(state, { type: "set_insurance", assuranceType: "bancaire" });
  turn = await a.handle(turn.state, { type: "set_guarantee", typeGarantie: "aucune" });
  turn = await a.handle(
    turn.state,
    opts.fees !== undefined
      ? { type: "set_fees", souscritCetExercice: true, fraisDossier: opts.fees }
      : { type: "set_fees", souscritCetExercice: false },
  );
  turn = await a.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
  turn = await a.handle(turn.state, { type: "confirm_loan" });
  return turn.state;
}

async function manualLoan(a: F011FinancementAssistant, state: F011State, terms: { capital: number; taux: number }): Promise<F011State> {
  let turn = await a.handle(state, { type: "choose_loan_source", source: "manual" });
  turn = await a.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
  turn = await a.handle(turn.state, {
    type: "submit_loan_terms", capitalInitial: terms.capital, tauxNominal: terms.taux, dureeMois: 180, datePremiereMensualite: "2022-03-01",
  });
  return turn.state;
}

const roundTrip = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("F-011 provenance — extraction → documentId → confirmation", () => {
  it("chaque champ extrait porte le document qui l'a fourni ; le champ jamais fourni n'a aucune provenance", async () => {
    const a = assistant();
    let state = await importDocument(a, await toSourceChoice(a), "doc-1");
    assert.equal(state.fieldDocumentIds?.capitalInitial, "doc-1");
    state = (await a.handle(state, { type: "confirm_extraction" })).state;
    state = await finishAndConfirm(a, state, { fees: 500 });

    const loan = state.loans[0]!;
    assert.deepEqual(loan.provenance, {
      typePret: { source: "extracted", documentId: "doc-1" },
      capitalInitial: { source: "extracted", documentId: "doc-1" },
      tauxNominal: { source: "extracted", documentId: "doc-1" },
      dureeMois: { source: "extracted", documentId: "doc-1" },
      datePremiereMensualite: { source: "extracted", documentId: "doc-1" },
      assuranceAnnuelle: { source: "extracted", documentId: "doc-1" },
      fraisDossier: { source: "extracted", documentId: "doc-1" },
    });
    assert.equal(loan.provenance?.commissionCaution, undefined, "aucune caution : aucune provenance");
    assert.equal(loan.provenance?.capitalInitialOffre, undefined);
  });

  it("offre importée sans tableau : capitalInitialOffre est tracé avec l'id de l'offre", async () => {
    const a = assistant();
    const offer = mapCreditExtractionToF011Prefill({ loanOffer: { loanType: "Prêt amortissable", interestRate: 2, loanAmount: 120000 } }, "doc-offer", TS);
    assert.equal(offer.capitalInitialOffre, 120000, "précondition : le pont lit bien le capital de l'offre");
    let state = await importDocument(a, await toSourceChoice(a), "doc-offer", offer);
    assert.equal(state.fieldDocumentIds?.capitalInitialOffre, "doc-offer");
    // Le reste du prêt est saisi à la main : la provenance documentaire ne couvre que ce qui a été lu.
    state = (await a.handle(state, { type: "confirm_extraction" })).state;
    state = (await a.handle(state, { type: "submit_loan_terms", capitalInitial: 120000, tauxNominal: 0.02, dureeMois: 240, datePremiereMensualite: "2022-01-01" })).state;
    state = await finishAndConfirm(a, state);
    const provenance = state.loans[0]!.provenance!;
    assert.deepEqual(provenance.capitalInitialOffre, { source: "extracted", documentId: "doc-offer" });
    assert.equal(provenance.dureeMois?.documentId, undefined, "durée saisie à la main : aucun document");
  });

  it("saisie purement manuelle : source 'manual', aucun documentId, aucune provenance documentaire fabriquée", async () => {
    const a = assistant();
    let state = await manualLoan(a, await toSourceChoice(a), { capital: 90000, taux: 0.025 });
    state = await finishAndConfirm(a, state);
    const provenance = state.loans[0]!.provenance!;
    assert.deepEqual(provenance.capitalInitial, { source: "manual" });
    assert.deepEqual(provenance.tauxNominal, { source: "manual" });
    assert.ok(Object.values(provenance).every((entry) => entry?.documentId === undefined));
    assert.deepEqual(state.fieldDocumentIds, {});
  });

  it("valeur extraite puis corrigée par l'utilisateur : user_correction, document d'origine conservé, valeur écrasée absente", async () => {
    const a = assistant();
    const partial = mapCreditExtractionToF011Prefill({ amortization: { loanAmount: 80000 } }, "doc-p", TS);
    let state = await importDocument(a, await toSourceChoice(a), "doc-p", partial);
    state = (await a.handle(state, { type: "confirm_extraction" })).state;
    state = (await a.handle(state, { type: "set_loan_type", typePret: "amortissable" })).state;
    state = (await a.handle(state, { type: "submit_loan_terms", capitalInitial: 75000, tauxNominal: 0.02, dureeMois: 200, datePremiereMensualite: "2022-01-01" })).state;
    state = await finishAndConfirm(a, state);
    const provenance = state.loans[0]!.provenance!;
    assert.deepEqual(provenance.capitalInitial, { source: "user_correction", documentId: "doc-p" });
    assert.deepEqual(provenance.tauxNominal, { source: "manual" }, "champ jamais extrait : manuel, sans document");
    assert.equal(JSON.stringify(provenance).includes("80000"), false, "aucun historique des valeurs écrasées");
  });
});

describe("F-011 provenance — deux prêts / deux documents, aucune contamination", () => {
  it("chaque prêt ne porte que ses propres documents", async () => {
    const a = assistant();
    let state = await importDocument(a, await toSourceChoice(a, 2), "doc-1");
    state = (await a.handle(state, { type: "confirm_extraction" })).state;
    state = await finishAndConfirm(a, state, { fees: 500 });
    assert.equal(state.step, "loan_source_choice");
    assert.deepEqual(state.fieldSources, {}, "réinitialisée entre deux prêts (comportement Cycle 6 §11)");
    assert.deepEqual(state.fieldDocumentIds, {}, "aucun document du prêt 1 ne survit pour le prêt 2");

    const second = mapCreditExtractionToF011Prefill({ amortization: { loanAmount: 60000 } }, "doc-2", TS);
    state = await importDocument(a, state, "doc-2", second);
    state = (await a.handle(state, { type: "confirm_extraction" })).state;
    state = (await a.handle(state, { type: "set_loan_type", typePret: "in_fine" })).state;
    state = (await a.handle(state, { type: "submit_loan_terms", capitalInitial: 60000, tauxNominal: 0.03, dureeMois: 120, datePremiereMensualite: "2022-02-01" })).state;
    state = await finishAndConfirm(a, state);

    const [loan1, loan2] = state.loans;
    assert.ok(Object.values(loan1!.provenance!).every((entry) => entry?.documentId === "doc-1"));
    assert.deepEqual(loan2!.provenance!.capitalInitial, { source: "extracted", documentId: "doc-2" });
    assert.ok(!JSON.stringify(loan2!.provenance).includes("doc-1"), "aucune contamination du prêt 2 par le document du prêt 1");
    assert.ok(Object.entries(loan2!.provenance!).filter(([key]) => key !== "capitalInitial").every(([, entry]) => entry?.documentId === undefined));
  });
});

describe("F-011 provenance — conflits", () => {
  it("conflit tranché en faveur du document : extracted + ce document", async () => {
    const a = assistant();
    let state = await manualLoan(a, await toSourceChoice(a), { capital: 999999, taux: 0.09 });
    state = await importDocument(a, state, "doc-c", fullPrefill("doc-c"));
    assert.ok((state.extractionConflicts ?? []).some((c) => c.field === "capitalInitial"));
    state = (await a.handle(state, { type: "resolve_conflict", field: "capitalInitial", choice: "use_document" })).state;
    assert.equal(state.fieldSources.capitalInitial, "extracted");
    assert.equal(state.fieldDocumentIds?.capitalInitial, "doc-c");
  });

  it("conflit tranché en faveur de la saisie manuelle : user_correction, AUCUN document ajouté (la valeur n'en vient pas)", async () => {
    const a = assistant();
    let state = await manualLoan(a, await toSourceChoice(a), { capital: 999999, taux: 0.09 });
    state = await importDocument(a, state, "doc-c", fullPrefill("doc-c"));
    state = (await a.handle(state, { type: "resolve_conflict", field: "capitalInitial", choice: "keep_existing" })).state;
    assert.equal(state.fieldSources.capitalInitial, "user_correction");
    assert.equal(state.fieldDocumentIds?.capitalInitial, undefined, "jamais de provenance documentaire fabriquée");
  });

  it("conflit avec un second document, valeur du premier conservée : le document d'origine reste le premier", async () => {
    const a = assistant();
    let state = await importDocument(a, await toSourceChoice(a), "doc-j1", mapCreditExtractionToF011Prefill({ amortization: FULL_AMORTIZATION }, "doc-j1", TS));
    state = await importDocument(a, state, "doc-j2", mapCreditExtractionToF011Prefill({ amortization: { ...FULL_AMORTIZATION, loanAmount: 200000 } }, "doc-j2", TS));
    assert.equal(state.extractionConflicts?.[0]?.field, "capitalInitial");
    state = (await a.handle(state, { type: "resolve_conflict", field: "capitalInitial", choice: "keep_existing" })).state;
    assert.equal(state.fieldSources.capitalInitial, "user_correction");
    assert.equal(state.fieldDocumentIds?.capitalInitial, "doc-j1");
  });
});

describe("F-011 provenance — edit_loan, go_back, reprise", () => {
  async function confirmedFromDocument(a: F011FinancementAssistant): Promise<F011State> {
    let state = await importDocument(a, await toSourceChoice(a), "doc-1");
    state = (await a.handle(state, { type: "confirm_extraction" })).state;
    return finishAndConfirm(a, state, { fees: 500 });
  }

  it("edit_loan restaure la provenance de CE prêt ; reconfirmer sans changement la retrouve à l'identique", async () => {
    const a = assistant();
    const confirmed = await confirmedFromDocument(a);
    const before = confirmed.loans[0]!.provenance;
    const edited = (await a.handle(confirmed, { type: "edit_loan", pretId: confirmed.loans[0]!.pretId })).state;
    assert.equal(edited.fieldDocumentIds?.capitalInitial, "doc-1");
    assert.equal(edited.fieldSources.capitalInitial, "extracted");
    assert.equal("provenance" in (edited.pendingLoan ?? {}), false, "la provenance figée ne traîne pas sur le prêt en cours de saisie");

    let turn = await a.handle(edited, { type: "set_loan_type", typePret: "amortissable" });
    turn = await a.handle(turn.state, { type: "submit_loan_terms", capitalInitial: 120000, tauxNominal: 0.02, dureeMois: 240, datePremiereMensualite: "2022-01-01" });
    const again = await finishAndConfirm(a, turn.state, { fees: 500 });
    assert.deepEqual(again.loans[0]!.provenance, before);
  });

  it("edit_loan puis correction : le document d'origine est conservé", async () => {
    const a = assistant();
    const confirmed = await confirmedFromDocument(a);
    const edited = (await a.handle(confirmed, { type: "edit_loan", pretId: confirmed.loans[0]!.pretId })).state;
    let turn = await a.handle(edited, { type: "set_loan_type", typePret: "amortissable" });
    turn = await a.handle(turn.state, { type: "submit_loan_terms", capitalInitial: 110000, tauxNominal: 0.02, dureeMois: 240, datePremiereMensualite: "2022-01-01" });
    const again = await finishAndConfirm(a, turn.state, { fees: 500 });
    assert.deepEqual(again.loans[0]!.provenance!.capitalInitial, { source: "user_correction", documentId: "doc-1" });
  });

  it("go_back profond : plus aucun document pour un champ que pendingLoan ne porte plus ; go_back simple : rien ne change", async () => {
    const a = assistant();
    const extracted = await importDocument(a, await toSourceChoice(a), "doc-1");
    const confirmedExtraction = (await a.handle(extracted, { type: "confirm_extraction" })).state;
    const backOnce = (await a.handle(confirmedExtraction, { type: "go_back" })).state;
    assert.equal(backOnce.fieldDocumentIds?.capitalInitial, "doc-1", "pendingLoan garde sa valeur : le document aussi");

    let current = backOnce;
    for (let i = 0; i < 20 && Object.keys(current.pendingLoan ?? {}).length > 0; i += 1) {
      const turn = await a.handle(current, { type: "go_back" });
      if (turn.state.step === current.step) break;
      current = turn.state;
    }
    assert.equal(Object.keys(current.pendingLoan ?? {}).length, 0);
    assert.deepEqual(current.fieldDocumentIds, {});
    assert.deepEqual(current.fieldSources, {});
  });

  it("sauvegarde → JSON → reprise en cours de prêt : les documents survivent, la confirmation produit la même provenance", async () => {
    const a = assistant();
    const extracted = await importDocument(a, await toSourceChoice(a), "doc-1");
    const atInsurance = (await a.handle(extracted, { type: "confirm_extraction" })).state;
    assert.equal(atInsurance.step, "loan_insurance");

    const persisted = roundTrip(toF011PersistedState(atInsurance, TS));
    assert.equal(persisted.fieldDocumentIds?.capitalInitial, "doc-1", "la liste de sélection explicite transporte fieldDocumentIds");
    const resumed = a.resume(persisted).state;
    assert.deepEqual(resumed.fieldDocumentIds, atInsurance.fieldDocumentIds);

    const direct = await finishAndConfirm(a, atInsurance, { fees: 500 });
    const afterReload = await finishAndConfirm(a, resumed, { fees: 500 });
    assert.deepEqual(afterReload.loans[0]!.provenance, direct.loans[0]!.provenance);
    assert.equal(afterReload.loans[0]!.provenance?.capitalInitial?.documentId, "doc-1");
  });

  it("état persisté antérieur (sans fieldDocumentIds) : repris sans erreur, jamais de document inventé", async () => {
    const a = assistant();
    const extracted = await importDocument(a, await toSourceChoice(a), "doc-1");
    const atInsurance = (await a.handle(extracted, { type: "confirm_extraction" })).state;
    const legacy = roundTrip(toF011PersistedState(atInsurance, TS)) as F011PersistedState;
    delete legacy.fieldDocumentIds;
    const resumed = a.resume(legacy).state;
    const confirmed = await finishAndConfirm(a, resumed, { fees: 500 });
    const provenance = confirmed.loans[0]!.provenance!;
    assert.deepEqual(provenance.capitalInitial, { source: "extracted" }, "source connue, document inconnu → jamais inventé");
    assert.ok(Object.values(provenance).every((entry) => entry?.documentId === undefined));
  });
});

describe("F-011 provenance — anciens dossiers, N+1, non-régression fiscale", () => {
  it("un prêt confirmé sans provenance (dossier antérieur) est accepté tel quel et n'en reçoit jamais", async () => {
    const a = assistant();
    let state = await manualLoan(a, await toSourceChoice(a), { capital: 90000, taux: 0.025 });
    state = await finishAndConfirm(a, state);
    const legacyLoan = { ...state.loans[0]! };
    delete legacyLoan.provenance;
    const persisted: F011PersistedState = { ...roundTrip(toF011PersistedState(state, TS)), loans: [legacyLoan], step: "aggregate_review" };
    const resumed = a.resume(persisted).state;
    assert.equal(resumed.loans[0]!.provenance, undefined);
    assert.ok(resumed.result && !resumed.result.skipped, "le résultat est recalculé depuis les prêts, sans provenance");
  });

  it("N+1 ne reprend aucune provenance de N", async () => {
    const a = assistant();
    let state = await importDocument(a, await toSourceChoice(a), "doc-1");
    state = (await a.handle(state, { type: "confirm_extraction" })).state;
    state = await finishAndConfirm(a, state, { fees: 500 });
    assert.ok(state.loans[0]!.provenance, "précondition : le prêt de N porte sa provenance");

    const previous = { completedSteps: [], financementAssistantState: toF011PersistedState(state, TS) } as DeclarationDraft;
    const seeded = seedFinancementAssistantForNextYear(previous);
    assert.ok(seeded && seeded.loans.length === 1);
    assert.equal("provenance" in seeded.loans[0]!, false);
    assert.deepEqual(seeded.fieldSources, {});
    assert.equal(seeded.fieldDocumentIds, undefined);
    assert.equal(JSON.stringify(seeded).includes("doc-1"), false, "aucun id de document de N ne survit dans N+1");
  });

  it("non-régression fiscale : le résultat F-011 est strictement identique avec et sans provenance", async () => {
    const a = assistant();
    let state = await importDocument(a, await toSourceChoice(a), "doc-1");
    state = (await a.handle(state, { type: "confirm_extraction" })).state;
    state = await finishAndConfirm(a, state, { fees: 500 });
    assert.ok(state.loans[0]!.provenance);

    const withProvenance = roundTrip(toF011PersistedState({ ...state, step: "aggregate_review" }, TS));
    const stripped: F011PersistedState = {
      ...withProvenance,
      loans: withProvenance.loans.map((loan) => { const rest = { ...loan }; delete rest.provenance; return rest; }),
    };
    const resultWith = a.resume(withProvenance).state.result;
    const resultWithout = a.resume(stripped).state.result;
    assert.ok(resultWith && resultWithout);
    assert.deepEqual(resultWith.charges, resultWithout.charges);
    assert.deepEqual(resultWith.anomalies, resultWithout.anomalies);
  });

  it("fieldSources reste tel quel : l'état final ne change pas de contrat (compatibilité financementCharges.fieldSources)", async () => {
    const a = assistant();
    let state = await importDocument(a, await toSourceChoice(a), "doc-1");
    state = (await a.handle(state, { type: "confirm_extraction" })).state;
    state = await finishAndConfirm(a, state, { fees: 500 });
    assert.equal(state.fieldSources.capitalInitial, "extracted", "dernier prêt : la map reste en place comme avant");
  });
});
