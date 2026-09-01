/**
 * F-012 Cycle 13A — émergence / grain de complétude / verrou multi-familles.
 * Run: npx tsx --test src/runtime/assistants/f012-charges/assistant-cycle13a.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computeChargesExercice } from "../../capabilities/f012/compute-charges-exercice";
import type { ChargeCategorie } from "../../capabilities/f012/types";
import { F012ChargesAssistant } from "./assistant";
import { collectedToChargeRegistry } from "./collected-to-registry";
import { completenessSuggestions } from "./family-ux";
import { chargeRegistryToComputeInput } from "./registry-to-compute-input";
import type { F012Deps, F012Message, F012State } from "./types";

const YEAR = 2024;
const ctx = { dossierId: "test", fiscalYear: YEAR, route: "/assistants/charges" };
const DEPS: F012Deps = { dateMiseEnService: "2023-01-01" };
const PROFIL_SIMPLE = { copropriete: false, agence: false, travaux: false, vacance: false, comptable: false };
const PROFIL_FULL = { copropriete: true, agence: true, travaux: true, vacance: false, comptable: true };
const S2_TEXT =
  "1800 € syndic, 600 € d'assurance, 450 € à un plombier et 300 € à mon comptable";

type ExpectedExpense = { id: string; amount: number; category: ChargeCategorie };

const S1_EXPECTED: ExpectedExpense[] = [
  { id: "tf", amount: 1200, category: "taxe_fonciere" },
  { id: "pno", amount: 600, category: "assurance_pno" },
  { id: "gli", amount: 240, category: "assurance_gli" },
  { id: "syndic", amount: 1800, category: "copropriete" },
  { id: "gestion", amount: 1200, category: "honoraires_gestion" },
  { id: "comptable", amount: 300, category: "honoraires_comptable" },
  { id: "travaux", amount: 450, category: "travaux" },
  { id: "banque", amount: 20, category: "frais_bancaires" },
];

function registryOf(state: F012State) {
  return collectedToChargeRegistry({
    collected: state.collected,
    profil: state.profil,
    categoryInventory: state.categoryInventory,
    fieldSources: state.fieldSources,
    exercise: YEAR,
  });
}

function pipeline(state: F012State) {
  const registry = registryOf(state);
  const input = chargeRegistryToComputeInput(registry, {
    dateMiseEnService: "2023-01-01",
    fieldSources: state.fieldSources,
  });
  const result = computeChargesExercice(input);
  return { registry, input, result };
}

function identityMatched(expected: ExpectedExpense[], state: F012State): ExpectedExpense[] {
  const lignes = pipeline(state).result.charges.lignes;
  return expected.filter((item) =>
    lignes.some(
      (ligne) => ligne.categorie === item.category && Math.abs(ligne.montant - item.amount) < 0.05,
    ),
  );
}

function coveragePct(expected: ExpectedExpense[], state: F012State): number {
  if (expected.length === 0) return 100;
  return Math.round((100 * identityMatched(expected, state).length) / expected.length);
}

function nudgeQuestionCount(messages: F012Message[]): number {
  return messages.filter((message) =>
    message.suggestions?.some((item) => item.id === "slot_nudge_yes"),
  ).length;
}

function collectTexts(messages: F012Message[]): string {
  return messages.map((message) => message.content).join("\n");
}

async function toFirstFamily(profil = PROFIL_FULL) {
  const assistant = new F012ChargesAssistant(ctx, DEPS);
  const turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...profil });
  return { assistant, turn };
}

async function noneUntil(assistant: F012ChargesAssistant, state: F012State, familyId: string) {
  let turn = { state, messages: [] as F012Message[], completed: false };
  while (turn.state.familyInventory?.[turn.state.currentFamilyIndex ?? 0] !== familyId) {
    turn = await assistant.handle(turn.state, { type: "none_family" });
    if (turn.state.step !== "category_collect") break;
  }
  return turn;
}

async function noneUntilCompleteness(assistant: F012ChargesAssistant, state: F012State) {
  let turn = { state, messages: [] as F012Message[], completed: false };
  while (turn.state.step === "category_collect") {
    turn = await assistant.handle(turn.state, { type: "none_family" });
  }
  return turn;
}

describe("F-012 Cycle 13A — émergence utilisateur", () => {
  it("1. S1 diligent : 100 %, zéro relance", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    const extra: F012Message[] = [];
    let turn = await assistant.handle(start.state, { type: "submit_family_impots", taxeFonciere: 1200 });
    extra.push(...turn.messages);
    turn = await assistant.handle(turn.state, {
      type: "submit_family_syndic",
      montantPaye: 1800,
      epargneTravaux: "non",
    });
    extra.push(...turn.messages);
    turn = await assistant.handle(turn.state, {
      type: "submit_family_assurance",
      montant: 600,
      gliMontant: 240,
    });
    extra.push(...turn.messages);
    assert.equal(turn.state.pendingSlotNudge, undefined);
    turn = await assistant.handle(turn.state, {
      type: "submit_family_gestion",
      honorairesGestion: 1200,
      honorairesComptable: 300,
    });
    extra.push(...turn.messages);
    assert.equal(turn.state.pendingSlotNudge, undefined);
    turn = await assistant.handle(turn.state, {
      type: "submit_travaux_description",
      description: "Plombier",
      montant: 450,
    });
    turn = await assistant.handle(turn.state, {
      type: "submit_travaux_qualification",
      choix: "reparation_identique",
    });
    turn = await assistant.handle(turn.state, { type: "finish_travaux_category" });
    turn = await assistant.handle(turn.state, { type: "submit_family_autres", fraisBancaires: 20 });
    extra.push(...turn.messages);
    assert.equal(nudgeQuestionCount(extra), 0);
    turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: false });
    assert.equal(coveragePct(S1_EXPECTED, turn.state), 100);
    assert.equal(identityMatched(S1_EXPECTED, turn.state).length, 8);
  });

  it("2. S1 typique : GLI + comptable récupérables par relance", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "submit_family_impots", taxeFonciere: 1200 });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_syndic",
      montantPaye: 1800,
      epargneTravaux: "non",
    });
    turn = await assistant.handle(turn.state, { type: "submit_family_assurance", montant: 600 });
    assert.equal(turn.state.pendingSlotNudge, "gli");
    assert.equal(nudgeQuestionCount(turn.messages), 1);
    const before = coveragePct(S1_EXPECTED, turn.state);
    turn = await assistant.handle(turn.state, {
      type: "respond_slot_nudge",
      slot: "gli",
      accepted: true,
      montant: 240,
    });
    turn = await assistant.handle(turn.state, { type: "submit_family_gestion", honorairesGestion: 1200 });
    assert.equal(turn.state.pendingSlotNudge, "comptable");
    turn = await assistant.handle(turn.state, {
      type: "respond_slot_nudge",
      slot: "comptable",
      accepted: true,
      montant: 300,
    });
    turn = await assistant.handle(turn.state, {
      type: "submit_travaux_description",
      description: "Plombier",
      montant: 450,
    });
    turn = await assistant.handle(turn.state, {
      type: "submit_travaux_qualification",
      choix: "reparation_identique",
    });
    turn = await assistant.handle(turn.state, { type: "finish_travaux_category" });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    const chipIds = (turn.messages.at(-1)?.suggestions ?? []).map((item) => item.id);
    assert.ok(chipIds.includes("completeness_bank"));
    turn = await assistant.handle(turn.state, { type: "revisit_family", familyId: "autres" });
    turn = await assistant.handle(turn.state, { type: "submit_family_autres", fraisBancaires: 20 });
    const after = coveragePct(S1_EXPECTED, turn.state);
    assert.ok(before < 50, `coverage avant relances trop haute: ${before}`);
    assert.equal(after, 100);
    assert.equal(identityMatched(S1_EXPECTED, turn.state).length, 8);
  });

  it("3. Non à une relance → aucune deuxième relance", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await noneUntil(assistant, start.state, "assurances");
    turn = await assistant.handle(turn.state, { type: "submit_family_assurance", montant: 600 });
    assert.equal(turn.state.pendingSlotNudge, "gli");
    turn = await assistant.handle(turn.state, { type: "respond_slot_nudge", slot: "gli", accepted: false });
    assert.equal(turn.state.pendingSlotNudge, undefined);
    assert.equal(turn.state.collected.slotNudges?.gli, "declined");
    assert.equal(nudgeQuestionCount(turn.messages), 0);
    const chipIds = completenessSuggestions(registryOf(turn.state).familyCoverage, {
      collected: turn.state.collected,
      profil: turn.state.profil,
    }).map((item) => item.id);
    assert.equal(chipIds.includes("completeness_gli"), false);
  });

  it("4. captured + GLI via filet → deux assurances", async () => {
    const { assistant, turn: start } = await toFirstFamily(PROFIL_SIMPLE);
    let turn = await assistant.handle(start.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "submit_family_assurance", montant: 600 });
    turn = await assistant.handle(turn.state, { type: "respond_slot_nudge", slot: "gli", accepted: false });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    assert.equal(registryOf(turn.state).familyCoverage.find((row) => row.familyId === "assurances")?.status, "captured");
    turn = await assistant.handle(turn.state, { type: "revisit_family", familyId: "assurances" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_assurance",
      gliMontant: 240,
    });
    const charges = registryOf(turn.state).charges.filter((row) => row.familyId === "assurances");
    assert.equal(charges.length, 2);
    assert.equal(pipeline(turn.state).result.charges.parCategorie.assurance_pno, 600);
    assert.equal(pipeline(turn.state).result.charges.parCategorie.assurance_gli, 240);
  });

  it("5. none + syndic via filet", async () => {
    const { assistant, turn: start } = await toFirstFamily(PROFIL_FULL);
    let turn = await noneUntil(assistant, start.state, "syndic");
    turn = await assistant.handle(turn.state, { type: "none_family" });
    assert.equal(registryOf(turn.state).familyCoverage.find((row) => row.familyId === "syndic")?.status, "none");
    turn = await noneUntilCompleteness(assistant, turn.state);
    turn = await assistant.handle(turn.state, { type: "revisit_family", familyId: "syndic" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_syndic",
      montantPaye: 1800,
      epargneTravaux: "non",
    });
    assert.equal(pipeline(turn.state).result.charges.totalDeductible, 1800);
  });

  it("6. not_applicable + travaux via filet", async () => {
    const { assistant, turn: start } = await toFirstFamily(PROFIL_SIMPLE);
    assert.equal(start.state.familyInventory?.includes("travaux"), false);
    let turn = await noneUntilCompleteness(assistant, start.state);
    assert.equal(
      registryOf(turn.state).familyCoverage.find((row) => row.familyId === "travaux")?.status,
      "not_applicable",
    );
    const chipIds = (turn.messages.at(-1)?.suggestions ?? []).map((item) => item.id);
    assert.ok(chipIds.includes("completeness_travaux"));
    turn = await assistant.handle(turn.state, {
      type: "confirm_completeness",
      hasOther: true,
      freeText: "450 € à un plombier",
    });
    turn = await assistant.handle(turn.state, {
      type: "submit_travaux_qualification",
      choix: "reparation_identique",
    });
    assert.equal(pipeline(turn.state).result.charges.parCategorie.travaux, 450);
  });

  it("7. filet sans texte n'ouvre pas Autres", async () => {
    const { assistant, turn: start } = await toFirstFamily(PROFIL_SIMPLE);
    let turn = await noneUntilCompleteness(assistant, start.state);
    turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: true });
    assert.equal(turn.state.step, "completeness");
    assert.notEqual(turn.state.familyInventory?.[turn.state.currentFamilyIndex ?? 0], "autres");
    assert.match(collectTexts(turn.messages), /Décrivez la dépense/);
    assert.equal(turn.state.collected.divers.length, 0);
  });

  it("8. S2 multi-familles → aucune mauvaise écriture automatique", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, {
      type: "submit_family_impots",
      freeText: S2_TEXT,
    });
    assert.equal(turn.state.collected.taxeFonciere, undefined);
    assert.equal(turn.state.collected.divers.length, 0);
    assert.equal(registryOf(turn.state).charges.length, 0);
    assert.match(collectTexts(turn.messages), /n'avons rien inscrit automatiquement/);
    turn = await noneUntilCompleteness(assistant, turn.state);
    turn = await assistant.handle(turn.state, {
      type: "confirm_completeness",
      hasOther: true,
      freeText: S2_TEXT,
    });
    assert.equal(turn.state.step, "completeness");
    assert.equal(turn.state.collected.travaux.length, 0);
    assert.equal(turn.state.pendingTravaux, undefined);
    const kinds = registryOf(turn.state).charges.map((row) => row.category);
    assert.equal(kinds.includes("divers"), false);
    assert.equal(pipeline(turn.state).result.charges.totalDeductible, 0);
  });

  it("9. S2 mono-famille → 12A inchangé", async () => {
    const { assistant, turn: start } = await toFirstFamily(PROFIL_SIMPLE);
    let turn = await noneUntil(assistant, start.state, "assurances");
    turn = await assistant.handle(turn.state, {
      type: "submit_family_assurance",
      freeText: "600 € d'assurance habitation et 240 € de loyers impayés",
    });
    assert.equal(turn.state.pendingSlotNudge, undefined);
    assert.equal(turn.state.collected.assurancePno, 600);
    assert.equal(turn.state.collected.assuranceGli, 240);
    const charges = registryOf(turn.state).charges.filter((row) => row.familyId === "assurances");
    assert.equal(charges.length, 2);
    assert.equal(pipeline(turn.state).result.charges.totalDeductible, 840);
  });

  it("10. S5 → puces pertinentes encore disponibles", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "submit_family_impots", taxeFonciere: 1200 });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_syndic",
      montantPaye: 1800,
      epargneTravaux: "non",
    });
    turn = await assistant.handle(turn.state, { type: "submit_family_assurance", montant: 600 });
    turn = await assistant.handle(turn.state, { type: "respond_slot_nudge", slot: "gli", accepted: false });
    turn = await assistant.handle(turn.state, { type: "submit_family_gestion", honorairesGestion: 1200 });
    turn = await assistant.handle(turn.state, { type: "respond_slot_nudge", slot: "comptable", accepted: false });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    const chipIds = (turn.messages.at(-1)?.suggestions ?? []).map((item) => item.id);
    assert.ok(chipIds.includes("completeness_travaux"));
    assert.ok(chipIds.includes("completeness_bank"));
    assert.equal(turn.state.step, "completeness");
  });

  it("11. S6 structured + freeText inchangé", async () => {
    const { assistant, turn: start } = await toFirstFamily(PROFIL_SIMPLE);
    let turn = await noneUntil(assistant, start.state, "assurances");
    turn = await assistant.handle(turn.state, {
      type: "submit_family_assurance",
      freeText: "600 € d'habitation et 240 € de loyers impayés",
      montant: 600,
      gliMontant: 240,
    });
    const charges = registryOf(turn.state).charges.filter((row) => row.familyId === "assurances");
    assert.equal(charges.length, 2);
    assert.equal(pipeline(turn.state).result.charges.totalDeductible, 840);
  });

  it("12. captured n'empêche plus d'ajouter une 2e dépense de famille", async () => {
    const { assistant, turn: start } = await toFirstFamily(PROFIL_SIMPLE);
    let turn = await assistant.handle(start.state, { type: "submit_family_impots", taxeFonciere: 1200 });
    assert.equal(registryOf(turn.state).familyCoverage.find((row) => row.familyId === "impots")?.status, "captured");
    turn = await noneUntilCompleteness(assistant, turn.state);
    turn = await assistant.handle(turn.state, { type: "revisit_family", familyId: "impots" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_impots",
      autreDescription: "Ordures ménagères",
      autreMontant: 80,
    });
    assert.ok((pipeline(turn.state).result.charges.totalDeductible ?? 0) >= 1280);
  });
});
