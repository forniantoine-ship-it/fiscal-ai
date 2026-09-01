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

/** Avance jusqu'au choix document/manuel pour le premier prêt. */
async function driveToSourceChoice(assistant: F011FinancementAssistant, count = 1): Promise<F011State> {
  let turn = await assistant.handle(assistant.start().state, { type: "set_presence_emprunt", presence: true });
  turn = await assistant.handle(turn.state, { type: "set_nombre_prets", count });
  return turn.state;
}

/** Chemin document complet jusqu'à `loan_review_extraction`, sans conflit. */
async function driveThroughDocument(
  assistant: F011FinancementAssistant,
  documentId = "doc-1",
): Promise<F011State> {
  const state = await driveToSourceChoice(assistant);
  let turn = await assistant.handle(state, { type: "choose_loan_source", source: "document" });
  turn = await assistant.handle(turn.state, { type: "upload_document", documentId });
  turn = await assistant.handle(turn.state, { type: "analysis_success", documentId, prefill: fullPrefill(documentId) });
  return turn.state;
}

/** Complète les compléments (assurance/garantie/frais/IRA) au minimum, avec des réponses "non". */
async function finishComplements(assistant: F011FinancementAssistant, state: F011State): Promise<F011State> {
  let turn = await assistant.handle(state, { type: "set_insurance", assuranceType: "bancaire" });
  turn = await assistant.handle(turn.state, { type: "set_guarantee", typeGarantie: "aucune" });
  turn = await assistant.handle(turn.state, { type: "set_fees", souscritCetExercice: false });
  turn = await assistant.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
  return turn.state;
}

