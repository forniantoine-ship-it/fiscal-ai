/**
 * F-012 Cycle 10 — documentaire Agence / comptable / logiciel.
 * Run: npx tsx --test src/runtime/assistants/f012-charges/assistant-cycle10.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { aggregateFiscalInputs } from "../../capabilities/f006/aggregate-inputs";
import { computeChargesExercice } from "../../capabilities/f012/compute-charges-exercice";
import { F012ChargesAssistant } from "./assistant";
import { collectedToChargeRegistry } from "./collected-to-registry";
import { applyGestionReview } from "./apply-document-review";
import { canConfirmAll, everydayProposalNote, everydayProposalTitle } from "./document-review-decisions";
import { isDocumentaryFamily } from "./charge-proposal";
import {
  gestionProposalDiagnostics,
  proposalsFromGestionCorpus,
} from "./proposals-from-gestion";
import { proposalsFromExistingParsers } from "@/lib/lmnp/services/f012/f012-document-analysis";
import type { ChargeProposal } from "./charge-proposal";
import type { F012Deps, F012State } from "./types";

const YEAR = 2024;
const ctx = { dossierId: "test", fiscalYear: YEAR, route: "/assistants/charges" };
const DEPS: F012Deps = { dateMiseEnService: "2023-01-01" };
const DEPS_F011: F012Deps = {
  dateMiseEnService: "2023-01-01",
  financementCharges: { totalAssurance: 661, totalCapitalRembourse: 0 },
};
const TS = "2024-03-01T10:00:00.000Z";
const HERE = dirname(fileURLToPath(import.meta.url));

const RELEVE_SIMPLE = `
FONCIA
Relevé annuel de gestion
Honoraires de gestion : 480,00 €
Payé le 15/03/2024
`;

const RELEVE_MULTI = `
FONCIA
Relevé annuel de gestion 2024
Gestion : 480,00 €
État des lieux : 150,00 €
Mise en location : 300,00 €
Payé le 10/02/2024
`;

const RELEVE_AVEC_LOYERS = `
FONCIA
Relevé annuel de gestion
Gestion : 480,00 €
État des lieux : 150,00 €
Mise en location : 300,00 €
Loyers encaissés : 12 000,00 €
Payé le 10/02/2024
`;

const HONORAIRES_SEULS = `
Honoraires de gestion : 480,00 €
Payé le 01/04/2024
`;

const ETAT_DES_LIEUX = `
Facture agence
État des lieux : 150,00 €
Payé le 12/05/2024
`;

const MISE_EN_LOCATION = `
Frais de mise en location : 300,00 €
Payé le 03/06/2024
`;

const FACTURE_COMPTABLE = `
Cabinet DUPONT
Honoraires comptable : 360,00 €
Payé le 20/03/2024
`;

const FACTURE_LOGICIEL = `
Pennylane
Abonnement logiciel : 120,00 €
Payé le 08/01/2024
`;

const PAYE_N_PLUS_1 = `
Honoraires de gestion : 480,00 €
Facturé le 15/03/2024
Payé le 12/01/2025
`;

const PERIODE_MIXTE = `
Relevé de gestion
Période du 01/07/2023 au 30/06/2024
Honoraires de gestion : 480,00 €
Payé le 15/06/2024
`;

const SANS_DATE = `
Honoraires de gestion : 480,00 €
Période du 01/01/2024 au 31/12/2024
`;

const INCOMPLET = `
FONCIA
Mandat de gestion locative
Lot : 12 rue de la Paix
`;

const CONTRAT_AGENCE = `
Mandat de gestion locative
Honoraires selon relevé annuel
`;

const RELEVE_500 = `
FONCIA
Honoraires de gestion : 500,00 €
Payé le 15/03/2024
`;

const MENSUALITES = `
Honoraires de gestion
12 paiements de 40,00 €
Payé le 05/01/2024
`;

const PUBLICITE = `
FONCIA
Publicité liée à la location : 90,00 €
Payé le 01/04/2024
`;

const FRAIS_CREDIT = `
Frais liés au crédit : 200,00 €
Payé le 01/04/2024
`;

async function startGestion(deps: F012Deps = DEPS) {
  const assistant = new F012ChargesAssistant(ctx, deps);
  let turn = await assistant.handle(assistant.start().state, {
    type: "submit_profilage",
    copropriete: false,
    agence: true,
    travaux: false,
    vacance: false,
    comptable: true,
  });
  while (turn.state.familyInventory?.[turn.state.currentFamilyIndex ?? 0] !== "gestion") {
    turn = await assistant.handle(turn.state, { type: "none_family" });
  }
  return { assistant, turn };
}

function registryOf(state: F012State) {
  return collectedToChargeRegistry({
    collected: state.collected,
    profil: state.profil,
    categoryInventory: state.categoryInventory,
    fieldSources: state.fieldSources,
    exercise: YEAR,
  });
}

function coverageOf(state: F012State) {
  return registryOf(state).familyCoverage.find((row) => row.familyId === "gestion");
}

async function receiveAndConfirm(
  assistant: F012ChargesAssistant,
  state: F012State,
  input: { documentId: string; proposals: ChargeProposal[] },
) {
  let turn = await assistant.handle(state, {
    type: "receive_document_proposals",
    documentId: input.documentId,
    familyId: "gestion",
    proposals: input.proposals,
  });
  for (const proposal of turn.state.documentReview?.proposals ?? []) {
    if (proposal.exclusionReason || proposal.gestionKind === "loyer" || proposal.gestionKind === "financement") {
      turn = await assistant.handle(turn.state, { type: "ignore_proposal", proposalId: proposal.id });
    } else if (proposal.amount !== undefined) {
      turn = await assistant.handle(turn.state, { type: "confirm_proposal", proposalId: proposal.id });
    }
  }
  return assistant.handle(turn.state, { type: "commit_document_review" });
}

describe("F-012 Cycle 10 — documentaire agence / comptable / logiciel", () => {
  it("A — relevé agence simple", async () => {
    assert.equal(isDocumentaryFamily("gestion"), true);
    const proposals = proposalsFromGestionCorpus({
      corpus: RELEVE_SIMPLE,
      documentId: "ges-a",
      fiscalYear: YEAR,
    });
    assert.equal(proposals.find((item) => item.gestionKind === "gestion")?.amount, 480);
    const { assistant, turn: start } = await startGestion();
    const turn = await receiveAndConfirm(assistant, start.state, { documentId: "ges-a", proposals });
    assert.equal(turn.state.collected.honorairesGestion, 480);
    const charge = registryOf(turn.state).charges.find((item) => item.familyId === "gestion");
    assert.equal(charge?.amount, 480);
    assert.equal(charge?.source, "document");
    assert.deepEqual(charge?.documentIds, ["ges-a"]);
  });

  it("B — plusieurs lignes → plusieurs propositions, une review", () => {
    const proposals = proposalsFromGestionCorpus({
      corpus: RELEVE_MULTI,
      documentId: "ges-b",
      fiscalYear: YEAR,
    });
    assert.equal(proposals.filter((item) => !item.exclusionReason).length, 3);
    assert.equal(proposals.find((item) => item.gestionKind === "gestion")?.amount, 480);
    assert.equal(proposals.find((item) => item.gestionKind === "etat_des_lieux")?.amount, 150);
    assert.equal(proposals.find((item) => item.gestionKind === "mise_en_location")?.amount, 300);
  });

  it("C — loyers + frais : 12 000 € → 0 Charge", async () => {
    const proposals = proposalsFromGestionCorpus({
      corpus: RELEVE_AVEC_LOYERS,
      documentId: "ges-c",
      fiscalYear: YEAR,
    });
    const loyer = proposals.find((item) => item.gestionKind === "loyer");
    assert.equal(loyer?.amount, 12_000);
    assert.ok(loyer?.exclusionReason);
    const diag = gestionProposalDiagnostics(proposals, RELEVE_AVEC_LOYERS);
    assert.equal(diag.rentsExcludedAmount, 12_000);
    const { assistant, turn: start } = await startGestion();
    const turn = await receiveAndConfirm(assistant, start.state, { documentId: "ges-c", proposals });
    const charges = registryOf(turn.state).charges.filter((item) => item.familyId === "gestion");
    assert.equal(charges.some((item) => item.amount === 12_000), false);
    assert.equal(turn.state.collected.honorairesGestion, 780);
    assert.equal(turn.state.collected.fraisEtatDesLieux, 150);
  });

  it("D — honoraires gestion", () => {
    const [proposal] = proposalsFromGestionCorpus({
      corpus: HONORAIRES_SEULS,
      documentId: "ges-d",
      fiscalYear: YEAR,
    });
    assert.equal(proposal?.gestionKind, "gestion");
    assert.equal(proposal?.amount, 480);
    assert.equal(everydayProposalTitle(proposal!), "Frais de l'agence");
  });

  it("E — état des lieux", () => {
    const [proposal] = proposalsFromGestionCorpus({
      corpus: ETAT_DES_LIEUX,
      documentId: "ges-e",
      fiscalYear: YEAR,
    });
    assert.equal(proposal?.gestionKind, "etat_des_lieux");
    assert.equal(proposal?.amount, 150);
    assert.equal(everydayProposalTitle(proposal!), "État des lieux");
  });

  it("F — mise en location", () => {
    const [proposal] = proposalsFromGestionCorpus({
      corpus: MISE_EN_LOCATION,
      documentId: "ges-f",
      fiscalYear: YEAR,
    });
    assert.equal(proposal?.gestionKind, "mise_en_location");
    assert.equal(proposal?.amount, 300);
    assert.equal(everydayProposalTitle(proposal!), "Mise en location");
  });

  it("G — comptable", async () => {
    const proposals = proposalsFromGestionCorpus({
      corpus: FACTURE_COMPTABLE,
      documentId: "ges-g",
      fiscalYear: YEAR,
    });
    assert.equal(proposals[0]?.gestionKind, "comptable");
    assert.equal(proposals[0]?.amount, 360);
    const { assistant, turn: start } = await startGestion();
    const turn = await receiveAndConfirm(assistant, start.state, { documentId: "ges-g", proposals });
    assert.equal(turn.state.collected.honorairesComptable, 360);
  });

  it("H — logiciel", async () => {
    const proposals = proposalsFromGestionCorpus({
      corpus: FACTURE_LOGICIEL,
      documentId: "ges-h",
      fiscalYear: YEAR,
    });
    assert.equal(proposals[0]?.gestionKind, "logiciel");
    assert.equal(proposals[0]?.amount, 120);
    const { assistant, turn: start } = await startGestion();
    const turn = await receiveAndConfirm(assistant, start.state, { documentId: "ges-h", proposals });
    assert.equal(turn.state.collected.honorairesComptable, 120);
  });

  it("I — paiement N", () => {
    const [proposal] = proposalsFromGestionCorpus({
      corpus: RELEVE_SIMPLE,
      documentId: "ges-i",
      fiscalYear: YEAR,
    });
    assert.equal(proposal?.exercise, YEAR);
    assert.equal(proposal?.paymentProven, true);
  });

  it("J — paiement N+1 exclu du dossier N", async () => {
    const proposals = proposalsFromGestionCorpus({
      corpus: PAYE_N_PLUS_1,
      documentId: "ges-j",
      fiscalYear: YEAR,
    });
    assert.equal(proposals[0]?.exercise, 2025);
    const { assistant, turn: start } = await startGestion();
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "ges-j",
      familyId: "gestion",
      proposals,
    });
    turn = await assistant.handle(turn.state, { type: "confirm_proposal", proposalId: proposals[0]!.id });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.collected.honorairesGestion, undefined);
    assert.equal(turn.state.familyPhase, "review");
    assert.ok(turn.messages.some((message) => /n'appartient pas à cet exercice/.test(message.content)));
  });

  it("K — période mixte : pas de prorata, paiement en N", () => {
    const [proposal] = proposalsFromGestionCorpus({
      corpus: PERIODE_MIXTE,
      documentId: "ges-k",
      fiscalYear: YEAR,
    });
    assert.equal(proposal?.amount, 480);
    assert.equal(proposal?.exercise, YEAR);
  });

  it("L — date absente : pas d'invention de paiement", () => {
    const [proposal] = proposalsFromGestionCorpus({
      corpus: SANS_DATE,
      documentId: "ges-l",
      fiscalYear: YEAR,
    });
    assert.equal(proposal?.amount, 480);
    assert.equal(proposal?.paymentProven, false);
    assert.match(everydayProposalNote(proposal!) ?? "", /honoraires de 480 €/);
    assert.match(everydayProposalNote(proposal!) ?? "", /date du paiement/);
    assert.equal(canConfirmAll([proposal!]), false);
  });

  it("M — document incomplet : aucune invention de montant", () => {
    const proposals = proposalsFromGestionCorpus({
      corpus: INCOMPLET,
      documentId: "ges-m",
      fiscalYear: YEAR,
    });
    assert.equal(proposals[0]?.amount, undefined);
    assert.ok(proposals[0]?.missingFields.includes("amount"));
  });

  it("N — complément manuel sur la même proposition", async () => {
    const { assistant, turn: start } = await startGestion();
    const proposals = proposalsFromGestionCorpus({
      corpus: SANS_DATE,
      documentId: "ges-n",
      fiscalYear: YEAR,
    });
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "ges-n",
      familyId: "gestion",
      proposals,
    });
    turn = await assistant.handle(turn.state, {
      type: "fill_proposal_manual",
      proposalId: proposals[0]!.id,
      amount: 480,
    });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.collected.honorairesGestion, 480);
    assert.equal(turn.state.fieldSources.honoraires_gestion, "user_correction");
  });

  it("O — modification", async () => {
    const { assistant, turn: start } = await startGestion();
    const proposals = proposalsFromGestionCorpus({
      corpus: RELEVE_SIMPLE,
      documentId: "ges-o",
      fiscalYear: YEAR,
    });
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "ges-o",
      familyId: "gestion",
      proposals,
    });
    turn = await assistant.handle(turn.state, {
      type: "modify_proposal",
      proposalId: proposals[0]!.id,
      amount: 500,
    });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.collected.honorairesGestion, 500);
    assert.equal(turn.state.fieldSources.honoraires_gestion, "user_correction");
  });

  it("P — ignorer ≠ 0 €", async () => {
    const { assistant, turn: start } = await startGestion();
    const proposals = proposalsFromGestionCorpus({
      corpus: RELEVE_SIMPLE,
      documentId: "ges-p",
      fiscalYear: YEAR,
    });
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "ges-p",
      familyId: "gestion",
      proposals,
    });
    turn = await assistant.handle(turn.state, { type: "ignore_proposal", proposalId: proposals[0]!.id });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.collected.honorairesGestion, undefined);
    assert.notEqual(coverageOf(turn.state)?.status, "none");
  });

  it("Q — reviewed_empty", async () => {
    const { assistant, turn: start } = await startGestion();
    const proposals = proposalsFromGestionCorpus({
      corpus: RELEVE_SIMPLE,
      documentId: "ges-q",
      fiscalYear: YEAR,
    });
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "ges-q",
      familyId: "gestion",
      proposals,
    });
    turn = await assistant.handle(turn.state, { type: "ignore_proposal", proposalId: proposals[0]!.id });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(coverageOf(turn.state)?.status, "reviewed_empty");
    assert.equal(registryOf(turn.state).charges.filter((item) => item.familyId === "gestion").length, 0);
  });

  it("R — unknown", async () => {
    const { assistant, turn: start } = await startGestion();
    let turn = await assistant.handle(start.state, { type: "unknown_family" });
    turn = await assistant.handle(turn.state, { type: "continue_after_unknown" });
    assert.equal(coverageOf(turn.state)?.status, "unknown");
  });

  it("S — conflit manuel / document", async () => {
    const { assistant, turn: start } = await startGestion();
    let turn = await assistant.handle(start.state, { type: "open_family_manual" });
    turn = await assistant.handle(turn.state, { type: "submit_family_gestion", honorairesGestion: 480 });
    const proposals = proposalsFromGestionCorpus({
      corpus: RELEVE_500,
      documentId: "ges-s",
      fiscalYear: YEAR,
    });
    turn = await assistant.handle(turn.state, {
      type: "receive_document_proposals",
      documentId: "ges-s",
      familyId: "gestion",
      proposals,
    });
    assert.ok(turn.state.documentReview?.conflicts?.some((item) => item.existingAmount === 480 && item.incomingAmount === 500));
    turn = await assistant.handle(turn.state, { type: "confirm_proposal", proposalId: proposals[0]!.id });
    const blocked = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(blocked.state.familyPhase, "review");
    turn = await assistant.handle(blocked.state, {
      type: "resolve_document_conflict",
      choice: "keep_existing",
      label: "Frais de l'agence",
    });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.collected.honorairesGestion, 480);
    const useDoc = applyGestionReview({
      collected: { coproLignes: [], travaux: [], divers: [], skippedCategories: [], honorairesGestion: 480 },
      review: {
        documentId: "ges-s",
        familyId: "gestion",
        proposals: proposals.map((item) => ({ ...item, decision: "confirmed" as const })),
        conflicts: [{ existingAmount: 480, incomingAmount: 500, label: "Frais de l'agence", choice: "use_document" }],
      },
      fiscalYear: YEAR,
    });
    assert.equal(useDoc.collected.honorairesGestion, 500);
  });

  it("T — document + document complémentaire : une seule Charge", async () => {
    const { assistant, turn: start } = await startGestion();
    const contrat = proposalsFromGestionCorpus({
      corpus: CONTRAT_AGENCE,
      documentId: "contrat-a",
      fiscalYear: YEAR,
    });
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "contrat-a",
      familyId: "gestion",
      proposals: contrat,
    });
    turn = await assistant.handle(turn.state, {
      type: "fill_proposal_manual",
      proposalId: contrat[0]!.id,
      amount: 480,
    });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    const releve = proposalsFromGestionCorpus({
      corpus: RELEVE_SIMPLE,
      documentId: "releve-b",
      fiscalYear: YEAR,
    });
    turn = await receiveAndConfirm(assistant, turn.state, { documentId: "releve-b", proposals: releve });
    assert.equal(turn.state.collected.honorairesGestion, 480);
    assert.deepEqual(turn.state.collected.documentIdsByFamily?.gestion, ["contrat-a", "releve-b"]);
    assert.equal(
      registryOf(turn.state).charges.filter((item) => item.familyId === "gestion" && item.category === "honoraires_gestion").length,
      1,
    );
  });

  it("U — persistence : review partielle, modify, ignore", async () => {
    const { assistant, turn: start } = await startGestion();
    const proposals = proposalsFromGestionCorpus({
      corpus: RELEVE_SIMPLE,
      documentId: "ges-u",
      fiscalYear: YEAR,
    });
    const reviewing = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "ges-u",
      familyId: "gestion",
      proposals,
    });
    const { toF012PersistedStateWithRegistry } = await import("./collected-to-registry");
    const persisted = toF012PersistedStateWithRegistry(reviewing.state, TS, YEAR);
    const resumed = assistant.resume(persisted);
    assert.equal(resumed.state.familyPhase, "review");
    assert.deepEqual(
      resumed.state.documentReview?.proposals.map((item) => item.id),
      proposals.map((item) => item.id),
    );

    const modified = await assistant.handle(resumed.state, {
      type: "modify_proposal",
      proposalId: proposals[0]!.id,
      amount: 470,
    });
    const afterModify = toF012PersistedStateWithRegistry(modified.state, TS, YEAR);
    assert.equal(assistant.resume(afterModify).state.documentReview?.proposals[0]?.modifiedAmount, 470);

    const ignored = await assistant.handle(resumed.state, {
      type: "ignore_proposal",
      proposalId: proposals[0]!.id,
    });
    const afterIgnore = toF012PersistedStateWithRegistry(ignored.state, TS, YEAR);
    assert.equal(assistant.resume(afterIgnore).state.documentReview?.proposals[0]?.decision, "ignored");
  });

  it("V — GO_BACK : review → précédent → retour, pas de duplication", async () => {
    const { assistant, turn: start } = await startGestion();
    const proposals = proposalsFromGestionCorpus({
      corpus: RELEVE_SIMPLE,
      documentId: "ges-v",
      fiscalYear: YEAR,
    });
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "ges-v",
      familyId: "gestion",
      proposals,
    });
    turn = await assistant.handle(turn.state, { type: "confirm_proposal", proposalId: proposals[0]!.id });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.collected.honorairesGestion, 480);
    turn = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(turn.state.familyPhase, "review");
    assert.equal(turn.state.collected.honorairesGestion, undefined);
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.collected.honorairesGestion, 480);
    assert.equal(registryOf(turn.state).charges.filter((item) => item.familyId === "gestion").length, 1);
  });

  it("W — FamilyCoverage", async () => {
    const { assistant, turn: start } = await startGestion();
    const captured = await receiveAndConfirm(assistant, start.state, {
      documentId: "ges-w1",
      proposals: proposalsFromGestionCorpus({ corpus: RELEVE_SIMPLE, documentId: "ges-w1", fiscalYear: YEAR }),
    });
    assert.equal(coverageOf(captured.state)?.status, "captured");

    const { assistant: a2, turn: s2 } = await startGestion();
    const none = await a2.handle(s2.state, { type: "none_family" });
    assert.equal(coverageOf(none.state)?.status, "none");

    const { assistant: a3, turn: s3 } = await startGestion();
    let unknown = await a3.handle(s3.state, { type: "unknown_family" });
    unknown = await a3.handle(unknown.state, { type: "continue_after_unknown" });
    assert.equal(coverageOf(unknown.state)?.status, "unknown");

    const { assistant: a4, turn: s4 } = await startGestion();
    let manual = await a4.handle(s4.state, { type: "open_family_manual" });
    manual = await a4.handle(manual.state, { type: "submit_family_gestion", honorairesGestion: 480 });
    assert.equal(coverageOf(manual.state)?.status, "captured");
  });

  it("X — calcul fiscal : documentaire ≡ manuel", async () => {
    const manual = computeChargesExercice({
      exerciceFiscal: YEAR,
      dateMiseEnService: "2023-01-01",
      honorairesGestion: 780,
      fraisEtatDesLieux: 150,
    });
    const { assistant, turn: start } = await startGestion();
    const turn = await receiveAndConfirm(assistant, start.state, {
      documentId: "ges-x",
      proposals: proposalsFromGestionCorpus({
        corpus: RELEVE_MULTI,
        documentId: "ges-x",
        fiscalYear: YEAR,
      }),
    });
    const fromRegistry = computeChargesExercice({
      exerciceFiscal: YEAR,
      dateMiseEnService: "2023-01-01",
      honorairesGestion: turn.state.collected.honorairesGestion,
      fraisEtatDesLieux: turn.state.collected.fraisEtatDesLieux,
    });
    assert.equal(fromRegistry.charges.totalDeductible, manual.charges.totalDeductible);
    assert.equal(fromRegistry.charges.totalDeductible, 930);
  });

  it("Y — F-006 consomme le même total", () => {
    const { charges } = computeChargesExercice({
      exerciceFiscal: YEAR,
      dateMiseEnService: "2023-01-01",
      honorairesGestion: 480,
    });
    const aggregated = aggregateFiscalInputs({
      exerciceFiscal: YEAR,
      activite: { dateMiseEnService: "2023-01-01" },
      revenusAssistant: { exerciceFiscal: YEAR, totalRecettes: 9000 },
      chargesAssistant: {
        exerciceFiscal: YEAR,
        totalDeductible: charges.totalDeductible,
        totalPreExploitation: charges.totalPreExploitation,
        parCategorie: charges.parCategorie,
      },
      financementCharges: {
        exerciceFiscal: YEAR,
        totalChargesFinancementExercice: 0,
        totalInteretsPreExploitation: 0,
      },
      amortissementAssistant: { exerciceFiscal: YEAR, totalDotations: 0, status: "validated" },
    });
    assert.equal(aggregated.data?.chargesExploitation, 480);
  });

  it("Z — F-011 : pas d'absorption crédit / intérêts / capital", async () => {
    const proposals = proposalsFromGestionCorpus({
      corpus: FRAIS_CREDIT,
      documentId: "ges-z",
      fiscalYear: YEAR,
    });
    assert.ok(proposals.every((item) => item.gestionKind === "financement"));
    assert.ok(proposals[0]?.exclusionReason);
    const { assistant, turn: start } = await startGestion(DEPS_F011);
    const turn = await receiveAndConfirm(assistant, start.state, { documentId: "ges-z", proposals });
    assert.equal(turn.state.collected.honorairesGestion, undefined);

    const { assistant: a2, turn: s2 } = await startGestion(DEPS_F011);
    let credit = await a2.handle(s2.state, { type: "open_family_manual" });
    credit = await a2.handle(credit.state, {
      type: "submit_family_gestion",
      honorairesGestion: 200,
      description: "frais liés au crédit",
    });
    assert.equal(credit.state.collected.honorairesGestion, undefined);
    assert.ok(credit.messages.some((message) => /prêt/.test(message.content) && /Financement/.test(message.content)));
  });

  it("AA — pont existant + mensualités + publicité + UX + pas de document ≠ none", async () => {
    const viaPont = proposalsFromExistingParsers({
      familyId: "gestion",
      corpus: { text: RELEVE_SIMPLE },
      documentId: "pont",
      fiscalYear: YEAR,
    });
    assert.equal(viaPont[0]?.familyId, "gestion");

    const monthly = proposalsFromGestionCorpus({
      corpus: MENSUALITES,
      documentId: "mens",
      fiscalYear: YEAR,
    });
    const logement = monthly.filter((item) => item.gestionKind === "gestion");
    assert.equal(logement.length, 1);
    assert.equal(logement[0]?.amount, 480);

    const pub = proposalsFromGestionCorpus({
      corpus: PUBLICITE,
      documentId: "pub",
      fiscalYear: YEAR,
    });
    assert.equal(pub[0]?.gestionKind, "autre");
    assert.equal(gestionProposalDiagnostics(pub, PUBLICITE).publiciteMappedToGestion, true);

    const capture = readFileSync(join(HERE, "../../../components/lmnp/assistants/F012FamilyCapture.tsx"), "utf8");
    assert.match(capture, /Frais de gestion —/);
    assert.match(capture, /J'ai payé/);
    assert.doesNotMatch(capture, /honoraires déductibles/);
    assert.match(capture, /Comptable ou logiciel/);

    const { assistant, turn: start } = await startGestion();
    const paper = await assistant.handle(start.state, { type: "open_family_paper" });
    assert.equal(paper.state.familyPhase, "paper");
    assert.notEqual(coverageOf(paper.state)?.status, "none");
  });
});
