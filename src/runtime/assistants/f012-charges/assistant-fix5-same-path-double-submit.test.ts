/**
 * Fix 5 (Blocker #2 — F012 V2, taxe foncière) — gap symétrique découvert par
 * un re-re-re-audit indépendant, APRÈS validation des Fix 1-4
 * (`assistant-blocker2-reaudit-fixes.test.ts`,
 * `assistant-blocker2-taxe-fonciere-replace.test.ts`,
 * `assistant-fix4-cross-path-exclusion.test.ts`, tous verts et inchangés —
 * ce fichier construit PAR-DESSUS).
 *
 * Fix 1-4 gataient les croisements ENTRE chemins (Expense↔historique). Ils
 * ne gataient JAMAIS le MÊME chemin d'entrée appelé deux fois avant décision :
 *
 * - Bug 1 (Fix 5A) — `receive_taxe_fonciere_expense` ne vérifiait jamais un
 *   `pendingTaxeFonciereExpense` A préexistant : B écrasait silencieusement A
 *   à `pendingTaxeFonciereExpense: action.expense`.
 * - Bug 2 (Fix 5B) — `receive_document_proposals` (familyId "impots") ne
 *   vérifiait jamais un `documentReview` "impots" A préexistant : B écrasait
 *   silencieusement A à `documentReview: { ...draftReview, conflicts }`, et
 *   B était en plus absorbé dans `analyzedDocumentIds` comme si son workflow
 *   avait été correctement consommé (alors qu'il a été gaté, pas traité).
 *
 * Invariant Fix 5 : pour un bien/exercice donné, une transition Taxe
 * Foncière DÉJÀ OUVERTE (`pendingTaxeFonciereExpense`,
 * `pendingTaxeFonciereReplace`, OU `documentReview` famille "impots") doit
 * être résolue explicitement avant qu'une nouvelle transition ne puisse la
 * remplacer/concurrencer/écraser — y compris via LE MÊME chemin d'entrée.
 *
 * Run: npx tsx --test "src/runtime/assistants/f012-charges/assistant-fix5-same-path-double-submit.test.ts"
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

const AVIS_B_1600 = `
Avis de taxe foncière — Année 2024
Net à payer : 1 600,00 EUR
Payé le 15/03/2024
`;

// Document C : autre documentId, MÊME montant que A (1500) — cas G du plan.
const AVIS_C_SAME_AMOUNT_AS_A = `
Avis de taxe foncière — Année 2024
Net à payer : 1 500,00 EUR
Payé le 20/03/2024
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
// A/B/C — Expense → Expense (Fix 5A)
// ---------------------------------------------------------------------------

describe("Fix 5A — A. Expense pending (A) → receive_taxe_fonciere_expense(B), même chemin", () => {
  it("B ne remplace pas A ; collected/Registry/total inchangés ; message clair", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const pendingA = await reachPendingExpenseA(assistant, "doc-A");

    const [expenseB] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_B_1600, documentId: "doc-B", fiscalYear: YEAR });
    const turn = await assistant.handle(pendingA.state, { type: "receive_taxe_fonciere_expense", expense: expenseB! });

    assert.deepEqual(turn.state.pendingTaxeFonciereExpense, pendingA.state.pendingTaxeFonciereExpense, "A reste seul pending");
    assert.equal(turn.state.pendingTaxeFonciereExpense?.documentId, "doc-A", "B n'a jamais remplacé A");
    assert.equal(turn.state.pendingTaxeFonciereReplace, undefined, "B n'ouvre pas non plus de conflit de remplacement");
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

describe("Fix 5A — B. le gating same-path survit au reload/re-entry", () => {
  it("A pending restauré après reload → B toujours rejeté", async () => {
    const before = new F012ChargesAssistant(ctx, DEPS);
    const pendingA = await reachPendingExpenseA(before, "doc-A-reload");

    const persisted = toF012PersistedState(pendingA.state, TS);
    const after = new F012ChargesAssistant(ctx, DEPS);
    const resumed = after.resume(persisted);
    assert.ok(resumed.state.pendingTaxeFonciereExpense, "A pending restauré après reload");

    const [expenseB] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_B_1600, documentId: "doc-B-reload", fiscalYear: YEAR });
    const turn = await after.handle(resumed.state, { type: "receive_taxe_fonciere_expense", expense: expenseB! });

    assert.equal(turn.state.pendingTaxeFonciereExpense?.documentId, "doc-A-reload", "A toujours seul pending après reload");
    assert.deepEqual(turn.state.collected, resumed.state.collected);
  });
});

describe("Fix 5A — C. résolution de A puis B : pas de deadlock résiduel", () => {
  it("A confirmé → B entre normalement (routé vers le conflit de remplacement explicite, pas rejeté)", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachPendingExpenseA(assistant, "doc-A-confirm");
    turn = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_expense" });
    assert.equal(turn.state.pendingTaxeFonciereExpense, undefined, "A n'est plus pending");
    assert.equal(turn.state.collected.taxeFonciereExpense?.documentId, "doc-A-confirm");

    const [expenseB] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_B_1600, documentId: "doc-B-after-confirm", fiscalYear: YEAR });
    turn = await assistant.handle(turn.state, { type: "receive_taxe_fonciere_expense", expense: expenseB! });
    assert.ok(turn.state.pendingTaxeFonciereExpense, "B entre normalement comme nouveau pending — plus aucun verrou de A");
    assert.equal(turn.state.pendingTaxeFonciereExpense?.documentId, "doc-B-after-confirm");
  });

  it("A ignoré → B entre normalement comme nouveau pending", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachPendingExpenseA(assistant, "doc-A-ignore");
    turn = await assistant.handle(turn.state, { type: "ignore_taxe_fonciere_expense" });
    assert.equal(turn.state.pendingTaxeFonciereExpense, undefined, "A n'est plus pending (ignorée)");

    const [expenseB] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_B_1600, documentId: "doc-B-after-ignore", fiscalYear: YEAR });
    turn = await assistant.handle(turn.state, { type: "receive_taxe_fonciere_expense", expense: expenseB! });
    assert.ok(turn.state.pendingTaxeFonciereExpense, "B entre normalement, aucun deadlock résiduel");
    assert.equal(turn.state.pendingTaxeFonciereExpense?.documentId, "doc-B-after-ignore");
  });

  it("A corrigé → B entre normalement (routé vers conflit de remplacement, pas de deadlock)", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachPendingExpenseA(assistant, "doc-A-correct");
    turn = await assistant.handle(turn.state, { type: "correct_taxe_fonciere_expense", montant: 1700 });
    assert.equal(turn.state.pendingTaxeFonciereExpense, undefined, "A n'est plus pending (corrigée puis appliquée)");
    assert.equal(turn.state.collected.taxeFonciereExpense?.montant, 1700);

    const [expenseB] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_B_1600, documentId: "doc-B-after-correct", fiscalYear: YEAR });
    turn = await assistant.handle(turn.state, { type: "receive_taxe_fonciere_expense", expense: expenseB! });
    assert.ok(turn.state.pendingTaxeFonciereExpense, "B entre normalement, aucun deadlock résiduel");
  });
});

// ---------------------------------------------------------------------------
// D/E/F — historique → historique (Fix 5B)
// ---------------------------------------------------------------------------

describe("Fix 5B — D. documentReview impots ouvert (A) → receive_document_proposals(B, impots), même chemin", () => {
  it("B ne remplace pas A ; aucun changement fiscal ; B n'entre PAS dans analyzedDocumentIds comme traité", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const openA = await reachOpenDocumentReviewImpots(assistant, "doc-A-legacy");
    assert.ok(openA.state.analyzedDocumentIds?.includes("doc-A-legacy"), "A, lui, est bien marqué analysé (traité normalement)");

    const proposalsB = proposalsFromTaxeFonciereCorpus({ corpus: AVIS_B_1600, documentId: "doc-B-legacy", fiscalYear: YEAR });
    const turn = await assistant.handle(openA.state, {
      type: "receive_document_proposals",
      documentId: "doc-B-legacy",
      familyId: "impots",
      proposals: proposalsB,
    });

    assert.deepEqual(turn.state.documentReview, openA.state.documentReview, "A reste la review active, inchangée");
    assert.equal(turn.state.documentReview?.documentId, "doc-A-legacy", "B n'a jamais remplacé A");
    assert.ok(
      !turn.state.analyzedDocumentIds?.includes("doc-B-legacy"),
      "B a été gaté, pas traité — ne doit JAMAIS figurer dans analyzedDocumentIds",
    );
    assert.deepEqual(turn.state.analyzedDocumentIds, openA.state.analyzedDocumentIds, "aucun ajout parasite à analyzedDocumentIds");
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

describe("Fix 5B — E. le gating same-path survit au reload/re-entry", () => {
  it("documentReview A restauré après reload → B toujours rejeté, jamais marqué analysé", async () => {
    const before = new F012ChargesAssistant(ctx, DEPS);
    const openA = await reachOpenDocumentReviewImpots(before, "doc-A-legacy-reload");

    const persisted = toF012PersistedState(openA.state, TS);
    const after = new F012ChargesAssistant(ctx, DEPS);
    const resumed = after.resume(persisted);
    assert.ok(resumed.state.documentReview, "revue A restaurée après reload");
    assert.equal(resumed.state.documentReview?.familyId, "impots");

    const proposalsB = proposalsFromTaxeFonciereCorpus({ corpus: AVIS_B_1600, documentId: "doc-B-legacy-reload", fiscalYear: YEAR });
    const turn = await after.handle(resumed.state, {
      type: "receive_document_proposals",
      documentId: "doc-B-legacy-reload",
      familyId: "impots",
      proposals: proposalsB,
    });

    assert.equal(turn.state.documentReview?.documentId, "doc-A-legacy-reload", "A toujours seule review active après reload");
    assert.ok(!turn.state.analyzedDocumentIds?.includes("doc-B-legacy-reload"), "B toujours pas marqué analysé après reload");
  });
});

describe("Fix 5B — F. résolution de la review A puis B : pas de deadlock résiduel", () => {
  it("A commité (all_ignored) → B ouvre ensuite normalement sa propre review", async () => {
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

    const proposalsB = proposalsFromTaxeFonciereCorpus({ corpus: AVIS_B_1600, documentId: "doc-B-after-resolve", fiscalYear: YEAR });
    turn = await assistant.handle(turn.state, {
      type: "receive_document_proposals",
      documentId: "doc-B-after-resolve",
      familyId: "impots",
      proposals: proposalsB,
    });
    assert.ok(turn.state.documentReview, "B entre normalement — plus aucun verrou résiduel de A");
    assert.equal(turn.state.documentReview?.documentId, "doc-B-after-resolve");
  });
});

// ---------------------------------------------------------------------------
// G — identité document/montant (overwrite silencieux, toutes combinaisons)
// ---------------------------------------------------------------------------

describe("Fix 5 — G. identité document/montant : aucune combinaison ne permet un overwrite silencieux d'une transition ouverte", () => {
  it("Expense : même documentId, même montant (recommit) — toujours gaté, A inchangé", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const pendingA = await reachPendingExpenseA(assistant, "doc-A");
    const [sameExpense] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_A_1500, documentId: "doc-A", fiscalYear: YEAR });
    const turn = await assistant.handle(pendingA.state, { type: "receive_taxe_fonciere_expense", expense: sameExpense! });
    assert.deepEqual(turn.state.pendingTaxeFonciereExpense, pendingA.state.pendingTaxeFonciereExpense);
  });

  it("Expense : même documentId, montant différent — toujours gaté, A inchangé", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const pendingA = await reachPendingExpenseA(assistant, "doc-A");
    const [reExtracted] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_B_1600, documentId: "doc-A", fiscalYear: YEAR });
    const turn = await assistant.handle(pendingA.state, { type: "receive_taxe_fonciere_expense", expense: reExtracted! });
    assert.deepEqual(turn.state.pendingTaxeFonciereExpense, pendingA.state.pendingTaxeFonciereExpense);
  });

  it("Expense : autre documentId, même montant que A — toujours gaté, A inchangé", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const pendingA = await reachPendingExpenseA(assistant, "doc-A");
    const [sameAmountOtherDoc] = expensesFromTaxeFonciereCorpus({
      corpus: AVIS_C_SAME_AMOUNT_AS_A,
      documentId: "doc-C",
      fiscalYear: YEAR,
    });
    const turn = await assistant.handle(pendingA.state, { type: "receive_taxe_fonciere_expense", expense: sameAmountOtherDoc! });
    assert.deepEqual(turn.state.pendingTaxeFonciereExpense, pendingA.state.pendingTaxeFonciereExpense);
  });

  it("Expense : autre documentId, montant différent — toujours gaté, A inchangé", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const pendingA = await reachPendingExpenseA(assistant, "doc-A");
    const [expenseB] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_B_1600, documentId: "doc-B", fiscalYear: YEAR });
    const turn = await assistant.handle(pendingA.state, { type: "receive_taxe_fonciere_expense", expense: expenseB! });
    assert.deepEqual(turn.state.pendingTaxeFonciereExpense, pendingA.state.pendingTaxeFonciereExpense);
  });

  it("historique : même documentId envoyé une seconde fois — gaté par documentReview ouvert (pas seulement isDocumentAlreadyAnalyzed)", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const openA = await reachOpenDocumentReviewImpots(assistant, "doc-A-legacy");
    const sameProposals = proposalsFromTaxeFonciereCorpus({ corpus: AVIS_A_1500, documentId: "doc-A-legacy", fiscalYear: YEAR });
    const turn = await assistant.handle(openA.state, {
      type: "receive_document_proposals",
      documentId: "doc-A-legacy",
      familyId: "impots",
      proposals: sameProposals,
    });
    assert.deepEqual(turn.state.documentReview, openA.state.documentReview, "review A inchangée (référence identique)");
  });

  it("historique : autre documentId, même montant que A — toujours gaté, A inchangée, B pas marqué analysé", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const openA = await reachOpenDocumentReviewImpots(assistant, "doc-A-legacy");
    const proposalsC = proposalsFromTaxeFonciereCorpus({ corpus: AVIS_C_SAME_AMOUNT_AS_A, documentId: "doc-C-legacy", fiscalYear: YEAR });
    const turn = await assistant.handle(openA.state, {
      type: "receive_document_proposals",
      documentId: "doc-C-legacy",
      familyId: "impots",
      proposals: proposalsC,
    });
    assert.deepEqual(turn.state.documentReview, openA.state.documentReview);
    assert.ok(!turn.state.analyzedDocumentIds?.includes("doc-C-legacy"));
  });
});

// ---------------------------------------------------------------------------
// H — non-régression Fix 1-4 (entrelacements déjà acquis)
// ---------------------------------------------------------------------------

describe("Fix 5 — H. non-régression : les gates Fix 1-4 restent intacts", () => {
  it("Fix 1 : pendingTaxeFonciereReplace ouvert → receive_document_proposals(impots) toujours gaté", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachImpots(assistant);
    const [expenseA] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_A_1500, documentId: "doc-A-h1", fiscalYear: YEAR });
    turn = await assistant.handle(turn.state, { type: "receive_taxe_fonciere_expense", expense: expenseA! });
    turn = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_expense" });
    turn = await assistant.handle(turn.state, { type: "submit_taxe_fonciere", montant: 1650 });
    assert.ok(turn.state.pendingTaxeFonciereReplace, "précondition : conflit de remplacement ouvert");

    const proposalsC = proposalsFromTaxeFonciereCorpus({ corpus: AVIS_B_1600, documentId: "doc-C-h1", fiscalYear: YEAR });
    const after = await assistant.handle(turn.state, {
      type: "receive_document_proposals",
      documentId: "doc-C-h1",
      familyId: "impots",
      proposals: proposalsC,
    });
    assert.equal(after.state.documentReview, undefined, "toujours gaté (Fix 1, non-régression)");
    assert.deepEqual(after.state.pendingTaxeFonciereReplace, turn.state.pendingTaxeFonciereReplace);
  });

  it("Fix 4 : Expense pending → historique gaté, et historique ouvert → Expense gaté (sens croisés, non-régression)", async () => {
    const assistant1 = new F012ChargesAssistant(ctx, DEPS);
    const pendingA = await reachPendingExpenseA(assistant1, "doc-A-h4a");
    const proposalsB = proposalsFromTaxeFonciereCorpus({ corpus: AVIS_B_1600, documentId: "doc-B-h4a", fiscalYear: YEAR });
    const turn1 = await assistant1.handle(pendingA.state, {
      type: "receive_document_proposals",
      documentId: "doc-B-h4a",
      familyId: "impots",
      proposals: proposalsB,
    });
    assert.equal(turn1.state.documentReview, undefined, "Fix 4 croisé toujours actif");

    const assistant2 = new F012ChargesAssistant(ctx, DEPS);
    const openA = await reachOpenDocumentReviewImpots(assistant2, "doc-A-h4b");
    const [expenseB] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_B_1600, documentId: "doc-B-h4b", fiscalYear: YEAR });
    const turn2 = await assistant2.handle(openA.state, { type: "receive_taxe_fonciere_expense", expense: expenseB! });
    assert.equal(turn2.state.pendingTaxeFonciereExpense, undefined, "Fix 4 croisé (sens inverse) toujours actif");
  });

  it("scope 'impots' uniquement : documentReview 'assurances' ouvert ne bloque ni Fix 5A ni Fix 5B", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachImpots(assistant);
    turn = await assistant.handle(turn.state, { type: "skip_category" });
    const proposalsAssurance = proposalsFromTaxeFonciereCorpus({ corpus: AVIS_A_1500, documentId: "doc-assurance-h", fiscalYear: YEAR });
    turn = await assistant.handle(turn.state, {
      type: "receive_document_proposals",
      documentId: "doc-assurance-h",
      familyId: "assurances",
      proposals: proposalsAssurance,
    });
    assert.equal(turn.state.documentReview?.familyId, "assurances");

    const [expenseB] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_B_1600, documentId: "doc-tf-h", fiscalYear: YEAR });
    const after = await assistant.handle(turn.state, { type: "receive_taxe_fonciere_expense", expense: expenseB! });
    assert.ok(after.state.pendingTaxeFonciereExpense, "revue assurances étrangère ne bloque jamais la taxe foncière");
  });

  it("Blocker #1 : Expense active existante → nouveau document B (via même chemin) route toujours vers le conflit de remplacement, jamais un second pending silencieux", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachPendingExpenseA(assistant, "doc-A-b1");
    turn = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_expense" });
    assert.equal(turn.state.collected.taxeFonciereExpense?.documentId, "doc-A-b1");

    const [expenseB] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_B_1600, documentId: "doc-B-b1", fiscalYear: YEAR });
    const after = await assistant.handle(turn.state, { type: "receive_taxe_fonciere_expense", expense: expenseB! });
    assert.ok(after.state.pendingTaxeFonciereExpense, "B pending normalement — A active, pas de gate Fix 5A ici (A n'est plus pending)");
    // Confirmer B route vers le conflit de remplacement explicite (Blocker #2), jamais un overwrite silencieux de A active.
    const confirmed = await assistant.handle(after.state, { type: "confirm_taxe_fonciere_expense" });
    assert.ok(confirmed.state.pendingTaxeFonciereReplace, "Blocker #2 toujours actif : conflit explicite, pas d'overwrite silencieux");
    assert.equal(confirmed.state.collected.taxeFonciereExpense?.documentId, "doc-A-b1", "A reste active tant que le conflit n'est pas tranché");
  });
});
