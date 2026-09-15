/**
 * Blocker #2 (F012 V2 — taxe foncière) — RE-AUDIT INDÉPENDANT, 3 correctifs.
 *
 * Un re-audit indépendant a invalidé la première implémentation de
 * `pendingTaxeFonciereReplace`/`confirm_taxe_fonciere_replace`/
 * `decline_taxe_fonciere_replace` (voir
 * `assistant-blocker2-taxe-fonciere-replace.test.ts`, toujours vert et
 * inchangé — ce fichier construit PAR-DESSUS, ne le remplace pas) en
 * trouvant trois chemins adversariaux non couverts :
 *
 *  FIX 1 — un troisième document (C) arrivant pendant qu'un conflit A→B est
 *  déjà ouvert (`pendingTaxeFonciereReplace`) ne doit JAMAIS être absorbé
 *  silencieusement comme nouveau candidate : `receive_taxe_fonciere_expense`
 *  (et son équivalent en amont côté chemin `ChargeProposal` historique,
 *  `receive_document_proposals`) sont gatés tant que ce conflit n'est pas
 *  tranché. Exclusion UI stricte : `TaxeFonciereReviewForm`
 *  (`pendingTaxeFonciereExpense`) et `TaxeFonciereReplaceForm`
 *  (`pendingTaxeFonciereReplace`) ne peuvent jamais être actionnables
 *  simultanément — prouvé ici par construction (jamais les deux champs de
 *  state truthy en même temps, quelle que soit la séquence d'actions).
 *
 *  FIX 2 — le chemin `ChargeProposal` historique (`receive_document_proposals`
 *  + `commit_document_review`, familyId "impots") ET la saisie manuelle
 *  directe (`submit_taxe_fonciere`, `submit_family_impots`) écrivaient
 *  directement `collected.taxeFonciere` (scalaire) sans jamais consulter
 *  `collected.taxeFonciereExpense` : un scalaire concurrent pouvait être
 *  créé silencieusement pendant qu'une Expense documentaire était déjà la
 *  vérité fiscale active. Les deux chemins routent désormais vers le MÊME
 *  mécanisme `pendingTaxeFonciereReplace` (jamais une seconde architecture
 *  de conflit), avec une `Expense` candidate synthétique
 *  (`buildTaxeFonciereReplaceCandidate`, types.ts — `origin: "legacy_migration"`
 *  / `"manual"`).
 *
 *  FIX 3 — un recommit du MÊME `documentId` était traité comme
 *  automatiquement idempotent quel que soit le montant résultant.
 *  `confirm_taxe_fonciere_expense` route désormais vers le même conflit de
 *  remplacement explicite dès que le montant RÉSULTANT diverge, même
 *  `documentId` identique — jamais un remplacement silencieux juste parce
 *  que "c'est le même document". `correct_taxe_fonciere_expense` (montant
 *  TAPÉ explicitement par l'utilisateur) reste hors de cette garde — cette
 *  saisie EST déjà la transition explicite et traçable requise (non-
 *  régression du parcours "corriger la même dépense confirmée", voir
 *  `assistant-cycle-phase2.test.ts`, test F/G, inchangé et toujours vert).
 *
 * Run: npx tsx --test "src/runtime/assistants/f012-charges/assistant-blocker2-reaudit-fixes.test.ts"
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
import type { ChargeProposal } from "./charge-proposal";
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

const AVIS_C_1700 = `
Avis de taxe foncière — Année 2024
Net à payer : 1 700,00 EUR
Payé le 18/03/2024
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
  assert.equal(turn.state.collected.taxeFonciereExpense?.documentId, "doc-A");
  assert.equal(turn.state.collected.taxeFonciereExpense?.montant, 1500);
  return turn;
}

/** A actif, conflit A→B déjà ouvert (candidate = doc-B, 1600€), non tranché. */
async function reachPendingReplace(assistant: F012ChargesAssistant) {
  let turn = await confirmDocumentA(assistant);
  const [expenseB] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_B_1600, documentId: "doc-B", fiscalYear: YEAR });
  turn = await assistant.handle(turn.state, { type: "receive_taxe_fonciere_expense", expense: expenseB! });
  turn = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_expense" });
  assert.ok(turn.state.pendingTaxeFonciereReplace, "précondition : conflit A→B ouvert");
  return turn;
}

