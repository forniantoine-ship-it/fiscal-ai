import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F011FinancementAssistant } from "./assistant";
import type { F011Deps, F011State } from "./types";
import { toF011PersistedState } from "./types";
import { mapCreditExtractionToF011Prefill } from "@/lib/lmnp/services/f011/credit-bridge";
import type { CreditAmortizationExtraction } from "@/lib/documents/gpt/schemas/credit-amortization.schema";
import type { CreditLoanOfferExtraction } from "@/lib/documents/gpt/schemas/credit-loan-offer.schema";

const ctx = { dossierId: "test", fiscalYear: 2022, route: "/assistants/financement" };
const DEPS_OK: F011Deps = { dateMiseEnService: "2021-01-01" };
const TS = "2024-07-01T09:00:00.000Z";

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
  return mapCreditExtractionToF011Prefill({ amortization: FULL_AMORTIZATION, loanOffer: FULL_LOAN_OFFER }, documentId, TS);
}

async function driveToSourceChoice(assistant: F011FinancementAssistant, count = 1): Promise<F011State> {
  let turn = await assistant.handle(assistant.start().state, { type: "set_presence_emprunt", presence: true });
  turn = await assistant.handle(turn.state, { type: "set_nombre_prets", count });
  return turn.state;
}

async function driveThroughDocument(assistant: F011FinancementAssistant, documentId = "doc-1"): Promise<F011State> {
  const state = await driveToSourceChoice(assistant);
  let turn = await assistant.handle(state, { type: "choose_loan_source", source: "document" });
  turn = await assistant.handle(turn.state, { type: "upload_document", documentId });
  turn = await assistant.handle(turn.state, { type: "analysis_success", documentId, prefill: fullPrefill(documentId) });
  return turn.state;
}

async function finishComplements(assistant: F011FinancementAssistant, state: F011State): Promise<F011State> {
  let turn = await assistant.handle(state, { type: "set_insurance", assuranceType: "bancaire" });
  turn = await assistant.handle(turn.state, { type: "set_guarantee", typeGarantie: "aucune" });
  turn = await assistant.handle(turn.state, { type: "set_fees", souscritCetExercice: false });
  turn = await assistant.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
  return turn.state;
}

