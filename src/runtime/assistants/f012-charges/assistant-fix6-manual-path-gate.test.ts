/**
 * Fix 6 (Blocker #2 — F012 V2, taxe foncière) — gap résiduel signalé par
 * l'implémenteur de Fix 5 (`assistant-fix5-same-path-double-submit.test.ts`,
 * vert et inchangé — ce fichier construit PAR-DESSUS, sans le toucher).
 *
 * Fix 1-5 gataient `receive_taxe_fonciere_expense` et
 * `receive_document_proposals` (chemin document → Expense / chemin
 * historique `ChargeProposal`) entre eux et contre eux-mêmes. Aucun d'eux
 * ne touchait au troisième canal : `submit_taxe_fonciere`, le chemin
 * manuel/legacy par catégorie (`F012ChargesAssistant` → `afterCategoryInput`).
 *
 * Ce chemin vérifiait déjà (Fix 1/Fix 2) `pendingTaxeFonciereReplace` et une
 * `taxeFonciereExpense` déjà active (`isActiveTaxeFonciereExpense`) — mais
 * JAMAIS :
 *
 * - Bug 1 (Fix 6A) — un `pendingTaxeFonciereExpense` A pas encore décidé
 *   (chemin document → Expense). `submit_taxe_fonciere(B)` écrivait alors
 *   directement `collected.taxeFonciere` via `afterCategoryInput`, sans
 *   jamais passer par une décision explicite sur A : A restait "pending"
 *   mais silencieusement contourné par un scalaire concurrent.
 * - Bug 2 (Fix 6B) — un `documentReview` "impots" A pas encore décidé
 *   (chemin historique `ChargeProposal`). Même contournement silencieux.
 *
 * Invariant Fix 6 (complète Fix 1-5, ne les duplique/contredit pas) : pour
 * un bien/exercice donné, une seule transition susceptible d'établir,
 * corriger ou remplacer la Taxe Foncière peut être ouverte ou appliquée à
 * la fois — y compris depuis le chemin manuel/legacy `submit_taxe_fonciere`.
 *
 * Run: npx tsx --test "src/runtime/assistants/f012-charges/assistant-fix6-manual-path-gate.test.ts"
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

const AVIS_B_DIVERGENT = `
Avis de taxe foncière — Année 2024
Net à payer : 1 600,00 EUR
Prélèvement 1 : 150,00
Prélèvement 2 : 150,00
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

// ---------------------------------------------------------------------------
// A/B/C — pendingTaxeFonciereExpense → submit_taxe_fonciere (Fix 6A)
// ---------------------------------------------------------------------------

describe("Fix 6A — A. pendingTaxeFonciereExpense A (non décidé) → submit_taxe_fonciere(B)", () => {
  it("B est gaté ; A intact ; collected/Registry/total inchangés", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const pendingA = await reachPendingExpenseA(assistant, "doc-A");

    const turn = await assistant.handle(pendingA.state, { type: "submit_taxe_fonciere", montant: 1650 });

    assert.deepEqual(turn.state.pendingTaxeFonciereExpense, pendingA.state.pendingTaxeFonciereExpense, "A reste seul pending");
    assert.equal(turn.state.pendingTaxeFonciereReplace, undefined, "B n'ouvre pas non plus de conflit de remplacement");
    assert.equal(turn.state.collected.taxeFonciere, undefined, "B n'a jamais écrit collected.taxeFonciere");
    assert.deepEqual(turn.state.collected, pendingA.state.collected, "collected inchangé");

    const before = chargeTotalFor(pendingA.state);
    const after = chargeTotalFor(turn.state);
    assert.deepEqual(after.registry, before.registry, "Charge Registry inchangé");
    assert.equal(after.result.charges.totalDeductible, before.result.charges.totalDeductible);
    assert.equal(after.result.charges.totalDeductible, 0, "ni A ni B ne sont comptés tant que non décidés");

    const message = turn.messages.at(-1);
    assert.match(message?.content ?? "", /décision.*attente|attente.*décision/i);
  });
});

describe("Fix 6A — B. le gating survit au reload/re-entry", () => {
  it("A pending restauré après reload → submit_taxe_fonciere(B) toujours rejeté", async () => {
    const before = new F012ChargesAssistant(ctx, DEPS);
    const pendingA = await reachPendingExpenseA(before, "doc-A-reload");

    const persisted = toF012PersistedState(pendingA.state, TS);
    const after = new F012ChargesAssistant(ctx, DEPS);
    const resumed = after.resume(persisted);
    assert.ok(resumed.state.pendingTaxeFonciereExpense, "A pending restauré après reload");

    const turn = await after.handle(resumed.state, { type: "submit_taxe_fonciere", montant: 1650 });

    assert.deepEqual(turn.state.pendingTaxeFonciereExpense, resumed.state.pendingTaxeFonciereExpense, "A toujours seul pending après reload");
    assert.equal(turn.state.collected.taxeFonciere, undefined);
    assert.deepEqual(turn.state.collected, resumed.state.collected);
  });
});

describe("Fix 6A / I — C. résolution de A (y compris Blocker #1) puis B : pas de deadlock résiduel", () => {
  it("A confirmé → submit_taxe_fonciere(B) réussit normalement ensuite (route vers le conflit de remplacement explicite)", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachPendingExpenseA(assistant, "doc-A-confirm");
    turn = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_expense" });
    assert.equal(turn.state.pendingTaxeFonciereExpense, undefined, "A n'est plus pending");
    assert.equal(turn.state.collected.taxeFonciereExpense?.documentId, "doc-A-confirm");

    turn = await assistant.handle(turn.state, { type: "submit_taxe_fonciere", montant: 1700 });
    assert.ok(turn.state.pendingTaxeFonciereReplace, "B entre normalement — routé vers le conflit de remplacement (Fix 1/2), jamais bloqué");
    assert.equal(turn.state.pendingTaxeFonciereReplace?.candidate.montant, 1700);
    assert.equal(turn.state.collected.taxeFonciereExpense?.documentId, "doc-A-confirm", "A reste actif tant que le remplacement n'est pas tranché");
  });

  it("A ignoré → submit_taxe_fonciere(B) réussit normalement ensuite (écrit directement collected.taxeFonciere)", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachPendingExpenseA(assistant, "doc-A-ignore");
    turn = await assistant.handle(turn.state, { type: "ignore_taxe_fonciere_expense" });
    assert.equal(turn.state.pendingTaxeFonciereExpense, undefined, "A n'est plus pending (ignorée)");

    turn = await assistant.handle(turn.state, { type: "submit_taxe_fonciere", montant: 1650 });
    assert.equal(turn.state.pendingTaxeFonciereExpense, undefined, "aucun deadlock résiduel");
    assert.equal(turn.state.pendingTaxeFonciereReplace, undefined, "aucune Expense active — écriture directe normale");
    assert.equal(turn.state.collected.taxeFonciere, 1650, "B a bien été appliqué une fois A résolue");
  });

  it("Blocker #1 (I) — conflit interne sur A (montant vs prélèvements) se résout en premier, avant tout gating Fix 6, puis B réussit", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachImpots(assistant);
    const [expenseADivergent] = expensesFromTaxeFonciereCorpus({
      corpus: AVIS_B_DIVERGENT,
      documentId: "doc-A-blocker1",
      fiscalYear: YEAR,
    });
    turn = await assistant.handle(turn.state, { type: "receive_taxe_fonciere_expense", expense: expenseADivergent! });
    assert.ok(turn.state.pendingTaxeFonciereExpense?.montantConflict, "conflit interne Blocker #1 affiché en premier");

    // Tant que Blocker #1 n'est pas tranché, submit_taxe_fonciere(B) reste gaté par Fix 6A (pendingTaxeFonciereExpense toujours présent).
    const stillGated = await assistant.handle(turn.state, { type: "submit_taxe_fonciere", montant: 1800 });
    assert.deepEqual(stillGated.state.pendingTaxeFonciereExpense, turn.state.pendingTaxeFonciereExpense, "Fix 6A gate toujours actif pendant Blocker #1 non résolu");
    assert.equal(stillGated.state.collected.taxeFonciere, undefined);

    // Résolution explicite de Blocker #1 (l'utilisateur choisit 1600).
    turn = await assistant.handle(turn.state, { type: "correct_taxe_fonciere_expense", montant: 1600 });
    assert.equal(turn.state.pendingTaxeFonciereExpense, undefined, "Blocker #1 tranché, A n'est plus pending");
    assert.equal(turn.state.collected.taxeFonciereExpense?.montant, 1600);

    // B réussit maintenant normalement (route vers le conflit de remplacement, A étant désormais actif).
    turn = await assistant.handle(turn.state, { type: "submit_taxe_fonciere", montant: 1900 });
    assert.ok(turn.state.pendingTaxeFonciereReplace, "B réussit normalement une fois Blocker #1 résolu — pas de deadlock résiduel Fix 6");
  });
});

// ---------------------------------------------------------------------------
// D/E/F — documentReview impots → submit_taxe_fonciere (Fix 6B)
// ---------------------------------------------------------------------------

describe("Fix 6B — D. documentReview impots A (non décidé) → submit_taxe_fonciere(B)", () => {
  it("B est gaté ; A reste review active ; aucun changement fiscal", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const openA = await reachOpenDocumentReviewImpots(assistant, "doc-A-legacy");

    const turn = await assistant.handle(openA.state, { type: "submit_taxe_fonciere", montant: 1650 });

    assert.deepEqual(turn.state.documentReview, openA.state.documentReview, "A reste la review active, inchangée");
    assert.equal(turn.state.collected.taxeFonciere, undefined, "B n'a jamais écrit collected.taxeFonciere");
    assert.deepEqual(turn.state.collected, openA.state.collected, "aucun changement fiscal");
    assert.equal(turn.state.pendingTaxeFonciereExpense, undefined);
    assert.equal(turn.state.pendingTaxeFonciereReplace, undefined);

    const before = chargeTotalFor(openA.state);
    const after = chargeTotalFor(turn.state);
    assert.deepEqual(after.registry, before.registry, "Charge Registry inchangé");
    assert.equal(after.result.charges.totalDeductible, before.result.charges.totalDeductible);

    const message = turn.messages.at(-1);
    assert.match(message?.content ?? "", /décision.*attente|attente.*décision/i);
  });
});

describe("Fix 6B — E. le gating survit au reload/re-entry", () => {
  it("documentReview A restauré après reload → submit_taxe_fonciere(B) toujours rejeté", async () => {
    const before = new F012ChargesAssistant(ctx, DEPS);
    const openA = await reachOpenDocumentReviewImpots(before, "doc-A-legacy-reload");

    const persisted = toF012PersistedState(openA.state, TS);
    const after = new F012ChargesAssistant(ctx, DEPS);
    const resumed = after.resume(persisted);
    assert.ok(resumed.state.documentReview, "revue A restaurée après reload");
    assert.equal(resumed.state.documentReview?.familyId, "impots");

    const turn = await after.handle(resumed.state, { type: "submit_taxe_fonciere", montant: 1650 });

    assert.deepEqual(turn.state.documentReview, resumed.state.documentReview, "A toujours seule review active après reload");
    assert.equal(turn.state.collected.taxeFonciere, undefined);
    assert.deepEqual(turn.state.collected, resumed.state.collected);
  });
});

describe("Fix 6B — F. résolution de la review A puis B : pas de deadlock résiduel", () => {
  it("A commité (all_ignored) → submit_taxe_fonciere(B) réussit normalement ensuite", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachOpenDocumentReviewImpots(assistant, "doc-A-toignore");
    for (const proposal of turn.state.documentReview?.proposals ?? []) {
      turn = await assistant.handle(turn.state, {
        type: "ignore_proposal",
        proposalId: proposal.id,
        reason: "not_deductible",
      });
    }
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.documentReview, undefined, "review A résolue (fermée)");

    turn = await assistant.handle(turn.state, { type: "submit_taxe_fonciere", montant: 1650 });
    assert.equal(turn.state.documentReview, undefined, "aucun deadlock résiduel");
    assert.equal(turn.state.collected.taxeFonciere, 1650, "B a bien été appliqué une fois A résolue");
  });
});

// ---------------------------------------------------------------------------
// G/H — non-régression Fix 1-5
// ---------------------------------------------------------------------------

describe("Fix 6 — G. non-régression Fix 5 (Expense/Expense, historique/historique inchangés)", () => {
  it("Fix 5A (Expense pending A → receive_taxe_fonciere_expense(B), même chemin) toujours actif", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const pendingA = await reachPendingExpenseA(assistant, "doc-A-fix5a");
    const [expenseB] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_B_DIVERGENT, documentId: "doc-B-fix5a", fiscalYear: YEAR });
    const turn = await assistant.handle(pendingA.state, { type: "receive_taxe_fonciere_expense", expense: expenseB! });
    assert.equal(turn.state.pendingTaxeFonciereExpense?.documentId, "doc-A-fix5a", "Fix 5A intact : B n'a jamais remplacé A");
  });

  it("Fix 5B (documentReview impots A → receive_document_proposals(B, impots), même chemin) toujours actif", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const openA = await reachOpenDocumentReviewImpots(assistant, "doc-A-fix5b");
    const proposalsB = proposalsFromTaxeFonciereCorpus({ corpus: AVIS_B_DIVERGENT, documentId: "doc-B-fix5b", fiscalYear: YEAR });
    const turn = await assistant.handle(openA.state, {
      type: "receive_document_proposals",
      documentId: "doc-B-fix5b",
      familyId: "impots",
      proposals: proposalsB,
    });
    assert.equal(turn.state.documentReview?.documentId, "doc-A-fix5b", "Fix 5B intact : B n'a jamais remplacé A");
    assert.ok(!turn.state.analyzedDocumentIds?.includes("doc-B-fix5b"));
  });
});

describe("Fix 6 — H. non-régression Fix 1-4 : les gardes préexistantes de submit_taxe_fonciere restent intactes", () => {
  it("Fix 1/2 : pendingTaxeFonciereReplace déjà ouvert → submit_taxe_fonciere(B) toujours gaté (garde préexistante, pas Fix 6)", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachPendingExpenseA(assistant, "doc-A-h1");
    turn = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_expense" });
    turn = await assistant.handle(turn.state, { type: "submit_taxe_fonciere", montant: 1650 });
    assert.ok(turn.state.pendingTaxeFonciereReplace, "précondition : conflit de remplacement déjà ouvert");

    const after = await assistant.handle(turn.state, { type: "submit_taxe_fonciere", montant: 1700 });
    assert.deepEqual(after.state.pendingTaxeFonciereReplace, turn.state.pendingTaxeFonciereReplace, "toujours gaté par la garde Fix 1/2 préexistante, inchangée");
  });

  it("Fix 1/2 : taxeFonciereExpense active → submit_taxe_fonciere(B) route toujours vers le conflit de remplacement (garde préexistante, pas Fix 6)", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachPendingExpenseA(assistant, "doc-A-h2");
    turn = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_expense" });
    assert.equal(turn.state.collected.taxeFonciereExpense?.documentId, "doc-A-h2");

    const after = await assistant.handle(turn.state, { type: "submit_taxe_fonciere", montant: 1700 });
    assert.ok(after.state.pendingTaxeFonciereReplace, "garde préexistante Fix 1/2 toujours active : route vers le conflit de remplacement");
    assert.equal(after.state.collected.taxeFonciereExpense?.documentId, "doc-A-h2", "A reste actif, jamais écrasé");
  });

  it("scope 'impots' uniquement : documentReview 'assurances' ouvert ne bloque jamais submit_taxe_fonciere", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachImpots(assistant);
    turn = await assistant.handle(turn.state, { type: "skip_category" });
    const proposalsAssurance = proposalsFromTaxeFonciereCorpus({ corpus: AVIS_A_1500, documentId: "doc-assurance-h6", fiscalYear: YEAR });
    turn = await assistant.handle(turn.state, {
      type: "receive_document_proposals",
      documentId: "doc-assurance-h6",
      familyId: "assurances",
      proposals: proposalsAssurance,
    });
    assert.equal(turn.state.documentReview?.familyId, "assurances");

    const after = await assistant.handle(turn.state, { type: "submit_taxe_fonciere", montant: 1650 });
    assert.equal(after.state.collected.taxeFonciere, 1650, "revue assurances étrangère ne bloque jamais la taxe foncière manuelle");
  });
});