describe("F-011 — Cycle 5 : intégration document dans l'assistant", () => {
  it("A — choix document : avance vers l'upload, à égalité (pas un repli)", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToSourceChoice(assistant);
    assert.equal(state.step, "loan_source_choice");
    const turn = await assistant.handle(state, { type: "choose_loan_source", source: "document" });
    assert.equal(turn.state.step, "loan_upload");
  });

  it("B — choix manuel : reprend exactement le chemin Cycle 1, inchangé", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToSourceChoice(assistant);
    const turn = await assistant.handle(state, { type: "choose_loan_source", source: "manual" });
    assert.equal(turn.state.step, "loan_type");
  });

  it("C — upload : entre en analyse, mémorise le documentId", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToSourceChoice(assistant);
    let turn = await assistant.handle(state, { type: "choose_loan_source", source: "document" });
    turn = await assistant.handle(turn.state, { type: "upload_document", documentId: "doc-42" });
    assert.equal(turn.state.step, "loan_analyzing");
    assert.equal(turn.state.analyzingDocumentId, "doc-42");
  });

  it("D — analyse réussie : passe en revue avec les champs extraits appliqués", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveThroughDocument(assistant);
    assert.equal(state.step, "loan_review_extraction");
    assert.equal(state.analyzingDocumentId, undefined, "l'analyse n'est plus \"en cours\" une fois terminée");
    assert.equal(state.pendingLoan?.capitalInitial, 120000);
    assert.equal(state.pendingLoan?.tauxNominal, 0.02);
    assert.equal(state.pendingLoan?.dureeMois, 240);
    assert.equal(state.pendingLoan?.typePret, "amortissable");
  });

  it("E — extraction partielle : seuls les champs présents sont appliqués, le reste reste absent", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const partial = mapCreditExtractionToF011Prefill({ amortization: { loanAmount: 80000 } }, "doc-partial", TS);
    let state = await driveToSourceChoice(assistant);
    let turn = await assistant.handle(state, { type: "choose_loan_source", source: "document" });
    turn = await assistant.handle(turn.state, { type: "upload_document", documentId: "doc-partial" });
    turn = await assistant.handle(turn.state, { type: "analysis_success", documentId: "doc-partial", prefill: partial });
    state = turn.state;
    assert.equal(state.pendingLoan?.capitalInitial, 80000);
    assert.equal(state.pendingLoan?.tauxNominal, undefined);
    assert.equal(state.pendingLoan?.typePret, undefined);
  });

  it("F — extraction échouée : message clair, réessayer ou manuel — jamais un blocage définitif", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToSourceChoice(assistant);
    let turn = await assistant.handle(state, { type: "choose_loan_source", source: "document" });
    turn = await assistant.handle(turn.state, { type: "upload_document", documentId: "doc-fail" });
    turn = await assistant.handle(turn.state, { type: "analysis_failed" });
    assert.equal(turn.state.step, "loan_upload");
    assert.equal(turn.state.analyzingDocumentId, undefined);
    const suggestions = turn.messages.at(-1)?.suggestions ?? [];
    assert.ok(suggestions.some((s) => s.id === "retry_analysis"));
    assert.ok(suggestions.some((s) => s.id === "source_manual"));

    // Ni "réessayer" ni "manuel" ne sont des impasses.
    const retried = await assistant.handle(turn.state, { type: "retry_analysis" });
    assert.equal(retried.state.step, "loan_upload");
    const wentManual = await assistant.handle(turn.state, { type: "choose_loan_source", source: "manual" });
    assert.equal(wentManual.state.step, "loan_type");
  });

  it("G/H/I — review capital/taux/durée : visibles dans le message de revue avant toute question manuelle", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToSourceChoice(assistant);
    let turn = await assistant.handle(state, { type: "choose_loan_source", source: "document" });
    turn = await assistant.handle(turn.state, { type: "upload_document", documentId: "doc-1" });
    turn = await assistant.handle(turn.state, { type: "analysis_success", documentId: "doc-1", prefill: fullPrefill() });
    const reviewMessage = turn.messages.at(-1)!;
    assert.ok(/120[\s ]?000/.test(reviewMessage.content), "capital extrait visible dans le message de revue");
    assert.ok(reviewMessage.content.includes("2,00 %") || reviewMessage.content.includes("2.00 %"));
    assert.ok(reviewMessage.content.includes("240 mois"));
  });

  it("J — type de prêt identifié : confirm_extraction saute loan_type et loan_collect, va à loan_insurance", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveThroughDocument(assistant); // typePret = "amortissable" (extrait)
    const turn = await assistant.handle(state, { type: "confirm_extraction" });
    assert.equal(turn.state.step, "loan_insurance", "cœur complet — pas de re-collecte des quatre champs");
  });

  it("type de prêt non identifié : confirm_extraction redemande loan_type", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const prefillNoType = mapCreditExtractionToF011Prefill({ amortization: FULL_AMORTIZATION }, "doc-2", TS);
    const state = await driveToSourceChoice(assistant);
    let turn = await assistant.handle(state, { type: "choose_loan_source", source: "document" });
    turn = await assistant.handle(turn.state, { type: "upload_document", documentId: "doc-2" });
    turn = await assistant.handle(turn.state, { type: "analysis_success", documentId: "doc-2", prefill: prefillNoType });
    turn = await assistant.handle(turn.state, { type: "confirm_extraction" });
    assert.equal(turn.state.step, "loan_type", "le type n'a pas été identifié — la question manuelle reste posée");
  });

  it("K — conflit : le document contredit une réponse déjà donnée, jamais écrasée silencieusement", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    // Un prêt déjà partiellement saisi manuellement (capital connu), puis un
    // document qui propose une valeur différente pour ce même champ — le cas
    // réel derrière "manuel → document" (P) et "document → document" (Q).
    const state = await driveToSourceChoice(assistant);
    let turn = await assistant.handle(state, { type: "choose_loan_source", source: "manual" });
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    turn = await assistant.handle(turn.state, {
      // Durée et date identiques à FULL_AMORTIZATION — seul le capital diffère,
      // pour isoler un conflit unique et sans ambiguïté.
      type: "submit_loan_terms",
      capitalInitial: 999999,
      tauxNominal: 0.05,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-01",
    });
    // pendingLoan.capitalInitial = 999999 à ce stade. On applique directement
    // l'action d'analyse pour exercer la gouvernance (le chemin UI complet
    // pour y arriver — GO_BACK puis re-upload — est couvert par Q ci-dessous).
    const conflicting = mapCreditExtractionToF011Prefill({ amortization: FULL_AMORTIZATION }, "doc-conflict", TS);
    turn = await assistant.handle(turn.state, { type: "analysis_success", documentId: "doc-conflict", prefill: conflicting });
    assert.equal(turn.state.step, "loan_review_extraction");
    assert.equal(turn.state.pendingLoan?.capitalInitial, 999999, "la réponse déjà donnée n'est jamais écrasée silencieusement");
    assert.equal(turn.state.extractionConflicts?.length, 1);
    assert.equal(turn.state.extractionConflicts?.[0]?.field, "capitalInitial");
    assert.equal(turn.state.extractionConflicts?.[0]?.existingValue, 999999);
    assert.equal(turn.state.extractionConflicts?.[0]?.incomingValue, 120000);
    const suggestions = turn.messages.at(-1)?.suggestions ?? [];
    assert.ok(suggestions.some((s) => s.id === "keep_existing:capitalInitial"));
    assert.ok(suggestions.some((s) => s.id === "use_document:capitalInitial"));
  });

  it("L — correction : résoudre un conflit en choisissant le document met à jour le prêt", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToSourceChoice(assistant);
    let turn = await assistant.handle(state, { type: "choose_loan_source", source: "manual" });
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    turn = await assistant.handle(turn.state, {
      // Durée et date identiques à FULL_AMORTIZATION — seul le capital diffère,
      // pour isoler un conflit unique et sans ambiguïté.
      type: "submit_loan_terms",
      capitalInitial: 999999,
      tauxNominal: 0.05,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-01",
    });
    const conflicting = mapCreditExtractionToF011Prefill({ amortization: FULL_AMORTIZATION }, "doc-3", TS);
    turn = await assistant.handle(turn.state, { type: "analysis_success", documentId: "doc-3", prefill: conflicting });
    assert.equal(turn.state.extractionConflicts?.length, 1);

    const kept = await assistant.handle(turn.state, {
      type: "resolve_conflict",
      field: "capitalInitial",
      choice: "keep_existing",
    });
    assert.equal(kept.state.pendingLoan?.capitalInitial, 999999);
    assert.equal(kept.state.extractionConflicts?.length, 0);

    const useDoc = await assistant.handle(turn.state, {
      type: "resolve_conflict",
      field: "capitalInitial",
      choice: "use_document",
    });
    assert.equal(useDoc.state.pendingLoan?.capitalInitial, 120000, "correction acceptée : le document remplace la réponse");
    assert.equal(useDoc.state.extractionConflicts?.length, 0);
  });

  it("M — document → prêt confirmé : recalcule via le même moteur que le chemin manuel", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    let state = await driveThroughDocument(assistant);
    let turn = await assistant.handle(state, { type: "confirm_extraction" }); // -> loan_insurance (cœur déjà complet)
    state = await finishComplements(assistant, turn.state);
    turn = await assistant.handle(state, { type: "set_ira", remboursementAnticipe: false });
    turn = await assistant.handle(turn.state, { type: "confirm_loan" });
    assert.equal(turn.state.step, "aggregate_review");
    assert.equal(turn.state.loans.length, 1);
    assert.equal(turn.state.loans[0]?.capitalInitial, 120000);
    assert.ok(turn.state.result!.charges.totalChargesFinancementExercice > 0);
  });

  it("N — second prêt : recommence par le choix document/manuel, pas directement loan_type", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    let state = await driveToSourceChoice(assistant, 2);
    let turn = await assistant.handle(state, { type: "choose_loan_source", source: "manual" });
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    turn = await assistant.handle(turn.state, {
      type: "submit_loan_terms",
      capitalInitial: 100000,
      tauxNominal: 0.02,
      dureeMois: 240,
      datePremiereMensualite: "2022-01-01",
    });
    state = await finishComplements(assistant, turn.state);
    turn = await assistant.handle(state, { type: "set_ira", remboursementAnticipe: false });
    turn = await assistant.handle(turn.state, { type: "confirm_loan" });
    assert.equal(turn.state.step, "loan_source_choice", "Ajouter un autre prêt recommence par le choix document/manuel");
    assert.equal(turn.state.currentLoanIndex, 1);
  });

  it("O — document → manuel : les champs déjà extraits ne sont jamais redemandés", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    // Document ne fournissant que le capital — le reste doit être demandé manuellement.
    const capitalOnly = mapCreditExtractionToF011Prefill({ amortization: { loanAmount: 90000 } }, "doc-4", TS);
    const state = await driveToSourceChoice(assistant);
    let turn = await assistant.handle(state, { type: "choose_loan_source", source: "document" });
    turn = await assistant.handle(turn.state, { type: "upload_document", documentId: "doc-4" });
    turn = await assistant.handle(turn.state, { type: "analysis_success", documentId: "doc-4", prefill: capitalOnly });
    turn = await assistant.handle(turn.state, { type: "confirm_extraction" });
    assert.equal(turn.state.step, "loan_type", "le type n'a pas été extrait — demandé");
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
    assert.equal(turn.state.step, "loan_collect");
    // Le formulaire loan_collect est pré-rempli côté panel (seedLoanFormFrom) —
    // ici on vérifie que pendingLoan porte déjà le capital extrait, prêt à être confirmé.
    assert.equal(turn.state.pendingLoan?.capitalInitial, 90000, "jamais redemandé — déjà dans pendingLoan");
  });

  it("P — manuel → document : GO_BACK depuis le chemin manuel permet de changer d'avis pour le document", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToSourceChoice(assistant);
    let turn = await assistant.handle(state, { type: "choose_loan_source", source: "manual" });
    assert.equal(turn.state.step, "loan_type");
    turn = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(turn.state.step, "loan_source_choice", "retour possible avant tout engagement dans le chemin manuel");
    turn = await assistant.handle(turn.state, { type: "choose_loan_source", source: "document" });
    assert.equal(turn.state.step, "loan_upload");
  });

  it("Q — document → document : un second document complète sans écraser ce que le premier a confirmé", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    // Premier document : capital + durée + date, pas de taux ni de frais.
    const first = mapCreditExtractionToF011Prefill({ amortization: FULL_AMORTIZATION }, "doc-a", TS);
    const state = await driveToSourceChoice(assistant);
    let turn = await assistant.handle(state, { type: "choose_loan_source", source: "document" });
    turn = await assistant.handle(turn.state, { type: "upload_document", documentId: "doc-a" });
    turn = await assistant.handle(turn.state, { type: "analysis_success", documentId: "doc-a", prefill: first });
    assert.equal(turn.state.pendingLoan?.tauxNominal, undefined, "pas encore de taux après le premier document");

    // L'utilisateur importe un second document (l'offre de prêt, avec le taux) —
    // via "Importer un autre document", pas GO_BACK : GO_BACK défairait la
    // fusion du premier document au lieu d'en ajouter un second par-dessus.
    turn = await assistant.handle(turn.state, { type: "choose_loan_source", source: "document" });
    assert.equal(turn.state.step, "loan_upload");
    assert.equal(turn.state.pendingLoan?.capitalInitial, 120000, "le premier document reste acquis en attendant le second");
    turn = await assistant.handle(turn.state, { type: "upload_document", documentId: "doc-b" });
    const second = mapCreditExtractionToF011Prefill({ loanOffer: FULL_LOAN_OFFER }, "doc-b", TS);
    turn = await assistant.handle(turn.state, { type: "analysis_success", documentId: "doc-b", prefill: second });

    assert.equal(turn.state.pendingLoan?.capitalInitial, 120000, "conservé du premier document");
    assert.equal(turn.state.pendingLoan?.dureeMois, 240, "conservé du premier document");
    assert.equal(turn.state.pendingLoan?.tauxNominal, 0.02, "ajouté par le second document, jamais fourni par le premier");
    assert.equal(turn.state.extractionConflicts?.length ?? 0, 0, "aucun champ commun contradictoire entre les deux documents");
  });

  it("R — refresh pendant analyse : la reprise redemande l'analyse, jamais un blocage", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToSourceChoice(assistant);
    let turn = await assistant.handle(state, { type: "choose_loan_source", source: "document" });
    turn = await assistant.handle(turn.state, { type: "upload_document", documentId: "doc-5" });
    assert.equal(turn.state.step, "loan_analyzing");

    const persisted = toF011PersistedState(turn.state, TS);
    assert.equal(persisted.analyzingDocumentId, "doc-5");
    assert.equal("result" in persisted, false);

    const resumed = assistant.resume(persisted);
    assert.equal(resumed.state.step, "loan_analyzing");
    assert.equal(resumed.state.analyzingDocumentId, "doc-5");
    // Le déclenchement réel de l'analyse est un effet React (panel), hors de
    // portée de ce test runtime — resume() ne fait jamais l'appel OCR/GPT lui-même.
  });

  it("S — refresh review : la revue documentaire est reconstruite à l'identique", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveThroughDocument(assistant);
    const persisted = toF011PersistedState(state, TS);
    assert.equal(persisted.step, "loan_review_extraction");
    assert.equal(persisted.pendingExtraction?.documentId, "doc-1");

    const resumed = assistant.resume(persisted);
    assert.equal(resumed.state.step, "loan_review_extraction");
    assert.equal(resumed.state.pendingLoan?.capitalInitial, 120000);
    assert.ok(/120\s?000/.test(resumed.messages.at(-1)!.content));
  });

  it("T — refresh après confirmation : loan_insurance reprend avec les valeurs déjà extraites", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const afterDoc = await driveThroughDocument(assistant);
    const turn = await assistant.handle(afterDoc, { type: "confirm_extraction" });
    assert.equal(turn.state.step, "loan_insurance");

    const persisted: F011PersistedState = toF011PersistedState(turn.state, TS);
    const resumed = assistant.resume(persisted);
    assert.equal(resumed.state.step, "loan_insurance");
    assert.equal(resumed.state.pendingLoan?.capitalInitial, 120000, "la reprise ne perd pas le pré-remplissage documentaire");
  });

  it("V — multi-prêts : un prêt par document, un prêt manuel, agrégés ensemble", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveToSourceChoice(assistant, 2);

    // Prêt 1 — document.
    let turn = await assistant.handle(state, { type: "choose_loan_source", source: "document" });
    turn = await assistant.handle(turn.state, { type: "upload_document", documentId: "doc-6" });
    turn = await assistant.handle(turn.state, { type: "analysis_success", documentId: "doc-6", prefill: fullPrefill("doc-6") });
    turn = await assistant.handle(turn.state, { type: "confirm_extraction" });
    let s = await finishComplements(assistant, turn.state);
    turn = await assistant.handle(s, { type: "set_ira", remboursementAnticipe: false });
    turn = await assistant.handle(turn.state, { type: "confirm_loan" });
    assert.equal(turn.state.step, "loan_source_choice");
    assert.equal(turn.state.loans.length, 1);

    // Prêt 2 — manuel.
    turn = await assistant.handle(turn.state, { type: "choose_loan_source", source: "manual" });
    turn = await assistant.handle(turn.state, { type: "set_loan_type", typePret: "in_fine" });
    turn = await assistant.handle(turn.state, {
      type: "submit_loan_terms",
      capitalInitial: 50000,
      tauxNominal: 0.02,
      dureeMois: 120,
      datePremiereMensualite: "2022-01-01",
    });
    s = await finishComplements(assistant, turn.state);
    turn = await assistant.handle(s, { type: "set_ira", remboursementAnticipe: false });
    turn = await assistant.handle(turn.state, { type: "confirm_loan" });

    assert.equal(turn.state.step, "aggregate_review");
    assert.equal(turn.state.loans.length, 2);
    assert.equal(turn.state.loans[0]?.pretId !== turn.state.loans[1]?.pretId, true);
  });

  it("W — aucune donnée inventée : pendingLoan ne gagne jamais un champ absent du prefill", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const sparse = mapCreditExtractionToF011Prefill({ loanOffer: { applicationFees: 300 } }, "doc-7", TS);
    const state = await driveToSourceChoice(assistant);
    let turn = await assistant.handle(state, { type: "choose_loan_source", source: "document" });
    turn = await assistant.handle(turn.state, { type: "upload_document", documentId: "doc-7" });
    turn = await assistant.handle(turn.state, { type: "analysis_success", documentId: "doc-7", prefill: sparse });
    const pending = turn.state.pendingLoan ?? {};
    const populatedKeys = Object.keys(pending).filter((k) => pending[k as keyof typeof pending] !== undefined);
    assert.deepEqual(populatedKeys, ["fraisDossier"]);
  });

  it("X — provenance : le champ appliqué reste traçable jusqu'au document source", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    const state = await driveThroughDocument(assistant, "doc-8");
    const provenance = state.pendingExtraction?.prefill.provenance.capitalInitial;
    assert.ok(provenance);
    assert.equal(provenance!.sourceDocument, "doc-8");
    assert.equal(provenance!.sourceTunnel, "credit");
    assert.equal(provenance!.extractedBy, "gpt");
  });

  it("Y — financementCharges : un prêt entièrement issu du document alimente le même résultat que le manuel", async () => {
    const assistant = new F011FinancementAssistant(ctx, DEPS_OK);
    let state = await driveThroughDocument(assistant);
    let turn = await assistant.handle(state, { type: "confirm_extraction" });
    state = await finishComplements(assistant, turn.state);
    turn = await assistant.handle(state, { type: "set_ira", remboursementAnticipe: false });
    turn = await assistant.handle(turn.state, { type: "confirm_loan" });
    assert.ok(
      turn.state.result!.charges.totalChargesFinancementExercice > 0,
      "aggregate_review calcule bien un résultat pour un prêt entièrement issu du document",
    );
    const totalBeforeConfirm = turn.state.result!.charges.totalChargesFinancementExercice;

    turn = await assistant.handle(turn.state, { type: "confirm_all" });
    assert.equal(turn.completed, true);
    assert.equal(turn.event, "FINANCEMENT_TERMINE");
    assert.equal(
      turn.state.result?.charges.totalChargesFinancementExercice,
      totalBeforeConfirm,
      "confirm_all ne recalcule ni ne perd le résultat déjà validé à aggregate_review — c'est ce résultat que persistCompletion écrira dans financementCharges",
    );
  });
});