describe("F-011 — Cycle 6 : review documentaire / conflits / finalisation", () => {
  it("A — review complète : chaque champ extrait est visible avec sa provenance, aucun 'unavailable' affiché", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveThroughDocument(assistant);
    assert.equal(state.step, "loan_review_extraction");
    assert.equal(state.fieldSources.capitalInitial, "extracted");
    assert.equal(state.fieldSources.tauxNominal, "extracted");
    assert.equal(state.fieldSources.dureeMois, "extracted");
    assert.equal(state.fieldSources.typePret, "extracted");
    assert.equal(state.fieldSources.assuranceAnnuelle, "extracted");
    assert.equal(state.fieldSources.fraisDossier, "extracted");
    assert.ok(!/unavailable/i.test(JSON.stringify(state.pendingLoan)));
  });

  it("B — review partielle : seuls les champs réellement extraits sont marqués 'extracted', le reste reste absent", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const partial = mapCreditExtractionToF011Prefill({ amortization: { loanAmount: 80000 } }, "doc-partial", TS);
    const state = await driveToSourceChoice(assistant);
    let turn = await assistant.handle(state, { type: "choose_loan_source", source: "document" });
    turn = await assistant.handle(turn.state, { type: "upload_document", documentId: "doc-partial" });
    turn = await assistant.handle(turn.state, { type: "analysis_success", documentId: "doc-partial", prefill: partial });
    assert.equal(turn.state.fieldSources.capitalInitial, "extracted");
    assert.equal(turn.state.fieldSources.tauxNominal, undefined, "jamais marqué extrait un champ jamais fourni");
    assert.equal(turn.state.pendingLoan?.tauxNominal, undefined);
  });

  it("C — champ 'unavailable' : un document sans donnée exploitable ne fabrique jamais de valeur affichée", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const empty = mapCreditExtractionToF011Prefill({}, "doc-empty", TS);
    const state = await driveToSourceChoice(assistant);
    let turn = await assistant.handle(state, { type: "choose_loan_source", source: "document" });
    turn = await assistant.handle(turn.state, { type: "upload_document", documentId: "doc-empty" });
    turn = await assistant.handle(turn.state, { type: "analysis_success", documentId: "doc-empty", prefill: empty });
    const review = turn.messages.at(-1)!;
    assert.ok(review.content.includes("aucune donnée exploitable"));
    assert.deepEqual(Object.keys(turn.state.fieldSources), []);
  });

  it("D — confirmation : 'Tout confirmer' n'est proposé que s'il y a effectivement des champs extraits", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveThroughDocument(assistant);
    const turn = await assistant.handle(state, { type: "confirm_extraction" });
    assert.notEqual(turn.state.step, "loan_review_extraction");

    // Message associé à cet écran, avant confirmation.
    const reentry = new F011FinancementAssistant(ctx, DEPS_OK);
    const beforeConfirm = await driveThroughDocument(reentry);
    const persisted = toF011PersistedState(beforeConfirm, TS);
    const resumed = reentry.resume(persisted);
    const suggestions = resumed.messages.at(-1)?.suggestions ?? [];
    assert.ok(suggestions.some((s) => s.id === "confirm_extraction" && s.label === "Tout confirmer"));
  });

  it("D2 — pas de champ extrait : le label reste 'Continuer', jamais 'Tout confirmer'", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const empty = mapCreditExtractionToF011Prefill({}, "doc-empty2", TS);
    const state = await driveToSourceChoice(assistant);
    let turn = await assistant.handle(state, { type: "choose_loan_source", source: "document" });
    turn = await assistant.handle(turn.state, { type: "upload_document", documentId: "doc-empty2" });
    turn = await assistant.handle(turn.state, { type: "analysis_success", documentId: "doc-empty2", prefill: empty });
    const suggestions = turn.messages.at(-1)?.suggestions ?? [];
    assert.ok(suggestions.some((s) => s.id === "confirm_extraction" && s.label === "Continuer"));
  });

  it("E — correction : un champ extrait puis modifié manuellement devient 'user_correction', jamais laissé 'extracted'", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const partial = mapCreditExtractionToF011Prefill({ amortization: FULL_AMORTIZATION }, "doc-e", TS);
    const state = await driveToSourceChoice(assistant);
    let turn = await assistant.handle(state, { type: "choose_loan_source", source: "document" });
    turn = await assistant.handle(turn.state, { type: "upload_document", documentId: "doc-e" });
    turn = await assistant.handle(turn.state, { type: "analysis_success", documentId: "doc-e", prefill: partial });
    turn = await assistant.handle(turn.state, { type: "confirm_extraction" });
    assert.equal(turn.state.step, "loan_type");
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    assert.equal(turn.state.step, "loan_collect", "taux encore manquant — formulaire affiché");
    const corrected = await assistant.handle(turn.state, {
      type: "submit_loan_terms",
      capitalInitial: 130000, // différent de l'extraction (120000)
      tauxNominal: 0.02,
      dureeMois: turn.state.pendingLoan!.dureeMois!,
      datePremiereMensualite: turn.state.pendingLoan!.datePremiereMensualite!,
    });
    assert.equal(corrected.state.fieldSources.capitalInitial, "user_correction");
    // Les champs confirmés sans changement restent tracés comme extraits.
    assert.equal(corrected.state.fieldSources.dureeMois, "extracted");
  });

  it("F — conflit unique : les deux valeurs et les deux boutons sont proposés, sans écrasement silencieux", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToSourceChoice(assistant);
    let turn = await assistant.handle(state, { type: "choose_loan_source", source: "manual" });
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    turn = await assistant.handle(turn.state, {
      type: "submit_loan_terms",
      capitalInitial: 999999,
      tauxNominal: 0.05,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-01",
    });
    const conflicting = mapCreditExtractionToF011Prefill({ amortization: FULL_AMORTIZATION }, "doc-conflict", TS);
    turn = await assistant.handle(turn.state, { type: "analysis_success", documentId: "doc-conflict", prefill: conflicting });
    assert.equal(turn.state.extractionConflicts?.length, 1);
    const review = turn.messages.at(-1)!;
    assert.ok(review.content.includes("999"), "valeur actuelle visible");
    assert.ok(review.content.includes("120"), "valeur document visible");
    assert.ok(review.content.includes("saisi manuellement"), "provenance de la valeur actuelle visible");
    const suggestions = review.suggestions ?? [];
    assert.ok(suggestions.some((s) => s.id === "keep_existing:capitalInitial"));
    assert.ok(suggestions.some((s) => s.id === "use_document:capitalInitial"));
  });

  it("G — conflits multiples : résolvables dans n'importe quel ordre, aucun ne bloque les autres", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToSourceChoice(assistant);
    let turn = await assistant.handle(state, { type: "choose_loan_source", source: "manual" });
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    turn = await assistant.handle(turn.state, {
      type: "submit_loan_terms",
      capitalInitial: 999999,
      tauxNominal: 0.09,
      dureeMois: 12,
      datePremiereMensualite: "2020-01-01",
    });
    const conflicting = mapCreditExtractionToF011Prefill({ amortization: FULL_AMORTIZATION, loanOffer: FULL_LOAN_OFFER }, "doc-multi", TS);
    turn = await assistant.handle(turn.state, { type: "analysis_success", documentId: "doc-multi", prefill: conflicting });
    const initialConflicts = turn.state.extractionConflicts ?? [];
    assert.ok(initialConflicts.length >= 3, "capital, durée, date au minimum divergent");

    // Résout le second conflit de la liste avant le premier — aucun blocage.
    const secondField = initialConflicts[1]!.field;
    const afterSecond = await assistant.handle(turn.state, { type: "resolve_conflict", field: secondField, choice: "use_document" });
    assert.equal(afterSecond.state.extractionConflicts?.length, initialConflicts.length - 1);
    assert.ok(!afterSecond.state.extractionConflicts?.some((c) => c.field === secondField));

    // Puis les autres, un par un, jusqu'à résolution complète.
    let remaining = afterSecond;
    for (const c of afterSecond.state.extractionConflicts ?? []) {
      remaining = await assistant.handle(remaining.state, { type: "resolve_conflict", field: c.field, choice: "keep_existing" });
    }
    assert.equal(remaining.state.extractionConflicts?.length, 0);
    assert.equal(remaining.state.step, "loan_review_extraction");
  });

  it("H — document → manuel : seuls les champs encore inconnus sont redemandés", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const capitalOnly = mapCreditExtractionToF011Prefill({ amortization: { loanAmount: 90000 } }, "doc-h", TS);
    const state = await driveToSourceChoice(assistant);
    let turn = await assistant.handle(state, { type: "choose_loan_source", source: "document" });
    turn = await assistant.handle(turn.state, { type: "upload_document", documentId: "doc-h" });
    turn = await assistant.handle(turn.state, { type: "analysis_success", documentId: "doc-h", prefill: capitalOnly });
    turn = await assistant.handle(turn.state, { type: "confirm_extraction" });
    assert.equal(turn.state.step, "loan_type", "type non extrait — demandé");
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    assert.equal(turn.state.step, "loan_collect");
    assert.equal(turn.state.pendingLoan?.capitalInitial, 90000, "jamais redemandé");
  });

  it("I — manuel → document, valeur identique : aucun conflit créé", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToSourceChoice(assistant);
    let turn = await assistant.handle(state, { type: "choose_loan_source", source: "manual" });
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    turn = await assistant.handle(turn.state, {
      type: "submit_loan_terms",
      capitalInitial: 120000, // identique au document ci-dessous
      tauxNominal: 0.02,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-01",
    });
    const sameCapital = mapCreditExtractionToF011Prefill({ amortization: FULL_AMORTIZATION }, "doc-same", TS);
    turn = await assistant.handle(turn.state, { type: "analysis_success", documentId: "doc-same", prefill: sameCapital });
    assert.equal(turn.state.extractionConflicts?.length ?? 0, 0, "même valeur des deux côtés — pas de conflit");
    assert.equal(turn.state.pendingLoan?.capitalInitial, 120000);
  });

  it("I2 — manuel → document, valeur différente : conflit ; manuel → document, champ absent : pas de suppression", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToSourceChoice(assistant);
    let turn = await assistant.handle(state, { type: "choose_loan_source", source: "manual" });
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    turn = await assistant.handle(turn.state, {
      type: "submit_loan_terms",
      capitalInitial: 70000,
      tauxNominal: 0.02,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-01",
    });
    // Document qui ne fournit que les frais de dossier (absent côté manuel) —
    // champ absent du document (capitalInitial) : pas de conflit ni suppression.
    const feesOnly = mapCreditExtractionToF011Prefill({ loanOffer: { applicationFees: 400 } }, "doc-fees", TS);
    turn = await assistant.handle(turn.state, { type: "analysis_success", documentId: "doc-fees", prefill: feesOnly });
    assert.equal(turn.state.extractionConflicts?.length ?? 0, 0, "capitalInitial absent du document — pas un conflit");
    assert.equal(turn.state.pendingLoan?.capitalInitial, 70000, "jamais supprimé (anti-fantôme)");
    assert.equal(turn.state.pendingLoan?.fraisDossier, 400, "ajouté par le document");
  });

  it("J — document → document : review reconstruite, données déjà confirmées protégées, conflit sur contradiction", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const first = mapCreditExtractionToF011Prefill({ amortization: FULL_AMORTIZATION }, "doc-j1", TS);
    const state = await driveToSourceChoice(assistant);
    let turn = await assistant.handle(state, { type: "choose_loan_source", source: "document" });
    turn = await assistant.handle(turn.state, { type: "upload_document", documentId: "doc-j1" });
    turn = await assistant.handle(turn.state, { type: "analysis_success", documentId: "doc-j1", prefill: first });
    assert.equal(turn.state.pendingLoan?.capitalInitial, 120000);

    turn = await assistant.handle(turn.state, { type: "choose_loan_source", source: "document" });
    assert.equal(turn.state.step, "loan_upload");
    assert.equal(turn.state.pendingLoan?.capitalInitial, 120000, "protégé — pas GO_BACK");

    // Second document contredisant le capital.
    const contradicting = mapCreditExtractionToF011Prefill({ amortization: { ...FULL_AMORTIZATION, loanAmount: 200000 } }, "doc-j2", TS);
    turn = await assistant.handle(turn.state, { type: "upload_document", documentId: "doc-j2" });
    turn = await assistant.handle(turn.state, { type: "analysis_success", documentId: "doc-j2", prefill: contradicting });
    assert.equal(turn.state.step, "loan_review_extraction");
    assert.equal(turn.state.extractionConflicts?.length, 1);
    assert.equal(turn.state.extractionConflicts?.[0]?.field, "capitalInitial");
    assert.equal(turn.state.pendingLoan?.capitalInitial, 120000, "jamais écrasé silencieusement par le second document");

    const resolved = await assistant.handle(turn.state, { type: "resolve_conflict", field: "capitalInitial", choice: "use_document" });
    assert.equal(resolved.state.pendingLoan?.capitalInitial, 200000);
    assert.equal(resolved.state.fieldSources.capitalInitial, "extracted", "provenance finale = dernière décision (le second document)");
  });

  it("K — champ absent du second document : anti-fantôme, la valeur confirmée par le premier reste", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const first = mapCreditExtractionToF011Prefill({ amortization: FULL_AMORTIZATION }, "doc-k1", TS);
    const state = await driveToSourceChoice(assistant);
    let turn = await assistant.handle(state, { type: "choose_loan_source", source: "document" });
    turn = await assistant.handle(turn.state, { type: "upload_document", documentId: "doc-k1" });
    turn = await assistant.handle(turn.state, { type: "analysis_success", documentId: "doc-k1", prefill: first });
    turn = await assistant.handle(turn.state, { type: "choose_loan_source", source: "document" });
    turn = await assistant.handle(turn.state, { type: "upload_document", documentId: "doc-k2" });
    // Second document ne fournissant que les frais de dossier — capitalInitial absent.
    const feesOnly = mapCreditExtractionToF011Prefill({ loanOffer: { applicationFees: 600 } }, "doc-k2", TS);
    turn = await assistant.handle(turn.state, { type: "analysis_success", documentId: "doc-k2", prefill: feesOnly });
    assert.equal(turn.state.pendingLoan?.capitalInitial, 120000, "jamais supprimé par l'absence dans le second document");
    assert.equal(turn.state.pendingLoan?.fraisDossier, 600, "ajouté par le second document");
    assert.equal(turn.state.extractionConflicts?.length ?? 0, 0);
  });

  it("L — remplacement document : 'Importer un autre document' ouvre un vrai nouveau cycle, jamais GO_BACK", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveThroughDocument(assistant, "doc-l1");
    assert.equal(state.step, "loan_review_extraction");
    const turn = await assistant.handle(state, { type: "choose_loan_source", source: "document" });
    assert.equal(turn.state.step, "loan_upload");
    assert.equal(turn.state.pendingExtraction, undefined, "l'ancienne extraction en attente est nettoyée");
    assert.equal(turn.state.extractionConflicts, undefined);
    assert.equal(turn.state.pendingLoan?.capitalInitial, 120000, "les données déjà mergées restent acquises");
  });

  it("M — refresh review : la revue documentaire (valeurs + provenance) est reconstruite à l'identique", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveThroughDocument(assistant);
    const persisted = toF011PersistedState(state, TS);
    const resumed = assistant.resume(persisted);
    assert.equal(resumed.state.step, "loan_review_extraction");
    assert.equal(resumed.state.fieldSources.capitalInitial, "extracted");
    const content = resumed.messages.at(-1)!.content;
    assert.ok(/120\s?000/.test(content));
  });

  it("N — refresh conflit : le conflit et ses deux options survivent à la reprise", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToSourceChoice(assistant);
    let turn = await assistant.handle(state, { type: "choose_loan_source", source: "manual" });
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    turn = await assistant.handle(turn.state, {
      type: "submit_loan_terms",
      capitalInitial: 999999,
      tauxNominal: 0.05,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-01",
    });
    const conflicting = mapCreditExtractionToF011Prefill({ amortization: FULL_AMORTIZATION }, "doc-n", TS);
    turn = await assistant.handle(turn.state, { type: "analysis_success", documentId: "doc-n", prefill: conflicting });
    const persisted = toF011PersistedState(turn.state, TS);
    const resumed = assistant.resume(persisted);
    assert.equal(resumed.state.step, "loan_review_extraction");
    assert.equal(resumed.state.extractionConflicts?.length, 1);
    const suggestions = resumed.messages.at(-1)?.suggestions ?? [];
    assert.ok(suggestions.some((s) => s.id === "keep_existing:capitalInitial"));
    assert.ok(suggestions.some((s) => s.id === "use_document:capitalInitial"));
  });

  it("O — refresh pendant analyse : jamais une double analyse, la reprise retrouve l'état 'analyzing'", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToSourceChoice(assistant);
    let turn = await assistant.handle(state, { type: "choose_loan_source", source: "document" });
    turn = await assistant.handle(turn.state, { type: "upload_document", documentId: "doc-o" });
    assert.equal(turn.state.step, "loan_analyzing");
    const persisted = toF011PersistedState(turn.state, TS);
    const resumed = assistant.resume(persisted);
    assert.equal(resumed.state.step, "loan_analyzing");
    assert.equal(resumed.state.analyzingDocumentId, "doc-o", "même documentId — le panel reprend cette analyse, n'en relance pas une seconde");
  });

  it("P — double analyse empêchée : l'extraction déjà obtenue pour ce document n'est jamais recalculée par la simple reprise", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveThroughDocument(assistant, "doc-p");
    const persisted = toF011PersistedState(state, TS);
    const resumed = assistant.resume(persisted);
    // La reprise retrouve directement l'écran de revue déjà obtenu — jamais 'loan_analyzing'.
    assert.equal(resumed.state.step, "loan_review_extraction");
    assert.equal(resumed.state.analyzingDocumentId, undefined);
  });

  it("Q — provenance finale : suit la dernière décision réelle sur toute la chaîne document→confirmation→correction→compléments", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const partial = mapCreditExtractionToF011Prefill({ amortization: FULL_AMORTIZATION }, "doc-q1", TS);
    const state = await driveToSourceChoice(assistant);
    let turn = await assistant.handle(state, { type: "choose_loan_source", source: "document" });
    turn = await assistant.handle(turn.state, { type: "upload_document", documentId: "doc-q1" });
    turn = await assistant.handle(turn.state, { type: "analysis_success", documentId: "doc-q1", prefill: partial });
    assert.equal(turn.state.fieldSources.capitalInitial, "extracted");
    turn = await assistant.handle(turn.state, { type: "confirm_extraction" });
    assert.equal(turn.state.step, "loan_type");
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    assert.equal(turn.state.step, "loan_collect");
    turn = await assistant.handle(turn.state, {
      type: "submit_loan_terms",
      capitalInitial: 150000,
      tauxNominal: 0.02,
      dureeMois: turn.state.pendingLoan!.dureeMois!,
      datePremiereMensualite: turn.state.pendingLoan!.datePremiereMensualite!,
    });
    assert.equal(turn.state.fieldSources.capitalInitial, "user_correction");
    // 3) Complète les compléments jusqu'à confirmation du prêt.
    turn = await assistant.handle(turn.state, { type: "set_insurance", assuranceType: "bancaire" });
    turn = await assistant.handle(turn.state, { type: "set_guarantee", typeGarantie: "aucune" });
    turn = await assistant.handle(turn.state, { type: "set_fees", souscritCetExercice: false });
    turn = await assistant.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
    assert.equal(turn.state.step, "loan_review");
    turn = await assistant.handle(turn.state, { type: "confirm_loan" });
    assert.equal(turn.state.step, "aggregate_review");
    assert.equal(turn.state.loans[0]?.capitalInitial, 150000, "la correction manuelle est la valeur finale — jamais réécrasée");
  });

  it("R — bulk 'Tout confirmer' : jamais possible tant qu'un conflit reste ouvert", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToSourceChoice(assistant);
    let turn = await assistant.handle(state, { type: "choose_loan_source", source: "manual" });
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    turn = await assistant.handle(turn.state, {
      type: "submit_loan_terms",
      capitalInitial: 999999,
      tauxNominal: 0.05,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-01",
    });
    const conflicting = mapCreditExtractionToF011Prefill({ amortization: FULL_AMORTIZATION }, "doc-r", TS);
    turn = await assistant.handle(turn.state, { type: "analysis_success", documentId: "doc-r", prefill: conflicting });
    assert.ok((turn.state.extractionConflicts?.length ?? 0) > 0);
    const attempted = await assistant.handle(turn.state, { type: "confirm_extraction" });
    assert.equal(attempted.state.step, "loan_review_extraction", "bloqué par le conflit ouvert — jamais auto-confirmé");
    assert.equal(attempted.state.extractionConflicts?.length, turn.state.extractionConflicts?.length);
  });

  it("S — garantie hypothèque/IPPD : jamais estimée ni assimilée silencieusement, même après extraction documentaire", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveThroughDocument(assistant, "doc-s");
    let turn = await assistant.handle(state, { type: "confirm_extraction" });
    turn = await assistant.handle(turn.state, { type: "set_insurance", assuranceType: "bancaire" });
    turn = await assistant.handle(turn.state, { type: "set_guarantee", typeGarantie: "hypotheque_ippd" });
    assert.equal(turn.state.pendingLoan?.commissionCaution, undefined, "jamais de montant déductible assimilé pour hypothèque/IPPD");
    assert.equal(turn.state.pendingLoan?.typeGarantie, "hypotheque_ippd");
  });

  it("T — non-régression Cycles 1-5 : le parcours manuel complet reste inchangé (aucun conflit, aucune extraction)", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToSourceChoice(assistant);
    let turn = await assistant.handle(state, { type: "choose_loan_source", source: "manual" });
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    turn = await assistant.handle(turn.state, {
      type: "submit_loan_terms",
      capitalInitial: 100000,
      tauxNominal: 0.02,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-01",
    });
    const finished = await finishComplements(assistant, turn.state);
    turn = await assistant.handle(finished, { type: "set_ira", remboursementAnticipe: false });
    turn = await assistant.handle(turn.state, { type: "confirm_loan" });
    assert.equal(turn.state.step, "aggregate_review");
    assert.equal(turn.state.loans[0]?.capitalInitial, 100000);
    assert.equal(turn.state.fieldSources.capitalInitial, "manual");
  });

  it("U — régression corrigée (Cycle 6) : fieldSources ne fuit jamais d'un prêt au suivant en multi-prêts", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToSourceChoice(assistant, 2);
    // Prêt 1 — entièrement extrait d'un document.
    let turn = await assistant.handle(state, { type: "choose_loan_source", source: "document" });
    turn = await assistant.handle(turn.state, { type: "upload_document", documentId: "doc-u" });
    turn = await assistant.handle(turn.state, { type: "analysis_success", documentId: "doc-u", prefill: fullPrefill("doc-u") });
    turn = await assistant.handle(turn.state, { type: "confirm_extraction" });
    const s = await finishComplements(assistant, turn.state);
    turn = await assistant.handle(s, { type: "set_ira", remboursementAnticipe: false });
    turn = await assistant.handle(turn.state, { type: "confirm_loan" });
    assert.equal(turn.state.step, "loan_source_choice");
    assert.deepEqual(turn.state.fieldSources, {}, "la map est réinitialisée à la frontière entre deux prêts");

    // Prêt 2 — entièrement manuel : ne doit jamais hériter de la provenance du prêt 1.
    turn = await assistant.handle(turn.state, { type: "choose_loan_source", source: "manual" });
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    turn = await assistant.handle(turn.state, {
      type: "submit_loan_terms",
      capitalInitial: 50000,
      tauxNominal: 0.02,
      dureeMois: 120,
      datePremiereMensualite: "2022-01-01",
    });
    assert.equal(turn.state.fieldSources.capitalInitial, "manual", "jamais 'user_correction' pour une saisie neuve du second prêt");
  });
});
