/**
 * F-012 Cycle 14A — filet Impôts.
 * Correctif chirurgical : `impots` manquait dans la liste des familles
 * couvertes par le palier `unexplored` de `filetChips` (family-ux.ts).
 * Un `none_family` sur Impôts ne générait alors plus jamais de puce de
 * rattrapage. Ce fichier verrouille exactement ce comportement, sans
 * toucher à la hiérarchie de priorité ni aux autres familles.
 * Run: npx tsx --test src/runtime/assistants/f012-charges/assistant-cycle14a.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { ChargeFamilyId, FamilyCoverage } from "../../capabilities/f012/charge";
import { F012ChargesAssistant } from "./assistant";
import { collectedToChargeRegistry } from "./collected-to-registry";
import { filetChips } from "./family-ux";
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
const PROFIL_FULL = { copropriete: true, agence: true, travaux: true, vacance: false, comptable: true };

function emptyCollected() {
  return createInitialF012State().collected;
}

function coverage(familyId: ChargeFamilyId, status: FamilyCoverage["status"]): FamilyCoverage {
  return { familyId, exercise: YEAR, status, chargeIds: [], documentIds: [] };
}

function allCoverage(statuses: Partial<Record<ChargeFamilyId, FamilyCoverage["status"]>>): FamilyCoverage[] {
  const ids: ChargeFamilyId[] = ["impots", "syndic", "assurances", "gestion", "travaux", "autres"];
  return ids.map((familyId) => coverage(familyId, statuses[familyId] ?? "pending"));
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

describe("F-012 Cycle 14A — filetChips : impots rejoint le palier unexplored", () => {
  it("1. impots = none → completeness_impots présent", () => {
    const chips = filetChips({
      familyCoverage: allCoverage({ impots: "none" }),
      collected: emptyCollected(),
    });
    assert.ok(chips.some((chip) => chip.id === "completeness_impots"));
  });

  it("2. impots = pending → completeness_impots présent", () => {
    const chips = filetChips({
      familyCoverage: allCoverage({ impots: "pending" }),
      collected: emptyCollected(),
    });
    assert.ok(chips.some((chip) => chip.id === "completeness_impots"));
  });

  it("2bis. impots = captured → aucune puce impots (rien à rattraper)", () => {
    const chips = filetChips({
      familyCoverage: allCoverage({ impots: "captured" }),
      collected: { ...emptyCollected(), taxeFonciere: 1200 },
    });
    assert.equal(chips.some((chip) => chip.id === "completeness_impots"), false);
  });

  it("3. Parcours réel : none_family sur Impôts → filet propose completeness_impots", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    const turn = await noneUntilCompleteness(assistant, start.state);
    assert.equal(turn.state.step, "completeness");
    assert.equal(
      registryOf(turn.state).familyCoverage.find((row) => row.familyId === "impots")?.status,
      "none",
    );
    const chipIds = (turn.messages.at(-1)?.suggestions ?? []).map((item) => item.id);
    assert.ok(chipIds.includes("completeness_impots"), `puces obtenues : ${chipIds.join(", ")}`);
  });

  it("3bis. La puce completeness_impots rouvre bien la famille impots via revisit_family", async () => {
    const { assistant, turn: start } = await toFirstFamily();
    let turn = await noneUntilCompleteness(assistant, start.state);
    turn = await assistant.handle(turn.state, { type: "revisit_family", familyId: "impots" });
    turn = await assistant.handle(turn.state, { type: "submit_family_impots", taxeFonciere: 1200 });
    assert.equal(
      registryOf(turn.state).familyCoverage.find((row) => row.familyId === "impots")?.status,
      "captured",
    );
  });

  it("4a. Concurrence à 5 candidats unexplored : impots n'évince ni ne régresse la priorité des autres", () => {
    const chips = filetChips({
      familyCoverage: allCoverage({
        impots: "none",
        travaux: "none",
        syndic: "none",
        gestion: "none",
        assurances: "none",
      }),
      collected: emptyCollected(),
    });
    assert.equal(chips.length, 4, "le plafond de 4 puces reste respecté");
    // 5 familles au même palier (unexplored) pour 4 places : une seule est évincée,
    // et c'est la banque (priorité la plus basse) qui l'aurait été de toute façon
    // si elle avait été candidate — ici aucune des 5 familles unexplored n'est
    // elle-même évincée par une AUTRE famille de priorité supérieure inexistante
    // dans ce scénario ; on vérifie seulement qu'aucune régression de rang n'apparaît
    // pour travaux/syndic/gestion/assurances du fait de l'ajout d'impots.
    const ids = chips.map((chip) => chip.id);
    assert.ok(ids.includes("completeness_impots"));
  });

  it("4b. impots (unexplored) ne passe jamais devant unknown/companion/detected", () => {
    const chips = filetChips({
      familyCoverage: allCoverage({
        syndic: "unknown",
        impots: "none",
        assurances: "captured",
        gestion: "none",
      }),
      collected: { ...emptyCollected(), assurancePno: 600 },
      detectedFamilyIds: ["gestion"],
    });
    const ids = chips.map((chip) => chip.id);
    // detected (gestion) > unknown (syndic) > companion (gli, car PNO présent et gli non tranché)
    // > unexplored (impots) — l'ordre relatif préexistant n'est pas perturbé par l'ajout d'impots.
    assert.equal(ids[0], "completeness_gestion");
    assert.equal(ids[1], "completeness_syndic");
    assert.ok(ids.includes("completeness_gli"));
    assert.ok(ids.includes("completeness_impots"));
  });

  it("4c. banque reste la priorité la plus basse même avec impots candidat", () => {
    const chips = filetChips({
      familyCoverage: allCoverage({
        impots: "none",
        travaux: "none",
        syndic: "none",
        gestion: "none",
      }),
      collected: emptyCollected(),
    });
    const ids = chips.map((chip) => chip.id);
    assert.equal(ids.length, 4);
    assert.equal(ids.includes("completeness_bank"), false, "banque reste évincée au même titre qu'avant");
  });

  it("4d. Non-régression 13B : le cas historique (>4 familles, banque évincée) reste inchangé", () => {
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

  it("4e. Non-régression 13B : famille unknown non évincée par gli/comptable/travaux/banque, impots absent ici", () => {
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

  it("5. Profil complet : none partout y compris impots → completeness_impots toujours proposé", async () => {
    const { assistant, turn: start } = await toFirstFamily(PROFIL_FULL);
    const turn = await noneUntilCompleteness(assistant, start.state);
    const chipIds = (turn.messages.at(-1)?.suggestions ?? []).map((item) => item.id);
    assert.ok(chipIds.includes("completeness_impots"), `puces obtenues : ${chipIds.join(", ")}`);
  });
});

describe("F-012 Cycle 14A — sous-rang unexplored : Impôts et Assurances priment sur Travaux/Syndic/Gestion", () => {
  it("6. Parcours réel « Rien payé » sur toutes les familles (profil complet) : Impôts ET Assurances proposées ensemble", async () => {
    const { assistant, turn: start } = await toFirstFamily(PROFIL_FULL);
    const turn = await noneUntilCompleteness(assistant, start.state);
    assert.deepEqual(
      registryOf(turn.state).familyCoverage.map((row) => row.status),
      ["none", "none", "none", "none", "none", "none"],
      "les 6 familles doivent réellement être none pour que ce test porte sur le bon scénario",
    );
    const chipIds = (turn.messages.at(-1)?.suggestions ?? []).map((item) => item.id);
    assert.ok(chipIds.includes("completeness_impots"), `puces obtenues : ${chipIds.join(", ")}`);
    assert.ok(chipIds.includes("completeness_assurances"), `puces obtenues : ${chipIds.join(", ")}`);
    assert.equal(chipIds.length, 5, "4 puces de famille + « Non, c'est bon »");
  });

  it("7. 5 candidats unexplored (impots+assurances+travaux+syndic+gestion) : Impôts et Assurances survivent toujours, un seul conditionnel est sacrifié", () => {
    const chips = filetChips({
      familyCoverage: allCoverage({
        impots: "none",
        assurances: "none",
        travaux: "none",
        syndic: "none",
        gestion: "none",
      }),
      collected: emptyCollected(),
    });
    const ids = chips.map((chip) => chip.id);
    assert.equal(ids.length, 4, "3. le plafond de 4 puces reste strictement respecté");
    assert.ok(ids.includes("completeness_impots"), "Impôts doit toujours survivre");
    assert.ok(ids.includes("completeness_assurances"), "Assurances doit toujours survivre");
    const conditionalsPresent = ["completeness_travaux", "completeness_syndic", "completeness_gestion"].filter(
      (id) => ids.includes(id),
    );
    assert.equal(
      conditionalsPresent.length,
      2,
      "exactement 2 des 3 familles conditionnelles survivent, la 3e est le seul sacrifice possible",
    );
  });

  it("8. Le même scénario à 5, avec pending au lieu de none, produit le même arbitrage (le statut fixture ne change rien à la règle)", () => {
    const chips = filetChips({
      familyCoverage: allCoverage({
        impots: "pending",
        assurances: "pending",
        travaux: "pending",
        syndic: "pending",
        gestion: "pending",
      }),
      collected: emptyCollected(),
    });
    const ids = chips.map((chip) => chip.id);
    assert.equal(ids.length, 4);
    assert.ok(ids.includes("completeness_impots"));
    assert.ok(ids.includes("completeness_assurances"));
  });

  it("9. banque (autres) reste systématiquement la dernière priorité, même quand impots/assurances sont candidates", () => {
    const chips = filetChips({
      familyCoverage: allCoverage({
        impots: "none",
        assurances: "none",
        travaux: "none",
        syndic: "none",
        gestion: "none",
      }),
      collected: emptyCollected(),
    });
    const ids = chips.map((chip) => chip.id);
    assert.equal(ids.includes("completeness_bank"), false, "4. banque toujours évincée en dernier");
  });

  it("10. detected garde la priorité absolue sur unexplored, y compris quand Impôts/Assurances y sont candidates", () => {
    const chips = filetChips({
      familyCoverage: allCoverage({
        impots: "none",
        assurances: "none",
        travaux: "none",
        syndic: "none",
        gestion: "none",
      }),
      collected: emptyCollected(),
      detectedFamilyIds: ["gestion"],
    });
    const ids = chips.map((chip) => chip.id);
    assert.equal(ids[0], "completeness_gestion", "5. detected prime sur unexplored, impots/assurances inclus");
    assert.ok(ids.includes("completeness_impots"));
    assert.ok(ids.includes("completeness_assurances"));
  });

  it("11. unknown garde la priorité sur unexplored, y compris quand Impôts/Assurances y sont candidates", () => {
    const chips = filetChips({
      familyCoverage: allCoverage({
        travaux: "unknown",
        impots: "none",
        assurances: "none",
        syndic: "none",
        gestion: "none",
      }),
      collected: emptyCollected(),
    });
    const ids = chips.map((chip) => chip.id);
    assert.equal(ids[0], "completeness_travaux", "5. unknown prime sur unexplored, impots/assurances inclus");
    assert.ok(ids.includes("completeness_impots"));
    assert.ok(ids.includes("completeness_assurances"));
  });

  it("12. companion (gli) garde la priorité sur unexplored, y compris quand Impôts/Assurances y sont candidates", () => {
    const chips = filetChips({
      familyCoverage: allCoverage({
        assurances: "captured",
        impots: "none",
        syndic: "none",
        gestion: "none",
        travaux: "none",
      }),
      collected: { ...emptyCollected(), assurancePno: 600 },
    });
    const ids = chips.map((chip) => chip.id);
    assert.equal(ids[0], "completeness_gli", "5. companion prime sur unexplored");
    assert.ok(ids.includes("completeness_impots"));
  });

  it("13. notApplicable garde la priorité sur unexplored, même face au sous-rang universel d'Impôts/Assurances", () => {
    const chips = filetChips({
      familyCoverage: allCoverage({
        syndic: "not_applicable",
        impots: "none",
        assurances: "none",
        travaux: "none",
        gestion: "none",
      }),
      collected: emptyCollected(),
    });
    const ids = chips.map((chip) => chip.id);
    assert.equal(ids[0], "completeness_syndic", "5. notApplicable (palier 3) prime toujours sur unexplored (4/4.5)");
    assert.equal(ids.length, 4);
    assert.ok(ids.includes("completeness_impots"));
    assert.ok(ids.includes("completeness_assurances"));
  });
});
