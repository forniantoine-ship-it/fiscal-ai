/**
 * F-012 Cycle 11 — anti-oubli : amorces de mémoire, année N, recap à compléter.
 * Run: npx tsx --test src/runtime/assistants/f012-charges/assistant-cycle11.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { aggregateFiscalInputs } from "../../capabilities/f006/aggregate-inputs";
import { CHARGE_FAMILY_IDS } from "../../capabilities/f012/charge";
import { computeChargesExercice } from "../../capabilities/f012/compute-charges-exercice";
import { F012ChargesAssistant } from "./assistant";
import { collectedToChargeRegistry } from "./collected-to-registry";
import { DOCUMENTARY_FAMILY_IDS } from "./charge-proposal";
import { proposalsFromTaxeFonciereCorpus } from "./proposals-from-taxe-fonciere";
import {
  FAMILY_CARD_TITLES,
  FAMILY_TO_CATEGORIES,
  buildFamilyInventory,
  completenessSuggestions,
  coverageMark,
  coverageRecapLines,
  familyActionLabels,
  familyCardPrompt,
  familyMemoryPrompts,
  familyYearReminder,
  firstIncompleteFamilyIndex,
  nextFamilyIndexToVisit,
  remainingIncompleteMessage,
} from "./family-ux";
import { firstIntentViolations } from "./ux-copy";
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

const AVIS_N_PLUS_1 = `
Avis de taxe foncière — Année 2024
Net à payer : 1 100,00 EUR
Payé le 12/03/2025
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

async function toFirstFamily() {
  const assistant = new F012ChargesAssistant(ctx, DEPS);
  const turn = await assistant.handle(assistant.start().state, {
    type: "submit_profilage",
    ...PROFIL_SIMPLE,
  });
  return { assistant, turn };
}

describe("F-012 Cycle 11 — anti-oubli et collecte intelligente", () => {
  it("matrice : 6 familles, 2–4 rappels, catégories moteur existantes, pas de CFE", () => {
    const seen = new Set<string>();
    for (const familyId of CHARGE_FAMILY_IDS) {
      const prompts = familyMemoryPrompts(familyId);
      assert.ok(prompts.length >= 2 && prompts.length <= 4, familyId);
      for (const prompt of prompts) {
        assert.ok(FAMILY_TO_CATEGORIES[familyId].includes(prompt.category) || prompt.category === "divers");
        assert.equal(
          prompt.documentary,
          (DOCUMENTARY_FAMILY_IDS as readonly string[]).includes(familyId) && prompt.category !== "divers",
        );
        assert.doesNotMatch(prompt.reminder, /\bPNO\b|\bALUR\b|\bCFE\b|assurancePno|honorairesGestion/);
        assert.equal(seen.has(prompt.reminder), false, `doublon: ${prompt.reminder}`);
        seen.add(prompt.reminder);
      }
    }
    assert.deepEqual(buildFamilyInventory(PROFIL_FULL), [...CHARGE_FAMILY_IDS]);
  });

  it("A — client qui ne connaît aucune charge : parcours guidé, rien n'est oublié", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_FULL });
    const visited: string[] = [];
    while (turn.state.step === "category_collect" && turn.state.familyPhase !== "unknown_help") {
      const familyId = turn.state.familyInventory?.[turn.state.currentFamilyIndex ?? 0];
      if (familyId) visited.push(familyId);
      turn = await assistant.handle(turn.state, { type: "unknown_family" });
      turn = await assistant.handle(turn.state, { type: "continue_after_unknown" });
    }
    assert.deepEqual(visited, [...CHARGE_FAMILY_IDS]);
    assert.equal(turn.state.step, "completeness");
    const recap = collectTexts(turn.messages);
    assert.match(recap, /Il vous reste 6 informations à compléter/);
    for (const title of Object.values(FAMILY_CARD_TITLES)) {
      assert.match(recap, new RegExp(title));
    }
    assert.equal(registryOf(turn.state).charges.length, 0);
  });

  it("B — seulement certains montants, le reste à compléter", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "submit_family_impots", taxeFonciere: 1200 });
    turn = await assistant.handle(turn.state, { type: "unknown_family" });
    turn = await assistant.handle(turn.state, { type: "continue_after_unknown" });
    turn = await assistant.handle(turn.state, { type: "submit_family_autres", fraisBancaires: 24 });
    assert.equal(turn.state.step, "completeness");
    assert.equal(turn.state.collected.taxeFonciere, 1200);
    assert.equal(turn.state.collected.fraisBancaires, 24);
    assert.equal(registryOf(turn.state).familyCoverage.find((row) => row.familyId === "assurances")?.status, "unknown");
    assert.match(collectTexts(turn.messages), /Il vous reste 1 information à compléter/);
    assert.match(collectTexts(turn.messages), /Assurance du logement/);
  });

  it("C — document pour une famille, pas pour les autres", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "open_family_paper" });
    assert.equal(turn.state.familyPhase, "paper");
    assert.match(collectTexts(turn.messages), /avis de taxe foncière/i);
    turn = await assistant.handle(turn.state, { type: "continue_after_unknown" });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "unknown_family", reason: "document_missing" });
    turn = await assistant.handle(turn.state, { type: "continue_after_unknown" });
    assert.equal(registryOf(turn.state).familyCoverage.find((row) => row.familyId === "impots")?.status, "unknown");
    assert.equal(registryOf(turn.state).familyCoverage.find((row) => row.familyId === "assurances")?.status, "none");
    assert.equal(registryOf(turn.state).familyCoverage.find((row) => row.familyId === "autres")?.status, "unknown");
    assert.notEqual(turn.state.collected.taxeFonciere, 0);
  });

  it("D — continuer sans document : unknown, jamais 0 €, les autres familles restent ouvertes", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "unknown_family", reason: "document_missing" });
    assert.equal(turn.state.collected.taxeFonciere, undefined);
    turn = await assistant.handle(turn.state, { type: "continue_after_unknown" });
    assert.equal(turn.state.familyInventory?.[turn.state.currentFamilyIndex ?? 0], "assurances");
    assert.equal(registryOf(turn.state).charges.length, 0);
  });

  it("E — revenir plus tard compléter une famille unknown", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "unknown_family" });
    turn = await assistant.handle(turn.state, { type: "continue_after_unknown" });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    assert.equal(turn.state.step, "completeness");
    assert.ok(turn.messages.some((message) => message.suggestions?.some((item) => item.id === "revisit_incomplete")));
    turn = await assistant.handle(turn.state, { type: "revisit_incomplete" });
    assert.equal(turn.state.step, "category_collect");
    assert.equal(turn.state.familyInventory?.[turn.state.currentFamilyIndex ?? 0], "impots");
    turn = await assistant.handle(turn.state, { type: "submit_family_impots", taxeFonciere: 950 });
    assert.equal(turn.state.collected.taxeFonciere, 950);
    assert.equal(turn.state.collected.unknownFamilies, undefined);
    assert.equal(turn.state.step, "completeness");
    assert.equal(remainingIncompleteMessage(registryOf(turn.state).familyCoverage), undefined);
  });

  it("F — F5 / resume conserve les éléments à compléter", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    const turn = await assistant.handle(start.state, { type: "unknown_family" });
    const { toF012PersistedStateWithRegistry } = await import("./collected-to-registry");
    const persisted = toF012PersistedStateWithRegistry(turn.state, TS, YEAR);
    const resumed = assistant.resume(persisted);
    assert.match(collectTexts(resumed.messages), /Il vous reste 1 information à compléter/);
    assert.match(collectTexts(resumed.messages), /Impôts du logement/);
    assert.equal(resumed.state.collected.unknownFamilies?.[0]?.familyId, "impots");
    assert.equal(resumed.state.collected.taxeFonciere, undefined);
  });

  it("G — GO_BACK conserve les unknown déjà posés sur une autre famille", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "unknown_family" });
    turn = await assistant.handle(turn.state, { type: "continue_after_unknown" });
    assert.equal(turn.state.familyInventory?.[turn.state.currentFamilyIndex ?? 0], "assurances");
    const back = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(back.state.collected.unknownFamilies?.[0]?.familyId, "impots");
    assert.equal(back.state.familyPhase, "unknown_help");
  });

  it("H — une dépense n'est jamais demandée deux fois (rappels + inventaire)", () => {
    const reminders = CHARGE_FAMILY_IDS.flatMap((familyId) => familyMemoryPrompts(familyId).map((row) => row.reminder));
    assert.equal(new Set(reminders).size, reminders.length);
    assert.equal(buildFamilyInventory(PROFIL_FULL).filter((id) => id === "impots").length, 1);
  });

  it("I — Rien payé ≠ je ne sais pas", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    const none = await assistant.handle(start.state, { type: "none_family" });
    assert.equal(registryOf(none.state).familyCoverage.find((row) => row.familyId === "impots")?.status, "none");
    const { assistant: other, turn: otherStart } = await toFirstFamily();
    const unknown = await other.handle(otherStart.state, { type: "unknown_family" });
    assert.equal(registryOf(unknown.state).familyCoverage.find((row) => row.familyId === "impots")?.status, "unknown");
    assert.notEqual(coverageMark("none"), coverageMark("unknown"));
    assert.equal(familyActionLabels(YEAR).none, "Rien payé en 2024");
    assert.match(familyActionLabels(YEAR).unknown, /Je ne sais pas/);
  });

  it("J — ignore ≠ none (reviewed_empty reste distinct)", () => {
    assert.equal(coverageMark("reviewed_empty"), "Vérifié — aucune dépense retenue");
    assert.equal(coverageMark("none"), "— Rien payé");
    assert.notEqual(coverageMark("reviewed_empty"), coverageMark("none"));
  });

  it("K — montant 0 : pas de déductible inventé", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    const turn = await assistant.handle(start.state, { type: "submit_family_impots", taxeFonciere: 0 });
    const viaEngine = computeChargesExercice({
      exerciceFiscal: YEAR,
      dateMiseEnService: "2023-01-01",
      taxeFonciere: 0,
    });
    assert.equal(viaEngine.charges.totalDeductible, 0);
    assert.equal(turn.state.result?.charges.totalDeductible ?? viaEngine.charges.totalDeductible, 0);
  });

  it("L — année N rappelée sur la carte et le recap", async () => {
    const { turn } = await toFirstFamily();
    const text = collectTexts(turn.messages);
    assert.match(text, /réellement payé en 2024/);
    assert.match(text, /prélèvement de janvier 2025/);
    assert.equal(firstIntentViolations(familyYearReminder(YEAR), YEAR).length, 0);
    assert.match(familyCardPrompt("impots", YEAR), /• taxe foncière/);
  });

  it("M — paiement N+1 ne devient pas une charge N", () => {
    const [proposal] = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_N_PLUS_1,
      documentId: "avis-n1",
      fiscalYear: YEAR,
    });
    assert.equal(proposal?.exercise, 2025);
    assert.notEqual(proposal?.exercise, YEAR);
    assert.match(familyYearReminder(YEAR), /janvier 2025/);
  });

  it("N — manuel + même slot : une seule Charge", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    const turn = await assistant.handle(start.state, { type: "submit_family_impots", taxeFonciere: 1200 });
    const charges = registryOf(turn.state).charges.filter((item) => item.category === "taxe_fonciere");
    assert.equal(charges.length, 1);
    assert.equal(charges[0]?.amount, 1200);
  });

  it("O / P — F-011 continue de bloquer les assurances liées au financement", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS_F011);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    assert.match(collectTexts(turn.messages), /Impôts du logement/);
    turn = await assistant.handle(turn.state, { type: "none_family" });
    assert.match(collectTexts(turn.messages), /crédit/);
    turn = await assistant.handle(turn.state, { type: "none_family" });
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

  it("P — totaux fiscaux OLD / NEW identiques", async () => {
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

  it("Q — les 6 familles restent couvertes", () => {
    assert.deepEqual([...CHARGE_FAMILY_IDS], ["impots", "syndic", "assurances", "gestion", "travaux", "autres"]);
    assert.deepEqual(buildFamilyInventory(PROFIL_FULL), [...CHARGE_FAMILY_IDS]);
    const recap = coverageRecapLines([
      { familyId: "impots", exercise: YEAR, status: "captured", chargeIds: ["a"], documentIds: [] },
      { familyId: "syndic", exercise: YEAR, status: "none", chargeIds: [], documentIds: [] },
      { familyId: "assurances", exercise: YEAR, status: "unknown", chargeIds: [], documentIds: [] },
      { familyId: "gestion", exercise: YEAR, status: "not_applicable", chargeIds: [], documentIds: [] },
      { familyId: "travaux", exercise: YEAR, status: "reviewed_empty", chargeIds: [], documentIds: [] },
      { familyId: "autres", exercise: YEAR, status: "pending", chargeIds: [], documentIds: [] },
    ]);
    assert.match(recap, /✓ Vu/);
    assert.match(recap, /— Rien payé/);
    assert.match(recap, /\? À compléter/);
    assert.match(recap, /— Non concerné/);
    assert.match(recap, /Vérifié — aucune dépense retenue/);
    assert.match(recap, /À vérifier/);
  });

  it("R — unknown ne bloque jamais les autres familles + skip à la reprise", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "unknown_family" });
    turn = await assistant.handle(turn.state, { type: "continue_after_unknown" });
    assert.equal(turn.state.familyInventory?.[turn.state.currentFamilyIndex ?? 0], "assurances");
    turn = await assistant.handle(turn.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    const coverage = registryOf(turn.state).familyCoverage;
    assert.equal(firstIncompleteFamilyIndex(["impots", "assurances", "autres"], coverage), 0);
    assert.equal(nextFamilyIndexToVisit(["impots", "assurances", "autres"], 0, coverage), -1);
    const suggestions = completenessSuggestions(coverage);
    assert.equal(suggestions[0]?.id, "revisit_incomplete");
    turn = await assistant.handle(turn.state, { type: "revisit_incomplete" });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    assert.equal(turn.state.step, "completeness");
    assert.equal(registryOf(turn.state).familyCoverage.find((row) => row.familyId === "impots")?.status, "none");
  });
});