describe("Re-audit Blocker #2 — FIX 1 : troisième document (C) pendant un conflit A→B pending", () => {
  it("C reçu pendant A→B pending est rejeté, pas absorbé comme nouveau candidate", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const beforePending = await reachPendingReplace(assistant);
    const conflictBefore = beforePending.state.pendingTaxeFonciereReplace;

    const [expenseC] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_C_1700, documentId: "doc-C", fiscalYear: YEAR });
    const turn = await assistant.handle(beforePending.state, {
      type: "receive_taxe_fonciere_expense",
      expense: expenseC!,
    });

    // Toujours le conflit A→B, jamais A→C ni B→C.
    assert.deepEqual(turn.state.pendingTaxeFonciereReplace, conflictBefore, "conflit A→B inchangé, C jamais absorbé");
    assert.equal(turn.state.pendingTaxeFonciereExpense, undefined, "C n'entre jamais en pending review");
    assert.equal(turn.state.collected.taxeFonciereExpense?.documentId, "doc-A", "A reste seule vérité active");
    assert.equal(chargeTotalFor(turn.state).charges.totalDeductible, 1500, "jamais 1600, jamais 1700, jamais une somme");

    // Message clair à l'utilisateur.
    const message = turn.messages.at(-1);
    assert.match(message?.content ?? "", /décision.*attente|attente.*décision/i);
  });

  it("tenter de confirmer C explicitement échoue tant que A/B n'est pas tranché", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const beforePending = await reachPendingReplace(assistant);
    const conflictBefore = beforePending.state.pendingTaxeFonciereReplace;

    const [expenseC] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_C_1700, documentId: "doc-C", fiscalYear: YEAR });
    const rejected = await assistant.handle(beforePending.state, {
      type: "receive_taxe_fonciere_expense",
      expense: expenseC!,
    });

    // L'utilisateur tente quand même de confirmer (bouton fantôme / relecture d'un vieux message).
    const confirmed = await assistant.handle(rejected.state, { type: "confirm_taxe_fonciere_expense" });
    assert.deepEqual(confirmed.state.pendingTaxeFonciereReplace, conflictBefore, "toujours le conflit A→B, jamais résolu par C");
    assert.equal(confirmed.state.collected.taxeFonciereExpense?.documentId, "doc-A");
    assert.equal(chargeTotalFor(confirmed.state).charges.totalDeductible, 1500);

    // Idem via correction directe.
    const corrected = await assistant.handle(rejected.state, { type: "correct_taxe_fonciere_expense", montant: 1999 });
    assert.deepEqual(corrected.state.pendingTaxeFonciereReplace, conflictBefore);
    assert.equal(corrected.state.collected.taxeFonciereExpense?.documentId, "doc-A");
  });

  it("A→B pending → reload → C toujours rejeté, aucune résurrection, conflit A/B toujours actionnable", async () => {
    const before = new F012ChargesAssistant(ctx, DEPS);
    const pending = await reachPendingReplace(before);

    const persisted = toF012PersistedState(pending.state, TS);
    const after = new F012ChargesAssistant(ctx, DEPS);
    const resumed = after.resume(persisted);

    assert.ok(resumed.state.pendingTaxeFonciereReplace, "conflit A→B restauré après reload");
    assert.equal(resumed.state.pendingTaxeFonciereReplace?.existing.documentId, "doc-A");
    assert.equal(resumed.state.pendingTaxeFonciereReplace?.candidate.documentId, "doc-B");

    const [expenseC] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_C_1700, documentId: "doc-C", fiscalYear: YEAR });
    const turn = await after.handle(resumed.state, { type: "receive_taxe_fonciere_expense", expense: expenseC! });

    assert.deepEqual(turn.state.pendingTaxeFonciereReplace, resumed.state.pendingTaxeFonciereReplace, "C rejeté après reload aussi");
    assert.equal(turn.state.pendingTaxeFonciereExpense, undefined);
    assert.equal(turn.state.collected.taxeFonciereExpense?.documentId, "doc-A");

    // Le conflit A/B reste actionnable après reload : remplacement atomique fonctionne toujours.
    const replaced = await after.handle(turn.state, { type: "confirm_taxe_fonciere_replace" });
    assert.equal(replaced.state.collected.taxeFonciereExpense?.documentId, "doc-B");
    assert.equal(replaced.state.pendingTaxeFonciereReplace, undefined);
    assert.equal(chargeTotalFor(replaced.state).charges.totalDeductible, 1600);
  });

  it("chemin ChargeProposal historique : un nouveau document 'impots' est aussi gaté pendant A→B pending", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const pending = await reachPendingReplace(assistant);
    const conflictBefore = pending.state.pendingTaxeFonciereReplace;

    const proposals = proposalsFromTaxeFonciereCorpus({ corpus: AVIS_C_1700, documentId: "doc-C-legacy", fiscalYear: YEAR });
    const turn = await assistant.handle(pending.state, {
      type: "receive_document_proposals",
      documentId: "doc-C-legacy",
      familyId: "impots",
      proposals,
    });

    assert.equal(turn.state.documentReview, undefined, "aucune revue ouverte tant que A/B n'est pas tranché");
    assert.deepEqual(turn.state.pendingTaxeFonciereReplace, conflictBefore, "conflit A→B inchangé");
    assert.equal(turn.state.collected.taxeFonciereExpense?.documentId, "doc-A");
  });

  it("EXCLUSION UI — Review (pendingTaxeFonciereExpense) et Replace (pendingTaxeFonciereReplace) ne sont jamais truthy simultanément, par construction", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const pending = await reachPendingReplace(assistant);

    // Invariant d'état, à chaque étape de la séquence adversariale ci-dessus.
    assert.ok(pending.state.pendingTaxeFonciereReplace);
    assert.equal(pending.state.pendingTaxeFonciereExpense, undefined);

    const [expenseC] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_C_1700, documentId: "doc-C", fiscalYear: YEAR });
    const turn = await assistant.handle(pending.state, { type: "receive_taxe_fonciere_expense", expense: expenseC! });
    assert.ok(
      !(turn.state.pendingTaxeFonciereExpense && turn.state.pendingTaxeFonciereReplace),
      "pendingTaxeFonciereExpense et pendingTaxeFonciereReplace ne sont jamais truthy simultanément",
    );

    // Preuve côté panel : les deux conditions de rendu dérivent EXCLUSIVEMENT
    // de ces deux champs de state (jamais d'un troisième flag divergent qui
    // pourrait un jour les découpler), donc l'invariant ci-dessus SUFFIT à
    // garantir l'exclusion UI par construction — pas seulement par convention.
    assert.match(panelSource, /const showTaxeFonciereReview = Boolean\(state\.pendingTaxeFonciereExpense\)/);
    assert.match(panelSource, /const showTaxeFonciereReplace = Boolean\(state\.pendingTaxeFonciereReplace\)/);
  });
});

