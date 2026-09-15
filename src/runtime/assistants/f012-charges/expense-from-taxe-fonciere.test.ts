import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  expensesFromTaxeFonciereCorpus,
  sumPrelevements,
  taxeFonciereExpenseMissingAmount,
} from "./expense-from-taxe-fonciere";

const AVIS_SIMPLE = `
Avis de taxe foncière — Année 2024
Net à payer : 1 100,00 EUR
Payé le 12/03/2024
`;

const AVIS_SANS_MONTANT = `
Avis de taxe foncière — Année 2024
Commune : Lyon
`;

/** 10 prélèvements de 150,00 € — cas nominal de l'audit (perte silencieuse de 1350 € avant correctif). */
const AVIS_10_PRELEVEMENTS = `
Avis de taxe foncière — Année 2024
${Array.from({ length: 10 }, (_, i) => `Prélèvement ${i + 1} : 150,00`).join("\n")}
Payé le 12/03/2024
`;

const AVIS_MONTANT_ET_PRELEVEMENTS = `
Avis de taxe foncière — Année 2024
Net à payer : 999,00 EUR
Prélèvement 1 : 150,00
Prélèvement 2 : 150,00
Payé le 12/03/2024
`;

const AVIS_UN_SEUL_PRELEVEMENT = `
Avis de taxe foncière — Année 2024
Prélèvement 1 : 150,00
Net à payer : 1 500,00 EUR
Payé le 12/03/2024
`;

/** Montant annuel ET 10 prélèvements CONCORDANTS (1500 = 10×150) — mission cas B. */
const AVIS_1500_ET_10_PRELEVEMENTS = `
Avis de taxe foncière — Année 2024
Net à payer : 1 500,00 EUR
${Array.from({ length: 10 }, (_, i) => `Prélèvement ${i + 1} : 150,00`).join("\n")}
Payé le 12/03/2024
`;

/** Montant annuel ET un seul prélèvement — mission cas D (le prélèvement isolé ne doit jamais l'emporter). */
const AVIS_1500_ET_1_PRELEVEMENT = `
Avis de taxe foncière — Année 2024
Net à payer : 1 500,00 EUR
Prélèvement 1 : 150,00
Payé le 12/03/2024
`;

/** Montant annuel 1500 vs somme des prélèvements 1499 — écart d'1€, dans la tolérance d'arrondi OCR documentée. */
const AVIS_1500_QUASI_CONCORDANT_1499 = `
Avis de taxe foncière — Année 2024
Net à payer : 1 500,00 EUR
Prélèvement 1 : 749,50
Prélèvement 2 : 749,50
Payé le 12/03/2024
`;

/** Montant annuel 1500 vs somme des prélèvements 1501 — écart d'1€, dans la tolérance d'arrondi OCR documentée. */
const AVIS_1500_QUASI_CONCORDANT_1501 = `
Avis de taxe foncière — Année 2024
Net à payer : 1 500,00 EUR
Prélèvement 1 : 750,50
Prélèvement 2 : 750,50
Payé le 12/03/2024
`;

