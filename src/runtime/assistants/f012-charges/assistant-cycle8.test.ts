/**
 * F-012 Cycle 8 — review documentaire (impôts + syndic).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { computeChargesExercice } from "../../capabilities/f012/compute-charges-exercice";
import { F012ChargesAssistant } from "./assistant";
import { collectedToChargeRegistry } from "./collected-to-registry";
import { applyImpotsReview, decideProposalGroup, isDocumentAlreadyAnalyzed } from "./apply-document-review";
import type { ChargeProposal } from "./charge-proposal";
import { proposalsFromCoproCorpus } from "./proposals-from-copro";
import { proposalsFromTaxeFonciereCorpus } from "./proposals-from-taxe-fonciere";
import type { F012Deps, F012State } from "./types";

const YEAR = 2024;
const ctx = { dossierId: "test", fiscalYear: YEAR, route: "/assistants/charges" };
const DEPS: F012Deps = { dateMiseEnService: "2023-01-01" };
const TS = "2024-03-01T10:00:00.000Z";
const HERE = dirname(fileURLToPath(import.meta.url));

const AVIS_SIMPLE = `
Avis de taxe foncière — Année 2024
Commune de Lyon
Net à payer : 1 200,00 EUR
Date de paiement : 15/10/2024
`;

const AVIS_DEUX = `
Avis de taxe foncière 2024
Prélèvement 1 : 600,00 EUR
Prélèvement 2 : 600,00 EUR
Date de paiement : 15/10/2024
`;

const AVIS_TROIS = `
Avis de taxe foncière 2024
Prélèvement 1 : 400,00 EUR
Prélèvement 2 : 400,00 EUR
Prélèvement 3 : 400,00 EUR
Date de paiement : 15/10/2024
`;

const AVIS_1250 = `
Avis de taxe foncière — Année 2024
Net à payer : 1 250,00 EUR
Date de paiement : 15/10/2024
`;

const AVIS_SANS_MONTANT = `
Avis de taxe foncière
Commune de Nantes
`;

const AVIS_SANS_DATE = `
Avis de taxe foncière — Année 2024
Net à payer : 980,00 EUR
`;

const AVIS_HORS_EXERCICE = `
Avis de taxe foncière — Année 2024
Net à payer : 1 100,00 EUR
Payé le 12/03/2025
`;

const DECOMPTE_MULTI = `
Syndic — Décompte annuel 2024
CHARGES COMMUNES GENERALES          245,60 €
CHARGES BATIMENT                    128,40
FONDS TRAVAUX (ALUR)                 89,20
REGULARISATION ANNUELLE              40,00
TOTAL APPEL DE FONDS                503,20
`;

const DECOMPTE_AVANCE = `
Syndic — Décompte annuel 2024
CHARGES COMMUNES GENERALES          800,00 €
FONDS TRAVAUX (ALUR)                300,00
AVANCE DE TRESORERIE                150,00
`;

const DECOMPTE_S1 = `
Syndic — Décompte janvier-juin 2024
CHARGES COMMUNES GENERALES          400,00 €
`;

const DECOMPTE_S2 = `
Syndic — Décompte juillet-décembre 2024
CHARGES BATIMENT                    400,00 €
`;

const DECOMPTE_INCOMPLET = `
Syndic — Décompte
Lot n° 3
`;

const DECOMPTE_FLOU = `
Syndic — Décompte 2024
PRESTATIONS DIVERSES                150,00
`;

async function startFamily(familyId: "impots" | "syndic") {
  const assistant = new F012ChargesAssistant(ctx, DEPS);
  let turn = await assistant.handle(assistant.start().state, {
    type: "submit_profilage",
    copropriete: true,
    agence: false,
    travaux: false,
    vacance: false,
    comptable: false,
  });
  while (turn.state.familyInventory?.[turn.state.currentFamilyIndex ?? 0] !== familyId) {
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

function coverageOf(state: F012State, familyId: "impots" | "syndic") {
  return registryOf(state).familyCoverage.find((row) => row.familyId === familyId);
}

async function receiveAndConfirm(
  assistant: F012ChargesAssistant,
  state: F012State,
  input: { documentId: string; familyId: "impots" | "syndic"; proposals: ChargeProposal[] },
) {
  let turn = await assistant.handle(state, {
    type: "receive_document_proposals",
    documentId: input.documentId,
    familyId: input.familyId,
    proposals: input.proposals,
  });
  for (const proposal of turn.state.documentReview?.proposals ?? []) {
    if (proposal.exclusionReason) {
      turn = await assistant.handle(turn.state, { type: "ignore_proposal", proposalId: proposal.id });
    } else if (proposal.amount !== undefined) {
      turn = await assistant.handle(turn.state, { type: "confirm_proposal", proposalId: proposal.id });
    }
  }
  return assistant.handle(turn.state, { type: "commit_document_review" });
}

describe("F-012 Cycle 8 — review documentaire", () => {
  it("A — avis simple : confirm → une Charge 1200 €, source document", async () => {
    const { assistant, turn: start } = await startFamily("impots");
    const proposals = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_SIMPLE,
      documentId: "avis-a",
      fiscalYear: YEAR,
    });
    assert.equal(proposals.length, 1);
    const turn = await receiveAndConfirm(assistant, start.state, {
      documentId: "avis-a",
      familyId: "impots",
      proposals,
    });
    assert.equal(turn.state.collected.taxeFonciere, 1200);
    const charge = registryOf(turn.state).charges.find((item) => item.familyId === "impots");
    assert.equal(charge?.amount, 1200);
    assert.equal(charge?.source, "document");
    assert.deepEqual(charge?.documentIds, ["avis-a"]);
    assert.equal(turn.state.fieldSources.taxe_fonciere, "extracted");
  });

  it("B — 2 prélèvements → une Charge 1200 €, pas deux de 600 €", async () => {
    const { assistant, turn: start } = await startFamily("impots");
    const proposals = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_DEUX,
      documentId: "avis-b",
      fiscalYear: YEAR,
    });
    assert.equal(proposals.length, 2);
    assert.ok(proposals.every((item) => item.groupId === "avis-b:taxe-annuelle"));
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "avis-b",
      familyId: "impots",
      proposals,
    });
    turn = await assistant.handle(turn.state, { type: "confirm_proposal", proposalId: proposals[0]!.id });
    assert.ok(turn.state.documentReview?.proposals.every((item) => item.decision === "confirmed"));
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.collected.taxeFonciere, 1200);
    const impots = registryOf(turn.state).charges.filter((item) => item.familyId === "impots");
    assert.equal(impots.length, 1);
    assert.equal(impots[0]?.amount, 1200);
  });

  it("C — 3 prélèvements → une Charge 1200 €", async () => {
    const { assistant, turn: start } = await startFamily("impots");
    const proposals = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_TROIS,
      documentId: "avis-c",
      fiscalYear: YEAR,
    });
    assert.equal(proposals.length, 3);
    const turn = await receiveAndConfirm(assistant, start.state, {
      documentId: "avis-c",
      familyId: "impots",
      proposals,
    });
    assert.equal(turn.state.collected.taxeFonciere, 1200);
    assert.equal(registryOf(turn.state).charges.filter((item) => item.familyId === "impots").length, 1);
  });

  it("D — montant absent : aucune invention, saisie manuelle sur la même proposition", async () => {
    const { assistant, turn: start } = await startFamily("impots");
    const proposals = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_SANS_MONTANT,
      documentId: "avis-d",
      fiscalYear: YEAR,
    });
    assert.equal(proposals[0]?.amount, undefined);
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "avis-d",
      familyId: "impots",
      proposals,
    });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.familyPhase, "review");
    assert.equal(turn.state.collected.taxeFonciere, undefined);
    turn = await assistant.handle(turn.state, {
      type: "fill_proposal_manual",
      proposalId: proposals[0]!.id,
      amount: 750,
    });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.collected.taxeFonciere, 750);
    assert.equal(turn.state.fieldSources.taxe_fonciere, "user_correction");
    assert.deepEqual(turn.state.collected.documentIdsByFamily?.impots, ["avis-d"]);
  });

  it("E — date absente : montant conservé, date manquante, Charge possible", async () => {
    const proposals = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_SANS_DATE,
      documentId: "avis-e",
      fiscalYear: YEAR,
    });
    assert.equal(proposals[0]?.amount, 980);
    assert.ok(proposals[0]?.missingFields.includes("paymentDate"));
    const { assistant, turn: start } = await startFamily("impots");
    const turn = await receiveAndConfirm(assistant, start.state, {
      documentId: "avis-e",
      familyId: "impots",
      proposals,
    });
    assert.equal(turn.state.collected.taxeFonciere, 980);
  });

  it("F — paiement hors exercice : aucun montant inventé pour N", async () => {
    const { assistant, turn: start } = await startFamily("impots");
    const proposals = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_HORS_EXERCICE,
      documentId: "avis-f",
      fiscalYear: YEAR,
    });
    assert.equal(proposals[0]?.exercise, 2025);
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "avis-f",
      familyId: "impots",
      proposals,
    });
    turn = await assistant.handle(turn.state, { type: "confirm_proposal", proposalId: proposals[0]!.id });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.collected.taxeFonciere, undefined);
    assert.equal(turn.state.familyPhase, "review");
    assert.ok(turn.messages.some((message) => /n'appartient pas à cet exercice/.test(message.content)));
  });

  it("G — modification 1250 → 1300, provenance user_correction, document lié", async () => {
    const { assistant, turn: start } = await startFamily("impots");
    const proposals = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_1250,
      documentId: "avis-g",
      fiscalYear: YEAR,
    });
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "avis-g",
      familyId: "impots",
      proposals,
    });
    turn = await assistant.handle(turn.state, {
      type: "modify_proposal",
      proposalId: proposals[0]!.id,
      amount: 1300,
    });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.collected.taxeFonciere, 1300);
    assert.equal(turn.state.fieldSources.taxe_fonciere, "user_correction");
    assert.deepEqual(turn.state.collected.documentIdsByFamily?.impots, ["avis-g"]);
  });

  it("H — ignorer ≠ 0 €, aucune Charge, coverage pas none", async () => {
    const { assistant, turn: start } = await startFamily("impots");
    const proposals = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_SIMPLE,
      documentId: "avis-h",
      fiscalYear: YEAR,
    });
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "avis-h",
      familyId: "impots",
      proposals,
    });
    turn = await assistant.handle(turn.state, { type: "ignore_proposal", proposalId: proposals[0]!.id });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.collected.taxeFonciere, undefined);
    assert.equal(coverageOf(turn.state, "impots")?.status, "reviewed_empty");
    assert.notEqual(coverageOf(turn.state, "impots")?.status, "none");
    assert.notEqual(coverageOf(turn.state, "impots")?.status, "captured");
  });

  it("I — document + saisie manuelle : même proposition, document lié", async () => {
    const { assistant, turn: start } = await startFamily("impots");
    const proposals = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_SANS_MONTANT,
      documentId: "avis-i",
      fiscalYear: YEAR,
    });
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "avis-i",
      familyId: "impots",
      proposals,
    });
    turn = await assistant.handle(turn.state, {
      type: "fill_proposal_manual",
      proposalId: proposals[0]!.id,
      amount: 1180,
    });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.collected.taxeFonciere, 1180);
    assert.deepEqual(turn.state.collected.documentIdsByFamily?.impots, ["avis-i"]);
  });

  it("J — même document réanalysé : aucune Charge silencieuse", async () => {
    const { assistant, turn: start } = await startFamily("impots");
    const proposals = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_SIMPLE,
      documentId: "avis-j",
      fiscalYear: YEAR,
    });
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "avis-j",
      familyId: "impots",
      proposals,
    });
    assert.equal(isDocumentAlreadyAnalyzed(turn.state.analyzedDocumentIds, "avis-j"), true);
    turn = await assistant.handle(turn.state, {
      type: "receive_document_proposals",
      documentId: "avis-j",
      familyId: "impots",
      proposals: [{ ...proposals[0]!, amount: 1 }],
    });
    assert.equal(turn.state.documentReview?.proposals[0]?.amount, 1200);
    assert.equal(turn.state.collected.taxeFonciere, undefined);
  });

  it("K/L/M/N/O/P/Q — syndic multi-lignes : provisions, régul, fonds, avance", () => {
    const proposals = proposalsFromCoproCorpus({
      corpus: DECOMPTE_AVANCE,
      documentId: "copro-k",
      fiscalYear: YEAR,
    });
    assert.ok(proposals.some((item) => item.coproType === "provisions"));
    assert.ok(proposals.some((item) => item.coproType === "fonds_travaux" && item.exclusionReason));
    assert.ok(proposals.some((item) => /avance/i.test(item.exclusionReason ?? item.description)));
    const multi = proposalsFromCoproCorpus({
      corpus: DECOMPTE_MULTI,
      documentId: "copro-o",
      fiscalYear: YEAR,
    });
    assert.ok(multi.some((item) => item.coproType === "regularisation"));
    const deductible = multi
      .filter((item) => !item.exclusionReason)
      .reduce((sum, item) => sum + (item.amount ?? 0), 0);
    const total = multi.reduce((sum, item) => sum + (item.amount ?? 0), 0);
    assert.ok(total > deductible);
  });

  it("R — modifier une ligne syndic", async () => {
    const { assistant, turn: start } = await startFamily("syndic");
    const proposals = proposalsFromCoproCorpus({
      corpus: DECOMPTE_S1,
      documentId: "copro-r",
      fiscalYear: YEAR,
    });
    const line = proposals.find((item) => !item.exclusionReason && item.amount !== undefined);
    assert.ok(line);
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "copro-r",
      familyId: "syndic",
      proposals,
    });
    turn = await assistant.handle(turn.state, { type: "modify_proposal", proposalId: line.id, amount: 420 });
    for (const proposal of turn.state.documentReview?.proposals ?? []) {
      if (proposal.id !== line.id && !proposal.exclusionReason && proposal.decision === "pending") {
        turn = await assistant.handle(turn.state, { type: "confirm_proposal", proposalId: proposal.id });
      }
    }
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.ok(turn.state.collected.coproLignes.some((item) => item.montant === 420));
    assert.equal(turn.state.fieldSources.copropriete, "user_correction");
  });

  it("S — ignorer une ligne syndic ne crée pas de Charge 0", async () => {
    const { assistant, turn: start } = await startFamily("syndic");
    const proposals = proposalsFromCoproCorpus({
      corpus: DECOMPTE_S1,
      documentId: "copro-s",
      fiscalYear: YEAR,
    });
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "copro-s",
      familyId: "syndic",
      proposals,
    });
    for (const proposal of turn.state.documentReview?.proposals ?? []) {
      turn = await assistant.handle(turn.state, { type: "ignore_proposal", proposalId: proposal.id });
    }
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.collected.coproLignes.length, 0);
    assert.equal(coverageOf(turn.state, "syndic")?.status, "reviewed_empty");
    assert.notEqual(coverageOf(turn.state, "syndic")?.status, "none");
  });

  it("T — document syndic incomplet : trou manuel", async () => {
    const proposals = proposalsFromCoproCorpus({
      corpus: DECOMPTE_INCOMPLET,
      documentId: "copro-t",
      fiscalYear: YEAR,
    });
    assert.equal(proposals[0]?.amount, undefined);
    const { assistant, turn: start } = await startFamily("syndic");
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "copro-t",
      familyId: "syndic",
      proposals,
    });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.familyPhase, "review");
    turn = await assistant.handle(turn.state, {
      type: "fill_proposal_manual",
      proposalId: proposals[0]!.id,
      amount: 200,
    });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.collected.coproLignes[0]?.montant, 200);
  });

  it("U — document sans classification claire : proposition, pas d'échec", () => {
    const proposals = proposalsFromCoproCorpus({
      corpus: DECOMPTE_FLOU,
      documentId: "copro-u",
      fiscalYear: YEAR,
    });
    assert.ok(proposals.length >= 1);
    assert.ok(proposals.some((item) => item.amount === 150 || item.amount === undefined || item.description.length > 0));
  });

  it("conflit manuel 1200 ↔ document 1250 : pas d'écrasement silencieux", async () => {
    const { assistant, turn: start } = await startFamily("impots");
    let turn = await assistant.handle(start.state, { type: "submit_family_impots", taxeFonciere: 1200 });
    const proposals = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_1250,
      documentId: "avis-conf",
      fiscalYear: YEAR,
    });
    turn = await assistant.handle(turn.state, {
      type: "receive_document_proposals",
      documentId: "avis-conf",
      familyId: "impots",
      proposals,
    });
    assert.ok(turn.state.documentReview?.conflicts?.[0]);
    turn = await assistant.handle(turn.state, { type: "confirm_proposal", proposalId: proposals[0]!.id });
    const blocked = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(blocked.state.collected.taxeFonciere, 1200);
    assert.equal(blocked.state.familyPhase, "review");
    turn = await assistant.handle(blocked.state, { type: "resolve_document_conflict", choice: "use_document" });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.collected.taxeFonciere, 1250);
    assert.equal(turn.state.fieldSources.taxe_fonciere, "extracted");

    const keep = applyImpotsReview({
      collected: { coproLignes: [], travaux: [], divers: [], skippedCategories: [], taxeFonciere: 1200 },
      review: {
        documentId: "avis-conf",
        familyId: "impots",
        proposals: proposals.map((item) => ({ ...item, decision: "confirmed" as const })),
        conflicts: [{ existingAmount: 1200, incomingAmount: 1250, label: "Taxe foncière", choice: "keep_existing" }],
      },
      fiscalYear: YEAR,
    });
    assert.equal(keep.collected.taxeFonciere, 1200);
    assert.equal(keep.provenance, "manual");
  });

  it("deux documents syndic complémentaires : pas de fusion sur le mot syndic", async () => {
    const { assistant, turn: start } = await startFamily("syndic");
    const first = proposalsFromCoproCorpus({ corpus: DECOMPTE_S1, documentId: "s1", fiscalYear: YEAR });
    let turn = await receiveAndConfirm(assistant, start.state, {
      documentId: "s1",
      familyId: "syndic",
      proposals: first,
    });
    const afterFirst = turn.state.collected.coproLignes.length;
    const second = proposalsFromCoproCorpus({ corpus: DECOMPTE_S2, documentId: "s2", fiscalYear: YEAR });
    turn = await receiveAndConfirm(assistant, turn.state, {
      documentId: "s2",
      familyId: "syndic",
      proposals: second,
    });
    assert.ok(turn.state.collected.coproLignes.length > afterFirst);
    assert.deepEqual(turn.state.collected.documentIdsByFamily?.syndic, ["s1", "s2"]);
  });

  it("persistance review partielle : confirmée + en attente + ignorée", async () => {
    const { assistant, turn: start } = await startFamily("syndic");
    const proposals = proposalsFromCoproCorpus({
      corpus: DECOMPTE_MULTI,
      documentId: "copro-persist",
      fiscalYear: YEAR,
    });
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "copro-persist",
      familyId: "syndic",
      proposals,
    });
    const [first, second, third] = turn.state.documentReview?.proposals ?? [];
    assert.ok(first && second && third);
    turn = await assistant.handle(turn.state, { type: "confirm_proposal", proposalId: first.id });
    turn = await assistant.handle(turn.state, { type: "ignore_proposal", proposalId: second.id });
    const { toF012PersistedStateWithRegistry } = await import("./collected-to-registry");
    const persisted = toF012PersistedStateWithRegistry(turn.state, TS, YEAR);
    const resumed = assistant.resume(persisted);
    assert.equal(resumed.state.familyPhase, "review");
    assert.equal(resumed.state.documentReview?.proposals[0]?.decision, "confirmed");
    assert.equal(resumed.state.documentReview?.proposals[1]?.decision, "ignored");
    assert.equal(resumed.state.documentReview?.proposals[2]?.decision, "pending");
  });

  it("GO_BACK : review → précédent → retour, pas de Charge dupliquée", async () => {
    const { assistant, turn: start } = await startFamily("impots");
    const proposals = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_SIMPLE,
      documentId: "avis-back",
      fiscalYear: YEAR,
    });
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "avis-back",
      familyId: "impots",
      proposals,
    });
    turn = await assistant.handle(turn.state, { type: "confirm_proposal", proposalId: proposals[0]!.id });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.collected.taxeFonciere, 1200);
    turn = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(turn.state.familyPhase, "review");
    assert.equal(turn.state.collected.taxeFonciere, undefined);
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.collected.taxeFonciere, 1200);
    assert.equal(registryOf(turn.state).charges.filter((item) => item.familyId === "impots").length, 1);
  });

  it("FamilyCoverage : captured / unknown / pas none après ignore", async () => {
    const { assistant, turn: start } = await startFamily("impots");
    const confirmed = await receiveAndConfirm(assistant, start.state, {
      documentId: "avis-cov",
      familyId: "impots",
      proposals: proposalsFromTaxeFonciereCorpus({
        corpus: AVIS_SIMPLE,
        documentId: "avis-cov",
        fiscalYear: YEAR,
      }),
    });
    assert.equal(coverageOf(confirmed.state, "impots")?.status, "captured");

    const missing = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_SANS_MONTANT,
      documentId: "avis-unk",
      fiscalYear: YEAR,
    });
    const { assistant: a2, turn: s2 } = await startFamily("impots");
    const reviewing = await a2.handle(s2.state, {
      type: "receive_document_proposals",
      documentId: "avis-unk",
      familyId: "impots",
      proposals: missing,
    });
    assert.equal(coverageOf(reviewing.state, "impots")?.status, "pending");
  });

  it("calcul : taxe 1200 + syndic 800 + fonds 300 ≡ flux manuel", async () => {
    const manual = computeChargesExercice({
      exerciceFiscal: YEAR,
      dateMiseEnService: "2023-01-01",
      taxeFonciere: 1200,
      coproLignes: [
        { type: "provisions", montant: 800 },
        { type: "fonds_travaux", montant: 300 },
      ],
    });
    const { assistant, turn: start } = await startFamily("impots");
    let turn = await receiveAndConfirm(assistant, start.state, {
      documentId: "avis-calc",
      familyId: "impots",
      proposals: proposalsFromTaxeFonciereCorpus({
        corpus: AVIS_SIMPLE,
        documentId: "avis-calc",
        fiscalYear: YEAR,
      }),
    });
    const syndicProposals: ChargeProposal[] = [
      {
        id: "syn:1",
        documentId: "copro-calc",
        familyId: "syndic",
        description: "Charges de l'immeuble",
        amount: 800,
        exercise: YEAR,
        coproType: "provisions",
        missingFields: [],
        decision: "pending",
      },
      {
        id: "syn:2",
        documentId: "copro-calc",
        familyId: "syndic",
        description: "Épargne travaux",
        amount: 300,
        exercise: YEAR,
        coproType: "fonds_travaux",
        exclusionReason: "épargne pour de futurs travaux — pas encore une dépense",
        missingFields: [],
        decision: "pending",
      },
    ];
    turn = await receiveAndConfirm(assistant, turn.state, {
      documentId: "copro-calc",
      familyId: "syndic",
      proposals: syndicProposals,
    });
    const fromRegistry = computeChargesExercice({
      exerciceFiscal: YEAR,
      dateMiseEnService: "2023-01-01",
      taxeFonciere: turn.state.collected.taxeFonciere,
      coproLignes: turn.state.collected.coproLignes,
    });
    assert.equal(fromRegistry.charges.totalDeductible, manual.charges.totalDeductible);
    assert.equal(turn.state.collected.taxeFonciere, 1200);
    assert.ok(turn.state.collected.coproLignes.some((ligne) => ligne.montant === 800));
    assert.equal(
      turn.state.collected.coproLignes.some((ligne) => ligne.type === "fonds_travaux"),
      false,
    );
  });

  it("F-011 : le document F-012 n'écrit ni assurance emprunteur, ni capital, ni intérêts", async () => {
    const { assistant, turn: start } = await startFamily("impots");
    const turn = await receiveAndConfirm(assistant, start.state, {
      documentId: "avis-f011",
      familyId: "impots",
      proposals: proposalsFromTaxeFonciereCorpus({
        corpus: AVIS_SIMPLE,
        documentId: "avis-f011",
        fiscalYear: YEAR,
      }),
    });
    assert.equal(turn.state.collected.assurancePno, undefined);
    assert.equal(turn.state.collected.assuranceGli, undefined);
    assert.equal(turn.state.collected.divers.length, 0);
    assert.equal(
      turn.state.collected.divers.some((item) => item.financementOverlap === "assurance_emprunteur"),
      false,
    );
  });

  it("Tout confirmer refusé si une ligne est incomplète", async () => {
    const { assistant, turn: start } = await startFamily("impots");
    const proposals = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_SANS_MONTANT,
      documentId: "avis-all",
      fiscalYear: YEAR,
    });
    const turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "avis-all",
      familyId: "impots",
      proposals,
    });
    const blocked = await assistant.handle(turn.state, { type: "confirm_all_proposals" });
    assert.equal(blocked.state, turn.state);
    assert.equal(blocked.state.documentReview?.proposals[0]?.decision, "pending");
  });

  it("groupe : modifier le total annuel ignore les autres prélèvements", () => {
    const grouped = decideProposalGroup(
      [
        {
          id: "p1",
          documentId: "d",
          familyId: "impots",
          description: "Paiement 1",
          amount: 600,
          missingFields: [],
          decision: "pending",
          groupId: "g",
        },
        {
          id: "p2",
          documentId: "d",
          familyId: "impots",
          description: "Paiement 2",
          amount: 600,
          missingFields: [],
          decision: "pending",
          groupId: "g",
        },
      ],
      "p1",
      "modified",
      1300,
    );
    assert.equal(grouped[0]?.decision, "modified");
    assert.equal(grouped[0]?.modifiedAmount, 1300);
    assert.equal(grouped[1]?.decision, "ignored");
  });

  it("UI / panel : langage naturel + boutons + aria-live", () => {
    const capture = readFileSync(join(HERE, "../../../components/lmnp/assistants/F012FamilyCapture.tsx"), "utf8");
    const panel = readFileSync(join(HERE, "../../../components/lmnp/assistants/F012ChargesAssistantPanel.tsx"), "utf8");
    assert.match(capture, /Confirmer/);
    assert.match(capture, /Modifier/);
    assert.match(capture, /Ignorer/);
    assert.match(capture, /aria-label="Confirmer"/);
    assert.match(capture, /documentSourceLabel\(\)/);
    assert.match(capture, /everydayProposalTitle/);
    assert.doesNotMatch(capture, />ChargeProposal<|>FieldSource<|>provenance<|>exclusionReason</);
    assert.match(panel, /aria-live="polite"/);
    assert.match(panel, /className="sr-only"/);
  });
});
