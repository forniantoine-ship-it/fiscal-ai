/**
 * F-012 Cycle 13B — false confidence, warnings visibles, déduplication, filet.
 * Run: npx tsx --test src/runtime/assistants/f012-charges/assistant-cycle13b.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computeChargesExercice } from "../../capabilities/f012/compute-charges-exercice";
import type { ChargeFamilyId, FamilyCoverage } from "../../capabilities/f012/charge";
import { F012ChargesAssistant } from "./assistant";
import { collectedToChargeRegistry } from "./collected-to-registry";
import { chargesDeclaredRecordedMessage } from "./completeness-honesty";
import { applyFamilyExpenses } from "./family-expense-apply";
import { filetChips } from "./family-ux";
import { chargeRegistryToComputeInput } from "./registry-to-compute-input";
import { createInitialF012State, type F012Deps, type F012Message, type F012State } from "./types";

const YEAR = 2024;
const ctx = { dossierId: "test", fiscalYear: YEAR, route: "/assistants/charges" };
const DEPS: F012Deps = { dateMiseEnService: "2023-01-01" };
const PROFIL_SIMPLE = {
  copropriete: false,
  agence: false,
  travaux: false,
  vacance: false,
  comptable: false,
};
const PROFIL_AGENCE = {
  copropriete: false,
  agence: true,
  travaux: false,
  vacance: false,
  comptable: false,
};
const PROFIL_FULL = {
  copropriete: true,
  agence: true,
  travaux: true,
  vacance: false,
  comptable: true,
};

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
  return { registry, input, result: computeChargesExercice(input) };
}

function collectTexts(messages: F012Message[]): string {
  return messages.map((message) => message.content).join("\n");
}

function claimsTotalCompleteness(text: string): boolean {
  return (
    /toutes les charges/i.test(text) ||
    /tout est enregistré/i.test(text) ||
    /vos charges sont enregistrées(?! déclarées)/i.test(text)
  );
}

function emptyCollected() {
  return createInitialF012State().collected;
}

function coverage(
  familyId: ChargeFamilyId,
  status: FamilyCoverage["status"],
): FamilyCoverage {
  return { familyId, exercise: YEAR, status, chargeIds: [], documentIds: [] };
}

function allCoverage(
  statuses: Partial<Record<ChargeFamilyId, FamilyCoverage["status"]>>,
): FamilyCoverage[] {
  const ids: ChargeFamilyId[] = ["impots", "syndic", "assurances", "gestion", "travaux", "autres"];
  return ids.map((familyId) => coverage(familyId, statuses[familyId] ?? "pending"));
}

async function toFirstFamily(profil = PROFIL_SIMPLE) {
  const assistant = new F012ChargesAssistant(ctx, DEPS);
  const turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...profil });
  return { assistant, turn };
}

async function noneUntilCompleteness(assistant: F012ChargesAssistant, state: F012State) {
  let turn = { state, messages: [] as F012Message[], completed: false };
  while (turn.state.step === "category_collect") {
    turn = await assistant.handle(turn.state, { type: "none_family" });
  }
  return turn;
}

describe("F-012 Cycle 13B — false confidence", () => {
  it("Cas A — refus explicite GLI/comptable : pas d'impression de dossier complet", async () => {
    const { assistant, turn: start } = await toFirstFamily(PROFIL_AGENCE);
    let turn = await assistant.handle(start.state, { type: "submit_family_impots", taxeFonciere: 1200 });
    turn = await assistant.handle(turn.state, { type: "submit_family_assurance", montant: 600 });
    turn = await assistant.handle(turn.state, { type: "respond_slot_nudge", slot: "gli", accepted: false });
    turn = await assistant.handle(turn.state, { type: "submit_family_gestion", honorairesGestion: 1200 });
    turn = await assistant.handle(turn.state, {
      type: "respond_slot_nudge",
      slot: "comptable",
      accepted: false,
    });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: false });
    const reviewText = collectTexts(turn.messages);
    assert.equal(claimsTotalCompleteness(reviewText), false);
    assert.match(reviewText, /déclarées|Ces montants vous conviennent/);
    turn = await assistant.handle(turn.state, { type: "confirm_all" });
    assert.equal(turn.completed, true);
    assert.equal(turn.state.result?.chargesCoherentes, true);
    const finalText = collectTexts(turn.messages);
    assert.match(finalText, /charges déclarées sont enregistrées/);
    assert.equal(claimsTotalCompleteness(finalText), false);
    assert.equal(turn.state.collected.slotNudges?.gli, "declined");
    assert.equal(turn.state.collected.slotNudges?.comptable, "declined");
    const { registry, result } = pipeline(turn.state);
    assert.equal(registry.familyCoverage.find((row) => row.familyId === "assurances")?.status, "captured");
    assert.equal(result.charges.parCategorie.assurance_pno, 600);
    assert.equal(result.charges.parCategorie.assurance_gli ?? 0, 0);
    assert.equal(result.charges.parCategorie.honoraires_gestion, 1200);
    assert.equal(result.charges.parCategorie.honoraires_comptable ?? 0, 0);
  });

  it("Cas C — famille unknown : pas de « tout est enregistré »", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "unknown_family" });
    turn = await assistant.handle(turn.state, { type: "continue_after_unknown" });
    turn = await noneUntilCompleteness(assistant, turn.state);
    turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: false });
    assert.equal(turn.state.step, "aggregate_review");
    const unknown = registryOf(turn.state).familyCoverage.find((row) => row.status === "unknown");
    assert.ok(unknown);
    const warning = turn.state.result?.anomalies.find((anomaly) => anomaly.field === unknown.familyId);
    assert.ok(warning, "le warning de famille non résolue est dans result.anomalies");
    assert.equal(warning?.severity, "warning");
    const reviewText = collectTexts(turn.messages);
    assert.match(reviewText, /n'est pas encore résolu|pas un dossier complet|Points à clarifier/);
    assert.equal(claimsTotalCompleteness(reviewText), false);
    const suggestionIds = turn.messages.at(-1)?.suggestions?.map((item) => item.id) ?? [];
    assert.ok(suggestionIds.includes("revisit_incomplete"));
    assert.ok(suggestionIds.includes("confirm_all"));
    turn = await assistant.handle(turn.state, { type: "confirm_all" });
    assert.equal(turn.completed, true, "unknown ne bloque pas la finalisation");
    assert.equal(turn.state.result?.chargesCoherentes, true);
    const finalText = collectTexts(turn.messages);
    assert.match(finalText, /pas un dossier complet/);
    assert.equal(claimsTotalCompleteness(finalText), false);
    assert.ok(turn.state.result?.anomalies.some((anomaly) => anomaly.message.includes("n'est pas encore résolu")));
  });

  it("warning de complétude visible à la revue et à la fin", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await noneUntilCompleteness(assistant, start.state);
    turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: false });
    const review = collectTexts(turn.messages);
    assert.match(review, /Points à clarifier|taxe foncière|assurance PNO/i);
    assert.ok((turn.state.result?.anomalies.length ?? 0) > 0);
    turn = await assistant.handle(turn.state, { type: "confirm_all" });
    assert.equal(turn.completed, true);
    assert.match(collectTexts(turn.messages), /Points à clarifier/);
  });

  it("finalisation après refus explicite ≠ état unknown", async () => {
    const declined = chargesDeclaredRecordedMessage([]);
    const unknown = chargesDeclaredRecordedMessage(["Assurance du logement"]);
    assert.match(declined, /charges déclarées/);
    assert.doesNotMatch(declined, /dossier complet/);
    assert.match(unknown, /pas un dossier complet/);
  });
});

describe("F-012 Cycle 13B — déduplication", () => {
  it("PNO 600 + 600 → 2 lignes / 1200 € au compute", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "submit_family_assurance", montant: 600 });
    turn = await assistant.handle(turn.state, { type: "respond_slot_nudge", slot: "gli", accepted: false });
    turn = await assistant.handle(turn.state, { type: "revisit_family", familyId: "assurances" });
    turn = await assistant.handle(turn.state, { type: "submit_family_assurance", montant: 600 });
    const { registry, result } = pipeline(turn.state);
    const pno = registry.charges.filter((row) => row.category === "assurance_pno");
    assert.equal(pno.length, 2);
    assert.equal(result.charges.parCategorie.assurance_pno, 1200);
  });

  it("gestion 300 + 300 → 2 lignes / 600 € au compute", async () => {
    const { assistant, turn: start } = await toFirstFamily(PROFIL_AGENCE);
    let turn = await assistant.handle(start.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "submit_family_gestion", honorairesGestion: 300 });
    turn = await assistant.handle(turn.state, {
      type: "respond_slot_nudge",
      slot: "comptable",
      accepted: false,
    });
    turn = await assistant.handle(turn.state, { type: "revisit_family", familyId: "gestion" });
    turn = await assistant.handle(turn.state, { type: "submit_family_gestion", honorairesGestion: 300 });
    const { registry, result } = pipeline(turn.state);
    const lines = registry.charges.filter((row) => row.category === "honoraires_gestion");
    assert.equal(lines.length, 2);
    assert.equal(result.charges.parCategorie.honoraires_gestion, 600);
  });

  it("structured + freeText même dépense → 1 ligne / 600 €", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_assurance",
      montant: 600,
      freeText: "600 € assurance PNO",
    });
    const { registry, result } = pipeline(turn.state);
    assert.equal(registry.charges.filter((row) => row.category === "assurance_pno").length, 1);
    assert.equal(result.charges.parCategorie.assurance_pno, 600);
  });

  it("revisit + nouvelle dépense identique en montant → 2 lignes", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "submit_family_assurance", montant: 600 });
    turn = await assistant.handle(turn.state, { type: "respond_slot_nudge", slot: "gli", accepted: false });
    turn = await assistant.handle(turn.state, { type: "revisit_family", familyId: "assurances" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_assurance",
      freeText: "600 € PNO supplémentaire",
    });
    const { registry, result } = pipeline(turn.state);
    assert.equal(registry.charges.filter((row) => row.category === "assurance_pno").length, 2);
    assert.equal(result.charges.parCategorie.assurance_pno, 1200);
  });

  it("vrai doublon same-batch : deux parses identiques → une dépense", () => {
    const first = applyFamilyExpenses({
      collected: emptyCollected(),
      familyId: "assurances",
      exercise: YEAR,
      parsed: [
        { kind: "assurance_pno", amount: 600, description: "Assurance du logement" },
        { kind: "assurance_pno", amount: 600, description: "Assurance du logement" },
      ],
    });
    assert.equal(first.collected.assurancePno, 600);
    assert.equal((first.collected.familyLines ?? []).length, 0);
  });

  it("syndic 1800 + 1800 et travaux 450 + 450 restent distincts", async () => {
    const { assistant, turn: start } = await toFirstFamily(PROFIL_FULL);
    let turn = await assistant.handle(start.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_syndic",
      montantPaye: 1800,
      epargneTravaux: "non",
    });
    turn = await assistant.handle(turn.state, { type: "revisit_family", familyId: "syndic" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_syndic",
      montantPaye: 1800,
      epargneTravaux: "non",
    });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, {
      type: "submit_travaux_description",
      description: "Plombier",
      montant: 450,
    });
    turn = await assistant.handle(turn.state, {
      type: "submit_travaux_qualification",
      choix: "reparation_identique",
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
    const { registry, result } = pipeline(turn.state);
    assert.equal(registry.charges.filter((row) => row.familyId === "syndic").length, 2);
    assert.equal(result.charges.parCategorie.copropriete, 3600);
    assert.equal(registry.charges.filter((row) => row.familyId === "travaux").length, 2);
    assert.equal(result.charges.parCategorie.travaux, 900);
  });
});

describe("F-012 Cycle 13B — filet", () => {
  it(">4 familles candidates : autres/banque n'évince pas les priorités", () => {
    const chips = filetChips({
      familyCoverage: allCoverage({
        travaux: "none",
        syndic: "none",
        gestion: "none",
        assurances: "none",
        autres: "none",
      }),
      collected: emptyCollected(),
    });
    const ids = chips.map((chip) => chip.id);
    assert.ok(ids.length <= 4);
    assert.ok(ids.includes("completeness_assurances"));
    assert.equal(ids.includes("completeness_bank"), false);
  });

  it("famille unknown n'est pas évincée par gli/comptable/travaux/banque", () => {
    const chips = filetChips({
      familyCoverage: allCoverage({
        impots: "unknown",
        syndic: "none",
        assurances: "captured",
        gestion: "captured",
        travaux: "none",
        autres: "none",
      }),
      collected: { ...emptyCollected(), assurancePno: 600, honorairesGestion: 1200 },
    });
    const ids = chips.map((chip) => chip.id);
    assert.ok(ids.includes("completeness_impots"));
    assert.equal(ids[0], "completeness_impots");
    assert.equal(ids.includes("completeness_bank"), false);
  });

  it("détecté passe devant ; not_applicable rouvert reste prioritaire sur banque", () => {
    const chips = filetChips({
      familyCoverage: allCoverage({
        syndic: "not_applicable",
        travaux: "not_applicable",
        assurances: "captured",
        gestion: "none",
        autres: "none",
      }),
      collected: { ...emptyCollected(), assurancePno: 600 },
      detectedFamilyIds: ["syndic"],
    });
    const ids = chips.map((chip) => chip.id);
    assert.equal(ids[0], "completeness_syndic");
    assert.ok(ids.includes("completeness_travaux"));
    assert.equal(ids.includes("completeness_bank"), false);
  });

  it("Cas B — not_applicable syndic puis travaux via filet, rien perdu", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await noneUntilCompleteness(assistant, start.state);
    turn = await assistant.handle(turn.state, {
      type: "confirm_completeness",
      hasOther: true,
      freeText: "1800 € de copropriété",
    });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_syndic",
      freeText: turn.state.pendingFamilyFreeText,
      epargneTravaux: "non",
    });
    assert.equal(pipeline(turn.state).result.charges.parCategorie.copropriete, 1800);
    if (turn.state.step !== "completeness") {
      turn = await noneUntilCompleteness(assistant, turn.state);
    }
    turn = await assistant.handle(turn.state, {
      type: "confirm_completeness",
      hasOther: true,
      freeText: "450 € plombier",
    });
    turn = await assistant.handle(turn.state, {
      type: "submit_travaux_qualification",
      choix: "reparation_identique",
    });
    const { result } = pipeline(turn.state);
    assert.equal(result.charges.parCategorie.copropriete, 1800);
    assert.equal(result.charges.parCategorie.travaux, 450);
    if (turn.state.step !== "completeness") {
      turn = await noneUntilCompleteness(assistant, turn.state);
    }
    turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: false });
    turn = await assistant.handle(turn.state, { type: "confirm_all" });
    assert.equal(turn.completed, true);
    assert.equal(pipeline(turn.state).result.charges.parCategorie.copropriete, 1800);
    assert.equal(pipeline(turn.state).result.charges.parCategorie.travaux, 450);
  });

  it("abandon pendant nudge : PNO conservé, GLI non inventé, pas de fausse complétude", async () => {
    const { assistant, turn: start } = await toFirstFamily(PROFIL_AGENCE);
    let turn = await assistant.handle(start.state, { type: "submit_family_impots", taxeFonciere: 1200 });
    turn = await assistant.handle(turn.state, { type: "submit_family_assurance", montant: 600 });
    assert.equal(turn.state.pendingSlotNudge, "gli");
    turn = await assistant.handle(turn.state, { type: "none_family" });
    assert.equal(turn.state.collected.slotNudges?.gli, "declined");
    assert.equal(turn.state.collected.assurancePno, 600);
    assert.equal(turn.state.collected.assuranceGli, undefined);
    turn = await assistant.handle(turn.state, { type: "submit_family_gestion", honorairesGestion: 1200 });
    turn = await assistant.handle(turn.state, {
      type: "respond_slot_nudge",
      slot: "comptable",
      accepted: false,
    });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: false });
    turn = await assistant.handle(turn.state, { type: "confirm_all" });
    assert.equal(turn.completed, true);
    assert.equal(claimsTotalCompleteness(collectTexts(turn.messages)), false);
    assert.equal(pipeline(turn.state).result.charges.parCategorie.assurance_pno, 600);
    assert.equal(pipeline(turn.state).result.charges.parCategorie.assurance_gli ?? 0, 0);
  });

  it("retour après filet : go_back depuis la revue conserve les montants", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "submit_family_impots", taxeFonciere: 1200 });
    turn = await noneUntilCompleteness(assistant, turn.state);
    turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: false });
    assert.equal(turn.state.step, "aggregate_review");
    const back = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(back.state.collected.taxeFonciere, 1200);
    assert.notEqual(back.state.step, "complete");
  });
});
