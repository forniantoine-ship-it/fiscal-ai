/**
 * Fix 4 (Blocker #2 — F012 V2, taxe foncière) — gap distinct découvert par un
 * re-re-audit indépendant, APRÈS validation des Fix 1/2/3
 * (`assistant-blocker2-reaudit-fixes.test.ts`, `assistant-blocker2-taxe-fonciere-replace.test.ts`,
 * tous deux verts et inchangés — ce fichier construit PAR-DESSUS).
 *
 * Le chemin `ChargeProposal` historique (`receive_document_proposals` +
 * `commit_document_review`, familyId "impots") n'était gaté QUE contre
 * `pendingTaxeFonciereReplace` (Fix 1), jamais contre `pendingTaxeFonciereExpense`
 * (une Expense A simplement "pending", pas encore décidée). Un document A
 * reçu via le chemin Expense (pending) n'empêchait donc pas un document B
 * d'entrer via le chemin historique, ouvrant `documentReview` en parallèle de
 * `TaxeFonciereReviewForm` — si B était confirmé en premier,
 * `applyImpotsReview` testait uniquement `isActiveTaxeFonciereExpense` (donc
 * `false` pour un A seulement pending) et B s'écrivait directement dans
 * `collected.taxeFonciere` sans jamais mentionner A.
 *
 * Invariant Fix 4 : une seule décision Taxe Foncière actionnable à la fois,
 * quel que soit le chemin d'entrée (`TaxeFonciereExpense` pending,
 * `ChargeProposal`/`documentReview` historique famille "impots",
 * `pendingTaxeFonciereReplace`).
 *
 * Run: npx tsx --test "src/runtime/assistants/f012-charges/assistant-fix4-cross-path-exclusion.test.ts"
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { F012ChargesAssistant } from "./assistant";
import { collectedToChargeRegistry } from "./collected-to-registry";
import { chargeRegistryToComputeInput } from "./registry-to-compute-input";
import { computeChargesExercice } from "../../capabilities/f012/compute-charges-exercice";
import { expensesFromTaxeFonciereCorpus } from "./expense-from-taxe-fonciere";
import { proposalsFromTaxeFonciereCorpus } from "./proposals-from-taxe-fonciere";
import { toF012PersistedState } from "./types";
import type { F012Deps, F012State } from "./types";

const HERE = dirname(fileURLToPath(import.meta.url));
const panelSource = readFileSync(
  join(HERE, "../../../components/lmnp/assistants/F012ChargesAssistantPanel.tsx"),
  "utf-8",
);

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
  return { result: computeChargesExercice(input), registry };
}

/** A reçu via le chemin Expense, PAS ENCORE décidé (`pendingTaxeFonciereExpense`). */
async function reachPendingExpenseA(assistant: F012ChargesAssistant) {
  let turn = await reachImpots(assistant);
  const [expenseA] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_A_1500, documentId: "doc-A", fiscalYear: YEAR });
  turn = await assistant.handle(turn.state, { type: "receive_taxe_fonciere_expense", expense: expenseA! });
  assert.ok(turn.state.pendingTaxeFonciereExpense, "précondition : A pending, pas encore décidé");
  assert.equal(turn.state.collected.taxeFonciereExpense, undefined, "précondition : A pas encore actif");
  return turn;
}

/** documentReview "impots" ouvert via le chemin ChargeProposal historique (A, non encore commité). */
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
  assert.equal(turn.state.pendingTaxeFonciereExpense, undefined);
  assert.equal(turn.state.pendingTaxeFonciereReplace, undefined);
  return turn;
}

describe("Fix 4 — A. pendingTaxeFonciereExpense A → receive_document_proposals B (impots) gaté", () => {
  it("B est rejeté, A reste seul pending, collected/Registry inchangés, message clair", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const pendingA = await reachPendingExpenseA(assistant);

    const proposalsB = proposalsFromTaxeFonciereCorpus({ corpus: AVIS_B_1600, documentId: "doc-B-legacy", fiscalYear: YEAR });
    const turn = await assistant.handle(pendingA.state, {
      type: "receive_document_proposals",
      documentId: "doc-B-legacy",
      familyId: "impots",
      proposals: proposalsB,
    });

    // A reste seul pending, jamais écrasé ni doublé.
    assert.deepEqual(turn.state.pendingTaxeFonciereExpense, pendingA.state.pendingTaxeFonciereExpense);
    // B n'entre jamais en documentReview.
    assert.equal(turn.state.documentReview, undefined, "B n'ouvre jamais de revue tant que A est pending");
    assert.ok(!turn.state.analyzedDocumentIds?.includes("doc-B-legacy"), "B jamais marqué analysé");
    // collected/Registry inchangés.
    assert.deepEqual(turn.state.collected, pendingA.state.collected);
    const before = chargeTotalFor(pendingA.state);
    const after = chargeTotalFor(turn.state);
    assert.deepEqual(after.registry, before.registry, "Charge Registry inchangé");
    assert.equal(after.result.charges.totalDeductible, before.result.charges.totalDeductible);
    assert.equal(after.result.charges.totalDeductible, 0, "A pending n'est pas encore une Charge, B jamais compté non plus");

    // Message clair à l'utilisateur.
    const message = turn.messages.at(-1);
    assert.match(message?.content ?? "", /décision.*attente|attente.*décision/i);
  });
});

