/**
 * Blocker #2 (F012 V2 — taxe foncière, Phase 3) — un second document de
 * taxe foncière (`documentId` différent) confirmé/corrigé alors qu'une
 * `taxeFonciereExpense` `confirmed`/`modified` existe déjà pour cet exercice
 * ne doit JAMAIS écraser silencieusement l'ancienne ni s'y additionner
 * (`collected.taxeFonciereExpense` reste un SCALAIRE, invariant "un seul
 * bien / un seul avis actif par exercice", dossier.ts:9-11). Ce fichier
 * traverse le boundary reducer/assistant : `F012ChargesAssistant.handle()`
 * avec exactement les actions que le panel dispatche
 * (`receive_taxe_fonciere_expense`, `confirm_taxe_fonciere_expense`,
 * `correct_taxe_fonciere_expense`, `ignore_taxe_fonciere_expense`,
 * `confirm_taxe_fonciere_replace`, `decline_taxe_fonciere_replace`).
 *
 * Ne modifie ni ne contourne `resolveTaxeFonciereAnnualAmount`
 * (Blocker #1) : chaque `Expense` d'entrée est déjà résolue par
 * `expensesFromTaxeFonciereCorpus` (proposals-from-taxe-fonciere.ts), une
 * fois par document, exactement comme avant ce correctif.
 *
 * Run: npx tsx --test "src/runtime/assistants/f012-charges/assistant-blocker2-taxe-fonciere-replace.test.ts"
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F012ChargesAssistant } from "./assistant";
import { collectedToChargeRegistry } from "./collected-to-registry";
import { chargeRegistryToComputeInput } from "./registry-to-compute-input";
import { computeChargesExercice } from "../../capabilities/f012/compute-charges-exercice";
import { expensesFromTaxeFonciereCorpus } from "./expense-from-taxe-fonciere";
import { toF012PersistedState } from "./types";
import type { F012Deps, F012State } from "./types";

const YEAR = 2024;
const ctx = { dossierId: "test", fiscalYear: YEAR, route: "/assistants/charges" };
const DEPS: F012Deps = { dateMiseEnService: "2023-01-01" };
const TS = "2024-03-01T10:00:00.000Z";
const PROFIL_SIMPLE = { copropriete: false, agence: false, travaux: false, vacance: false, comptable: false };

const AVIS_A_1500 = `
Avis de taxe foncière — Année 2024
Net à payer : 1 500,00 EUR
Payé le 12/03/2024
`;

const AVIS_B_1600 = `
Avis de taxe foncière — Année 2024
Net à payer : 1 600,00 EUR
Payé le 15/03/2024
`;

async function reachImpots(assistant: F012ChargesAssistant) {
  const turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
  assert.equal(turn.state.categoryInventory[turn.state.currentCategoryIndex], "taxe_fonciere");
  return turn;
}

function chargeTotalFor(state: Pick<F012State, "collected" | "categoryInventory" | "fieldSources">) {
  const registry = collectedToChargeRegistry({
    collected: state.collected,
    categoryInventory: state.categoryInventory,
    fieldSources: state.fieldSources,
    exercise: YEAR,
  });
  const input = chargeRegistryToComputeInput(registry, { dateMiseEnService: "2023-01-01" });
  return computeChargesExercice(input);
}

async function confirmDocumentA(assistant: F012ChargesAssistant) {
  let turn = await reachImpots(assistant);
  const [expenseA] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_A_1500, documentId: "doc-A", fiscalYear: YEAR });
  turn = await assistant.handle(turn.state, { type: "receive_taxe_fonciere_expense", expense: expenseA! });
  turn = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_expense" });
  assert.equal(turn.state.collected.taxeFonciereExpense?.decision, "confirmed");
  assert.equal(turn.state.collected.taxeFonciereExpense?.documentId, "doc-A");
  assert.equal(turn.state.collected.taxeFonciereExpense?.montant, 1500);
  return turn;
}

describe("Blocker #2 — remplacement explicite taxe foncière (documentId différent, avis actif existant)", () => {
  it("CASE 1 — première taxe foncière (aucune active) : comportement inchangé, non-régression", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const turn = await confirmDocumentA(assistant);
    assert.equal(turn.state.pendingTaxeFonciereReplace, undefined, "aucun conflit sur la toute première confirmation");
    assert.equal(chargeTotalFor(turn.state).charges.totalDeductible, 1500);
  });

  it("CASE 2 — recommit du MÊME documentId : idempotent, pas de conflit de remplacement, pas de duplication", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await confirmDocumentA(assistant);

    // Ré-extraction / re-upload du même document (même documentId "doc-A").
    const [expenseAgain] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_A_1500, documentId: "doc-A", fiscalYear: YEAR });
    turn = await assistant.handle(turn.state, { type: "receive_taxe_fonciere_expense", expense: expenseAgain! });
    turn = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_expense" });

    assert.equal(turn.state.pendingTaxeFonciereReplace, undefined, "même documentId → jamais de conflit de remplacement");
    assert.equal(turn.state.collected.taxeFonciereExpense?.decision, "confirmed");
    assert.equal(turn.state.collected.taxeFonciereExpense?.documentId, "doc-A");
    assert.equal(turn.state.collected.taxeFonciereExpense?.montant, 1500);
    assert.equal(chargeTotalFor(turn.state).charges.totalDeductible, 1500, "jamais de duplication (2×1500)");
  });

  it("CASE 3 — nouveau documentId, montant différent, avis actif existant : conflit créé, registry ET collected inchangés jusqu'à résolution", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await confirmDocumentA(assistant);
    const beforeCollected = turn.state.collected.taxeFonciereExpense;

    const [expenseB] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_B_1600, documentId: "doc-B", fiscalYear: YEAR });
    turn = await assistant.handle(turn.state, { type: "receive_taxe_fonciere_expense", expense: expenseB! });
    turn = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_expense" });

    // Ni le Charge Registry, ni collected.taxeFonciereExpense ne bougent.
    assert.deepEqual(turn.state.collected.taxeFonciereExpense, beforeCollected, "collected inchangé tant que non résolu");
    assert.equal(chargeTotalFor(turn.state).charges.totalDeductible, 1500, "registry inchangé — pas 1600, pas 3100 (pas d'addition)");

    // État de conflit explicite créé.
    assert.ok(turn.state.pendingTaxeFonciereReplace, "état de conflit créé");
    assert.equal(turn.state.pendingTaxeFonciereReplace?.existing.documentId, "doc-A");
    assert.equal(turn.state.pendingTaxeFonciereReplace?.existing.montant, 1500);
    assert.equal(turn.state.pendingTaxeFonciereReplace?.candidate.documentId, "doc-B");
    assert.equal(turn.state.pendingTaxeFonciereReplace?.candidate.montant, 1600);
    assert.equal(turn.state.pendingTaxeFonciereExpense, undefined, "plus de pending review classique une fois le conflit ouvert");

    // Le message présente les deux montants et les deux actions.
    const message = turn.messages.at(-1);
    assert.match(message?.content ?? "", /1\s?500/);
    assert.match(message?.content ?? "", /1\s?600/);
    assert.ok(message?.suggestions?.some((s) => s.id === "confirm_taxe_fonciere_replace"));
    assert.ok(message?.suggestions?.some((s) => s.id === "decline_taxe_fonciere_replace"));
  });

  it("CASE 3 (via correct_taxe_fonciere_expense) — même garde côté correction manuelle", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await confirmDocumentA(assistant);

    const [expenseB] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_B_1600, documentId: "doc-B", fiscalYear: YEAR });
    turn = await assistant.handle(turn.state, { type: "receive_taxe_fonciere_expense", expense: expenseB! });
    turn = await assistant.handle(turn.state, { type: "correct_taxe_fonciere_expense", montant: 1700 });

    assert.equal(turn.state.collected.taxeFonciereExpense?.documentId, "doc-A", "toujours l'ancien tant que non résolu");
    assert.ok(turn.state.pendingTaxeFonciereReplace);
    assert.equal(turn.state.pendingTaxeFonciereReplace?.candidate.montant, 1700);
    assert.equal(turn.state.pendingTaxeFonciereReplace?.candidate.decision, "modified");
  });

  it("CASE 3BIS — nouveau documentId, MÊME montant que l'existant : conflit explicite quand même, jamais fusionné silencieusement", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await confirmDocumentA(assistant);

    // Même montant (1500€) mais un document différent — réupload accidentel sous un autre id, ou coïncidence.
    const AVIS_B_MEME_MONTANT = `
Avis de taxe foncière — Année 2024
Net à payer : 1 500,00 EUR
Payé le 20/03/2024
`;
    const [expenseBSame] = expensesFromTaxeFonciereCorpus({
      corpus: AVIS_B_MEME_MONTANT,
      documentId: "doc-B-bis",
      fiscalYear: YEAR,
    });
    turn = await assistant.handle(turn.state, { type: "receive_taxe_fonciere_expense", expense: expenseBSame! });
    turn = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_expense" });

    assert.ok(turn.state.pendingTaxeFonciereReplace, "conflit affiché même si les montants concordent");
    assert.equal(turn.state.pendingTaxeFonciereReplace?.existing.documentId, "doc-A");
    assert.equal(turn.state.pendingTaxeFonciereReplace?.candidate.documentId, "doc-B-bis");
    assert.equal(turn.state.collected.taxeFonciereExpense?.documentId, "doc-A", "collected inchangé");
    assert.equal(chargeTotalFor(turn.state).charges.totalDeductible, 1500, "jamais 3000 (pas de double comptage silencieux)");
  });

  it("CASE 4 — acceptation du remplacement : remplacement atomique, une seule active, registry mis à jour, reload stable", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await confirmDocumentA(assistant);

    const [expenseB] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_B_1600, documentId: "doc-B", fiscalYear: YEAR });
    turn = await assistant.handle(turn.state, { type: "receive_taxe_fonciere_expense", expense: expenseB! });
    turn = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_expense" });
    assert.ok(turn.state.pendingTaxeFonciereReplace);

    turn = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_replace" });

    assert.equal(turn.state.pendingTaxeFonciereReplace, undefined, "conflit résolu");
    assert.equal(turn.state.collected.taxeFonciereExpense?.documentId, "doc-B", "nouvelle dépense retenue");
    assert.equal(turn.state.collected.taxeFonciereExpense?.montant, 1600);
    assert.equal(turn.state.collected.taxeFonciereExpense?.decision, "confirmed");
    assert.equal(chargeTotalFor(turn.state).charges.totalDeductible, 1600, "registry = nouveau montant, jamais 3100 (pas d'addition)");

    // Reload — état stable, la nouvelle Expense (pas l'ancienne).
    const persisted = toF012PersistedState(turn.state, TS);
    const after = new F012ChargesAssistant(ctx, DEPS);
    const resumed = after.resume(persisted);
    assert.equal(resumed.state.collected.taxeFonciereExpense?.documentId, "doc-B");
    assert.equal(resumed.state.collected.taxeFonciereExpense?.montant, 1600);
    assert.equal(resumed.state.pendingTaxeFonciereReplace, undefined);
    assert.equal(chargeTotalFor(resumed.state).charges.totalDeductible, 1600);
  });

  it("CASE 5 — refus du remplacement : l'ancienne taxe foncière reste intégralement inchangée, registry inchangé, reload stable, aucun résidu", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await confirmDocumentA(assistant);
    const beforeExpense = turn.state.collected.taxeFonciereExpense;

    const [expenseB] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_B_1600, documentId: "doc-B", fiscalYear: YEAR });
    turn = await assistant.handle(turn.state, { type: "receive_taxe_fonciere_expense", expense: expenseB! });
    turn = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_expense" });
    assert.ok(turn.state.pendingTaxeFonciereReplace);

    turn = await assistant.handle(turn.state, { type: "decline_taxe_fonciere_replace" });

    assert.equal(turn.state.pendingTaxeFonciereReplace, undefined, "conflit résolu");
    assert.deepEqual(
      turn.state.collected.taxeFonciereExpense,
      beforeExpense,
      "montant, decision, documentId — intégralement inchangés",
    );
    assert.equal(chargeTotalFor(turn.state).charges.totalDeductible, 1500, "registry inchangé");

    // Reload — état stable, l'ancienne Expense (pas de résidu du document B décliné).
    const persisted = toF012PersistedState(turn.state, TS);
    const after = new F012ChargesAssistant(ctx, DEPS);
    const resumed = after.resume(persisted);
    assert.deepEqual(resumed.state.collected.taxeFonciereExpense, beforeExpense);
    assert.equal(resumed.state.pendingTaxeFonciereReplace, undefined, "aucun résidu du document décliné après reload");
    assert.equal(chargeTotalFor(resumed.state).charges.totalDeductible, 1500);
  });

  it("CASE 5bis — IGNORER (plutôt que corriger/confirmer) le nouveau document alors qu'un avis actif existe : aucun résidu, ancienne inchangée", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await confirmDocumentA(assistant);
    const beforeExpense = turn.state.collected.taxeFonciereExpense;

    const [expenseB] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_B_1600, documentId: "doc-B", fiscalYear: YEAR });
    turn = await assistant.handle(turn.state, { type: "receive_taxe_fonciere_expense", expense: expenseB! });
    // Directement "ignorer ce document" sans jamais confirmer/corriger — aucun conflit de remplacement ne doit s'ouvrir,
    // et l'ancienne dépense active (doc-A) ne doit jamais être écrasée par la version "ignored" du nouveau document.
    turn = await assistant.handle(turn.state, { type: "ignore_taxe_fonciere_expense" });

    assert.equal(turn.state.pendingTaxeFonciereReplace, undefined);
    assert.equal(turn.state.pendingTaxeFonciereExpense, undefined);
    assert.deepEqual(turn.state.collected.taxeFonciereExpense, beforeExpense, "ancienne dépense intacte, aucun résidu du document ignoré");
    assert.equal(chargeTotalFor(turn.state).charges.totalDeductible, 1500);
  });

  it("CASE 3ter — si le nouveau document B a lui-même un conflit interne (Blocker #1), ce conflit se résout EN PREMIER, avant toute proposition de remplacement", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await confirmDocumentA(assistant);

    // Document B : montant annuel explicite 1600 vs 2×150 prélèvements (300) — divergence Blocker #1.
    const AVIS_B_DIVERGENT = `
Avis de taxe foncière — Année 2024
Net à payer : 1 600,00 EUR
Prélèvement 1 : 150,00
Prélèvement 2 : 150,00
Payé le 15/03/2024
`;
    const [expenseBDivergent] = expensesFromTaxeFonciereCorpus({
      corpus: AVIS_B_DIVERGENT,
      documentId: "doc-B-divergent",
      fiscalYear: YEAR,
    });
    turn = await assistant.handle(turn.state, { type: "receive_taxe_fonciere_expense", expense: expenseBDivergent! });

    // Blocker #1 d'abord : le conflit interne au document B est montré, jamais le conflit de remplacement.
    assert.ok(turn.state.pendingTaxeFonciereExpense?.montantConflict, "conflit Blocker #1 du document B affiché en premier");
    assert.equal(turn.state.pendingTaxeFonciereReplace, undefined, "pas encore de conflit de remplacement — B n'est pas encore résolu");
    assert.equal(turn.state.collected.taxeFonciereExpense?.documentId, "doc-A", "l'ancienne dépense reste inchangée pendant ce temps");

    // Tenter de confirmer sans résoudre Blocker #1 est bloqué (garde existante, inchangée).
    const blocked = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_expense" });
    assert.ok(blocked.state.pendingTaxeFonciereExpense, "toujours en attente de résolution Blocker #1");
    assert.equal(blocked.state.pendingTaxeFonciereReplace, undefined);

    // Résolution explicite du Blocker #1 (l'utilisateur choisit 1600) → SEULEMENT ENSUITE le conflit de remplacement s'ouvre.
    turn = await assistant.handle(turn.state, { type: "correct_taxe_fonciere_expense", montant: 1600 });
    assert.ok(turn.state.pendingTaxeFonciereReplace, "conflit de remplacement ouvert seulement après résolution de Blocker #1");
    assert.equal(turn.state.pendingTaxeFonciereReplace?.candidate.montant, 1600);
    assert.equal(turn.state.pendingTaxeFonciereReplace?.candidate.decision, "modified", "décision Blocker #1 tranchée (montant corrigé explicitement), jamais reportée tel quel");
    assert.equal(turn.state.collected.taxeFonciereExpense?.documentId, "doc-A", "toujours inchangé jusqu'à la décision de remplacement");
  });

  it("NON-RÉGRESSION Blocker #1 — résolution montant sur un seul document (aucun avis actif existant) fonctionne toujours identiquement", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachImpots(assistant);

    const [expense] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_A_1500, documentId: "doc-solo", fiscalYear: YEAR });
    turn = await assistant.handle(turn.state, { type: "receive_taxe_fonciere_expense", expense: expense! });
    assert.equal(turn.state.pendingTaxeFonciereExpense?.montantExtrait, 1500);

    turn = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_expense" });
    assert.equal(turn.state.pendingTaxeFonciereReplace, undefined, "jamais de conflit de remplacement sur un premier document");
    assert.equal(turn.state.collected.taxeFonciereExpense?.decision, "confirmed");
    assert.equal(turn.state.collected.taxeFonciereExpense?.montant, 1500);
    assert.equal(chargeTotalFor(turn.state).charges.totalDeductible, 1500);
  });
});
