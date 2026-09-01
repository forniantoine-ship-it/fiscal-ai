/**
 * F-012 Cycle 8A — FamilyCoverage après review vide.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computeChargesExercice } from "../../capabilities/f012/compute-charges-exercice";
import { resolveFamilyCoverage } from "../../capabilities/f012/family-coverage";
import { F012ChargesAssistant } from "./assistant";
import { collectedToChargeRegistry } from "./collected-to-registry";
import {
  markFamilyNone,
  markFamilyReviewedEmpty,
  markFamilyUnknown,
} from "./family-coverage-intents";
import { coverageMark, coverageRecapLines } from "./family-ux";
import { proposalsFromTaxeFonciereCorpus } from "./proposals-from-taxe-fonciere";
import type { ChargeProposal } from "./charge-proposal";
import type { F012CollectedData, F012Deps, F012State } from "./types";

const YEAR = 2024;
const ctx = { dossierId: "test", fiscalYear: YEAR, route: "/assistants/charges" };
const DEPS: F012Deps = { dateMiseEnService: "2023-01-01" };
const TS = "2024-03-01T10:00:00.000Z";
const PROFIL = { copropriete: false, agence: false, travaux: false, vacance: false, comptable: false };

const AVIS_SIMPLE = `
Avis de taxe foncière — Année 2024
Commune de Lyon
Net à payer : 1 200,00 EUR
Date de paiement : 15/10/2024
`;

const AVIS_SANS_MONTANT = `
Avis de taxe foncière
Commune de Nantes
`;

function emptyCollected(): F012CollectedData {
  return { coproLignes: [], travaux: [], divers: [], skippedCategories: [] };
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

async function startImpots() {
  const assistant = new F012ChargesAssistant(ctx, DEPS);
  const turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL });
  return { assistant, turn };
}

function twoImpotsProposals(documentId: string): ChargeProposal[] {
  return [
    {
      id: `${documentId}:1`,
      documentId,
      familyId: "impots",
      description: "Taxe foncière — acompte",
      amount: 600,
      exercise: YEAR,
      missingFields: [],
      decision: "pending",
    },
    {
      id: `${documentId}:2`,
      documentId,
      familyId: "impots",
      description: "Taxe foncière — solde",
      amount: 600,
      exercise: YEAR,
      missingFields: [],
      decision: "pending",
    },
  ];
}

describe("F-012 Cycle 8A — FamilyCoverage après review vide", () => {
  it("priorité resolve : captured > unknown > none > reviewed_empty > pending", () => {
    assert.equal(
      resolveFamilyCoverage({
        chargeCount: 1,
        applicable: true,
        inInventory: true,
        explicitNone: true,
        reviewedEmpty: true,
        skipped: true,
      }).status,
      "captured",
    );
    assert.equal(
      resolveFamilyCoverage({
        chargeCount: 0,
        applicable: true,
        inInventory: true,
        explicitUnknown: "unsure",
        explicitNone: true,
        reviewedEmpty: true,
        skipped: true,
      }).status,
      "unknown",
    );
    assert.equal(
      resolveFamilyCoverage({
        chargeCount: 0,
        applicable: true,
        inInventory: true,
        explicitNone: true,
        reviewedEmpty: true,
        skipped: false,
      }).status,
      "none",
    );
    assert.equal(
      resolveFamilyCoverage({
        chargeCount: 0,
        applicable: true,
        inInventory: true,
        explicitNone: false,
        reviewedEmpty: true,
        skipped: false,
      }).status,
      "reviewed_empty",
    );
    assert.equal(
      resolveFamilyCoverage({
        chargeCount: 0,
        applicable: true,
        inInventory: true,
        explicitNone: false,
        skipped: false,
      }).status,
      "pending",
    );
  });

  it("A — 2 proposals toutes ignorées → reviewed_empty, pas none, pas de Charge", async () => {
    const { assistant, turn: start } = await startImpots();
    const proposals = twoImpotsProposals("avis-a");
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "avis-a",
      familyId: "impots",
      proposals,
    });
    for (const proposal of proposals) {
      turn = await assistant.handle(turn.state, { type: "ignore_proposal", proposalId: proposal.id });
    }
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.deepEqual(turn.state.collected.reviewedEmptyFamilies, ["impots"]);
    assert.equal(turn.state.collected.taxeFonciere, undefined);
    assert.equal(turn.state.collected.noneFamilies, undefined);
    assert.equal(coverageOf(turn.state, "impots")?.status, "reviewed_empty");
    assert.equal(registryOf(turn.state).charges.length, 0);
    assert.deepEqual(turn.state.collected.documentIdsByFamily?.impots, ["avis-a"]);
  });

  it("B — 1 confirmée + 1 ignorée → captured", async () => {
    const { assistant, turn: start } = await startImpots();
    const proposals = twoImpotsProposals("avis-b");
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "avis-b",
      familyId: "impots",
      proposals,
    });
    turn = await assistant.handle(turn.state, { type: "confirm_proposal", proposalId: proposals[0]!.id });
    turn = await assistant.handle(turn.state, { type: "ignore_proposal", proposalId: proposals[1]!.id });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(coverageOf(turn.state, "impots")?.status, "captured");
    assert.equal(turn.state.collected.taxeFonciere, 600);
    assert.equal(turn.state.collected.reviewedEmptyFamilies, undefined);
  });

  it("C — montant manquant : reste pending jusqu'à décision, unknown si je ne sais pas", async () => {
    const { assistant, turn: start } = await startImpots();
    const proposals = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_SANS_MONTANT,
      documentId: "avis-c",
      fiscalYear: YEAR,
    });
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "avis-c",
      familyId: "impots",
      proposals,
    });
    assert.equal(coverageOf(turn.state, "impots")?.status, "pending");
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.familyPhase, "review");
    assert.equal(coverageOf(turn.state, "impots")?.status, "pending");

    const { assistant: a2, turn: s2 } = await startImpots();
    let unknown = await a2.handle(s2.state, { type: "unknown_family" });
    unknown = await a2.handle(unknown.state, { type: "continue_after_unknown" });
    assert.equal(coverageOf(unknown.state, "impots")?.status, "unknown");
  });

  it("D — zéro proposition utile : pas none, pas reviewed_empty silencieux", async () => {
    const { assistant, turn: start } = await startImpots();
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "avis-d",
      familyId: "impots",
      proposals: [],
    });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.collected.noneFamilies, undefined);
    assert.equal(turn.state.collected.reviewedEmptyFamilies, undefined);
    assert.equal(turn.state.collected.taxeFonciere, undefined);
    assert.equal(coverageOf(turn.state, "impots")?.status, "pending");
  });

  it("E — manuel Rien payé → none", async () => {
    const { assistant, turn: start } = await startImpots();
    const turn = await assistant.handle(start.state, { type: "none_family" });
    assert.equal(coverageOf(turn.state, "impots")?.status, "none");
    assert.equal(turn.state.collected.taxeFonciere, undefined);
  });

  it("F — manuel Je ne sais pas → unknown", async () => {
    const { assistant, turn: start } = await startImpots();
    let turn = await assistant.handle(start.state, { type: "unknown_family" });
    turn = await assistant.handle(turn.state, { type: "continue_after_unknown" });
    assert.equal(coverageOf(turn.state, "impots")?.status, "unknown");
  });

  it("G — not_applicable inchangé", () => {
    const registry = collectedToChargeRegistry({
      collected: emptyCollected(),
      profil: PROFIL,
      categoryInventory: ["taxe_fonciere", "assurance_pno", "frais_bancaires", "divers"],
      fieldSources: {},
      exercise: YEAR,
    });
    assert.equal(registry.familyCoverage.find((row) => row.familyId === "syndic")?.status, "not_applicable");
  });

  it("H — pending uniquement si jamais vérifiée", () => {
    const registry = collectedToChargeRegistry({
      collected: emptyCollected(),
      profil: PROFIL,
      categoryInventory: ["taxe_fonciere"],
      fieldSources: {},
      exercise: YEAR,
    });
    assert.equal(registry.familyCoverage.find((row) => row.familyId === "impots")?.status, "pending");
    assert.equal(
      collectedToChargeRegistry({
        collected: markFamilyReviewedEmpty(emptyCollected(), "impots"),
        profil: PROFIL,
        categoryInventory: ["taxe_fonciere"],
        fieldSources: {},
        exercise: YEAR,
      }).familyCoverage.find((row) => row.familyId === "impots")?.status,
      "reviewed_empty",
    );
  });

  it("I — refresh après review vide : statut identique", async () => {
    const { assistant, turn: start } = await startImpots();
    const proposals = twoImpotsProposals("avis-i");
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "avis-i",
      familyId: "impots",
      proposals,
    });
    for (const proposal of proposals) {
      turn = await assistant.handle(turn.state, { type: "ignore_proposal", proposalId: proposal.id });
    }
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    const { toF012PersistedStateWithRegistry } = await import("./collected-to-registry");
    const persisted = toF012PersistedStateWithRegistry(turn.state, TS, YEAR);
    const resumed = assistant.resume(persisted);
    assert.deepEqual(resumed.state.collected.reviewedEmptyFamilies, ["impots"]);
    assert.equal(coverageOf(resumed.state, "impots")?.status, "reviewed_empty");
    assert.equal(persisted.registry?.familyCoverage.find((row) => row.familyId === "impots")?.status, "reviewed_empty");
  });

  it("J — GO_BACK après review vide : pas de corruption", async () => {
    const { assistant, turn: start } = await startImpots();
    const proposals = twoImpotsProposals("avis-j");
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "avis-j",
      familyId: "impots",
      proposals,
    });
    for (const proposal of proposals) {
      turn = await assistant.handle(turn.state, { type: "ignore_proposal", proposalId: proposal.id });
    }
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(coverageOf(turn.state, "impots")?.status, "reviewed_empty");
    turn = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(turn.state.familyPhase, "review");
    assert.equal(turn.state.collected.reviewedEmptyFamilies, undefined);
    assert.equal(coverageOf(turn.state, "impots")?.status, "pending");
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(coverageOf(turn.state, "impots")?.status, "reviewed_empty");
    assert.equal(registryOf(turn.state).charges.length, 0);
  });

  it("K — récap : famille visible, langage naturel, pas de jargon", () => {
    const registry = collectedToChargeRegistry({
      collected: markFamilyReviewedEmpty(emptyCollected(), "impots"),
      profil: PROFIL,
      categoryInventory: ["taxe_fonciere", "assurance_pno"],
      fieldSources: {},
      exercise: YEAR,
    });
    const recap = coverageRecapLines(registry.familyCoverage);
    assert.match(recap, /Impôts du logement/);
    assert.match(recap, /Vérifié — aucune dépense retenue/);
    assert.match(recap, /À vérifier/);
    assert.doesNotMatch(recap, /\bpending\b/);
    assert.doesNotMatch(recap, /\bcaptured\b/);
    assert.doesNotMatch(recap, /\breviewed_empty\b/);
    assert.doesNotMatch(recap, /\bnone\b/);
    assert.equal(coverageMark("pending"), "À vérifier");
    assert.equal(coverageMark("unknown"), "? À compléter");
    assert.equal(coverageMark("reviewed_empty"), "Vérifié — aucune dépense retenue");
  });

  it("markFamilyReviewedEmpty n'écrit jamais 0 € et ne devient pas none", () => {
    const marked = markFamilyReviewedEmpty(
      { ...emptyCollected(), taxeFonciere: undefined },
      "impots",
    );
    assert.equal(marked.taxeFonciere, undefined);
    assert.deepEqual(marked.reviewedEmptyFamilies, ["impots"]);
    assert.equal(marked.noneFamilies, undefined);
    const afterNone = markFamilyNone(emptyCollected(), "impots");
    assert.deepEqual(afterNone.noneFamilies, ["impots"]);
    assert.notEqual(
      collectedToChargeRegistry({
        collected: marked,
        profil: PROFIL,
        categoryInventory: ["taxe_fonciere"],
        fieldSources: {},
        exercise: YEAR,
      }).familyCoverage.find((row) => row.familyId === "impots")?.status,
      collectedToChargeRegistry({
        collected: afterNone,
        profil: PROFIL,
        categoryInventory: ["taxe_fonciere"],
        fieldSources: {},
        exercise: YEAR,
      }).familyCoverage.find((row) => row.familyId === "impots")?.status,
    );
  });

  it("unknown reste prioritaire sur reviewed_empty si les deux sont posés", () => {
    const both = markFamilyUnknown(markFamilyReviewedEmpty(emptyCollected(), "impots"), "impots", "unsure");
    assert.equal(
      collectedToChargeRegistry({
        collected: both,
        profil: PROFIL,
        categoryInventory: ["taxe_fonciere"],
        fieldSources: {},
        exercise: YEAR,
      }).familyCoverage.find((row) => row.familyId === "impots")?.status,
      "unknown",
    );
  });

  it("non-régression calcul : review vide = même total qu'aucune taxe", () => {
    const empty = computeChargesExercice({
      exerciceFiscal: YEAR,
      dateMiseEnService: "2023-01-01",
    });
    const afterIgnore = computeChargesExercice({
      exerciceFiscal: YEAR,
      dateMiseEnService: "2023-01-01",
      taxeFonciere: undefined,
    });
    assert.equal(afterIgnore.charges.totalDeductible, empty.charges.totalDeductible);
    const withCharge = computeChargesExercice({
      exerciceFiscal: YEAR,
      dateMiseEnService: "2023-01-01",
      taxeFonciere: 1200,
    });
    assert.notEqual(withCharge.charges.totalDeductible, empty.charges.totalDeductible);
  });

  it("document réel toutes ignorées : pas de Charge à 0 dans le registry", async () => {
    const { assistant, turn: start } = await startImpots();
    const proposals = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_SIMPLE,
      documentId: "avis-calc",
      fiscalYear: YEAR,
    });
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "avis-calc",
      familyId: "impots",
      proposals,
    });
    turn = await assistant.handle(turn.state, { type: "ignore_proposal", proposalId: proposals[0]!.id });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(registryOf(turn.state).charges.some((charge) => charge.amount === 0), false);
    assert.equal(coverageOf(turn.state, "impots")?.status, "reviewed_empty");
  });
});