describe("Fix 4 — B. défense en profondeur : commit_document_review/applyImpotsReview direct/rejoué ne bypass jamais l'étape A", () => {
  it("état reconstruit de toutes pièces (documentReview B + pendingTaxeFonciereExpense A simultanés) : commit refuse d'écrire collected.taxeFonciere", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const pendingA = await reachPendingExpenseA(assistant);

    // Simule un contournement de l'étape A (race condition / état rejoué) :
    // un `documentReview` B "impots" existe malgré tout, aux côtés de
    // `pendingTaxeFonciereExpense` A. Impossible d'atteindre cet état par
    // les actions normales depuis ce Fix — construit directement ici pour
    // prouver que l'écriture elle-même refuse, pas seulement l'entrée.
    const proposalsB = proposalsFromTaxeFonciereCorpus({ corpus: AVIS_B_1600, documentId: "doc-B-bypass", fiscalYear: YEAR });
    const bypassedState: F012State = {
      ...pendingA.state,
      familyPhase: "review",
      documentReview: { documentId: "doc-B-bypass", familyId: "impots", proposals: proposalsB, conflicts: [] },
    };

    // Toutes les propositions confirmées (aucun blocage `blocked_conflict`/`hasBlockingPendingDecisions`).
    let turn = { state: bypassedState, messages: [], completed: false } as ReturnType<F012ChargesAssistant["start"]>;
    for (const proposal of turn.state.documentReview?.proposals ?? []) {
      turn = await assistant.handle(turn.state, { type: "confirm_proposal", proposalId: proposal.id });
    }
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });

    // Aucun bypass : rien écrit dans collected.taxeFonciere, A toujours seul pending.
    assert.equal(turn.state.collected.taxeFonciere, undefined, "défense en profondeur : jamais un bypass direct");
    assert.equal(turn.state.collected.taxeFonciereExpense, undefined, "A toujours pending, jamais projeté");
    assert.deepEqual(turn.state.pendingTaxeFonciereExpense, pendingA.state.pendingTaxeFonciereExpense);
    assert.equal(chargeTotalFor(turn.state).result.charges.totalDeductible, 0);

    const message = turn.messages.at(-1);
    assert.match(message?.content ?? "", /décision.*attente|attente.*décision/i);
  });

  it("même défense quand pendingTaxeFonciereReplace (pas seulement pendingTaxeFonciereExpense) coexiste avec un documentReview bypass", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn0 = await reachImpots(assistant);
    const [expenseA] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_A_1500, documentId: "doc-A2", fiscalYear: YEAR });
    turn0 = await assistant.handle(turn0.state, { type: "receive_taxe_fonciere_expense", expense: expenseA! });
    turn0 = await assistant.handle(turn0.state, { type: "confirm_taxe_fonciere_expense" });
    assert.equal(turn0.state.collected.taxeFonciereExpense?.documentId, "doc-A2");

    // Ouvre un conflit de remplacement A→B' (manuel), sans le trancher.
    turn0 = await assistant.handle(turn0.state, { type: "submit_taxe_fonciere", montant: 1650 });
    assert.ok(turn0.state.pendingTaxeFonciereReplace, "précondition : conflit de remplacement ouvert");

    // État bypass : un documentReview C "impots" construit directement,
    // aux côtés du conflit pendingTaxeFonciereReplace toujours ouvert.
    const proposalsC = proposalsFromTaxeFonciereCorpus({ corpus: AVIS_B_1600, documentId: "doc-C-bypass", fiscalYear: YEAR });
    const bypassedState: F012State = {
      ...turn0.state,
      familyPhase: "review",
      documentReview: { documentId: "doc-C-bypass", familyId: "impots", proposals: proposalsC, conflicts: [] },
    };
    let turn = { state: bypassedState, messages: [], completed: false } as ReturnType<F012ChargesAssistant["start"]>;
    for (const proposal of turn.state.documentReview?.proposals ?? []) {
      turn = await assistant.handle(turn.state, { type: "confirm_proposal", proposalId: proposal.id });
    }
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });

    assert.equal(turn.state.collected.taxeFonciereExpense?.documentId, "doc-A2", "A reste seule vérité active, jamais écrasée");
    assert.ok(turn.state.pendingTaxeFonciereReplace, "conflit de remplacement toujours ouvert, jamais résolu par C");
    assert.equal(chargeTotalFor(turn.state).result.charges.totalDeductible, 1500);
  });
});

