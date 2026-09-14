/**
 * F012 V2 document-first — Phase 2, premier vertical slice.
 * Famille "impots" (taxe foncière) migrée : document → Expense →
 * confirmation/correction/rejet → projection Charge/ChargeRegistry.
 * Les autres familles documentaires (assurances/gestion/syndic) restent sur
 * le chemin `ChargeProposal` historique, inchangé (test L).
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
import type { F012Deps } from "./types";

const YEAR = 2024;
const ctx = { dossierId: "test", fiscalYear: YEAR, route: "/assistants/charges" };
const DEPS: F012Deps = { dateMiseEnService: "2023-01-01" };
const TS = "2024-03-01T10:00:00.000Z";
const PROFIL_SIMPLE = { copropriete: false, agence: false, travaux: false, vacance: false, comptable: false };

const AVIS_1100 = `
Avis de taxe foncière — Année 2024
Net à payer : 1 100,00 EUR
Payé le 12/03/2024
`;

async function reachImpots(assistant: F012ChargesAssistant) {
  const turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
  assert.equal(turn.state.categoryInventory[turn.state.currentCategoryIndex], "taxe_fonciere");
  return turn;
}

function chargeTotalFor(state: { collected: any; categoryInventory: any; fieldSources: any }) {
  const registry = collectedToChargeRegistry({
    collected: state.collected,
    categoryInventory: state.categoryInventory,
    fieldSources: state.fieldSources,
    exercise: YEAR,
  });
  const input = chargeRegistryToComputeInput(registry, { dateMiseEnService: "2023-01-01" });
  return computeChargesExercice(input);
}

describe("F012 V2 Phase 2 — document → Expense → Charge (famille impots)", () => {
  it("A/B — extraction correcte + confirmation → Expense confirmed → projection Charge", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachImpots(assistant);

    const [expense] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_1100, documentId: "doc-real-1", fiscalYear: YEAR });
    turn = await assistant.handle(turn.state, { type: "receive_taxe_fonciere_expense", expense: expense! });
    assert.equal(turn.state.pendingTaxeFonciereExpense?.id, expense!.id);

    turn = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_expense" });
    assert.equal(turn.state.pendingTaxeFonciereExpense, undefined, "plus rien en attente une fois confirmée");
    assert.equal(turn.state.collected.taxeFonciereExpense?.decision, "confirmed");
    assert.equal(turn.state.collected.taxeFonciereExpense?.montant, 1100);

    const result = chargeTotalFor(turn.state);
    assert.equal(result.charges.totalDeductible, 1100);
    assert.equal(result.anomalies.length, 0);
  });

  it("C — montant extrait incorrect → correction utilisateur → montantExtrait conservé, montant corrigé projeté", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachImpots(assistant);

    const [expense] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_1100, documentId: "doc-real-2", fiscalYear: YEAR });
    turn = await assistant.handle(turn.state, { type: "receive_taxe_fonciere_expense", expense: expense! });
    turn = await assistant.handle(turn.state, { type: "correct_taxe_fonciere_expense", montant: 1350 });

    const stored = turn.state.collected.taxeFonciereExpense!;
    assert.equal(stored.decision, "modified");
    assert.equal(stored.montantExtrait, 1100, "la valeur extraite d'origine n'est jamais effacée");
    assert.equal(stored.montant, 1350, "la valeur corrigée devient la valeur courante");
    assert.equal(stored.fieldSources.montant, "user_correction");

    const result = chargeTotalFor(turn.state);
    assert.equal(result.charges.totalDeductible, 1350, "la projection utilise le montant corrigé, jamais l'extraction brute");
  });

  it("D — l'utilisateur ignore/rejette le document → aucune Charge produite", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachImpots(assistant);

    const [expense] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_1100, documentId: "doc-real-3", fiscalYear: YEAR });
    turn = await assistant.handle(turn.state, { type: "receive_taxe_fonciere_expense", expense: expense! });
    turn = await assistant.handle(turn.state, { type: "ignore_taxe_fonciere_expense" });

    assert.equal(turn.state.collected.taxeFonciereExpense?.decision, "ignored");
    const result = chargeTotalFor(turn.state);
    assert.equal(result.charges.totalDeductible, 0, "une dépense ignorée ne devient jamais une Charge");
  });

  it("ambiguïté (§D KS) — aucun montant lisible : confirmer est refusé, jamais une qualification silencieuse à 0", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachImpots(assistant);

    const [expense] = expensesFromTaxeFonciereCorpus({
      corpus: "Avis de taxe foncière — Année 2024\nCommune : Lyon\n",
      documentId: "doc-no-amount",
      fiscalYear: YEAR,
    });
    turn = await assistant.handle(turn.state, { type: "receive_taxe_fonciere_expense", expense: expense! });

    const blocked = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_expense" });
    assert.ok(blocked.state.pendingTaxeFonciereExpense, "la confirmation sans montant est refusée, rien n'est validé");
    assert.equal(blocked.state.collected.taxeFonciereExpense, undefined);

    // Seule une correction explicite débloque.
    const corrected = await assistant.handle(blocked.state, { type: "correct_taxe_fonciere_expense", montant: 900 });
    assert.equal(corrected.state.collected.taxeFonciereExpense?.montant, 900);
    assert.equal(corrected.state.collected.taxeFonciereExpense?.decision, "modified");
  });

  it("E — documentId réel conservé jusqu'à Charge.documentIds", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachImpots(assistant);
    const [expense] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_1100, documentId: "real-supabase-doc-id-99", fiscalYear: YEAR });
    turn = await assistant.handle(turn.state, { type: "receive_taxe_fonciere_expense", expense: expense! });
    turn = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_expense" });

    const registry = collectedToChargeRegistry({
      collected: turn.state.collected,
      categoryInventory: turn.state.categoryInventory,
      fieldSources: turn.state.fieldSources,
      exercise: YEAR,
    });
    const charge = registry.charges.find((c) => c.category === "taxe_fonciere");
    assert.deepEqual(charge?.documentIds, ["real-supabase-doc-id-99"]);
  });

  it("F/G — reload : Expense retrouvée à l'identique, projection identique ; puis modifiée → reload → nouvelle projection correcte", async () => {
    const before = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachImpots(before);
    const [expense] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_1100, documentId: "doc-reload-1", fiscalYear: YEAR });
    turn = await before.handle(turn.state, { type: "receive_taxe_fonciere_expense", expense: expense! });
    turn = await before.handle(turn.state, { type: "confirm_taxe_fonciere_expense" });

    const persisted = toF012PersistedState(turn.state, TS);
    const after = new F012ChargesAssistant(ctx, DEPS);
    const resumed = after.resume(persisted);

    assert.deepEqual(resumed.state.collected.taxeFonciereExpense, turn.state.collected.taxeFonciereExpense);
    const resultBefore = chargeTotalFor(turn.state);
    const resultAfter = chargeTotalFor(resumed.state);
    assert.equal(resultAfter.charges.totalDeductible, resultBefore.charges.totalDeductible);
    assert.equal(
      resumed.state.collected.taxeFonciereExpense?.documentId,
      turn.state.collected.taxeFonciereExpense?.documentId,
    );

    // Modifie l'Expense confirmée (nouvelle correction) puis reload à nouveau.
    const corrected = await after.handle(resumed.state, {
      type: "receive_taxe_fonciere_expense",
      expense: { ...turn.state.collected.taxeFonciereExpense!, decision: "pending" as const },
    });
    const reCorrected = await after.handle(corrected.state, { type: "correct_taxe_fonciere_expense", montant: 1999 });
    const persistedAgain = toF012PersistedState(reCorrected.state, TS);
    const resumedAgain = new F012ChargesAssistant(ctx, DEPS).resume(persistedAgain);
    assert.equal(resumedAgain.state.collected.taxeFonciereExpense?.montant, 1999);
    assert.equal(chargeTotalFor(resumedAgain.state).charges.totalDeductible, 1999);
  });

  it("I/J — aucune double projection : une seule Charge 'taxe_fonciere', jamais Expense + saisie manuelle cumulées", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachImpots(assistant);
    const [expense] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_1100, documentId: "doc-dc-1", fiscalYear: YEAR });
    turn = await assistant.handle(turn.state, { type: "receive_taxe_fonciere_expense", expense: expense! });
    turn = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_expense" });

    const registry = collectedToChargeRegistry({
      collected: turn.state.collected,
      categoryInventory: turn.state.categoryInventory,
      fieldSources: turn.state.fieldSources,
      exercise: YEAR,
    });
    const taxeFonciereCharges = registry.charges.filter((c) => c.category === "taxe_fonciere");
    assert.equal(taxeFonciereCharges.length, 1, "jamais deux Charge taxe_fonciere pour la même dépense");

    // Même si (par hypothèse défensive) `collected.taxeFonciere` scalaire
    // était aussi présent, l'Expense doit rester la seule source projetée.
    const withLegacyScalarToo = { ...turn.state.collected, taxeFonciere: 50 };
    const registry2 = collectedToChargeRegistry({
      collected: withLegacyScalarToo,
      categoryInventory: turn.state.categoryInventory,
      fieldSources: turn.state.fieldSources,
      exercise: YEAR,
    });
    const charges2 = registry2.charges.filter((c) => c.category === "taxe_fonciere");
    assert.equal(charges2.length, 1, "l'Expense prime toujours, jamais un cumul avec le scalaire legacy");
    assert.equal(charges2[0]?.amount, 1100);
  });

  it("H — document supprimé après confirmation : le comportement FISCAL réel change, pas seulement un flag — plus aucune Charge à partir de l'Expense orpheline", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await reachImpots(assistant);
    const [expense] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_1100, documentId: "doc-to-delete", fiscalYear: YEAR });
    turn = await assistant.handle(turn.state, { type: "receive_taxe_fonciere_expense", expense: expense! });
    turn = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_expense" });

    const beforeDeletion = chargeTotalFor(turn.state);
    assert.equal(beforeDeletion.charges.totalDeductible, 1100);

    // Simule exactement la transformation appliquée par le reducer
    // REMOVE_DOCUMENT (src/lib/lmnp/store/reducer.ts) pour ce documentId :
    // decision repasse à "pending", montant/montantExtrait intacts. Testé
    // séparément au niveau du reducer lui-même (reducer-confirmation-
    // invalidation.test.ts, #1b) — ici, on prouve l'EFFET FISCAL réel, pas
    // seulement la forme de l'état.
    const afterDeletion = {
      ...turn.state,
      collected: {
        ...turn.state.collected,
        taxeFonciereExpense: {
          ...turn.state.collected.taxeFonciereExpense!,
          decision: "pending" as const,
          reviewNeeded: true,
        },
      },
    };
    const result = chargeTotalFor(afterDeletion);
    assert.equal(
      result.charges.totalDeductible,
      0,
      "une Expense orpheline (document supprimé) ne doit plus jamais être comptée — jamais une donnée validée sans provenance",
    );
    // Le montant lui-même n'est pas perdu — seulement plus exploitable en Charge tant que non revalidé.
    assert.equal(afterDeletion.collected.taxeFonciereExpense.montant, 1100);
  });

  it("L — famille non migrée (assurances) : chemin ChargeProposal historique inchangé", async () => {
    const PROFIL_ASSURANCES = { copropriete: false, agence: false, travaux: false, vacance: false, comptable: false };
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_ASSURANCES });
    // Avance jusqu'à assurance_pno (2e catégorie).
    turn = await assistant.handle(turn.state, { type: "skip_category" });
    assert.equal(turn.state.categoryInventory[turn.state.currentCategoryIndex], "assurance_pno");

    const proposals = proposalsFromTaxeFonciereCorpus({ corpus: AVIS_1100, documentId: "legacy-doc", fiscalYear: YEAR });
    turn = await assistant.handle(turn.state, {
      type: "receive_document_proposals",
      documentId: "legacy-doc",
      familyId: "assurances",
      proposals,
      fileName: "avis.txt",
    });
    // Chemin ChargeProposal intact : state.documentReview toujours peuplé,
    // aucune trace du nouveau chemin Expense.
    assert.ok(turn.state.documentReview);
    assert.equal(turn.state.pendingTaxeFonciereExpense, undefined);
    assert.equal(turn.state.collected.taxeFonciereExpense, undefined);
  });
});
