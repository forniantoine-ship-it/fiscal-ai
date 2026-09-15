/**
 * F012 V2 document-first — Phase 3, tests unitaires de l'adaptateur
 * ChargeProposal (décidée) → Expense (assurances/gestion/syndic).
 * Run: npx tsx --test src/runtime/assistants/f012-charges/expense-from-document-review.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isExpenseRecordable } from "../../capabilities/f012/expense";
import type { ChargeProposal } from "./charge-proposal";
import {
  applyDocumentReviewAsExpenses,
  expenseFromDecidedProposal,
  expensesFromDecidedReview,
} from "./expense-from-document-review";
import type { F012CollectedData } from "./types";

const YEAR = 2026;

function emptyCollected(): F012CollectedData {
  return { coproLignes: [], travaux: [], divers: [], skippedCategories: [] };
}

function assuranceProposal(overrides: Partial<ChargeProposal> = {}): ChargeProposal {
  return {
    id: "doc-1:logement:300",
    documentId: "doc-1",
    familyId: "assurances",
    description: "Assurance du logement",
    amount: 300,
    exercise: YEAR,
    insuranceKind: "logement",
    missingFields: [],
    decision: "confirmed",
    ...overrides,
  };
}

describe("expenseFromDecidedProposal — itemKey, catégorie, exclusion, décision", () => {
  it("A — proposition confirmée → Expense recordable, documentId réel, itemKey = suffixe de ChargeProposal.id", () => {
    const expense = expenseFromDecidedProposal(assuranceProposal(), YEAR);
    assert.ok(expense);
    assert.equal(expense!.id, "expense-doc-doc-1-logement:300");
    assert.equal(expense!.documentId, "doc-1");
    assert.equal(expense!.category, "assurance_pno");
    assert.equal(expense!.montant, 300);
    assert.equal(expense!.decision, "confirmed");
    assert.ok(isExpenseRecordable(expense!));
  });

  it("B — proposition exclue (exclusionReason) → aucune Expense, jamais fiscale", () => {
    const expense = expenseFromDecidedProposal(
      assuranceProposal({
        insuranceKind: "emprunteur",
        exclusionReason: "Cette assurance concerne votre prêt.",
        decision: "ignored",
      }),
      YEAR,
    );
    assert.equal(expense, undefined);
  });

  it("C — proposition modifiée → decision 'modified', montant corrigé, montantExtrait conservé, provenance user_correction", () => {
    const expense = expenseFromDecidedProposal(
      assuranceProposal({ decision: "modified", amount: 300, modifiedAmount: 350 }),
      YEAR,
    );
    assert.ok(expense);
    assert.equal(expense!.decision, "modified");
    assert.equal(expense!.montant, 350, "expenseFromDecidedProposal lit proposalAmount() — modifiedAmount prime");
    assert.equal(expense!.montantExtrait, 300, "le montant brut d'extraction reste tracé, jamais écrasé");
    assert.equal(expense!.fieldSources.montant, "user_correction");
  });

  it("D — proposition ignorée (sans exclusionReason) → Expense conservée, decision 'ignored', jamais recordable", () => {
    const expense = expenseFromDecidedProposal(assuranceProposal({ decision: "ignored" }), YEAR);
    assert.ok(expense, "une ligne ignorée par choix explicite reste traçable (§9/§10)");
    assert.equal(expense!.decision, "ignored");
    assert.equal(isExpenseRecordable(expense!), false);
  });

  it("E — syndic : coproType transmis (jamais perdu — sans lui, la Charge serait silencieusement exclue du calcul, voir chargeRegistryToComputeInput)", () => {
    const expense = expenseFromDecidedProposal(
      {
        id: "doc-2:copro:1",
        documentId: "doc-2",
        familyId: "syndic",
        description: "Charges de l'immeuble",
        amount: 800,
        exercise: YEAR,
        coproType: "regularisation",
        missingFields: [],
        decision: "confirmed",
      },
      YEAR,
    );
    assert.ok(expense);
    assert.equal(expense!.category, "copropriete");
    assert.equal(expense!.coproType, "regularisation");
  });

  it("F — syndic sans coproType explicite → repli 'provisions' (même repli que l'ancien applySyndicReview)", () => {
    const expense = expenseFromDecidedProposal(
      {
        id: "doc-3:copro:1",
        documentId: "doc-3",
        familyId: "syndic",
        description: "Charges de l'immeuble",
        amount: 500,
        exercise: YEAR,
        missingFields: [],
        decision: "confirmed",
      },
      YEAR,
    );
    assert.equal(expense?.coproType, "provisions");
  });

  it("G — gestion : état des lieux et honoraires partagent la catégorie fiscale honoraires_gestion (même traitement que le modèle scalaire à deux slots)", () => {
    const gestion = expenseFromDecidedProposal(
      {
        id: "doc-4:gestion:480",
        documentId: "doc-4",
        familyId: "gestion",
        description: "Frais de l'agence",
        amount: 480,
        exercise: YEAR,
        gestionKind: "gestion",
        missingFields: [],
        decision: "confirmed",
      },
      YEAR,
    );
    const etatDesLieux = expenseFromDecidedProposal(
      {
        id: "doc-4:etat_des_lieux:150",
        documentId: "doc-4",
        familyId: "gestion",
        description: "État des lieux",
        amount: 150,
        exercise: YEAR,
        gestionKind: "etat_des_lieux",
        missingFields: [],
        decision: "confirmed",
      },
      YEAR,
    );
    assert.equal(gestion?.category, "honoraires_gestion");
    assert.equal(etatDesLieux?.category, "honoraires_gestion");
  });

  it("H — gestion : comptable/logiciel → honoraires_comptable", () => {
    const comptable = expenseFromDecidedProposal(
      {
        id: "doc-5:comptable:360",
        documentId: "doc-5",
        familyId: "gestion",
        description: "Comptable",
        amount: 360,
        exercise: YEAR,
        gestionKind: "comptable",
        missingFields: [],
        decision: "confirmed",
      },
      YEAR,
    );
    assert.equal(comptable?.category, "honoraires_comptable");
  });

  it("I — deux propositions d'un même document, montants identiques mais itemKey distincts (kind différent) → deux Expense.id distincts, jamais un index de tableau", () => {
    const a = expenseFromDecidedProposal(
      assuranceProposal({ id: "doc-6:logement:300", insuranceKind: "logement", amount: 300 }),
      YEAR,
    );
    const b = expenseFromDecidedProposal(
      { ...assuranceProposal({ insuranceKind: "gli", amount: 300 }), id: "doc-6:gli:300", documentId: "doc-6" },
      YEAR,
    );
    assert.notEqual(a?.id, b?.id);
  });
});

describe("applyDocumentReviewAsExpenses — écriture canonique, additive, jamais de conflit scalaire", () => {
  it("J — tout confirmé → outcome 'wrote', documentExpenses peuplé, documentIdsByFamily mis à jour", () => {
    const result = applyDocumentReviewAsExpenses({
      collected: emptyCollected(),
      review: { documentId: "doc-7", familyId: "assurances", proposals: [assuranceProposal({ id: "doc-7:logement:300", documentId: "doc-7" })] },
      fiscalYear: YEAR,
    });
    assert.equal(result.outcome, "wrote");
    assert.equal(result.wroteCharge, true);
    assert.equal(result.collected.documentExpenses?.length, 1);
    assert.deepEqual(result.collected.documentIdsByFamily?.assurances, ["doc-7"]);
  });

  it("K — tout ignoré → outcome 'all_ignored', Expense(s) ignorée(s) tout de même persistées (traçabilité §9)", () => {
    const result = applyDocumentReviewAsExpenses({
      collected: emptyCollected(),
      review: {
        documentId: "doc-8",
        familyId: "assurances",
        proposals: [assuranceProposal({ id: "doc-8:logement:300", documentId: "doc-8", decision: "ignored" })],
      },
      fiscalYear: YEAR,
    });
    assert.equal(result.outcome, "all_ignored");
    assert.equal(result.wroteCharge, false);
    assert.equal(result.collected.documentExpenses?.[0]?.decision, "ignored");
  });

  it("L — recommit du même document (même itemKey) → remplace l'entrée existante, jamais un doublon", () => {
    const first = applyDocumentReviewAsExpenses({
      collected: emptyCollected(),
      review: { documentId: "doc-9", familyId: "assurances", proposals: [assuranceProposal({ id: "doc-9:logement:300", documentId: "doc-9" })] },
      fiscalYear: YEAR,
    });
    const second = applyDocumentReviewAsExpenses({
      collected: first.collected,
      review: {
        documentId: "doc-9",
        familyId: "assurances",
        proposals: [assuranceProposal({ id: "doc-9:logement:300", documentId: "doc-9", decision: "modified", amount: 300, modifiedAmount: 350 })],
      },
      fiscalYear: YEAR,
    });
    assert.equal(second.collected.documentExpenses?.length, 1, "jamais un doublon pour le même item du même document");
    assert.equal(second.collected.documentExpenses?.[0]?.montant, 350);
  });

  it("M — paiement confirmé hors exercice → outcome 'out_of_year', aucune Expense écrite (jamais un total qui glisse d'année)", () => {
    const result = applyDocumentReviewAsExpenses({
      collected: emptyCollected(),
      review: {
        documentId: "doc-10",
        familyId: "assurances",
        proposals: [assuranceProposal({ id: "doc-10:logement:300", documentId: "doc-10", exercise: YEAR + 1 })],
      },
      fiscalYear: YEAR,
    });
    assert.equal(result.outcome, "out_of_year");
    assert.equal(result.wroteCharge, false);
    assert.equal(result.collected.documentExpenses, undefined);
  });

  it("N — impots n'est jamais routé ici (garde défensive) — le chemin réel reste applyImpotsReview", () => {
    const result = applyDocumentReviewAsExpenses({
      collected: emptyCollected(),
      review: { documentId: "doc-11", familyId: "impots", proposals: [] },
      fiscalYear: YEAR,
    });
    assert.equal(result.outcome, "missing");
    assert.equal(result.collected.documentExpenses, undefined);
  });
});

describe("expensesFromDecidedReview — pas de double comptage total-vs-lignes", () => {
  it("O — plusieurs propositions confirmées d'un même document → autant d'Expense distinctes, somme égale au total attendu", () => {
    const review = {
      documentId: "doc-12",
      familyId: "gestion" as const,
      proposals: [
        {
          id: "doc-12:gestion:480",
          documentId: "doc-12",
          familyId: "gestion" as const,
          description: "Frais de l'agence",
          amount: 480,
          exercise: YEAR,
          gestionKind: "gestion" as const,
          missingFields: [],
          decision: "confirmed" as const,
        },
        {
          id: "doc-12:mise_en_location:300",
          documentId: "doc-12",
          familyId: "gestion" as const,
          description: "Mise en location",
          amount: 300,
          exercise: YEAR,
          gestionKind: "mise_en_location" as const,
          missingFields: [],
          decision: "confirmed" as const,
        },
      ],
    };
    const expenses = expensesFromDecidedReview(review, YEAR);
    assert.equal(expenses.length, 2);
    assert.equal(
      expenses.reduce((sum, e) => sum + e.montant, 0),
      780,
    );
    assert.equal(new Set(expenses.map((e) => e.id)).size, 2, "jamais deux Expense partageant le même id");
  });
});
