/**
 * F-012 — Cycle UX-A : année N / langage quotidien / Je ne sais pas.
 * Run: npx tsx --test src/runtime/assistants/f012-charges/assistant-cycle-ux-a.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computeCoproDeductible } from "../../capabilities/f012/compute-copro-deductible";
import { mapChoixToNature } from "../../capabilities/f012/qualify-travail";
import { buildCoproLignesFromAmounts } from "@/lib/lmnp/services/f012/f012-copro-form-state";
import { F012ChargesAssistant } from "./assistant";
import type { F012Deps } from "./types";
import {
  allFirstIntentCopy,
  categoryLabel,
  categoryQuestion,
  coproFieldLabels,
  firstIntentViolations,
  paidInYearAnchor,
  unknownCategoryHelp,
} from "./ux-copy";

const YEAR = 2025;
const ctx = { dossierId: "test", fiscalYear: YEAR, route: "/assistants/charges" };
const DEPS: F012Deps = { dateMiseEnService: "2023-01-01" };
const PROFIL_SIMPLE = { copropriete: false, agence: false, travaux: false, vacance: false, comptable: false };
const PROFIL_COPRO_TRAVAUX = {
  copropriete: true,
  agence: false,
  travaux: true,
  vacance: false,
  comptable: false,
};

function collectTexts(messages: { content: string }[]): string {
  return messages.map((m) => m.content).join("\n");
}

describe("F-012 — Cycle UX-A : année / langage / je ne sais pas", () => {
  it("A — N est explicitement affiché (ancre + questions)", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const start = assistant.start();
    assert.match(start.messages[0]?.content ?? "", new RegExp(String(YEAR)));
    assert.match(start.messages[0]?.content ?? "", /réellement payé/);

    const turn = await assistant.handle(start.state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    const text = collectTexts(turn.messages);
    assert.match(text, new RegExp(String(YEAR)));
    assert.match(text, /En 2025, avez-vous payé une ou plusieurs taxes pour ce logement/);
    assert.match(text, /taxe foncière/);
    assert.equal(paidInYearAnchor(YEAR), `Nous allons regarder uniquement ce que vous avez réellement payé en ${YEAR}.`);
  });

  it("B — jamais de « déclaration N → N-1 »", () => {
    const copy = allFirstIntentCopy(YEAR);
    assert.ok(copy.length > 0);
    for (const text of copy) {
      const violations = firstIntentViolations(text, YEAR);
      assert.deepEqual(violations, [], `copy interdite: ${text}`);
      assert.doesNotMatch(text, /pour votre déclaration/);
      assert.doesNotMatch(text, new RegExp(`${YEAR}\\s*[→\\->]+\\s*${YEAR - 1}`));
    }
  });

  it("C — « je ne sais pas » est distinct de 0 €", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    assert.equal(turn.state.categoryInventory[turn.state.currentCategoryIndex], "taxe_fonciere");

    turn = await assistant.handle(turn.state, { type: "unknown_category" });
    assert.equal(turn.state.step, "category_collect");
    assert.equal(turn.state.categoryInventory[turn.state.currentCategoryIndex], "taxe_fonciere");
    assert.equal(turn.state.collected.taxeFonciere, undefined);
    assert.notEqual(turn.state.collected.taxeFonciere, 0);
    assert.deepEqual(turn.state.collected.skippedCategories, []);
    assert.match(collectTexts(turn.messages), /Je ne sais pas|réellement payé en 2025/);
    assert.ok(turn.messages.some((m) => m.suggestions?.some((s) => s.id === "skip_category" && s.label === "Passer")));
  });

  it("D — Passer est distinct de 0 €", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "skip_category" });
    assert.equal(turn.state.collected.taxeFonciere, undefined);
    assert.notEqual(turn.state.collected.taxeFonciere, 0);
    assert.ok(turn.state.collected.skippedCategories.includes("taxe_fonciere"));
    assert.equal(turn.state.categoryInventory[turn.state.currentCategoryIndex], "assurance_pno");
  });

  it("E — assurance : langage quotidien", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "skip_category" });
    const text = collectTexts(turn.messages);
    assert.match(text, /En 2025, avez-vous payé une assurance pour ce logement/);
    assert.doesNotMatch(text, /\bPNO\b/);
    assert.doesNotMatch(text, /montant annuel/);
    assert.equal(categoryLabel("assurance_pno"), "Assurance du logement");
    assert.equal(categoryQuestion("assurance_pno", YEAR), "En 2025, avez-vous payé une assurance pour ce logement ?");
  });

  it("F — syndic : langage quotidien", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const turn = await assistant.handle(assistant.start().state, {
      type: "submit_profilage",
      ...PROFIL_COPRO_TRAVAUX,
    });
    let state = turn.state;
    while (state.categoryInventory[state.currentCategoryIndex] !== "copropriete") {
      const next = await assistant.handle(state, { type: "skip_category" });
      state = next.state;
    }
    const reentry = await assistant.handle(state, { type: "unknown_category" });
    const text = collectTexts(reentry.messages);
    assert.match(categoryQuestion("copropriete", YEAR), /payé un syndic/);
    assert.doesNotMatch(text, /\bALUR\b/);
    assert.doesNotMatch(text, /\bprovisions?\b/i);
    const labels = coproFieldLabels(YEAR);
    assert.doesNotMatch(labels.courant, /\bprovisions?\b/i);
    assert.doesNotMatch(labels.epargneTravaux, /\bALUR\b/);
    assert.doesNotMatch(labels.grosTravaux, /déductible/i);
  });

  it("G — travaux : langage quotidien", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, {
      type: "submit_profilage",
      ...PROFIL_COPRO_TRAVAUX,
    });
    while (turn.state.categoryInventory[turn.state.currentCategoryIndex] !== "travaux") {
      turn = await assistant.handle(turn.state, { type: "skip_category" });
    }
    const text = collectTexts(turn.messages);
    assert.match(text, /En 2025, avez-vous payé des travaux ou fait réparer/);
    assert.doesNotMatch(text, /pour cet exercice/);
    assert.match(text, /Combien avez-vous réellement payé en 2025/);
  });

  it("H — incertain ne devient plus silencieusement entretien", async () => {
    assert.equal(mapChoixToNature("incertain"), null);

    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, {
      type: "submit_profilage",
      ...PROFIL_COPRO_TRAVAUX,
    });
    while (turn.state.categoryInventory[turn.state.currentCategoryIndex] !== "travaux") {
      turn = await assistant.handle(turn.state, { type: "skip_category" });
    }
    turn = await assistant.handle(turn.state, {
      type: "submit_travaux_description",
      description: "Cas ambigu",
      montant: 600,
    });
    turn = await assistant.handle(turn.state, { type: "submit_travaux_qualification", choix: "incertain" });

    const draft = turn.state.collected.travaux[0];
    assert.ok(draft, "la dépense n'est jamais perdue");
    assert.equal(draft.choix, "incertain");
    assert.equal(draft.natureIntervention, undefined);
    assert.notEqual(draft.natureIntervention, "entretien");
    assert.equal(turn.event, undefined);
    assert.match(collectTexts(turn.messages), /ne la comptons pas comme un simple entretien/);

    turn = await assistant.handle(turn.state, { type: "finish_travaux_category" });
    while (turn.state.step === "category_collect") {
      turn = await assistant.handle(turn.state, { type: "skip_category" });
    }
    turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: false });
    assert.equal(turn.state.result?.charges.totalDeductible ?? 0, 0, "incertain n'est pas compté comme entretien déductible");
  });

  it("I — gros travaux jamais auto-déclarés déductibles", () => {
    const lignes = buildCoproLignesFromAmounts({
      courant: 0,
      regularisation: 0,
      epargneTravaux: 0,
      grosTravaux: 800,
    });
    assert.deepEqual(lignes, [{ type: "appel_gros_travaux", montant: 800 }]);
    assert.equal("grosTravauxDeductible" in lignes[0]!, false);

    const unqualified = computeCoproDeductible({ lignes });
    assert.equal(unqualified.detail.grosTravauxCharge, 0);
    assert.equal(unqualified.grosTravauxImmobilisation, 0);
    assert.equal(unqualified.coproprieteDeductible, 0);

    const explicit = computeCoproDeductible({
      lignes: [{ type: "appel_gros_travaux", montant: 800, grosTravauxDeductible: true }],
    });
    assert.equal(explicit.detail.grosTravauxCharge, 800);
  });

  it("J — non-régression Cycle 1→4E (parcours nominal + skip + GO_BACK)", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "submit_taxe_fonciere", montant: 1200 });
    turn = await assistant.handle(turn.state, { type: "submit_assurance_pno", montant: 300 });
    turn = await assistant.handle(turn.state, { type: "skip_category" });
    turn = await assistant.handle(turn.state, { type: "skip_category" });
    turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: false });
    assert.equal(turn.state.step, "aggregate_review");
    assert.equal(turn.state.result?.charges.totalDeductible, 1500);
    assert.equal(turn.state.result?.chargesCoherentes, true);

    const back = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(back.state.step, "completeness");

    const confirmed = await assistant.handle(turn.state, { type: "confirm_all" });
    assert.equal(confirmed.completed, true);
    assert.equal(confirmed.event, "CHARGES_TERMINE");
  });

  it("C+ — aide « je ne sais pas » : où chercher, payé en N, document, Passer ≠ 0", async () => {
    const help = unknownCategoryHelp("assurance_pno", YEAR);
    assert.match(help, /réellement payé en 2025/);
    assert.match(help, /contrat d'assurance|attestation|prélèvement/);
    assert.match(help, /ajouter plus tard|lire le montant/);
    assert.match(help, /Passer/);
    assert.doesNotMatch(help, /0 € n'est pas/);

    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
    turn = await assistant.handle(turn.state, { type: "skip_category" });
    turn = await assistant.handle(turn.state, { type: "unknown_category" });
    turn = await assistant.handle(turn.state, { type: "skip_category" });
    assert.equal(turn.state.collected.assurancePno, undefined);
    assert.ok(turn.state.collected.skippedCategories.includes("assurance_pno"));
  });
});