describe("Re-audit Blocker #2 — FIX 2 : bypass via ChargeProposal historique / saisie manuelle scalaire", () => {
  it("Expense A active + ChargeProposal historique (nouveau document, familyId impots) : gaté, jamais un scalaire concurrent silencieux", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await confirmDocumentA(assistant);

    const proposals: ChargeProposal[] = proposalsFromTaxeFonciereCorpus({
      corpus: AVIS_B_1600,
      documentId: "legacy-doc-B",
      fiscalYear: YEAR,
    });
    turn = await assistant.handle(turn.state, {
      type: "receive_document_proposals",
      documentId: "legacy-doc-B",
      familyId: "impots",
      proposals,
    });
    for (const proposal of turn.state.documentReview?.proposals ?? []) {
      turn = await assistant.handle(turn.state, { type: "confirm_proposal", proposalId: proposal.id });
    }
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });

    // Jamais un scalaire `collected.taxeFonciere` concurrent écrit silencieusement.
    assert.equal(turn.state.collected.taxeFonciere, undefined, "jamais de scalaire concurrent écrit");
    assert.equal(turn.state.collected.taxeFonciereExpense?.documentId, "doc-A", "l'Expense active reste inchangée jusqu'à décision");
    assert.equal(chargeTotalFor(turn.state).charges.totalDeductible, 1500, "jamais 1600, jamais 3100 (pas d'addition ni de bypass)");

    // Routé vers le MÊME mécanisme de décision explicite que Blocker #2.
    assert.ok(turn.state.pendingTaxeFonciereReplace, "conflit de remplacement ouvert (même mécanisme, pas une 2e architecture)");
    assert.equal(turn.state.pendingTaxeFonciereReplace?.existing.montant, 1500);
    assert.equal(turn.state.pendingTaxeFonciereReplace?.candidate.montant, 1600);
    assert.equal(turn.state.pendingTaxeFonciereReplace?.candidate.origin, "legacy_migration");
    assert.equal(turn.state.documentReview, undefined, "revue documentaire fermée — jamais DocumentReviewForm + TaxeFonciereReplaceForm simultanés");
    assert.equal(turn.state.pendingTaxeFonciereExpense, undefined);

    // Décision explicite : remplacer.
    const replaced = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_replace" });
    assert.equal(replaced.state.collected.taxeFonciereExpense?.montant, 1600);
    assert.equal(replaced.state.collected.taxeFonciereExpense?.origin, "legacy_migration");
    assert.equal(chargeTotalFor(replaced.state).charges.totalDeductible, 1600);

    // Décision explicite : conserver — aucun résidu du scalaire.
    const assistant2 = new F012ChargesAssistant(ctx, DEPS);
    let turn2 = await confirmDocumentA(assistant2);
    turn2 = await assistant2.handle(turn2.state, {
      type: "receive_document_proposals",
      documentId: "legacy-doc-B-decline",
      familyId: "impots",
      proposals: proposalsFromTaxeFonciereCorpus({ corpus: AVIS_B_1600, documentId: "legacy-doc-B-decline", fiscalYear: YEAR }),
    });
    for (const proposal of turn2.state.documentReview?.proposals ?? []) {
      turn2 = await assistant2.handle(turn2.state, { type: "confirm_proposal", proposalId: proposal.id });
    }
    turn2 = await assistant2.handle(turn2.state, { type: "commit_document_review" });
    assert.ok(turn2.state.pendingTaxeFonciereReplace);
    const declined = await assistant2.handle(turn2.state, { type: "decline_taxe_fonciere_replace" });
    assert.equal(declined.state.collected.taxeFonciereExpense?.montant, 1500, "ancienne préservée");
    assert.equal(declined.state.collected.taxeFonciereExpense?.documentId, "doc-A");
    assert.equal(declined.state.collected.taxeFonciere, undefined, "jamais un scalaire résiduel du document décliné");
    assert.equal(chargeTotalFor(declined.state).charges.totalDeductible, 1500);
  });

  it("Expense A active + saisie manuelle directe (submit_taxe_fonciere) : gaté, jamais un scalaire concurrent silencieux", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await confirmDocumentA(assistant);

    turn = await assistant.handle(turn.state, { type: "submit_taxe_fonciere", montant: 1650 });

    assert.equal(turn.state.collected.taxeFonciere, undefined, "jamais de scalaire concurrent écrit");
    assert.equal(turn.state.collected.taxeFonciereExpense?.montant, 1500, "l'Expense active reste inchangée jusqu'à décision");
    assert.ok(turn.state.pendingTaxeFonciereReplace, "routé vers le conflit de remplacement explicite");
    assert.equal(turn.state.pendingTaxeFonciereReplace?.candidate.montant, 1650);
    assert.equal(turn.state.pendingTaxeFonciereReplace?.candidate.origin, "manual");
    assert.equal(chargeTotalFor(turn.state).charges.totalDeductible, 1500);

    const replaced = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_replace" });
    assert.equal(replaced.state.collected.taxeFonciereExpense?.montant, 1650);
    assert.equal(replaced.state.collected.taxeFonciereExpense?.origin, "manual");
    assert.equal(chargeTotalFor(replaced.state).charges.totalDeductible, 1650);
  });

  it("Expense A active + saisie manuelle via la carte famille (submit_family_impots) : gaté, jamais un scalaire concurrent silencieux", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await confirmDocumentA(assistant);

    turn = await assistant.handle(turn.state, { type: "submit_family_impots", taxeFonciere: 1800 });

    assert.equal(turn.state.collected.taxeFonciere, undefined, "jamais de scalaire concurrent écrit");
    assert.equal(turn.state.collected.taxeFonciereExpense?.montant, 1500);
    assert.ok(turn.state.pendingTaxeFonciereReplace);
    assert.equal(turn.state.pendingTaxeFonciereReplace?.candidate.montant, 1800);
    assert.equal(chargeTotalFor(turn.state).charges.totalDeductible, 1500);

    const declined = await assistant.handle(turn.state, { type: "decline_taxe_fonciere_replace" });
    assert.equal(declined.state.collected.taxeFonciereExpense?.montant, 1500, "ancienne préservée");
    assert.equal(declined.state.collected.taxeFonciere, undefined, "aucun résidu");
    assert.equal(chargeTotalFor(declined.state).charges.totalDeductible, 1500);
  });

  it("famille 'impots' verrouillée pendant un conflit déjà ouvert : submit_family_impots ne crée jamais un second candidate", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const pending = await reachPendingReplace(assistant);
    const conflictBefore = pending.state.pendingTaxeFonciereReplace;

    const turn = await assistant.handle(pending.state, { type: "submit_family_impots", taxeFonciere: 2000 });

    assert.deepEqual(turn.state.pendingTaxeFonciereReplace, conflictBefore, "toujours le conflit A→B, jamais A→2000");
    assert.equal(turn.state.collected.taxeFonciereExpense?.documentId, "doc-A");
    assert.equal(chargeTotalFor(turn.state).charges.totalDeductible, 1500);
  });

  it("NON-RÉGRESSION — sans Expense active, submit_taxe_fonciere/submit_family_impots écrivent le scalaire exactement comme avant", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const start = await reachImpots(assistant);
    const turn = await assistant.handle(start.state, { type: "submit_taxe_fonciere", montant: 900 });
    assert.equal(turn.state.collected.taxeFonciere, 900);
    assert.equal(turn.state.pendingTaxeFonciereReplace, undefined);
    assert.equal(chargeTotalFor(turn.state).charges.totalDeductible, 900);
  });

  it("NON-RÉGRESSION — sans Expense active, le chemin ChargeProposal historique écrit le scalaire exactement comme avant", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const start = await reachImpots(assistant);
    const proposals = proposalsFromTaxeFonciereCorpus({ corpus: AVIS_A_1500, documentId: "legacy-solo", fiscalYear: YEAR });
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "legacy-solo",
      familyId: "impots",
      proposals,
    });
    for (const proposal of turn.state.documentReview?.proposals ?? []) {
      turn = await assistant.handle(turn.state, { type: "confirm_proposal", proposalId: proposal.id });
    }
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.collected.taxeFonciere, 1500);
    assert.equal(turn.state.pendingTaxeFonciereReplace, undefined);
    assert.equal(chargeTotalFor(turn.state).charges.totalDeductible, 1500);
  });

  it("SENS SYMÉTRIQUE — scalaire manuel déjà actif + première Expense confirmée (document) : gaté, jamais un remplacement silencieux", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const start = await reachImpots(assistant);
    let turn = await assistant.handle(start.state, { type: "submit_taxe_fonciere", montant: 1200 });
    assert.equal(turn.state.collected.taxeFonciere, 1200, "précondition : scalaire manuel actif");
    assert.equal(turn.state.collected.taxeFonciereExpense, undefined);

    const [expenseDoc] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_B_1600, documentId: "doc-first", fiscalYear: YEAR });
    turn = await assistant.handle(turn.state, { type: "receive_taxe_fonciere_expense", expense: expenseDoc! });
    turn = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_expense" });

    // Jamais une bascule silencieuse du scalaire (1200) vers le document (1600).
    assert.equal(turn.state.collected.taxeFonciereExpense, undefined, "l'Expense ne devient jamais active sans décision explicite");
    assert.equal(turn.state.collected.taxeFonciere, 1200, "le scalaire existant reste inchangé tant que non tranché");
    assert.equal(chargeTotalFor(turn.state).charges.totalDeductible, 1200, "jamais 1600, jamais 2800 (pas d'addition)");
    assert.ok(turn.state.pendingTaxeFonciereReplace, "routé vers le même conflit de remplacement explicite");
    assert.equal(turn.state.pendingTaxeFonciereReplace?.existing.montant, 1200);
    assert.equal(turn.state.pendingTaxeFonciereReplace?.existing.origin, "manual");
    assert.equal(turn.state.pendingTaxeFonciereReplace?.candidate.montant, 1600);
    assert.equal(turn.state.pendingTaxeFonciereReplace?.candidate.documentId, "doc-first");

    // Décision explicite : remplacer par le document.
    const replaced = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_replace" });
    assert.equal(replaced.state.collected.taxeFonciereExpense?.montant, 1600);
    assert.equal(chargeTotalFor(replaced.state).charges.totalDeductible, 1600);

    // Décision explicite : conserver le scalaire — le document est jeté, aucun résidu.
    const assistant2 = new F012ChargesAssistant(ctx, DEPS);
    let turn2 = await assistant2.handle((await reachImpots(assistant2)).state, { type: "submit_taxe_fonciere", montant: 1200 });
    const [expenseDoc2] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_B_1600, documentId: "doc-first-2", fiscalYear: YEAR });
    turn2 = await assistant2.handle(turn2.state, { type: "receive_taxe_fonciere_expense", expense: expenseDoc2! });
    turn2 = await assistant2.handle(turn2.state, { type: "confirm_taxe_fonciere_expense" });
    assert.ok(turn2.state.pendingTaxeFonciereReplace);
    const declined = await assistant2.handle(turn2.state, { type: "decline_taxe_fonciere_replace" });
    assert.equal(declined.state.collected.taxeFonciere, 1200, "scalaire préservé");
    assert.equal(declined.state.collected.taxeFonciereExpense, undefined, "aucun résidu du document décliné");
    assert.equal(chargeTotalFor(declined.state).charges.totalDeductible, 1200);
  });

  it("SENS SYMÉTRIQUE — scalaire manuel déjà actif + première Expense CORRIGÉE (montant tapé) : gaté aussi, jamais un remplacement silencieux", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const start = await reachImpots(assistant);
    let turn = await assistant.handle(start.state, { type: "submit_taxe_fonciere", montant: 1200 });

    const [expenseDoc] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_B_1600, documentId: "doc-first-correct", fiscalYear: YEAR });
    turn = await assistant.handle(turn.state, { type: "receive_taxe_fonciere_expense", expense: expenseDoc! });
    turn = await assistant.handle(turn.state, { type: "correct_taxe_fonciere_expense", montant: 1650 });

    assert.equal(turn.state.collected.taxeFonciereExpense, undefined, "jamais une bascule silencieuse, même via correction tapée");
    assert.equal(turn.state.collected.taxeFonciere, 1200, "scalaire existant inchangé");
    assert.ok(turn.state.pendingTaxeFonciereReplace);
    assert.equal(turn.state.pendingTaxeFonciereReplace?.candidate.montant, 1650);
    assert.equal(turn.state.pendingTaxeFonciereReplace?.candidate.decision, "modified");
    assert.equal(chargeTotalFor(turn.state).charges.totalDeductible, 1200);
  });
});