/** Montant annuel absent, seulement 2 prélèvements — aucune source concurrente : agrégation légitime (mission cas F). */
const AVIS_2_PRELEVEMENTS_SEULS = `
Avis de taxe foncière — Année 2024
Prélèvement 1 : 150,00
Prélèvement 2 : 150,00
Payé le 12/03/2024
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

  it("B (régression P0) — plusieurs prélèvements dans un même document → UNE SEULE Expense, montant = somme (jamais last-write-wins)", () => {
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
    assert.equal(expenses.length, 1, "une seule Expense candidate — jamais N, jamais écrasée par un dispatch séquentiel");
    assert.equal(expenses[0]!.montant, 800);
    assert.equal(expenses[0]!.montantExtrait, 800);
  });

  it("A — 10×150€ → montant final 1500€ (cas nominal de l'audit, perte silencieuse de 1350€ avant correctif)", () => {
    const expenses = expensesFromTaxeFonciereCorpus({
      corpus: AVIS_10_PRELEVEMENTS,
      documentId: "doc-10x150",
      fiscalYear: 2024,
    });
    assert.equal(expenses.length, 1);
    assert.equal(expenses[0]!.montant, 1500);
    assert.equal(expenses[0]!.montantExtrait, 1500);
    assert.equal(expenses[0]!.decision, "pending");
    assert.match(expenses[0]!.description, /10 prélèvements/);
  });

  it("P1 (régression) — id dérivé du document seul, jamais d'un index de prélèvement, stable même document → même id", () => {
    const [expense] = expensesFromTaxeFonciereCorpus({
      corpus: AVIS_10_PRELEVEMENTS,
      documentId: "doc-10x150",
      fiscalYear: 2024,
    });
    assert.equal(expense!.id, "expense-doc-doc-10x150-taxe-annuelle");
    const [again] = expensesFromTaxeFonciereCorpus({
      corpus: AVIS_10_PRELEVEMENTS,
      documentId: "doc-10x150",
      fiscalYear: 2024,
    });
    assert.equal(again!.id, expense!.id, "recommit du même document → même id, jamais un doublon");
  });

  it("B — reorder des prélèvements → même montant final (la somme ne dépend jamais de la position)", () => {
    const inOrder = sumPrelevements([150, 150, 150, 150, 150, 150, 150, 150, 150, 150]);
    const reordered = sumPrelevements([150, 150, 150, 150, 150, 150, 150, 150, 150, 150].reverse());
    const shuffled = sumPrelevements([400, 150, 800, 150]);
    const shuffledReordered = sumPrelevements([150, 800, 150, 400]);
    assert.equal(inOrder, 1500);
    assert.equal(reordered, 1500);
    assert.equal(shuffled, shuffledReordered);
  });

  it("C — insertion d'un prélèvement tiers dans la collection source → somme mise à jour, jamais un doublon de l'existant", () => {
    const before = sumPrelevements([150, 150]);
    const afterInsertion = sumPrelevements([150, 75, 150]);
    assert.equal(before, 300);
    assert.equal(afterInsertion, 375, "le nouveau prélèvement s'ajoute, aucun montant existant n'est perdu ni dupliqué");
  });

  it("D (Blocker #1 — re-audit) — montant annuel ET prélèvements présents simultanément mais DIVERGENTS → jamais un montant choisi silencieusement, review explicite", () => {
    const expenses = expensesFromTaxeFonciereCorpus({
      corpus: AVIS_MONTANT_ET_PRELEVEMENTS,
      documentId: "doc-conflit",
      fiscalYear: 2024,
    });
    assert.equal(expenses.length, 1);
    // 999 (annuel) vs 300 (150+150) divergent au-delà de la tolérance d'arrondi :
    // ni 300 (perte silencieuse du montant explicite) ni 999 + 300 (double comptage) ni 999 seul.
    assert.equal(expenses[0]!.montantExtrait, undefined, "aucune valeur choisie silencieusement entre les deux sources divergentes");
    assert.equal(expenses[0]!.montant, 0, "jamais un montant inventé — 0 est le repli neutre déjà utilisé pour 'montant absent'");
    assert.equal(expenses[0]!.decision, "pending");
    assert.equal(expenses[0]!.reviewNeeded, true);
    assert.deepEqual(expenses[0]!.montantConflict, { montantIndique: 999, sommePrelevements: 300 });
    assert.equal(taxeFonciereExpenseMissingAmount(expenses[0]!), true, "bloque la confirmation automatique — même garde que 'montant non lu'");
  });

  it("E — un seul prélèvement détecté : ambigu, jamais traité comme le montant annuel certain — repli sur le montant explicite du document", () => {
    const expenses = expensesFromTaxeFonciereCorpus({
      corpus: AVIS_UN_SEUL_PRELEVEMENT,
      documentId: "doc-un-seul",
      fiscalYear: 2024,
    });
    assert.equal(expenses.length, 1);
    // Le montant retenu est celui explicitement annoncé comme "net à payer" (1500), pas le prélèvement isolé (150) :
    // un seul prélèvement ne prouve pas, à lui seul, le montant annuel total.
    assert.equal(expenses[0]!.montant, 1500);
  });

  it("ANNUAL 1500 + 1×150 (Blocker #1, mission §3.D) — le prélèvement isolé ne devient JAMAIS 150 seul", () => {
    const expenses = expensesFromTaxeFonciereCorpus({
      corpus: AVIS_1500_ET_1_PRELEVEMENT,
      documentId: "doc-annuel-1-prelevement",
      fiscalYear: 2024,
    });
    assert.equal(expenses.length, 1);
    assert.equal(expenses[0]!.montant, 1500);
    assert.equal(expenses[0]!.montantExtrait, 1500);
    assert.equal(expenses[0]!.montantConflict, undefined, "un seul prélèvement n'est jamais comparé au montant explicite — pas de conflit");
  });

  it("ANNUAL 1500 + 10×150 concordant (mission §3.B) — 1500€, jamais 300€ ni double comptage", () => {
    const expenses = expensesFromTaxeFonciereCorpus({
      corpus: AVIS_1500_ET_10_PRELEVEMENTS,
      documentId: "doc-annuel-et-10x150",
      fiscalYear: 2024,
    });
    assert.equal(expenses.length, 1);
    assert.equal(expenses[0]!.montant, 1500);
    assert.equal(expenses[0]!.montantExtrait, 1500);
    assert.equal(expenses[0]!.montantConflict, undefined, "sources concordantes — jamais un conflit affiché à tort");
  });

  it("ANNUAL 1500 + prélèvements = 1499 (tolérance d'arrondi ±1€, mission §3/§7) — concordant, 1500€ retenu", () => {
    const expenses = expensesFromTaxeFonciereCorpus({
      corpus: AVIS_1500_QUASI_CONCORDANT_1499,
      documentId: "doc-quasi-1499",
      fiscalYear: 2024,
    });
    assert.equal(expenses.length, 1);
    assert.equal(expenses[0]!.montant, 1500, "écart d'1€ absorbé par la tolérance d'arrondi OCR documentée");
    assert.equal(expenses[0]!.montantConflict, undefined);
  });

  it("ANNUAL 1500 + prélèvements = 1501 (tolérance d'arrondi ±1€, mission §3/§7) — concordant, 1500€ retenu", () => {
    const expenses = expensesFromTaxeFonciereCorpus({
      corpus: AVIS_1500_QUASI_CONCORDANT_1501,
      documentId: "doc-quasi-1501",
      fiscalYear: 2024,
    });
    assert.equal(expenses.length, 1);
    assert.equal(expenses[0]!.montant, 1500, "écart d'1€ absorbé par la tolérance d'arrondi OCR documentée");
    assert.equal(expenses[0]!.montantConflict, undefined);
  });

  it("prélèvements seuls, sans montant annuel (mission §3.F) — 2×150€ agrégés sans conflit : aucune source concurrente à comparer", () => {
    const expenses = expensesFromTaxeFonciereCorpus({
      corpus: AVIS_2_PRELEVEMENTS_SEULS,
      documentId: "doc-2-seuls",
      fiscalYear: 2024,
    });
    assert.equal(expenses.length, 1);
    assert.equal(expenses[0]!.montant, 300);
    assert.equal(expenses[0]!.montantExtrait, 300);
    assert.equal(expenses[0]!.decision, "pending", "reste soumis à confirmation utilisateur explicite — jamais auto-confirmé");
    assert.equal(expenses[0]!.montantConflict, undefined, "aucun second signal disponible : pas de conflit à signaler");
  });

  it("valeurs invalides — corpus vide/illisible : aucun montant inventé, review nécessaire, aucune exception levée", () => {
    const expenses = expensesFromTaxeFonciereCorpus({
      corpus: "",
      documentId: "doc-vide",
      fiscalYear: 2024,
    });
    assert.equal(expenses.length, 1);
    assert.equal(expenses[0]!.montantExtrait, undefined);
    assert.equal(expenses[0]!.montant, 0);
    assert.equal(expenses[0]!.reviewNeeded, true);
    assert.equal(expenses[0]!.montantConflict, undefined);
  });

  it("K — cas simple historique (montant annuel unique, pas de prélèvements) : non-régression", () => {
    const [expense] = expensesFromTaxeFonciereCorpus({
      corpus: AVIS_SIMPLE,
      documentId: "doc-simple",
      fiscalYear: 2024,
    });
    assert.equal(expense!.montant, 1100);
    assert.equal(expense!.montantExtrait, 1100);
    assert.equal(expense!.id, "expense-doc-doc-simple-taxe-fonciere");
  });
});

describe("sumPrelevements — agrégation pure, point unique testable (§3 de la mission)", () => {
  it("somme explicite, jamais un dernier montant retenu seul", () => {
    assert.equal(sumPrelevements([150, 150, 150, 150, 150, 150, 150, 150, 150, 150]), 1500);
  });

  it("tableau vide → 0, jamais undefined ni NaN", () => {
    assert.equal(sumPrelevements([]), 0);
  });

  it("montants distincts (mensualités inégales) → somme correcte", () => {
    assert.equal(sumPrelevements([125.5, 130, 99.99]), 355.49);
  });
});