describe("Fix 4 — C/D/E. sens inverse : documentReview impots ouvert bloque receive_taxe_fonciere_expense, survit au reload, se libère après résolution explicite", () => {
  it("C — documentReview impots ouvert (A) → receive_taxe_fonciere_expense B ne crée ni pending ni replace", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const openReview = await reachOpenDocumentReviewImpots(assistant);

    const [expenseB] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_B_1600, documentId: "doc-B-expense", fiscalYear: YEAR });
    const turn = await assistant.handle(openReview.state, { type: "receive_taxe_fonciere_expense", expense: expenseB! });

    assert.equal(turn.state.pendingTaxeFonciereExpense, undefined, "B ne crée jamais de pending expense");
    assert.equal(turn.state.pendingTaxeFonciereReplace, undefined, "B ne crée jamais de conflit de remplacement");
    assert.deepEqual(turn.state.documentReview, openReview.state.documentReview, "la revue A reste inchangée, seule vérité en cours");
    assert.equal(turn.state.collected.taxeFonciere, undefined);
    assert.equal(turn.state.collected.taxeFonciereExpense, undefined);

    const message = turn.messages.at(-1);
    assert.match(message?.content ?? "", /décision.*attente|attente.*décision/i);
  });

  it("D — le gating survit au reload/re-entry (scénario A : pendingTaxeFonciereExpense)", async () => {
    const before = new F012ChargesAssistant(ctx, DEPS);
    const pendingA = await reachPendingExpenseA(before);

    const persisted = toF012PersistedState(pendingA.state, TS);
    const after = new F012ChargesAssistant(ctx, DEPS);
    const resumed = after.resume(persisted);
    assert.ok(resumed.state.pendingTaxeFonciereExpense, "A pending restauré après reload");

    const proposalsB = proposalsFromTaxeFonciereCorpus({ corpus: AVIS_B_1600, documentId: "doc-B-reload", fiscalYear: YEAR });
    const turn = await after.handle(resumed.state, {
      type: "receive_document_proposals",
      documentId: "doc-B-reload",
      familyId: "impots",
      proposals: proposalsB,
    });
    assert.equal(turn.state.documentReview, undefined, "toujours gaté après reload");
    assert.deepEqual(turn.state.pendingTaxeFonciereExpense, resumed.state.pendingTaxeFonciereExpense);
  });

  it("D — le gating survit au reload/re-entry (scénario C : documentReview impots ouvert)", async () => {
    const before = new F012ChargesAssistant(ctx, DEPS);
    const openReview = await reachOpenDocumentReviewImpots(before, "doc-A-reload");

    const persisted = toF012PersistedState(openReview.state, TS);
    const after = new F012ChargesAssistant(ctx, DEPS);
    const resumed = after.resume(persisted);
    assert.ok(resumed.state.documentReview, "revue A restaurée après reload");
    assert.equal(resumed.state.documentReview?.familyId, "impots");

    const [expenseB] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_B_1600, documentId: "doc-B-reload2", fiscalYear: YEAR });
    const turn = await after.handle(resumed.state, { type: "receive_taxe_fonciere_expense", expense: expenseB! });
    assert.equal(turn.state.pendingTaxeFonciereExpense, undefined, "toujours gaté après reload");
    assert.equal(turn.state.pendingTaxeFonciereReplace, undefined);
  });

  it("E — après résolution explicite de A (confirm), B entre normalement dans le workflow attendu (pas de verrou résiduel)", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachPendingExpenseA(assistant);
    // Résolution explicite de A.
    turn = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_expense" });
    assert.equal(turn.state.pendingTaxeFonciereExpense, undefined, "A n'est plus pending");
    assert.equal(turn.state.collected.taxeFonciereExpense?.documentId, "doc-A");

    // B ne peut toujours pas écraser silencieusement (A désormais ACTIVE —
    // c'est le Fix 2/1 déjà en place, non-régression), mais B entre bien
    // dans le workflow normal attendu : routé vers le conflit de
    // remplacement explicite, jamais rejeté silencieusement comme à l'étape A.
    const proposalsB = proposalsFromTaxeFonciereCorpus({ corpus: AVIS_B_1600, documentId: "doc-B-after-resolve", fiscalYear: YEAR });
    turn = await assistant.handle(turn.state, {
      type: "receive_document_proposals",
      documentId: "doc-B-after-resolve",
      familyId: "impots",
      proposals: proposalsB,
    });
    assert.ok(turn.state.documentReview, "B entre bien en revue — plus aucun verrou résiduel de l'étape A pending");
    assert.equal(turn.state.documentReview?.documentId, "doc-B-after-resolve");
  });

  it("E — après résolution explicite de A (decline_taxe_fonciere_replace, verrou levé), B peut ensuite ouvrir une revue", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachPendingExpenseA(assistant);
    turn = await assistant.handle(turn.state, { type: "ignore_taxe_fonciere_expense" });
    assert.equal(turn.state.pendingTaxeFonciereExpense, undefined, "A n'est plus pending (ignorée)");
    assert.equal(turn.state.collected.taxeFonciereExpense?.decision, "ignored");

    const proposalsB = proposalsFromTaxeFonciereCorpus({ corpus: AVIS_B_1600, documentId: "doc-B-after-ignore", fiscalYear: YEAR });
    turn = await assistant.handle(turn.state, {
      type: "receive_document_proposals",
      documentId: "doc-B-after-ignore",
      familyId: "impots",
      proposals: proposalsB,
    });
    assert.ok(turn.state.documentReview, "aucun verrou permanent résiduel après ignore de A");
  });
});

