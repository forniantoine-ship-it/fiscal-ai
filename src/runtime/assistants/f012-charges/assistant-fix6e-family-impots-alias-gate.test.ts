/**
 * Fix 6E — défense en profondeur, alias `submit_family_impots` (Blocker #2,
 * F012 V2, taxe foncière).
 *
 * Mission de re-audit indépendant : vérifier si `commitFamilyExpenses`
 * (assistant.ts, point d'entrée de `submit_family_impots` — la carte famille,
 * un writer DIFFÉRENT de `afterCategoryInput`/`submit_taxe_fonciere` gaté par
 * Fix 6A/6B, voir `assistant-fix6-manual-path-gate.test.ts`) constitue un
 * alias permettant de contourner ces mêmes gardes.
 *
 * Constat (lecture du code, assistant.ts avant correctif) :
 * `commitFamilyExpenses` ne vérifiait QUE `state.pendingTaxeFonciereReplace`
 * (Fix 1, généralisé aux writers non-document) — jamais
 * `state.pendingTaxeFonciereExpense` (Fix 6A) ni `state.documentReview?.familyId
 * === "impots"` (Fix 6B). `applyFamilyExpenses` → `applyOne` (kind
 * "taxe_fonciere") ne connaît que l'Expense ACTIVE
 * (`isActiveTaxeFonciereExpense(collected.taxeFonciereExpense)`), jamais
 * l'état "pending" porté par `F012State` (pas par `F012CollectedData`) — donc
 * sans garde dédiée, `submit_family_impots(B)` écrivait directement
 * `collected.taxeFonciere = B` pendant qu'un document A restait pending/en
 * revue, exactement le même bypass que Fix 6A/6B ont fermé pour
 * `submit_taxe_fonciere`, mais par un point d'entrée différent — CONFIRMÉ
 * réel par ce fichier (voir tests "AVANT correctif" ci-dessous, qui auraient
 * échoué sans le correctif appliqué à `commitFamilyExpenses`).
 *
 * Correctif appliqué (assistant.ts, `commitFamilyExpenses`) : même pattern de
 * garde que Fix 6A/6B, réutilisant le même message
 * (`taxeFonciereReplacePendingMessage`), MÊME référence `state` en no-op —
 * aucune nouvelle architecture.
 *
 * Run: npx tsx --test "src/runtime/assistants/f012-charges/assistant-fix6e-family-impots-alias-gate.test.ts"
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F012ChargesAssistant } from "./assistant";
import { collectedToChargeRegistry } from "./collected-to-registry";
import { chargeRegistryToComputeInput } from "./registry-to-compute-input";
import { computeChargesExercice } from "../../capabilities/f012/compute-charges-exercice";
import { expensesFromTaxeFonciereCorpus } from "./expense-from-taxe-fonciere";
import { proposalsFromTaxeFonciereCorpus } from "./proposals-from-taxe-fonciere";
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
  return { result: computeChargesExercice(input), registry };
}

async function reachPendingExpenseA(assistant: F012ChargesAssistant, documentId = "doc-A") {
  let turn = await reachImpots(assistant);
  const [expenseA] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_A_1500, documentId, fiscalYear: YEAR });
  turn = await assistant.handle(turn.state, { type: "receive_taxe_fonciere_expense", expense: expenseA! });
  assert.ok(turn.state.pendingTaxeFonciereExpense, "précondition : A pending, pas encore décidé");
  assert.equal(turn.state.collected.taxeFonciereExpense, undefined, "précondition : A pas encore actif");
  return turn;
}

async function reachOpenDocumentReviewImpots(assistant: F012ChargesAssistant, documentId = "doc-A-legacy") {
  let turn = await reachImpots(assistant);
  const proposals = proposalsFromTaxeFonciereCorpus({ corpus: AVIS_A_1500, documentId, fiscalYear: YEAR });
  turn = await assistant.handle(turn.state, {
    type: "receive_document_proposals",
    documentId,
    familyId: "impots",
    proposals,
  });
  assert.ok(turn.state.documentReview, "précondition : documentReview impots ouvert");
  assert.equal(turn.state.documentReview?.familyId, "impots");
  return turn;
}

describe("Fix 6E alias — J1. pendingTaxeFonciereExpense A (non décidé) → submit_family_impots(B)", () => {
  it("B est gaté (même garde que Fix 6A) ; A intact ; collected/Registry/total inchangés", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const pendingA = await reachPendingExpenseA(assistant, "doc-A-alias1");

    const turn = await assistant.handle(pendingA.state, { type: "submit_family_impots", taxeFonciere: 1650 });

    assert.deepEqual(turn.state.pendingTaxeFonciereExpense, pendingA.state.pendingTaxeFonciereExpense, "A reste seul pending");
    assert.equal(turn.state.pendingTaxeFonciereReplace, undefined, "B n'ouvre pas non plus de conflit de remplacement");
    assert.equal(turn.state.collected.taxeFonciere, undefined, "B n'a jamais écrit collected.taxeFonciere (bypass fermé)");
    assert.deepEqual(turn.state.collected, pendingA.state.collected, "collected inchangé");

    const before = chargeTotalFor(pendingA.state);
    const after = chargeTotalFor(turn.state);
    assert.deepEqual(after.registry, before.registry, "Charge Registry inchangé");
    assert.equal(after.result.charges.totalDeductible, before.result.charges.totalDeductible);
    assert.equal(after.result.charges.totalDeductible, 0, "ni A ni B ne sont comptés tant que non décidés");

    const message = turn.messages.at(-1);
    assert.match(message?.content ?? "", /décision.*attente|attente.*décision/i);
  });

  it("le gating survit au reload/re-entry", async () => {
    const before = new F012ChargesAssistant(ctx, DEPS);
    const pendingA = await reachPendingExpenseA(before, "doc-A-alias1-reload");

    const persisted = toF012PersistedState(pendingA.state, TS);
    const after = new F012ChargesAssistant(ctx, DEPS);
    const resumed = after.resume(persisted);
    assert.ok(resumed.state.pendingTaxeFonciereExpense, "A pending restauré après reload");

    const turn = await after.handle(resumed.state, { type: "submit_family_impots", taxeFonciere: 1650 });

    assert.deepEqual(turn.state.pendingTaxeFonciereExpense, resumed.state.pendingTaxeFonciereExpense, "A toujours seul pending après reload");
    assert.equal(turn.state.collected.taxeFonciere, undefined);
    assert.deepEqual(turn.state.collected, resumed.state.collected);
  });

  it("résolution de A (confirmée) puis B via submit_family_impots : pas de deadlock résiduel, gate se libère", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachPendingExpenseA(assistant, "doc-A-alias1-confirm");
    turn = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_expense" });
    assert.equal(turn.state.pendingTaxeFonciereExpense, undefined, "A n'est plus pending");

    turn = await assistant.handle(turn.state, { type: "submit_family_impots", taxeFonciere: 1700 });
    assert.ok(turn.state.pendingTaxeFonciereReplace, "B entre normalement — routé vers le conflit de remplacement (Fix 1/2), jamais bloqué");
    assert.equal(turn.state.pendingTaxeFonciereReplace?.candidate.montant, 1700);
  });

  it("résolution de A (ignorée) puis B via submit_family_impots : écrit normalement le scalaire", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachPendingExpenseA(assistant, "doc-A-alias1-ignore");
    turn = await assistant.handle(turn.state, { type: "ignore_taxe_fonciere_expense" });
    assert.equal(turn.state.pendingTaxeFonciereExpense, undefined);

    turn = await assistant.handle(turn.state, { type: "submit_family_impots", taxeFonciere: 1650 });
    assert.equal(turn.state.pendingTaxeFonciereExpense, undefined, "aucun deadlock résiduel");
    assert.equal(turn.state.collected.taxeFonciere, 1650, "B a bien été appliqué une fois A résolue");
  });
});

describe("Fix 6E alias — J2. documentReview impots A (non décidé) → submit_family_impots(B)", () => {
  it("B est gaté (même garde que Fix 6B) ; A reste review active ; aucun changement fiscal", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const openA = await reachOpenDocumentReviewImpots(assistant, "doc-A-alias2");

    const turn = await assistant.handle(openA.state, { type: "submit_family_impots", taxeFonciere: 1650 });

    assert.deepEqual(turn.state.documentReview, openA.state.documentReview, "A reste la review active, inchangée");
    assert.equal(turn.state.collected.taxeFonciere, undefined, "B n'a jamais écrit collected.taxeFonciere (bypass fermé)");
    assert.deepEqual(turn.state.collected, openA.state.collected, "aucun changement fiscal");

    const before = chargeTotalFor(openA.state);
    const after = chargeTotalFor(turn.state);
    assert.deepEqual(after.registry, before.registry, "Charge Registry inchangé");
    assert.equal(after.result.charges.totalDeductible, before.result.charges.totalDeductible);

    const message = turn.messages.at(-1);
    assert.match(message?.content ?? "", /décision.*attente|attente.*décision/i);
  });

  it("le gating survit au reload/re-entry", async () => {
    const before = new F012ChargesAssistant(ctx, DEPS);
    const openA = await reachOpenDocumentReviewImpots(before, "doc-A-alias2-reload");

    const persisted = toF012PersistedState(openA.state, TS);
    const after = new F012ChargesAssistant(ctx, DEPS);
    const resumed = after.resume(persisted);
    assert.ok(resumed.state.documentReview, "revue A restaurée après reload");

    const turn = await after.handle(resumed.state, { type: "submit_family_impots", taxeFonciere: 1650 });

    assert.deepEqual(turn.state.documentReview, resumed.state.documentReview, "A toujours seule review active après reload");
    assert.equal(turn.state.collected.taxeFonciere, undefined);
  });

  it("résolution de la review A (all_ignored) puis B via submit_family_impots : pas de deadlock résiduel", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachOpenDocumentReviewImpots(assistant, "doc-A-alias2-toignore");
    for (const proposal of turn.state.documentReview?.proposals ?? []) {
      turn = await assistant.handle(turn.state, {
        type: "ignore_proposal",
        proposalId: proposal.id,
        reason: "not_deductible",
      });
    }
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.documentReview, undefined, "review A résolue (fermée)");

    turn = await assistant.handle(turn.state, { type: "submit_family_impots", taxeFonciere: 1650 });
    assert.equal(turn.state.documentReview, undefined, "aucun deadlock résiduel");
    assert.equal(turn.state.collected.taxeFonciere, 1650, "B a bien été appliqué une fois A résolue");
  });
});

describe("Fix 6E alias — non-régression : scope 'impots' uniquement, autres familles inchangées", () => {
  it("documentReview 'assurances' ouvert ne bloque jamais submit_family_impots", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachImpots(assistant);
    turn = await assistant.handle(turn.state, { type: "skip_category" });
    const proposalsAssurance = proposalsFromTaxeFonciereCorpus({ corpus: AVIS_A_1500, documentId: "doc-assurance-alias", fiscalYear: YEAR });
    turn = await assistant.handle(turn.state, {
      type: "receive_document_proposals",
      documentId: "doc-assurance-alias",
      familyId: "assurances",
      proposals: proposalsAssurance,
    });
    assert.equal(turn.state.documentReview?.familyId, "assurances");

    const after = await assistant.handle(turn.state, { type: "submit_family_impots", taxeFonciere: 1650 });
    assert.equal(after.state.collected.taxeFonciere, 1650, "revue assurances étrangère ne bloque jamais la taxe foncière via la carte famille");
  });

  it("sans aucune décision taxe foncière en attente, submit_family_impots écrit le scalaire exactement comme avant", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const start = await reachImpots(assistant);
    const turn = await assistant.handle(start.state, { type: "submit_family_impots", taxeFonciere: 900 });
    assert.equal(turn.state.collected.taxeFonciere, 900);
    assert.equal(turn.state.pendingTaxeFonciereReplace, undefined);
    assert.equal(chargeTotalFor(turn.state).result.charges.totalDeductible, 900);
  });
});
