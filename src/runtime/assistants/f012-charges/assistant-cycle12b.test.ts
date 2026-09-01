/**
 * F-012 Cycle 12B — complétude fiscale end-to-end (collecte → registry → compute).
 * Run: npx tsx --test src/runtime/assistants/f012-charges/assistant-cycle12b.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { computeChargesExercice } from "../../capabilities/f012/compute-charges-exercice";
import { F012ChargesAssistant } from "./assistant";
import { collectedToChargeRegistry } from "./collected-to-registry";
import { parseStructuredAmount } from "./family-expense-parse";
import { chargeRegistryToComputeInput } from "./registry-to-compute-input";
import type { F012Deps, F012State } from "./types";

const YEAR = 2024;
const ctx = { dossierId: "test", fiscalYear: YEAR, route: "/assistants/charges" };
const DEPS: F012Deps = { dateMiseEnService: "2023-01-01" };
const DEPS_F011: F012Deps = {
  dateMiseEnService: "2023-01-01",
  financementCharges: { totalAssurance: 500, totalCapitalRembourse: 5000 },
};
const PROFIL_SIMPLE = { copropriete: false, agence: false, travaux: false, vacance: false, comptable: false };
const PROFIL_FULL = { copropriete: true, agence: true, travaux: true, vacance: false, comptable: true };
const HERE = dirname(fileURLToPath(import.meta.url));

function pipeline(state: F012State) {
  const registry = collectedToChargeRegistry({
    collected: state.collected,
    profil: state.profil,
    categoryInventory: state.categoryInventory,
    fieldSources: state.fieldSources,
    exercise: YEAR,
  });
  const input = chargeRegistryToComputeInput(registry, {
    dateMiseEnService: "2023-01-01",
    fieldSources: state.fieldSources,
  });
  const result = computeChargesExercice(input);
  return { registry, input, result };
}

async function toFirstFamily(profil = PROFIL_SIMPLE, deps = DEPS) {
  const assistant = new F012ChargesAssistant(ctx, deps);
  const turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...profil });
  return { assistant, turn };
}

async function noneUntilCompleteness(assistant: F012ChargesAssistant, state: F012State) {
  let turn = { state, messages: [] as { content: string }[], completed: false };
  turn.state = state;
  while (turn.state.step === "category_collect") {
    turn = await assistant.handle(turn.state, { type: "none_family" });
  }
  return turn;
}

describe("F-012 Cycle 12B — travaux → compute", () => {
  it("autres + 450 € plombier : pas collecté sans nature, puis compute après qualification", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_autres",
      freeText: "450 € à un plombier",
    });
    assert.equal(turn.state.collected.travaux.length, 0);
    assert.equal(turn.state.pendingTravaux?.montant, 450);
    assert.equal(turn.state.travauxSubStep, "qualification");
    assert.equal(pipeline(turn.state).result.charges.totalDeductible, 0);

    turn = await assistant.handle(turn.state, {
      type: "submit_travaux_qualification",
      choix: "reparation_identique",
    });
    assert.equal(turn.state.collected.travaux[0]?.montant, 450);
    assert.equal(turn.state.collected.travaux[0]?.natureIntervention, "entretien");
    const { registry, input, result } = pipeline(turn.state);
    assert.equal(registry.charges.some((row) => row.familyId === "travaux" && row.amount === 450), true);
    assert.equal(input.travaux?.[0]?.montant, 450);
    assert.equal(result.charges.totalDeductible, 450);
  });

  it("plusieurs travaux : les montants restent en file puis arrivent au compute", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_autres",
      freeText: "450 € à un plombier et 200 € de peinture",
    });
    assert.equal(turn.state.pendingTravaux?.montant, 450);
    assert.equal(turn.state.queuedTravaux?.[0]?.montant, 200);
    turn = await assistant.handle(turn.state, {
      type: "submit_travaux_qualification",
      choix: "reparation_identique",
    });
    assert.equal(turn.state.collected.travaux[0]?.montant, 450);
    assert.equal(turn.state.pendingTravaux?.montant, 200);
    turn = await assistant.handle(turn.state, {
      type: "submit_travaux_qualification",
      choix: "reparation_identique",
    });
    assert.equal(turn.state.collected.travaux.length, 2);
    assert.equal(pipeline(turn.state).result.charges.totalDeductible, 650);
  });

  it("travaux déjà présents : une nouvelle ligne s'ajoute sans écraser", async () => {
    const { assistant, turn: start } = await toFirstFamily({ ...PROFIL_SIMPLE, travaux: true });
    let turn = await assistant.handle(start.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, {
      type: "submit_travaux_description",
      description: "Serrure",
      montant: 80,
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
    assert.equal(turn.state.collected.travaux.length, 2);
    assert.equal(pipeline(turn.state).result.charges.totalDeductible, 530);
  });

  it("travaux avec nature renseignée atteignent le compute", async () => {
    const { assistant, turn: start } = await toFirstFamily({ ...PROFIL_SIMPLE, travaux: true });
    let turn = await assistant.handle(start.state, { type: "none_family" });
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
    assert.equal(turn.state.collected.travaux[0]?.natureIntervention, "entretien");
    assert.equal(pipeline(turn.state).result.charges.totalDeductible, 450);
  });

  it("travaux sans nature ne sont pas présentés comme collectés", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_autres",
      freeText: "450 € à un plombier",
    });
    const { registry, result } = pipeline(turn.state);
    assert.equal(turn.state.collected.travaux.length, 0);
    assert.equal(registry.charges.filter((row) => row.familyId === "travaux").length, 0);
    assert.equal(result.charges.totalDeductible, 0);
    assert.equal(turn.state.pendingTravaux?.montant, 450);
  });
});

describe("F-012 Cycle 12B — filet UI / revisit", () => {
  it("le panneau envoie le freeText du filet", () => {
    const panel = readFileSync(join(HERE, "../../../components/lmnp/assistants/F012ChargesAssistantPanel.tsx"), "utf8");
    const capture = readFileSync(join(HERE, "../../../components/lmnp/assistants/F012FamilyCapture.tsx"), "utf8");
    assert.match(capture, /CompletenessCatchForm/);
    assert.match(panel, /CompletenessCatchForm/);
    assert.match(panel, /confirm_completeness[\s\S]*freeText/);
  });

  it("profilage sans copro puis filet syndic conserve 1800 € jusqu'au compute", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    assert.equal(start.state.familyInventory?.includes("syndic"), false);
    let turn = await noneUntilCompleteness(assistant, start.state);
    turn = await assistant.handle(turn.state, {
      type: "confirm_completeness",
      hasOther: true,
      freeText: "1 800 € de charges de copropriété",
    });
    assert.equal(turn.state.familyInventory?.[turn.state.currentFamilyIndex ?? 0], "syndic");
    assert.equal(turn.state.pendingFamilyFreeText, "1 800 € de charges de copropriété");
    turn = await assistant.handle(turn.state, {
      type: "submit_family_syndic",
      freeText: turn.state.pendingFamilyFreeText,
      epargneTravaux: "non",
    });
    assert.equal(turn.state.collected.coproLignes[0]?.montant, 1800);
    assert.equal(pipeline(turn.state).result.charges.totalDeductible, 1800);
  });

  it("profilage sans agence puis filet gestion conserve 1200 € jusqu'au compute", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    assert.equal(start.state.familyInventory?.includes("gestion"), false);
    let turn = await noneUntilCompleteness(assistant, start.state);
    turn = await assistant.handle(turn.state, {
      type: "confirm_completeness",
      hasOther: true,
      freeText: "1 200 € de frais de gestion",
    });
    assert.equal(turn.state.familyInventory?.[turn.state.currentFamilyIndex ?? 0], "gestion");
    assert.ok(turn.state.pendingFamilyFreeText);
    turn = await assistant.handle(turn.state, {
      type: "submit_family_gestion",
      freeText: turn.state.pendingFamilyFreeText,
    });
    assert.equal(turn.state.collected.honorairesGestion, 1200);
    assert.equal(pipeline(turn.state).result.charges.totalDeductible, 1200);
  });

  it("profilage sans travaux puis filet 450 € plombier : montant conservé jusqu'au compute", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    assert.equal(start.state.familyInventory?.includes("travaux"), false);
    let turn = await noneUntilCompleteness(assistant, start.state);
    turn = await assistant.handle(turn.state, {
      type: "confirm_completeness",
      hasOther: true,
      freeText: "450 € à un plombier",
    });
    assert.equal(turn.state.familyInventory?.[turn.state.currentFamilyIndex ?? 0], "travaux");
    assert.equal(turn.state.pendingTravaux?.montant, 450);
    turn = await assistant.handle(turn.state, {
      type: "submit_travaux_qualification",
      choix: "reparation_identique",
    });
    assert.equal(pipeline(turn.state).result.charges.totalDeductible, 450);
  });
});

describe("F-012 Cycle 12B — invariant registry → compute", () => {
  it("1. syndic 1800 + 350 : déclaré = compute", async () => {
    const { assistant, turn: start } = await toFirstFamily(PROFIL_FULL);
    let turn = await assistant.handle(start.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_syndic",
      freeText: "1 800 € de charges et 350 € de régularisation",
      epargneTravaux: "non",
    });
    const { registry, input, result } = pipeline(turn.state);
    assert.equal(registry.charges.filter((row) => row.familyId === "syndic").length, 2);
    assert.equal((input.coproLignes ?? []).reduce((sum, row) => sum + row.montant, 0), 2150);
    assert.equal(result.charges.totalDeductible, 2150);
  });

  it("2. gestion 1200 + 180 + 300 : déclaré = compute", async () => {
    const { assistant, turn: start } = await toFirstFamily(PROFIL_FULL);
    let turn = await assistant.handle(start.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_gestion",
      honorairesGestion: 1200,
      fraisEtatDesLieux: 180,
      fraisMiseEnLocation: 300,
    });
    const declared = 1200 + 180 + 300;
    assert.equal(pipeline(turn.state).result.charges.totalDeductible, declared);
  });

  it("3. deux PNO : les deux montants arrivent au compute", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_assurance",
      freeText: "600 € d'habitation et 700 € d'assurance propriétaire",
    });
    assert.equal(turn.state.collected.assurancePno, 600);
    assert.equal(turn.state.collected.familyLines?.some((line) => line.montant === 700), true);
    assert.equal(pipeline(turn.state).result.charges.totalDeductible, 1300);
  });

  it("4. autres + plombier : 450 € au compute après qualification", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_autres",
      freeText: "450 € à un plombier",
    });
    turn = await assistant.handle(turn.state, {
      type: "submit_travaux_qualification",
      choix: "reparation_identique",
    });
    assert.equal(pipeline(turn.state).result.charges.totalDeductible, 450);
  });

  it("8. lot mixte F-011 + PNO légitime : la charge F-012 n'est pas perdue", async () => {
    const { assistant, turn: start } = await toFirstFamily(PROFIL_SIMPLE, DEPS_F011);
    let turn = await assistant.handle(start.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_assurance",
      freeText: "600 € d'assurance habitation et 500 € d'assurance emprunteur",
    });
    assert.equal(turn.state.collected.assurancePno, 600);
    assert.equal(turn.state.collected.assuranceGli, undefined);
    const { registry, result } = pipeline(turn.state);
    assert.equal(registry.charges.some((row) => row.amount === 600 && row.familyId === "assurances"), true);
    assert.equal(registry.charges.some((row) => row.amount === 500 && row.exclusionReason === "f011_overlap"), false);
    assert.equal(result.charges.totalDeductible, 600);
  });

  it("9. 1 800 en champ structuré", async () => {
    assert.equal(parseStructuredAmount("1 800"), 1800);
    const { assistant, turn: start } = await toFirstFamily(PROFIL_FULL);
    let turn = await assistant.handle(start.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_syndic",
      montantPaye: parseStructuredAmount("1 800"),
      epargneTravaux: "non",
    });
    assert.equal(turn.state.collected.coproLignes[0]?.montant, 1800);
    assert.equal(pipeline(turn.state).result.charges.totalDeductible, 1800);
  });

  it("10. 1200 ou 1300 € : pas de montant fiscal certain", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    const turn = await assistant.handle(start.state, {
      type: "submit_family_impots",
      freeText: "1200 ou 1300 €",
    });
    assert.equal(turn.state.collected.taxeFonciere, undefined);
    assert.equal(pipeline(turn.state).result.charges.totalDeductible, 0);
    assert.ok(turn.messages.some((message) => /incertain/.test(message.content)));
  });

  it("11. dépense déjà présente : pas de duplication au compute", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "submit_family_impots", taxeFonciere: 1200 });
    turn = await assistant.handle(turn.state, { type: "revisit_family", familyId: "impots" });
    turn = await assistant.handle(turn.state, { type: "submit_family_impots", taxeFonciere: 1200 });
    const { registry, result } = pipeline(turn.state);
    assert.equal(registry.charges.filter((row) => row.familyId === "impots").length, 1);
    assert.equal(result.charges.totalDeductible, 1200);
  });

  it("12. doublon strict structured + freeText", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_assurance",
      montant: 600,
      gliMontant: 240,
      freeText: "600 € d'habitation et 240 € de loyers impayés",
    });
    assert.equal(pipeline(turn.state).result.charges.totalDeductible, 840);
  });

  it("13. texte multi-familles soumis dans une famille ouverte : pas de parser global", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await assistant.handle(start.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_assurance",
      freeText: "1200 € de taxe foncière et 600 € d'assurance habitation",
    });
    assert.equal(turn.state.collected.taxeFonciere, undefined);
    const pno = (turn.state.collected.assurancePno ?? 0) +
      (turn.state.collected.familyLines ?? [])
        .filter((line) => line.category === "assurance_pno")
        .reduce((sum, line) => sum + line.montant, 0);
    assert.equal(pno, 600);
    assert.equal(pipeline(turn.state).result.charges.totalDeductible, 600);
    assert.match(
      turn.messages.map((message) => message.content).join("\n"),
      /n'avons rien inscrit automatiquement/,
    );
  });

  it("fonds travaux : exclusion fiscale explicite, pas une perte technique", async () => {
    const { assistant, turn: start } = await toFirstFamily(PROFIL_FULL);
    let turn = await assistant.handle(start.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_syndic",
      montantPaye: 1800,
      epargneTravaux: "oui",
      epargneMontant: 120,
    });
    const { registry, result } = pipeline(turn.state);
    assert.equal(registry.charges.filter((row) => row.familyId === "syndic").length, 2);
    assert.equal(result.charges.totalDeductible, 1800);
    assert.ok(result.charges.lignes.some((ligne) => ligne.montant === 120 && ligne.montantDeductible === 0));
  });
});