describe("Fix 4 — F. gating scopé strictement à 'impots' : un documentReview d'une autre famille ne bloque jamais la taxe foncière", () => {
  it("documentReview 'assurances' ouvert → receive_taxe_fonciere_expense n'est jamais gaté", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachImpots(assistant);
    // Avance jusqu'à assurance_pno (comme le test L existant, Phase 2).
    turn = await assistant.handle(turn.state, { type: "skip_category" });
    assert.equal(turn.state.categoryInventory[turn.state.currentCategoryIndex], "assurance_pno");

    const proposalsAssurance = proposalsFromTaxeFonciereCorpus({ corpus: AVIS_A_1500, documentId: "doc-assurance", fiscalYear: YEAR });
    turn = await assistant.handle(turn.state, {
      type: "receive_document_proposals",
      documentId: "doc-assurance",
      familyId: "assurances",
      proposals: proposalsAssurance,
    });
    assert.ok(turn.state.documentReview, "précondition : revue assurances ouverte");
    assert.equal(turn.state.documentReview?.familyId, "assurances");

    const [expenseB] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_B_1600, documentId: "doc-tf-unrelated", fiscalYear: YEAR });
    const after = await assistant.handle(turn.state, { type: "receive_taxe_fonciere_expense", expense: expenseB! });
    assert.ok(after.state.pendingTaxeFonciereExpense, "taxe foncière jamais bloquée par une revue assurances");
    assert.equal(after.state.pendingTaxeFonciereExpense?.documentId, "doc-tf-unrelated");
    assert.deepEqual(after.state.documentReview, turn.state.documentReview, "la revue assurances reste intacte, indépendante");
  });

  it("documentReview 'assurances' ouvert → receive_document_proposals(impots) B n'est jamais gaté par cette revue étrangère", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachImpots(assistant);
    turn = await assistant.handle(turn.state, { type: "skip_category" });

    const proposalsAssurance = proposalsFromTaxeFonciereCorpus({ corpus: AVIS_A_1500, documentId: "doc-assurance-2", fiscalYear: YEAR });
    turn = await assistant.handle(turn.state, {
      type: "receive_document_proposals",
      documentId: "doc-assurance-2",
      familyId: "assurances",
      proposals: proposalsAssurance,
    });
    assert.equal(turn.state.documentReview?.familyId, "assurances");

    // Un document impots doit pouvoir ouvrir sa propre revue normalement —
    // la garde Fix 4 ne teste QUE `state.documentReview?.familyId === "impots"`.
    const proposalsImpots = proposalsFromTaxeFonciereCorpus({ corpus: AVIS_B_1600, documentId: "doc-impots-ok", fiscalYear: YEAR });
    const after = await assistant.handle(turn.state, {
      type: "receive_document_proposals",
      documentId: "doc-impots-ok",
      familyId: "impots",
      proposals: proposalsImpots,
    });
    // NB : `receive_document_proposals` remplace `state.documentReview` par la
    // nouvelle revue reçue (une seule revue active à la fois, comportement
    // historique inchangé) — la revue impots B s'ouvre donc bien, preuve que
    // la garde Fix 4 ne l'a pas bloquée à tort à cause de la revue assurances.
    assert.equal(after.state.documentReview?.familyId, "impots");
    assert.equal(after.state.documentReview?.documentId, "doc-impots-ok");
  });
});

