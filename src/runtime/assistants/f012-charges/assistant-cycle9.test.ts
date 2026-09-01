/**
 * F-012 Cycle 9 — documentaire Assurance du logement.
 * Run: npx tsx --test src/runtime/assistants/f012-charges/assistant-cycle9.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { aggregateFiscalInputs } from "../../capabilities/f006/aggregate-inputs";
import { computeChargesExercice } from "../../capabilities/f012/compute-charges-exercice";
import { detectFinancementOverlap } from "../../capabilities/f012/detect-financement-overlap";
import { F012ChargesAssistant } from "./assistant";
import { collectedToChargeRegistry } from "./collected-to-registry";
import { applyAssurancesReview } from "./apply-document-review";
import { canConfirmAll, everydayProposalNote, everydayProposalTitle } from "./document-review-decisions";
import { isDocumentaryFamily } from "./charge-proposal";
import {
  assuranceProposalDiagnostics,
  proposalsFromAssuranceCorpus,
} from "./proposals-from-assurance";
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

const CONTRAT_SIMPLE = `
AXA ASSURANCE
Contrat Multirisque Habitation
Période du 01/01/2024 au 31/12/2024
Prime annuelle TTC : 300,00 €
Payé le 15/03/2024
`;

const PRIME_ANNUELLE_PAYEE = `
MAIF
Assurance logement
Prime annuelle TTC : 600,00 €
Date de paiement : 10/02/2024
Période du 01/01/2024 au 31/12/2024
`;

const MENSUALITES = `
Allianz
Assurance habitation
12 paiements de 50,00 €
Payé le 05/01/2024
`;

const PAIEMENT_N_PLUS_1 = `
AXA ASSURANCE
Contrat Multirisque Habitation
Période du 01/01/2024 au 31/12/2024
Prime annuelle TTC : 1 100,00 €
Payé le 12/03/2025
`;

const CONTRAT_SANS_PAIEMENT = `
AXA ASSURANCE
Contrat Multirisque Habitation
Prime annuelle TTC : 600,00 €
Période du 01/01/2024 au 31/12/2024
`;

const CONTRAT_INCOMPLET = `
AXA ASSURANCE
Contrat habitation
Risque situé : 12 rue de la Paix 75002 Paris
`;

const EMPRUNTEUR_SEUL = `
Assurance emprunteur : 661,00 €
Payé le 01/04/2024
`;

const MIXTE = `
AXA ASSURANCE
Assurance emprunteur : 661,00 €
Assurance logement : 300,00 €
Payé le 10/02/2024
`;

const CREDIT_VARIANTE = `
Assurance liée au financement : 661,00 €
`;

const HABITATION_VARIANTE = `
AXA ASSURANCE
Contrat assurance habitation
Période du 01/01/2024 au 31/12/2024
Prime annuelle TTC : 300,00 €
Payé le 20/06/2024
`;

const GLI_SEPARE = `
MAIF
Garantie loyers impayés
Période du 01/01/2024 au 31/12/2024
Prime annuelle TTC : 180,00 €
Payé le 01/04/2024
`;

const GLI_MENTION_SANS_MONTANT = `
AXA ASSURANCE
Contrat Multirisque Habitation
Prime annuelle TTC : 300,00 €
Couverture : incendie, dégât des eaux, loyers impayés
Payé le 01/04/2024
`;

const PERIODE_A_CHEVAL = `
AXA ASSURANCE
Assurance logement
Prime annuelle TTC : 300,00 €
Période du 01/10/2024 au 30/09/2025
Payé le 01/10/2024
`;

const RELEVE_PAIEMENT = `
Relevé de paiement assurance habitation
Montant payé : 300,00 €
Payé le 15/03/2024
`;

const CONTRAT_320 = `
AXA ASSURANCE
Assurance logement
Période du 01/01/2024 au 31/12/2024
Prime annuelle TTC : 320,00 €
Payé le 15/03/2024
`;

async function startAssurances(deps: F012Deps = DEPS) {
  const assistant = new F012ChargesAssistant(ctx, deps);
  let turn = await assistant.handle(assistant.start().state, {
    type: "submit_profilage",
    copropriete: false,
    agence: false,
    travaux: false,
    vacance: false,
    comptable: false,
  });
  while (turn.state.familyInventory?.[turn.state.currentFamilyIndex ?? 0] !== "assurances") {
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
  return registryOf(state).familyCoverage.find((row) => row.familyId === "assurances");
}

async function receiveAndConfirm(
  assistant: F012ChargesAssistant,
  state: F012State,
  input: { documentId: string; proposals: ChargeProposal[] },
) {
  let turn = await assistant.handle(state, {
    type: "receive_document_proposals",
    documentId: input.documentId,
    familyId: "assurances",
    proposals: input.proposals,
  });
  for (const proposal of turn.state.documentReview?.proposals ?? []) {
    if (proposal.exclusionReason || proposal.insuranceKind === "emprunteur") {
      turn = await assistant.handle(turn.state, { type: "ignore_proposal", proposalId: proposal.id });
    } else if (proposal.amount !== undefined) {
      turn = await assistant.handle(turn.state, { type: "confirm_proposal", proposalId: proposal.id });
    }
  }
  return assistant.handle(turn.state, { type: "commit_document_review" });
}

describe("F-012 Cycle 9 — documentaire assurance du logement", () => {
  it("A — assurance logement simple", async () => {
    assert.equal(isDocumentaryFamily("assurances"), true);
    const proposals = proposalsFromAssuranceCorpus({
      corpus: CONTRAT_SIMPLE,
      documentId: "ass-a",
      fiscalYear: YEAR,
    });
    const logement = proposals.find((item) => item.insuranceKind === "logement");
    assert.equal(logement?.amount, 300);
    const { assistant, turn: start } = await startAssurances();
    const turn = await receiveAndConfirm(assistant, start.state, { documentId: "ass-a", proposals });
    assert.equal(turn.state.collected.assurancePno, 300);
    const charge = registryOf(turn.state).charges.find((item) => item.familyId === "assurances");
    assert.equal(charge?.amount, 300);
    assert.equal(charge?.source, "document");
    assert.deepEqual(charge?.documentIds, ["ass-a"]);
  });

  it("B — prime annuelle payée en N", () => {
    const [proposal] = proposalsFromAssuranceCorpus({
      corpus: PRIME_ANNUELLE_PAYEE,
      documentId: "ass-b",
      fiscalYear: YEAR,
    });
    assert.equal(proposal?.amount, 600);
    assert.equal(proposal?.exercise, YEAR);
    assert.equal(proposal?.paymentProven, true);
  });

  it("C — paiements mensuels → une Charge", async () => {
    const proposals = proposalsFromAssuranceCorpus({
      corpus: MENSUALITES,
      documentId: "ass-c",
      fiscalYear: YEAR,
    });
    const logement = proposals.filter((item) => item.insuranceKind === "logement");
    assert.equal(logement.length, 1);
    assert.equal(logement[0]?.amount, 600);
    const { assistant, turn: start } = await startAssurances();
    const turn = await receiveAndConfirm(assistant, start.state, { documentId: "ass-c", proposals });
    assert.equal(turn.state.collected.assurancePno, 600);
    assert.equal(registryOf(turn.state).charges.filter((item) => item.familyId === "assurances").length, 1);
  });

  it("D — paiement N+1 exclu du dossier N", async () => {
    const proposals = proposalsFromAssuranceCorpus({
      corpus: PAIEMENT_N_PLUS_1,
      documentId: "ass-d",
      fiscalYear: YEAR,
    });
    assert.equal(proposals[0]?.exercise, 2025);
    const { assistant, turn: start } = await startAssurances();
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "ass-d",
      familyId: "assurances",
      proposals,
    });
    turn = await assistant.handle(turn.state, { type: "confirm_proposal", proposalId: proposals[0]!.id });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.collected.assurancePno, undefined);
    assert.equal(turn.state.familyPhase, "review");
    assert.ok(turn.messages.some((message) => /n'appartient pas à cet exercice/.test(message.content)));
  });

  it("E — contrat annuel sans preuve de paiement", () => {
    const [proposal] = proposalsFromAssuranceCorpus({
      corpus: CONTRAT_SANS_PAIEMENT,
      documentId: "ass-e",
      fiscalYear: YEAR,
    });
    assert.equal(proposal?.amount, 600);
    assert.equal(proposal?.paymentProven, false);
    assert.ok(proposal?.missingFields.includes("paymentDate"));
    assert.match(everydayProposalNote(proposal!) ?? "", /prime de 600 € par an/);
    assert.equal(canConfirmAll([proposal!]), false);
  });

  it("F — complément manuel sur la même proposition", async () => {
    const { assistant, turn: start } = await startAssurances();
    const proposals = proposalsFromAssuranceCorpus({
      corpus: CONTRAT_SANS_PAIEMENT,
      documentId: "ass-f",
      fiscalYear: YEAR,
    });
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "ass-f",
      familyId: "assurances",
      proposals,
    });
    turn = await assistant.handle(turn.state, {
      type: "fill_proposal_manual",
      proposalId: proposals[0]!.id,
      amount: 600,
    });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.collected.assurancePno, 600);
    assert.equal(turn.state.fieldSources.assurance_pno, "user_correction");
    assert.deepEqual(turn.state.collected.documentIdsByFamily?.assurances, ["ass-f"]);
  });

  it("G — document incomplet : aucune invention de montant", async () => {
    const proposals = proposalsFromAssuranceCorpus({
      corpus: CONTRAT_INCOMPLET,
      documentId: "ass-g",
      fiscalYear: YEAR,
    });
    assert.equal(proposals[0]?.amount, undefined);
    assert.ok(proposals[0]?.missingFields.includes("amount"));
    const { assistant, turn: start } = await startAssurances();
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "ass-g",
      familyId: "assurances",
      proposals,
    });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.collected.assurancePno, undefined);
    turn = await assistant.handle(turn.state, {
      type: "fill_proposal_manual",
      proposalId: proposals[0]!.id,
      amount: 280,
    });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.collected.assurancePno, 280);
  });

  it("H — modification", async () => {
    const { assistant, turn: start } = await startAssurances();
    const proposals = proposalsFromAssuranceCorpus({
      corpus: CONTRAT_SIMPLE,
      documentId: "ass-h",
      fiscalYear: YEAR,
    });
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "ass-h",
      familyId: "assurances",
      proposals,
    });
    turn = await assistant.handle(turn.state, {
      type: "modify_proposal",
      proposalId: proposals[0]!.id,
      amount: 310,
    });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.collected.assurancePno, 310);
    assert.equal(turn.state.fieldSources.assurance_pno, "user_correction");
  });

  it("I — ignorer ≠ 0 €", async () => {
    const { assistant, turn: start } = await startAssurances();
    const proposals = proposalsFromAssuranceCorpus({
      corpus: CONTRAT_SIMPLE,
      documentId: "ass-i",
      fiscalYear: YEAR,
    });
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "ass-i",
      familyId: "assurances",
      proposals,
    });
    turn = await assistant.handle(turn.state, { type: "ignore_proposal", proposalId: proposals[0]!.id });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.collected.assurancePno, undefined);
    assert.notEqual(coverageOf(turn.state)?.status, "none");
  });

  it("J — reviewed_empty", async () => {
    const { assistant, turn: start } = await startAssurances();
    const proposals = proposalsFromAssuranceCorpus({
      corpus: CONTRAT_SIMPLE,
      documentId: "ass-j",
      fiscalYear: YEAR,
    });
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "ass-j",
      familyId: "assurances",
      proposals,
    });
    turn = await assistant.handle(turn.state, { type: "ignore_proposal", proposalId: proposals[0]!.id });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(coverageOf(turn.state)?.status, "reviewed_empty");
    assert.equal(registryOf(turn.state).charges.filter((item) => item.familyId === "assurances").length, 0);
  });

  it("K — conflit manuel / document", async () => {
    const { assistant, turn: start } = await startAssurances();
    let turn = await assistant.handle(start.state, { type: "open_family_manual" });
    turn = await assistant.handle(turn.state, { type: "submit_family_assurance", montant: 300 });
    const proposals = proposalsFromAssuranceCorpus({
      corpus: CONTRAT_320,
      documentId: "ass-k",
      fiscalYear: YEAR,
    });
    turn = await assistant.handle(turn.state, {
      type: "receive_document_proposals",
      documentId: "ass-k",
      familyId: "assurances",
      proposals,
    });
    assert.ok(turn.state.documentReview?.conflicts?.some((item) => item.existingAmount === 300 && item.incomingAmount === 320));
    turn = await assistant.handle(turn.state, { type: "confirm_proposal", proposalId: proposals[0]!.id });
    const blocked = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(blocked.state.familyPhase, "review");
    turn = await assistant.handle(blocked.state, {
      type: "resolve_document_conflict",
      choice: "keep_existing",
      label: "Assurance du logement",
    });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.collected.assurancePno, 300);
    assert.equal(turn.state.fieldSources.assurance_pno, "manual");
    const useDoc = applyAssurancesReview({
      collected: { coproLignes: [], travaux: [], divers: [], skippedCategories: [], assurancePno: 300 },
      review: {
        documentId: "ass-k",
        familyId: "assurances",
        proposals: proposals.map((item) => ({ ...item, decision: "confirmed" as const })),
        conflicts: [
          { existingAmount: 300, incomingAmount: 320, label: "Assurance du logement", choice: "use_document" },
        ],
      },
      fiscalYear: YEAR,
    });
    assert.equal(useDoc.collected.assurancePno, 320);
  });

  it("L — document + document complémentaire : une seule Charge", async () => {
    const { assistant, turn: start } = await startAssurances();
    const contrat = proposalsFromAssuranceCorpus({
      corpus: CONTRAT_SANS_PAIEMENT,
      documentId: "contrat-a",
      fiscalYear: YEAR,
    });
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "contrat-a",
      familyId: "assurances",
      proposals: contrat,
    });
    turn = await assistant.handle(turn.state, {
      type: "fill_proposal_manual",
      proposalId: contrat[0]!.id,
      amount: 300,
    });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    const paiement = proposalsFromAssuranceCorpus({
      corpus: RELEVE_PAIEMENT,
      documentId: "releve-b",
      fiscalYear: YEAR,
    });
    turn = await receiveAndConfirm(assistant, turn.state, { documentId: "releve-b", proposals: paiement });
    assert.equal(turn.state.collected.assurancePno, 300);
    assert.deepEqual(turn.state.collected.documentIdsByFamily?.assurances, ["contrat-a", "releve-b"]);
    assert.equal(registryOf(turn.state).charges.filter((item) => item.familyId === "assurances").length, 1);
  });

  it("M — assurance emprunteur seule : jamais une Charge F-012", async () => {
    const proposals = proposalsFromAssuranceCorpus({
      corpus: EMPRUNTEUR_SEUL,
      documentId: "ass-m",
      fiscalYear: YEAR,
    });
    assert.ok(proposals.every((item) => item.insuranceKind === "emprunteur"));
    assert.ok(proposals[0]?.exclusionReason);
    const { assistant, turn: start } = await startAssurances();
    const turn = await receiveAndConfirm(assistant, start.state, { documentId: "ass-m", proposals });
    assert.equal(turn.state.collected.assurancePno, undefined);
    assert.equal(coverageOf(turn.state)?.status, "reviewed_empty");
  });

  it("N — logement + emprunteur dans le même document", async () => {
    const proposals = proposalsFromAssuranceCorpus({
      corpus: MIXTE,
      documentId: "ass-n",
      fiscalYear: YEAR,
    });
    const logement = proposals.find((item) => item.insuranceKind === "logement");
    const pret = proposals.find((item) => item.insuranceKind === "emprunteur");
    assert.equal(logement?.amount, 300);
    assert.equal(pret?.amount, 661);
    assert.ok(pret?.exclusionReason);
    const { assistant, turn: start } = await startAssurances();
    const turn = await receiveAndConfirm(assistant, start.state, { documentId: "ass-n", proposals });
    assert.equal(turn.state.collected.assurancePno, 300);
    assert.equal(turn.state.collected.assuranceGli, undefined);
    assert.equal(registryOf(turn.state).charges.filter((item) => item.familyId === "assurances").length, 1);
  });

  it("O — formulation crédit variante", () => {
    assert.equal(
      detectFinancementOverlap({ description: "assurance liée au financement", montant: 661 }).kind,
      "assurance_emprunteur",
    );
    const proposals = proposalsFromAssuranceCorpus({
      corpus: CREDIT_VARIANTE,
      documentId: "ass-o",
      fiscalYear: YEAR,
    });
    assert.ok(proposals.some((item) => item.insuranceKind === "emprunteur"));
    assert.equal(
      proposals.some((item) => item.insuranceKind === "logement" && item.amount === 661),
      false,
    );
  });

  it("P — formulation habitation variante", () => {
    assert.equal(detectFinancementOverlap({ description: "assurance habitation", montant: 300 }).kind, "none");
    const proposals = proposalsFromAssuranceCorpus({
      corpus: HABITATION_VARIANTE,
      documentId: "ass-p",
      fiscalYear: YEAR,
    });
    assert.equal(proposals.find((item) => item.insuranceKind === "logement")?.amount, 300);
    assert.equal(
      proposals.some((item) => item.insuranceKind === "emprunteur"),
      false,
    );
  });

  it("Q — refresh review : propositions identiques", async () => {
    const { assistant, turn: start } = await startAssurances();
    const proposals = proposalsFromAssuranceCorpus({
      corpus: CONTRAT_SIMPLE,
      documentId: "ass-q",
      fiscalYear: YEAR,
    });
    const reviewing = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "ass-q",
      familyId: "assurances",
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
      amount: 310,
    });
    const afterModify = toF012PersistedStateWithRegistry(modified.state, TS, YEAR);
    const resumedModify = assistant.resume(afterModify);
    assert.equal(resumedModify.state.documentReview?.proposals[0]?.modifiedAmount, 310);
    const committed = await assistant.handle(resumedModify.state, { type: "commit_document_review" });
    assert.equal(committed.state.collected.assurancePno, 310);
    const afterCommit = toF012PersistedStateWithRegistry(committed.state, TS, YEAR);
    assert.equal(assistant.resume(afterCommit).state.collected.assurancePno, 310);
    assert.equal(registryOf(assistant.resume(afterCommit).state).charges.filter((item) => item.familyId === "assurances").length, 1);
  });

  it("R — GO_BACK : review → précédent → retour, pas de duplication", async () => {
    const { assistant, turn: start } = await startAssurances();
    const proposals = proposalsFromAssuranceCorpus({
      corpus: CONTRAT_SIMPLE,
      documentId: "ass-r",
      fiscalYear: YEAR,
    });
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "ass-r",
      familyId: "assurances",
      proposals,
    });
    turn = await assistant.handle(turn.state, { type: "confirm_proposal", proposalId: proposals[0]!.id });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.collected.assurancePno, 300);
    turn = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(turn.state.familyPhase, "review");
    assert.equal(turn.state.collected.assurancePno, undefined);
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.collected.assurancePno, 300);
    assert.equal(registryOf(turn.state).charges.filter((item) => item.familyId === "assurances").length, 1);
  });

  it("S — FamilyCoverage", async () => {
    const { assistant, turn: start } = await startAssurances();
    const captured = await receiveAndConfirm(assistant, start.state, {
      documentId: "ass-s1",
      proposals: proposalsFromAssuranceCorpus({
        corpus: CONTRAT_SIMPLE,
        documentId: "ass-s1",
        fiscalYear: YEAR,
      }),
    });
    assert.equal(coverageOf(captured.state)?.status, "captured");

    const { assistant: a2, turn: s2 } = await startAssurances();
    const none = await a2.handle(s2.state, { type: "none_family" });
    assert.equal(coverageOf(none.state)?.status, "none");

    const { assistant: a3, turn: s3 } = await startAssurances();
    let unknown = await a3.handle(s3.state, { type: "unknown_family" });
    unknown = await a3.handle(unknown.state, { type: "continue_after_unknown" });
    assert.equal(coverageOf(unknown.state)?.status, "unknown");

    const { assistant: a4, turn: s4 } = await startAssurances();
    let manual = await a4.handle(s4.state, { type: "open_family_manual" });
    manual = await a4.handle(manual.state, { type: "submit_family_assurance", montant: 300 });
    assert.equal(coverageOf(manual.state)?.status, "captured");
  });

  it("T — calcul fiscal : documentaire ≡ manuel, sans double comptage F-011", async () => {
    const manual = computeChargesExercice({
      exerciceFiscal: YEAR,
      dateMiseEnService: "2023-01-01",
      assurancePno: 300,
    });
    const { assistant, turn: start } = await startAssurances(DEPS_F011);
    const turn = await receiveAndConfirm(assistant, start.state, {
      documentId: "ass-t",
      proposals: proposalsFromAssuranceCorpus({
        corpus: MIXTE,
        documentId: "ass-t",
        fiscalYear: YEAR,
      }),
    });
    const fromRegistry = computeChargesExercice({
      exerciceFiscal: YEAR,
      dateMiseEnService: "2023-01-01",
      assurancePno: turn.state.collected.assurancePno,
    });
    assert.equal(fromRegistry.charges.totalDeductible, manual.charges.totalDeductible);
    assert.equal(fromRegistry.charges.totalDeductible, 300);
    assert.equal(turn.state.collected.assurancePno, 300);
  });

  it("U — F-006 consomme le même total", async () => {
    const { charges } = computeChargesExercice({
      exerciceFiscal: YEAR,
      dateMiseEnService: "2023-01-01",
      assurancePno: 300,
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
        totalChargesFinancementExercice: 661,
        totalInteretsPreExploitation: 0,
      },
      amortissementAssistant: { exerciceFiscal: YEAR, totalDotations: 0, status: "validated" },
    });
    assert.equal(aggregated.data?.chargesExploitation, 300);
  });

  it("V — F-011 : séparation, alerte manuelle, pas d'import", async () => {
    const { assistant, turn: start } = await startAssurances(DEPS_F011);
    const mixte = await receiveAndConfirm(assistant, start.state, {
      documentId: "ass-v",
      proposals: proposalsFromAssuranceCorpus({
        corpus: MIXTE,
        documentId: "ass-v",
        fiscalYear: YEAR,
      }),
    });
    assert.equal(mixte.state.collected.assurancePno, 300);

    const { assistant: a2, turn: s2 } = await startAssurances(DEPS_F011);
    let credit = await a2.handle(s2.state, { type: "open_family_manual" });
    credit = await a2.handle(credit.state, {
      type: "submit_family_assurance",
      montant: 661,
      description: "assurance crédit 661",
    });
    assert.equal(credit.state.collected.assurancePno, undefined);
    assert.ok(credit.messages.some((message) => /prêt/.test(message.content) && /Financement/.test(message.content)));

    const { assistant: a3, turn: s3 } = await startAssurances();
    let appartement = await a3.handle(s3.state, { type: "open_family_manual" });
    appartement = await a3.handle(appartement.state, {
      type: "submit_family_assurance",
      montant: 300,
      description: "300 € pour mon appartement",
    });
    assert.equal(appartement.state.collected.assurancePno, 300);

    const { assistant: a4, turn: s4 } = await startAssurances();
    const sansF011 = await receiveAndConfirm(a4, s4.state, {
      documentId: "ass-v4",
      proposals: proposalsFromAssuranceCorpus({
        corpus: EMPRUNTEUR_SEUL,
        documentId: "ass-v4",
        fiscalYear: YEAR,
      }),
    });
    assert.equal(sansF011.state.collected.assurancePno, undefined);
  });

  it("W — pont existant + GLI + période à cheval + UX", () => {
    const viaPont = proposalsFromExistingParsers({
      familyId: "assurances",
      corpus: { text: CONTRAT_SIMPLE },
      documentId: "pont",
      fiscalYear: YEAR,
    });
    assert.equal(viaPont[0]?.familyId, "assurances");

    const gli = proposalsFromAssuranceCorpus({
      corpus: GLI_SEPARE,
      documentId: "gli",
      fiscalYear: YEAR,
    });
    assert.equal(gli.find((item) => item.insuranceKind === "gli")?.amount, 180);
    assert.equal(everydayProposalTitle(gli[0]!), "Assurance loyers impayés");

    const mention = proposalsFromAssuranceCorpus({
      corpus: GLI_MENTION_SANS_MONTANT,
      documentId: "gli-m",
      fiscalYear: YEAR,
    });
    const diag = assuranceProposalDiagnostics(mention, GLI_MENTION_SANS_MONTANT);
    assert.equal(diag.gliMentionedWithoutAmount, true);
    assert.equal(
      mention.some((item) => item.insuranceKind === "gli" && item.amount !== undefined),
      false,
    );

    const cheval = proposalsFromAssuranceCorpus({
      corpus: PERIODE_A_CHEVAL,
      documentId: "cheval",
      fiscalYear: YEAR,
    });
    assert.equal(cheval[0]?.amount, 300);
    assert.equal(cheval[0]?.exercise, YEAR);

    const capture = readFileSync(join(HERE, "../../../components/lmnp/assistants/F012FamilyCapture.tsx"), "utf8");
    assert.match(capture, /assurances? du logement/i);
    assert.match(capture, /J'ai payé/);
    assert.match(capture, /Je ne sais pas/);
    assert.doesNotMatch(capture, /assuranceAnnuelle|F011 overlap|assuranceType/);
    assert.doesNotMatch(everydayProposalTitle(viaPont[0]!), /PNO|GLI|assuranceAnnuelle/);
  });

  it("manuel toujours disponible + rien payé + je ne sais pas", async () => {
    const { assistant, turn: start } = await startAssurances();
    const paper = await assistant.handle(start.state, { type: "open_family_paper" });
    assert.equal(paper.state.familyPhase, "paper");
    let manual = await assistant.handle(paper.state, { type: "open_family_manual" });
    assert.equal(manual.state.familyPhase, "manual");
    manual = await assistant.handle(manual.state, { type: "submit_family_assurance", montant: 300 });
    assert.equal(manual.state.collected.assurancePno, 300);
  });

  it("pas d'assurance détectée : ne pas inventer none", () => {
    const proposals = proposalsFromAssuranceCorpus({
      corpus: CONTRAT_INCOMPLET,
      documentId: "vide",
      fiscalYear: YEAR,
    });
    assert.ok(proposals.length >= 1);
    assert.equal(proposals[0]?.amount, undefined);
  });
});
