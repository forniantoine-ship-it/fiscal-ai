/**
 * F-012 Cycle 12A — anti-oubli : plusieurs dépenses par famille, filet final.
 * Run: npx tsx --test src/runtime/assistants/f012-charges/assistant-cycle12a.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { aggregateFiscalInputs } from "../../capabilities/f006/aggregate-inputs";
import { CHARGE_FAMILY_IDS } from "../../capabilities/f012/charge";
import { computeChargesExercice } from "../../capabilities/f012/compute-charges-exercice";
import { F012ChargesAssistant } from "./assistant";
import { collectedToChargeRegistry, toF012PersistedStateWithRegistry } from "./collected-to-registry";
import { FILET_MEMORY_HINTS, familyMemoryPrompts, filetFinalPrompt } from "./family-ux";
import { firstIntentViolations } from "./ux-copy";
import { proposalsFromTaxeFonciereCorpus } from "./proposals-from-taxe-fonciere";
import type { ChargeProposal } from "./charge-proposal";
import type { F012Deps, F012State } from "./types";

const YEAR = 2024;
const ctx = { dossierId: "test", fiscalYear: YEAR, route: "/assistants/charges" };
const DEPS: F012Deps = { dateMiseEnService: "2023-01-01" };
const DEPS_F011: F012Deps = {
  dateMiseEnService: "2023-01-01",
  financementCharges: { totalAssurance: 300, totalCapitalRembourse: 5000 },
};
const TS = "2024-03-01T10:00:00.000Z";
const PROFIL_SIMPLE = { copropriete: false, agence: false, travaux: false, vacance: false, comptable: false };
const PROFIL_FULL = { copropriete: true, agence: true, travaux: true, vacance: false, comptable: true };
const AVIS = `
Avis de taxe foncière — Année 2024
Net à payer : 1 200,00 EUR
Date de paiement : 15/10/2024
`;
const AVIS_INCOMPLET = `
Avis de taxe foncière — Année 2024
Net à payer :
Date de paiement : 15/10/2024
`;

function registryOf(state: F012State) {
  return collectedToChargeRegistry({
    collected: state.collected,
    profil: state.profil,
    categoryInventory: state.categoryInventory,
    fieldSources: state.fieldSources,
    exercise: YEAR,
  });
}

function collectTexts(messages: { content: string }[]): string {
  return messages.map((message) => message.content).join("\n");
}

function fiscalSnapshot(result: ReturnType<typeof computeChargesExercice>) {
  return {
    totalDeductible: result.charges.totalDeductible,
    totalPreExploitation: result.charges.totalPreExploitation,
    parCategorie: result.charges.parCategorie,
    composants: result.charges.composantsNouveaux,
    lignes: result.charges.lignes.map((ligne) => ({
      id: ligne.id,
      montant: ligne.montant,
      montantDeductible: ligne.montantDeductible,
      categorie: ligne.categorie,
    })),
    anomalies: result.anomalies,
  };
}

async function toFirstFamily(profil = PROFIL_SIMPLE) {
  const assistant = new F012ChargesAssistant(ctx, DEPS);
  const turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...profil });
  return { assistant, turn };
}

async function noneUntil(assistant: F012ChargesAssistant, state: F012State, familyId: string) {
  let turn = { state, messages: [] as { content: string }[], completed: false };
  turn.state = state;
  while (turn.state.familyInventory?.[turn.state.currentFamilyIndex ?? 0] !== familyId) {
    const next = await assistant.handle(turn.state, { type: "none_family" });
    turn = next;
    if (turn.state.step !== "category_collect") break;
  }
  return turn;
}

describe("F-012 Cycle 12A — anti-oubli sans rallonger le parcours", () => {
  it("A — une famille, une dépense", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    const turn = await assistant.handle(start.state, { type: "submit_family_impots", taxeFonciere: 1200 });
    const charges = registryOf(turn.state).charges.filter((row) => row.familyId === "impots");
    assert.equal(charges.length, 1);
    assert.equal(charges[0]?.amount, 1200);
  });

  it("B — une famille, 2 dépenses (assurance habitation + GLI)", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_assurance",
      montant: 600,
      gliMontant: 240,
    });
    assert.equal(turn.state.collected.assurancePno, 600);
    assert.equal(turn.state.collected.assuranceGli, 240);
    const charges = registryOf(turn.state).charges.filter((row) => row.familyId === "assurances");
    assert.equal(charges.length, 2);
  });

  it("C — une famille, 3+ dépenses (gestion)", async () => {
    const { assistant, turn: start } = await toFirstFamily(PROFIL_FULL);
    let turn = await noneUntil(assistant, start.state, "gestion");
    turn = await assistant.handle(turn.state, {
      type: "submit_family_gestion",
      honorairesGestion: 1200,
      fraisEtatDesLieux: 180,
      fraisMiseEnLocation: 300,
    });
    assert.equal(turn.state.collected.honorairesGestion, 1200);
    assert.equal(turn.state.collected.fraisEtatDesLieux, 180);
    assert.equal((turn.state.collected.familyLines ?? []).some((line) => line.montant === 300), true);
    const charges = registryOf(turn.state).charges.filter((row) => row.familyId === "gestion");
    assert.ok(charges.length >= 3);
  });

  it("D — plusieurs familles avec plusieurs dépenses", async () => {
    const { assistant, turn: start } = await toFirstFamily(PROFIL_FULL);
    let turn = await assistant.handle(start.state, { type: "submit_family_impots", taxeFonciere: 900 });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_syndic",
      freeText: "1 800 € de charges et 350 € de régularisation",
      epargneTravaux: "non",
    });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_assurance",
      freeText: "600 € d'habitation et 240 € de loyers impayés",
    });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_gestion",
      freeText: "1 200 € de gestion + 180 € d'état des lieux + 300 € de mise en location",
    });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_autres",
      items: [
        { description: "Annonce", montant: 40 },
        { description: "Fournitures", montant: 25 },
      ],
    });
    const registry = registryOf(turn.state);
    assert.ok(registry.charges.filter((row) => row.familyId === "syndic").length >= 2);
    assert.ok(registry.charges.filter((row) => row.familyId === "assurances").length >= 2);
    assert.ok(registry.charges.filter((row) => row.familyId === "gestion").length >= 3);
    assert.ok(registry.charges.filter((row) => row.familyId === "autres").length >= 2);
  });

  it("E — assurance habitation + GLI (saisie libre)", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_assurance",
      freeText: "600 € d'assurance habitation et 240 € de loyers impayés",
    });
    assert.equal(turn.state.collected.assurancePno, 600);
    assert.equal(turn.state.collected.assuranceGli, 240);
  });

  it("F — gestion + état des lieux + mise en location", async () => {
    const { assistant, turn: start } = await toFirstFamily(PROFIL_FULL);
    let turn = await noneUntil(assistant, start.state, "gestion");
    turn = await assistant.handle(turn.state, {
      type: "submit_family_gestion",
      freeText: "1 200 € de gestion + 180 € d'état des lieux + 300 € de mise en location",
    });
    assert.equal(turn.state.collected.honorairesGestion, 1200);
    assert.equal(turn.state.collected.fraisEtatDesLieux, 180);
    assert.equal(turn.state.collected.familyLines?.some((line) => line.montant === 300), true);
  });

  it("G — syndic + régularisation, sans perdre le 350 €", async () => {
    const { assistant, turn: start } = await toFirstFamily(PROFIL_FULL);
    let turn = await assistant.handle(start.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_syndic",
      freeText: "1 800 € de charges et 350 € de régularisation",
      epargneTravaux: "non",
    });
    assert.equal(turn.state.collected.coproLignes.length, 2);
    assert.equal(turn.state.collected.coproLignes.find((ligne) => ligne.type === "provisions")?.montant, 1800);
    assert.equal(turn.state.collected.coproLignes.find((ligne) => ligne.type === "regularisation")?.montant, 350);
  });

  it("H — petite réparation après profilage « pas de travaux »", async () => {
    const { assistant, turn: start } = await toFirstFamily(PROFIL_SIMPLE);
    assert.equal(start.state.familyInventory?.includes("travaux"), false);
    let turn = await assistant.handle(start.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    assert.equal(turn.state.step, "completeness");
    turn = await assistant.handle(turn.state, { type: "revisit_family", familyId: "travaux" });
    assert.equal(turn.state.familyInventory?.includes("travaux"), true);
    assert.equal(turn.state.travauxSubStep, "description");
    turn = await assistant.handle(turn.state, {
      type: "submit_travaux_description",
      description: "Plombier — fuite",
      montant: 450,
    });
    turn = await assistant.handle(turn.state, { type: "submit_travaux_qualification", choix: "reparation_identique" });
    turn = await assistant.handle(turn.state, { type: "finish_travaux_category" });
    assert.equal(turn.state.collected.travaux[0]?.montant, 450);
    assert.equal(turn.state.collected.travaux[0]?.natureIntervention, "entretien");
    assert.equal(registryOf(turn.state).charges.some((row) => row.familyId === "travaux" && row.amount === 450), true);
  });

  it("I — autre dépense après parcours complet", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: true, familyId: "autres" });
    assert.equal(turn.state.step, "category_collect");
    assert.equal(turn.state.familyInventory?.[turn.state.currentFamilyIndex ?? 0], "autres");
    turn = await assistant.handle(turn.state, {
      type: "submit_family_autres",
      diversDescription: "Annonce",
      diversMontant: 35,
    });
    assert.equal(turn.state.collected.divers.some((row) => row.montant === 35), true);
    assert.equal(turn.state.step, "completeness");
  });

  it("I2 — filet : le texte rouvre la famille pertinente, pas divers", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, {
      type: "confirm_completeness",
      hasOther: true,
      freeText: "450 € à un plombier",
    });
    assert.equal(turn.state.familyInventory?.[turn.state.currentFamilyIndex ?? 0], "travaux");
    assert.equal(turn.state.travauxSubStep, "qualification");
    assert.equal(turn.state.pendingTravaux?.montant, 450);
  });

  it("J — réponse libre contenant plusieurs montants", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_assurance",
      freeText: "600 € d'habitation et 240 € de loyers impayés",
    });
    assert.notEqual(turn.state.collected.assurancePno, 840);
    assert.equal(turn.state.collected.assurancePno, 600);
    assert.equal(turn.state.collected.assuranceGli, 240);
  });

  it("K — document + manuel dans une même famille", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "open_family_paper" });
    const [proposal] = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS,
      documentId: "avis-k",
      fiscalYear: YEAR,
    });
    turn = await assistant.handle(turn.state, {
      type: "receive_document_proposals",
      documentId: "avis-k",
      familyId: "impots",
      proposals: [proposal as ChargeProposal],
    });
    turn = await assistant.handle(turn.state, { type: "confirm_proposal", proposalId: proposal!.id });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.collected.taxeFonciere, 1200);
    turn = await assistant.handle(turn.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "revisit_family", familyId: "impots" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_impots",
      autreDescription: "Autre taxe",
      autreMontant: 80,
    });
    assert.equal(turn.state.collected.taxeFonciere, 1200);
    assert.equal(turn.state.collected.divers.some((row) => row.montant === 80), true);
  });

  it("L — document incomplet puis manuel", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "open_family_paper" });
    const [proposal] = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_INCOMPLET,
      documentId: "avis-l",
      fiscalYear: YEAR,
    });
    turn = await assistant.handle(turn.state, {
      type: "receive_document_proposals",
      documentId: "avis-l",
      familyId: "impots",
      proposals: proposal ? [proposal] : [],
    });
    if (proposal) {
      turn = await assistant.handle(turn.state, { type: "fill_proposal_manual", proposalId: proposal.id, amount: 1100 });
      turn = await assistant.handle(turn.state, { type: "commit_document_review" });
      assert.equal(turn.state.collected.taxeFonciere, 1100);
    } else {
      turn = await assistant.handle(turn.state, { type: "open_family_manual" });
      turn = await assistant.handle(turn.state, { type: "submit_family_impots", taxeFonciere: 1100 });
      assert.equal(turn.state.collected.taxeFonciere, 1100);
    }
  });

  it("M — unknown puis retour plus tard", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "unknown_family" });
    turn = await assistant.handle(turn.state, { type: "continue_after_unknown" });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "revisit_incomplete" });
    turn = await assistant.handle(turn.state, { type: "submit_family_impots", taxeFonciere: 950 });
    assert.equal(turn.state.collected.taxeFonciere, 950);
    assert.equal(turn.state.collected.unknownFamilies, undefined);
  });

  it("N — none explicite", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    const turn = await assistant.handle(start.state, { type: "none_family" });
    assert.equal(registryOf(turn.state).familyCoverage.find((row) => row.familyId === "impots")?.status, "none");
    assert.equal(registryOf(turn.state).charges.length, 0);
  });

  it("O — ignore ≠ none", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "open_family_paper" });
    const [proposal] = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS,
      documentId: "avis-o",
      fiscalYear: YEAR,
    });
    turn = await assistant.handle(turn.state, {
      type: "receive_document_proposals",
      documentId: "avis-o",
      familyId: "impots",
      proposals: [proposal as ChargeProposal],
    });
    turn = await assistant.handle(turn.state, { type: "ignore_proposal", proposalId: proposal!.id });
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(registryOf(turn.state).familyCoverage.find((row) => row.familyId === "impots")?.status, "reviewed_empty");
    assert.notEqual(registryOf(turn.state).familyCoverage.find((row) => row.familyId === "impots")?.status, "none");
    assert.equal(registryOf(turn.state).charges.length, 0);
  });

  it("P — montant 0 n'écrit pas de Charge", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    const turn = await assistant.handle(start.state, { type: "submit_family_impots", taxeFonciere: 0 });
    assert.equal(turn.state.collected.taxeFonciere, undefined);
    assert.equal(registryOf(turn.state).charges.length, 0);
    assert.equal(turn.state.step, "category_collect");
  });

  it("Q — paiement N+1 n'est pas une charge N", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    const turn = await assistant.handle(start.state, {
      type: "submit_family_impots",
      taxeFonciere: 1100,
      paidAt: "2025-01-12",
    });
    assert.equal(turn.state.collected.taxeFonciere, undefined);
    assert.equal(registryOf(turn.state).charges.length, 0);
  });

  it("R — GO_BACK conserve les dépenses déjà posées", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "submit_family_impots", taxeFonciere: 1200 });
    const back = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(back.state.collected.taxeFonciere, undefined);
    turn = await assistant.handle(back.state, { type: "submit_family_impots", taxeFonciere: 1200 });
    assert.equal(turn.state.collected.taxeFonciere, 1200);
  });

  it("S / T — refresh / resume : plusieurs Charges stables", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_assurance",
      montant: 600,
      gliMontant: 240,
    });
    const persisted = toF012PersistedStateWithRegistry(turn.state, TS, YEAR);
    const resumed = assistant.resume(persisted);
    assert.equal(resumed.state.collected.assurancePno, 600);
    assert.equal(resumed.state.collected.assuranceGli, 240);
    const before = registryOf(turn.state).charges.map((row) => row.id).sort();
    const after = registryOf(resumed.state).charges.map((row) => row.id).sort();
    assert.deepEqual(after, before);
  });

  it("U — garde-fou F-011 : assurance emprunteur n'est pas une Charge F-012", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS_F011);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    const blocked = await assistant.handle(turn.state, {
      type: "submit_family_assurance",
      montant: 300,
      description: "Assurance emprunteur du crédit",
    });
    assert.equal(blocked.state.collected.assurancePno, undefined);
    assert.equal(blocked.state.step, "category_collect");
    turn = await assistant.handle(blocked.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_autres",
      diversDescription: "Assurance emprunteur",
      diversMontant: 300,
    });
    const item = turn.state.collected.divers.find((row) => row.description === "Assurance emprunteur");
    assert.equal(item?.financementOverlap, "assurance_emprunteur");
    const computed = computeChargesExercice({
      exerciceFiscal: YEAR,
      dateMiseEnService: "2023-01-01",
      divers: turn.state.collected.divers,
    });
    assert.equal(computed.charges.totalDeductible, 0);
  });

  it("V — filet final anti-oubli", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    const text = collectTexts(turn.messages);
    assert.match(text, /Avant de terminer, repensons une dernière fois à votre logement/);
    assert.match(text, /Avez-vous payé quelque chose en 2024 que nous n'avons pas encore renseigné/);
    for (const hint of FILET_MEMORY_HINTS.slice(0, 4)) {
      assert.match(text, new RegExp(hint));
    }
    assert.equal(firstIntentViolations(filetFinalPrompt(YEAR), YEAR).length, 0);
    assert.ok(turn.messages.some((message) => message.suggestions?.some((item) => item.id === "completeness_travaux")));
  });

  it("W — « non » au filet final ne bloque pas et n'invente rien", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "submit_family_impots", taxeFonciere: 1200 });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: false });
    assert.equal(turn.state.step, "aggregate_review");
    assert.equal(turn.state.collected.divers.length, 0);
    assert.equal(turn.state.result?.charges.totalDeductible, 1200);
  });

  it("X — aucune duplication", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_assurance",
      freeText: "600 € d'habitation et 240 € de loyers impayés",
      montant: 600,
      gliMontant: 240,
    });
    const charges = registryOf(turn.state).charges.filter((row) => row.familyId === "assurances");
    assert.equal(charges.length, 2);
    assert.equal(turn.state.collected.assurancePno, 600);
    assert.equal(turn.state.collected.assuranceGli, 240);
  });

  it("Y — total fiscal OLD === NEW (mêmes montants, slots existants)", async () => {
    const input = {
      exerciceFiscal: YEAR,
      dateMiseEnService: "2023-01-01" as const,
      taxeFonciere: 1200,
      assurancePno: 180,
      fraisBancaires: 20,
    };
    const direct = computeChargesExercice(input);
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "submit_family_impots", taxeFonciere: 1200 });
    turn = await assistant.handle(turn.state, { type: "submit_family_assurance", montant: 180 });
    turn = await assistant.handle(turn.state, { type: "submit_family_autres", fraisBancaires: 20 });
    turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: false });
    const viaAssistant = computeChargesExercice({
      exerciceFiscal: YEAR,
      dateMiseEnService: "2023-01-01",
      taxeFonciere: turn.state.collected.taxeFonciere,
      assurancePno: turn.state.collected.assurancePno,
      fraisBancaires: turn.state.collected.fraisBancaires,
    });
    assert.deepEqual(fiscalSnapshot(viaAssistant), fiscalSnapshot(direct));
    assert.equal(turn.state.result!.charges.totalDeductible, direct.charges.totalDeductible);
    assert.deepEqual(turn.state.result!.charges.parCategorie, direct.charges.parCategorie);
    const aggregated = aggregateFiscalInputs({
      exerciceFiscal: YEAR,
      activite: { dateMiseEnService: "2023-01-01" },
      revenusAssistant: { exerciceFiscal: YEAR, totalRecettes: 9000 },
      chargesAssistant: {
        exerciceFiscal: YEAR,
        totalDeductible: direct.charges.totalDeductible,
        totalPreExploitation: direct.charges.totalPreExploitation,
        parCategorie: direct.charges.parCategorie,
      },
      financementCharges: {
        exerciceFiscal: YEAR,
        totalChargesFinancementExercice: 0,
        totalInteretsPreExploitation: 0,
      },
      amortissementAssistant: { exerciceFiscal: YEAR, totalDotations: 0, status: "validated" },
    });
    assert.equal(aggregated.data?.chargesExploitation, direct.charges.totalDeductible);
  });

  it("Z — 6 familles, ≤4 amorces, pas de jargon, CFE absente", () => {
    for (const familyId of CHARGE_FAMILY_IDS) {
      const prompts = familyMemoryPrompts(familyId);
      assert.ok(prompts.length >= 2 && prompts.length <= 4, familyId);
      for (const prompt of prompts) {
        assert.doesNotMatch(prompt.reminder, /\bPNO\b|\bALUR\b|\bCFE\b|provision|immobilisation/);
      }
    }
    assert.match(filetFinalPrompt(YEAR), /réparation/);
    assert.doesNotMatch(filetFinalPrompt(YEAR), /\bPNO\b|\bALUR\b/);
  });
});

describe("F-012 Cycle 12A — tests humains adversariaux", () => {
  it("1. propriétaire très simple : taxe + assurance, filet « non »", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "submit_family_impots", taxeFonciere: 800 });
    turn = await assistant.handle(turn.state, { type: "submit_family_assurance", montant: 120 });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    assert.match(collectTexts(turn.messages), /Avant de terminer/);
    turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: false });
    assert.equal(turn.state.result?.charges.totalDeductible, 920);
  });

  it("2. copro + assurance + agence : plusieurs lignes sans questionnaire", async () => {
    const { assistant, turn: start } = await toFirstFamily(PROFIL_FULL);
    let turn = await assistant.handle(start.state, { type: "submit_family_impots", taxeFonciere: 1100 });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_syndic",
      freeText: "1 800 € de charges et 350 € de régularisation",
      epargneTravaux: "non",
    });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_assurance",
      montant: 600,
      gliMontant: 240,
    });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_gestion",
      honorairesGestion: 1200,
      fraisEtatDesLieux: 180,
    });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    const registry = registryOf(turn.state);
    assert.ok(registry.charges.length >= 6);
    assert.match(collectTexts(turn.messages), /copropriété|assurance|réparation/);
  });

  it("3. beaucoup de petites dépenses : saisie libre autres", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_autres",
      freeText: "40 € d'annonce, 12 € de fournitures et 28 € de déplacement",
    });
    assert.ok(turn.state.collected.divers.length >= 3);
  });

  it("4. pas de documents : unknown puis filet non", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "unknown_family" });
    turn = await assistant.handle(turn.state, { type: "continue_after_unknown" });
    turn = await assistant.handle(turn.state, { type: "unknown_family" });
    turn = await assistant.handle(turn.state, { type: "continue_after_unknown" });
    turn = await assistant.handle(turn.state, { type: "unknown_family" });
    turn = await assistant.handle(turn.state, { type: "continue_after_unknown" });
    assert.equal(turn.state.step, "completeness");
    assert.match(collectTexts(turn.messages), /À compléter/);
    turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: false });
    assert.equal(turn.state.step, "aggregate_review");
    assert.equal(registryOf(turn.state).charges.length, 0);
  });

  it("5. oubli travaux : le filet rouvre la réparation", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "submit_family_impots", taxeFonciere: 1000 });
    turn = await assistant.handle(turn.state, { type: "submit_family_assurance", montant: 150 });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "revisit_family", familyId: "travaux" });
    turn = await assistant.handle(turn.state, {
      type: "submit_travaux_description",
      description: "Plombier",
      montant: 450,
    });
    turn = await assistant.handle(turn.state, { type: "submit_travaux_qualification", choix: "reparation_identique" });
    assert.equal(turn.state.collected.travaux[0]?.montant, 450);
  });
});