describe("Fix 4 — G. boundary panel : aucune combinaison n'affiche simultanément TaxeFonciereReviewForm/TaxeFonciereReplaceForm et DocumentReviewForm (impots)", () => {
  function panelShowFlags(state: {
    pendingTaxeFonciereExpense?: unknown;
    pendingTaxeFonciereReplace?: unknown;
    documentReview?: { familyId: string };
    familyPhase?: string;
  }) {
    // Réplique EXACTE de la logique du panel (F012ChargesAssistantPanel.tsx) —
    // vérifiée ci-dessous par un match direct sur le code source, pour que ce
    // test reste lié à l'implémentation réelle plutôt qu'à une copie qui
    // pourrait diverger silencieusement.
    const showTaxeFonciereReview = Boolean(state.pendingTaxeFonciereExpense);
    const showTaxeFonciereReplace = Boolean(state.pendingTaxeFonciereReplace);
    const showReview =
      state.familyPhase === "review" &&
      Boolean(state.documentReview) &&
      !(state.documentReview?.familyId === "impots" && (showTaxeFonciereReview || showTaxeFonciereReplace));
    return { showTaxeFonciereReview, showTaxeFonciereReplace, showReview };
  }

  it("le code source du panel correspond exactement à la formule testée ici", () => {
    assert.match(panelSource, /const showTaxeFonciereReview = Boolean\(state\.pendingTaxeFonciereExpense\)/);
    assert.match(panelSource, /const showTaxeFonciereReplace = Boolean\(state\.pendingTaxeFonciereReplace\)/);
    assert.match(
      panelSource,
      /const showReview =\s*\n\s*state\.familyPhase === "review" &&\s*\n\s*Boolean\(state\.documentReview\) &&\s*\n\s*!\(state\.documentReview\?\.familyId === "impots" && \(showTaxeFonciereReview \|\| showTaxeFonciereReplace\)\);/,
    );
  });

  it("état bypass réaliste (A pending + documentReview B impots simultanés) : jamais deux formulaires actionnables ensemble", () => {
    const flags = panelShowFlags({
      pendingTaxeFonciereExpense: { id: "expense-A" },
      documentReview: { familyId: "impots" },
      familyPhase: "review",
    });
    assert.equal(flags.showTaxeFonciereReview, true);
    assert.equal(flags.showReview, false, "DocumentReviewForm cède la place à TaxeFonciereReviewForm");
    assert.ok(
      Number(flags.showTaxeFonciereReview) + Number(flags.showTaxeFonciereReplace) + Number(flags.showReview) <= 1,
      "au plus un formulaire taxe foncière actionnable à la fois",
    );
  });

  it("état bypass réaliste (replace pending + documentReview B impots simultanés) : jamais deux formulaires actionnables ensemble", () => {
    const flags = panelShowFlags({
      pendingTaxeFonciereReplace: { existing: {}, candidate: {} },
      documentReview: { familyId: "impots" },
      familyPhase: "review",
    });
    assert.equal(flags.showTaxeFonciereReplace, true);
    assert.equal(flags.showReview, false, "DocumentReviewForm cède la place à TaxeFonciereReplaceForm");
    assert.ok(Number(flags.showTaxeFonciereReview) + Number(flags.showTaxeFonciereReplace) + Number(flags.showReview) <= 1);
  });

  it("documentReview d'une AUTRE famille (assurances) n'est jamais masqué par ces deux drapeaux — gating bien scopé au panel aussi", () => {
    const flags = panelShowFlags({
      pendingTaxeFonciereExpense: { id: "expense-A" },
      documentReview: { familyId: "assurances" },
      familyPhase: "review",
    });
    assert.equal(flags.showReview, true, "revue assurances reste affichée, indépendante de la taxe foncière");
  });

  it("aucun conflit taxe foncière en attente : documentReview impots s'affiche normalement", () => {
    const flags = panelShowFlags({ documentReview: { familyId: "impots" }, familyPhase: "review" });
    assert.equal(flags.showReview, true);
    assert.equal(flags.showTaxeFonciereReview, false);
    assert.equal(flags.showTaxeFonciereReplace, false);
  });
});
