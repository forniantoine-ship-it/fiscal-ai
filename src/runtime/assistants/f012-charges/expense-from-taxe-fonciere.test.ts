import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { expensesFromTaxeFonciereCorpus, taxeFonciereExpenseMissingAmount } from "./expense-from-taxe-fonciere";

const AVIS_SIMPLE = `
Avis de taxe foncière — Année 2024
Net à payer : 1 100,00 EUR
Payé le 12/03/2024
`;

const AVIS_SANS_MONTANT = `
Avis de taxe foncière — Année 2024
Commune : Lyon
`;

describe("expensesFromTaxeFonciereCorpus — F012 V2 Phase 2, réutilise l'extraction existante", () => {
  it("A — document réel (corpus) → Expense pending, avec montant/date/documentId réels", () => {
    const [expense] = expensesFromTaxeFonciereCorpus({
      corpus: AVIS_SIMPLE,
      documentId: "doc-real-42",
      fiscalYear: 2024,
    });
    assert.ok(expense);
    assert.equal(expense!.decision, "pending", "jamais confirmée automatiquement à l'extraction");
    assert.equal(expense!.montantExtrait, 1100);
    assert.equal(expense!.montant, 1100);
    assert.equal(expense!.category, "taxe_fonciere");
    assert.equal(expense!.origin, "document");
    assert.equal(expense!.documentId, "doc-real-42", "le vrai LmnpDocument.id, jamais un id synthétique");
    assert.equal(expense!.fieldSources.montant, "extracted");
    assert.equal(expense!.exerciceFiscal, 2024);
    assert.equal(taxeFonciereExpenseMissingAmount(expense!), false);
  });

  it("id stable dérivé du document (deriveExpenseIdFromDocument), jamais d'index de tableau", () => {
    const [expense] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_SIMPLE, documentId: "doc-1", fiscalYear: 2024 });
    assert.equal(expense!.id, "expense-doc-doc-1-taxe-fonciere");
    // Même document, même extraction → même id (idempotence à la ré-extraction).
    const [expenseAgain] = expensesFromTaxeFonciereCorpus({ corpus: AVIS_SIMPLE, documentId: "doc-1", fiscalYear: 2024 });
    assert.equal(expenseAgain!.id, expense!.id);
  });

  it("aucun montant lisible : jamais un 0 inventé silencieusement — reste pending, reviewNeeded, montantExtrait absent", () => {
    const [expense] = expensesFromTaxeFonciereCorpus({
      corpus: AVIS_SANS_MONTANT,
      documentId: "doc-2",
      fiscalYear: 2024,
    });
    assert.equal(expense!.montantExtrait, undefined);
    assert.equal(expense!.decision, "pending");
    assert.equal(expense!.reviewNeeded, true);
    assert.equal(taxeFonciereExpenseMissingAmount(expense!), true);
  });

  it("plusieurs prélèvements dans un même document → plusieurs Expense, ids distincts", () => {
    const corpusMultiple = `
Avis de taxe foncière — Année 2024
Prélèvement 1 : 400,00
Prélèvement 2 : 400,00
`;
    const expenses = expensesFromTaxeFonciereCorpus({
      corpus: corpusMultiple,
      documentId: "doc-multi",
      fiscalYear: 2024,
    });
    assert.equal(expenses.length, 2);
    assert.notEqual(expenses[0]!.id, expenses[1]!.id);
    assert.ok(expenses.every((e) => e.documentId === "doc-multi"));
  });
});
