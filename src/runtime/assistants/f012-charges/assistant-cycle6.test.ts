import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { aggregateFiscalInputs } from "../../capabilities/f006/aggregate-inputs";
import { computeChargesExercice } from "../../capabilities/f012/compute-charges-exercice";
import { CHARGE_FAMILY_IDS } from "../../capabilities/f012/charge";
import { collectedToChargeRegistry } from "./collected-to-registry";
import { F012ChargesAssistant } from "./assistant";
import {
  FAMILY_CARD_TITLES,
  buildFamilyInventory,
  coverageMark,
  coverageRecapLines,
  familyCardExamples,
  familyCardPhrase,
  familyCardPrompt,
  paperReservedMessage,
} from "./family-ux";
import { resolveSituationalProfilage, situationalProfilageQuestions } from "./situational-profilage";
import { firstIntentViolations } from "./ux-copy";
import type { F012Deps } from "./types";

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

describe("F-012 Cycle 6 — UX des 6 familles", () => {
  it("A — 6 familles construites, titres quotidiens", () => {
    assert.deepEqual([...CHARGE_FAMILY_IDS], ["impots", "syndic", "assurances", "gestion", "travaux", "autres"]);
    assert.equal(FAMILY_CARD_TITLES.impots, "Impôts du logement");
    assert.equal(FAMILY_CARD_TITLES.syndic, "Syndic / immeuble");
    assert.equal(FAMILY_CARD_TITLES.assurances, "Assurance du logement");
    assert.equal(FAMILY_CARD_TITLES.gestion, "Agence / comptable / logiciel");
    assert.equal(FAMILY_CARD_TITLES.travaux, "Réparations et travaux");
    assert.equal(FAMILY_CARD_TITLES.autres, "Autre chose payé pour ce logement");
    assert.equal(buildFamilyInventory(PROFIL_FULL).length, 6);
    assert.deepEqual(buildFamilyInventory(PROFIL_SIMPLE), ["impots", "assurances", "autres"]);
  });

  it("B — questions de profilage réduites (pas vacance, pas 18 cases)", () => {
    const questions = situationalProfilageQuestions({}, YEAR);
    assert.deepEqual(
      questions.map((q) => q.id),
      ["copropriete", "gestion", "travaux"],
    );
    assert.ok(questions.every((q) => !/vacance|PNO|ALUR|CFE/i.test(q.label)));
  });

  it("C — copro F-010 réutilisée : on ne repose pas la question", () => {
    const questions = situationalProfilageQuestions({ copropriete: true }, YEAR);
    assert.equal(questions.some((q) => q.id === "copropriete"), false);
    const profil = resolveSituationalProfilage({ known: { copropriete: true }, gestion: false, travaux: false });
    assert.equal(profil.copropriete, true);
    assert.equal(buildFamilyInventory(profil).includes("syndic"), true);
  });

  it("D — financement F-011 réutilisé (note + overlap, pas une Charge importée)", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS_F011);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    assert.ok(turn.messages.some((m) => m.content.includes("crédit")));
    turn = await assistant.handle(turn.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, {
      type: "submit_family_autres",
      diversDescription: "Assurance emprunteur",
      diversMontant: 300,
    });
    const item = turn.state.collected.divers.find((d) => d.description === "Assurance emprunteur");
    assert.equal(item?.financementOverlap, "assurance_emprunteur");
  });

  it("E — papier réservé hors familles documentaires, sans upload", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "open_family_paper" });
    assert.match(turn.messages.map((m) => m.content).join("\n"), /papier/);
    assert.equal(turn.state.familyPhase, "paper");
    assert.equal(turn.state.familyInventory?.[turn.state.currentFamilyIndex ?? 0], "autres");
    assert.equal(paperReservedMessage().includes("upload"), false);
  });

  it("F — saisie manuelle taxe foncière", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "open_family_manual" });
    turn = await assistant.handle(turn.state, { type: "submit_family_impots", taxeFonciere: 1200 });
    assert.equal(turn.state.collected.taxeFonciere, 1200);
    assert.equal(turn.state.familyInventory?.[turn.state.currentFamilyIndex ?? 0], "assurances");
  });

  it("G — none : rien payé, aucune Charge", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    assert.deepEqual(turn.state.collected.noneFamilies, ["impots"]);
    assert.equal(turn.state.collected.taxeFonciere, undefined);
    const registry = collectedToChargeRegistry({
      collected: turn.state.collected,
      profil: turn.state.profil,
      categoryInventory: turn.state.categoryInventory,
      fieldSources: turn.state.fieldSources,
      exercise: YEAR,
    });
    assert.equal(registry.familyCoverage.find((f) => f.familyId === "impots")?.status, "none");
    assert.equal(registry.charges.length, 0);
  });

  it("H — unknown : je ne sais pas, jamais 0 €", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "unknown_family" });
    assert.equal(turn.state.collected.taxeFonciere, undefined);
    assert.deepEqual(turn.state.collected.unknownFamilies, [{ familyId: "impots", reason: "unsure" }]);
    turn = await assistant.handle(turn.state, { type: "continue_after_unknown" });
    const registry = collectedToChargeRegistry({
      collected: turn.state.collected,
      profil: turn.state.profil,
      categoryInventory: turn.state.categoryInventory,
      fieldSources: turn.state.fieldSources,
      exercise: YEAR,
    });
    assert.equal(registry.familyCoverage.find((f) => f.familyId === "impots")?.status, "unknown");
    assert.equal(registry.charges.length, 0);
  });

  it("I — not_applicable : syndic absent du profil simple", () => {
    const inventory = buildFamilyInventory(PROFIL_SIMPLE);
    assert.equal(inventory.includes("syndic"), false);
    const registry = collectedToChargeRegistry({
      collected: { coproLignes: [], travaux: [], divers: [], skippedCategories: [] },
      profil: PROFIL_SIMPLE,
      categoryInventory: ["taxe_fonciere", "assurance_pno", "frais_bancaires", "divers"],
      fieldSources: {},
      exercise: YEAR,
    });
    assert.equal(registry.familyCoverage.find((f) => f.familyId === "syndic")?.status, "not_applicable");
  });

  it("J — captured après manuel", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "submit_family_impots", taxeFonciere: 800 });
    const registry = collectedToChargeRegistry({
      collected: turn.state.collected,
      profil: turn.state.profil,
      categoryInventory: turn.state.categoryInventory,
      fieldSources: turn.state.fieldSources,
      exercise: YEAR,
    });
    assert.equal(registry.familyCoverage.find((f) => f.familyId === "impots")?.status, "captured");
  });

  it("K — couverture finale exacte", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "submit_family_impots", taxeFonciere: 1200 });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "unknown_family" });
    turn = await assistant.handle(turn.state, { type: "continue_after_unknown" });
    assert.equal(turn.state.step, "completeness");
    assert.match(turn.messages.map((m) => m.content).join("\n"), /Avant de terminer/);
    assert.match(turn.messages.map((m) => m.content).join("\n"), /Avez-vous payé quelque chose en 2024 que nous n'avons pas encore renseigné/);
    const registry = collectedToChargeRegistry({
      collected: turn.state.collected,
      profil: turn.state.profil,
      categoryInventory: turn.state.categoryInventory,
      fieldSources: turn.state.fieldSources,
      exercise: YEAR,
    });
    const recap = coverageRecapLines(registry.familyCoverage);
    assert.match(recap, /Impôts du logement ✓/);
    assert.match(recap, /Assurance du logement —/);
    assert.match(recap, /Autre chose payé pour ce logement \? À compléter/);
    assert.equal(coverageMark("not_applicable"), "— Non concerné");
    assert.equal(coverageMark("none"), "— Rien payé");
    assert.equal(coverageMark("captured"), "✓ Vu");
  });

  it("L — unknown n'écrit jamais 0 €", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "unknown_family", reason: "document_missing" });
    assert.notEqual(turn.state.collected.taxeFonciere, 0);
    assert.equal(turn.state.collected.taxeFonciere, undefined);
  });

  it("M — reprise d'un unknown", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "unknown_family" });
    const { toF012PersistedStateWithRegistry } = await import("./collected-to-registry");
    const persisted = toF012PersistedStateWithRegistry(turn.state, TS, YEAR);
    const resumed = assistant.resume(persisted);
    assert.ok(resumed.messages.some((m) => m.content.includes("manquait une information")));
    assert.equal(resumed.completed, false);
    assert.equal(resumed.state.collected.unknownFamilies?.[0]?.familyId, "impots");
  });

  it("N — unknown → captured par saisie manuelle", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "unknown_family" });
    turn = await assistant.handle(turn.state, { type: "open_family_manual" });
    turn = await assistant.handle(turn.state, { type: "submit_family_impots", taxeFonciere: 950 });
    assert.equal(turn.state.collected.unknownFamilies, undefined);
    assert.equal(turn.state.collected.taxeFonciere, 950);
  });

  it("O — travaux : incertain n'est pas entretien", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, {
      type: "submit_profilage",
      ...PROFIL_SIMPLE,
      travaux: true,
    });
    while (turn.state.familyInventory?.[turn.state.currentFamilyIndex ?? 0] !== "travaux") {
      turn = await assistant.handle(turn.state, { type: "none_family" });
    }
    turn = await assistant.handle(turn.state, { type: "open_family_manual" });
    turn = await assistant.handle(turn.state, {
      type: "submit_travaux_description",
      description: "Travaux incertains",
      montant: 2000,
    });
    turn = await assistant.handle(turn.state, { type: "submit_travaux_qualification", choix: "incertain" });
    assert.equal(turn.state.collected.travaux[0]?.natureIntervention, undefined);
    assert.equal(turn.state.result?.charges.totalDeductible ?? 0, 0);
  });

  it("P — anti-doublon F-011 avant enregistrement", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS_F011);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    const before = turn.state.collected.divers.length;
    const blocked = await assistant.handle(turn.state, {
      type: "submit_family_autres",
      diversDescription: "Remboursement du capital du prêt",
      diversMontant: 1000,
    });
    assert.equal(blocked.state.collected.divers.length, before);
    assert.ok(blocked.messages.some((m) => m.content.includes("AX-009")));
  });

  it("Q — calcul inchangé vs collected direct", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "submit_family_impots", taxeFonciere: 1200 });
    turn = await assistant.handle(turn.state, { type: "submit_family_assurance", montant: 180 });
    turn = await assistant.handle(turn.state, { type: "submit_family_autres", fraisBancaires: 20 });
    turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: false });
    const viaAssistant = turn.state.result!.charges;
    const direct = computeChargesExercice({
      exerciceFiscal: YEAR,
      dateMiseEnService: "2023-01-01",
      taxeFonciere: 1200,
      assurancePno: 180,
      fraisBancaires: 20,
    });
    assert.equal(viaAssistant.totalDeductible, direct.charges.totalDeductible);
    assert.deepEqual(viaAssistant.parCategorie, direct.charges.parCategorie);
  });

  it("R — F-006 contrat inchangé", async () => {
    const { charges } = computeChargesExercice({
      exerciceFiscal: YEAR,
      dateMiseEnService: "2023-01-01",
      taxeFonciere: 1200,
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
    assert.equal(aggregated.data?.chargesExploitation, charges.totalDeductible);
  });

  it("S — refresh / reprise conserve familyInventory", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    const { toF012PersistedStateWithRegistry } = await import("./collected-to-registry");
    const persisted = toF012PersistedStateWithRegistry(turn.state, TS, YEAR);
    const resumed = assistant.resume(persisted);
    assert.deepEqual(resumed.state.familyInventory, ["impots", "assurances", "autres"]);
    assert.equal(resumed.state.familyPhase, "card");
  });

  it("T — GO_BACK depuis une famille", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "none_family" });
    assert.equal(turn.state.familyInventory?.[turn.state.currentFamilyIndex ?? 0], "assurances");
    const back = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(back.state.familyInventory?.[back.state.currentFamilyIndex ?? 0], "impots");
  });

  it("U — aucune Charge dupliquée", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "submit_family_impots", taxeFonciere: 1200 });
    const registry = collectedToChargeRegistry({
      collected: turn.state.collected,
      profil: turn.state.profil,
      categoryInventory: turn.state.categoryInventory,
      fieldSources: turn.state.fieldSources,
      exercise: YEAR,
    });
    const ids = registry.charges.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("premier-intent : pas de PNO / ALUR / CFE en première ligne", () => {
    for (const familyId of CHARGE_FAMILY_IDS) {
      const text = `${FAMILY_CARD_TITLES[familyId]}\n${familyCardPhrase(familyId, YEAR)}\n${familyCardExamples(familyId).join(" ")}\n${familyCardPrompt(familyId, YEAR)}`;
      assert.deepEqual(firstIntentViolations(text, YEAR), []);
      assert.doesNotMatch(text, /\bPNO\b/);
      assert.doesNotMatch(text, /\bALUR\b/);
      assert.doesNotMatch(text, /\bCFE\b/);
    }
  });
});