describe("Re-audit Blocker #2 — FIX 3 : même documentId, montant résultant différent", () => {
  it("doc-A 1500 confirmé → doc-A 1999 (même documentId, montant différent) via confirm : jamais un remplacement silencieux", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await confirmDocumentA(assistant);
    const beforeExpense = turn.state.collected.taxeFonciereExpense;

    // Ré-extraction du MÊME document (même documentId "doc-A") produisant un
    // montant résultant différent (1999) — l'utilisateur se contente de
    // confirmer ce qui est affiché, il ne tape rien lui-même.
    const [reExtracted] = expensesFromTaxeFonciereCorpus({
      corpus: `
Avis de taxe foncière — Année 2024
Net à payer : 1 999,00 EUR
Payé le 12/03/2024
`,
      documentId: "doc-A",
      fiscalYear: YEAR,
    });
    turn = await assistant.handle(turn.state, { type: "receive_taxe_fonciere_expense", expense: reExtracted! });
    turn = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_expense" });

    assert.deepEqual(turn.state.collected.taxeFonciereExpense, beforeExpense, "jamais remplacé silencieusement, même documentId");
    assert.equal(chargeTotalFor(turn.state).charges.totalDeductible, 1500, "jamais 1999 tant que non tranché");
    assert.ok(turn.state.pendingTaxeFonciereReplace, "conflit de remplacement ouvert malgré le documentId identique");
    assert.equal(turn.state.pendingTaxeFonciereReplace?.existing.documentId, "doc-A");
    assert.equal(turn.state.pendingTaxeFonciereReplace?.existing.montant, 1500);
    assert.equal(turn.state.pendingTaxeFonciereReplace?.candidate.documentId, "doc-A");
    assert.equal(turn.state.pendingTaxeFonciereReplace?.candidate.montant, 1999);

    // Décision explicite : remplacer.
    const replaced = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_replace" });
    assert.equal(replaced.state.collected.taxeFonciereExpense?.montant, 1999);
    assert.equal(replaced.state.collected.taxeFonciereExpense?.documentId, "doc-A");
    assert.equal(chargeTotalFor(replaced.state).charges.totalDeductible, 1999);

    // Reload — état stable après décision.
    const persisted = toF012PersistedState(replaced.state, TS);
    const resumed = new F012ChargesAssistant(ctx, DEPS).resume(persisted);
    assert.equal(resumed.state.collected.taxeFonciereExpense?.montant, 1999);
    assert.equal(resumed.state.pendingTaxeFonciereReplace, undefined);
  });

  it("doc-A 1500 confirmé → doc-A 1500 (même documentId, même montant) : idempotent, comportement inchangé", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await confirmDocumentA(assistant);

    const [sameAgain] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_A_1500, documentId: "doc-A", fiscalYear: YEAR });
    turn = await assistant.handle(turn.state, { type: "receive_taxe_fonciere_expense", expense: sameAgain! });
    turn = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_expense" });

    assert.equal(turn.state.pendingTaxeFonciereReplace, undefined, "même documentId + même montant → jamais un conflit");
    assert.equal(turn.state.collected.taxeFonciereExpense?.montant, 1500);
    assert.equal(turn.state.collected.taxeFonciereExpense?.documentId, "doc-A");
    assert.equal(chargeTotalFor(turn.state).charges.totalDeductible, 1500, "jamais une duplication (2×1500)");
  });

  it("NON-RÉGRESSION — correction explicite (montant tapé) sur le même documentId déjà actif reste acceptée directement", async () => {
    // Même parcours que `assistant-cycle-phase2.test.ts` (test F/G, inchangé) :
    // l'utilisateur TAPE lui-même le montant corrigé via `correct_taxe_fonciere_expense`
    // — transition déjà explicite et traçable, volontairement hors de la
    // garde Fix 3 (qui cible uniquement `confirm_taxe_fonciere_expense`, le
    // cas où l'utilisateur ne fait que confirmer une ré-extraction sans rien taper).
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await confirmDocumentA(assistant);

    const reopened = { ...turn.state.collected.taxeFonciereExpense!, decision: "pending" as const };
    turn = await assistant.handle(turn.state, { type: "receive_taxe_fonciere_expense", expense: reopened });
    turn = await assistant.handle(turn.state, { type: "correct_taxe_fonciere_expense", montant: 1999 });

    assert.equal(turn.state.pendingTaxeFonciereReplace, undefined, "correction explicite directe, pas de conflit de remplacement");
    assert.equal(turn.state.collected.taxeFonciereExpense?.montant, 1999);
    assert.equal(turn.state.collected.taxeFonciereExpense?.decision, "modified");
    assert.equal(chargeTotalFor(turn.state).charges.totalDeductible, 1999);
  });
});
