/**
 * Blocker #3 — Lot A : détection legacy + validité du marker d'intégrité.
 *
 * Run: npx tsx --test "src/runtime/assistants/f012-charges/taxe-fonciere-legacy-integrity.test.ts"
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { Expense } from "../../capabilities/f012/expense";
import { deriveExpenseIdFromDocument } from "../../capabilities/f012/expense";
import type { F012CollectedData } from "./types";
import { toF012PersistedState, createInitialF012State, snapshotF012State } from "./types";
import {
  TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
  detectTaxeFonciereLegacyRisk,
  isTaxeFonciereIntegrityCheckValid,
  type TaxeFonciereIntegrityCheck,
} from "./taxe-fonciere-legacy-integrity";

function baseExpense(overrides: Partial<Expense> & Pick<Expense, "id" | "decision">): Expense {
  return {
    exerciceFiscal: 2024,
    montant: 150,
    description: "Taxe foncière",
    origin: "document",
    documentId: "doc-X",
    fieldSources: { montant: "extracted" },
    category: "taxe_fonciere",
    ...overrides,
  };
}

function collectedWith(expense?: Expense, scalar?: number): F012CollectedData {
  return {
    coproLignes: [],
    travaux: [],
    divers: [],
    skippedCategories: [],
    ...(expense ? { taxeFonciereExpense: expense } : {}),
    ...(scalar !== undefined ? { taxeFonciere: scalar } : {}),
  };
}

const LEGACY_ID_1 = deriveExpenseIdFromDocument("doc-X", "prelevement:1");
const LEGACY_ID_10 = deriveExpenseIdFromDocument("doc-X", "prelevement:10");

describe("detectTaxeFonciereLegacyRisk — Lot A", () => {
  it("A1 — expense-doc-X-prelevement:1 confirmed → certainly_exposed", () => {
    const expense = baseExpense({ id: LEGACY_ID_1, decision: "confirmed" });
    const risk = detectTaxeFonciereLegacyRisk({ collected: collectedWith(expense) });
    assert.equal(risk.kind, "certainly_exposed");
    if (risk.kind !== "certainly_exposed") return;
    assert.equal(risk.matchedId, LEGACY_ID_1);
    assert.equal(risk.expense, expense);
  });

  it("A2 — expense-doc-X-prelevement:10 confirmed → certainly_exposed", () => {
    const expense = baseExpense({ id: LEGACY_ID_10, decision: "confirmed", montant: 150 });
    const risk = detectTaxeFonciereLegacyRisk({ collected: collectedWith(expense) });
    assert.equal(risk.kind, "certainly_exposed");
    if (risk.kind !== "certainly_exposed") return;
    assert.equal(risk.matchedId, LEGACY_ID_10);
  });

  it("A3 — même id modified → certainly_exposed", () => {
    const expense = baseExpense({ id: LEGACY_ID_10, decision: "modified", montant: 1500 });
    assert.equal(detectTaxeFonciereLegacyRisk({ collected: collectedWith(expense) }).kind, "certainly_exposed");
  });

  it("A4 — même id pending → none", () => {
    const expense = baseExpense({ id: LEGACY_ID_10, decision: "pending" });
    assert.equal(detectTaxeFonciereLegacyRisk({ collected: collectedWith(expense) }).kind, "none");
  });

  it("A5 — même id ignored → none", () => {
    const expense = baseExpense({ id: LEGACY_ID_10, decision: "ignored" });
    assert.equal(detectTaxeFonciereLegacyRisk({ collected: collectedWith(expense) }).kind, "none");
  });

  it("A6 — id moderne taxe-annuelle → none", () => {
    const expense = baseExpense({
      id: deriveExpenseIdFromDocument("doc-X", "taxe-annuelle"),
      decision: "confirmed",
      montant: 1500,
    });
    assert.equal(detectTaxeFonciereLegacyRisk({ collected: collectedWith(expense) }).kind, "none");
  });

  it("A7 — id moderne taxe-fonciere → none", () => {
    const expense = baseExpense({
      id: deriveExpenseIdFromDocument("doc-X", "taxe-fonciere"),
      decision: "confirmed",
      montant: 1500,
    });
    assert.equal(detectTaxeFonciereLegacyRisk({ collected: collectedWith(expense) }).kind, "none");
  });

  it("A8 — ChargeProposal-like X:prelevement:3 → none", () => {
    const expense = baseExpense({ id: "doc-X:prelevement:3", decision: "confirmed" });
    assert.equal(detectTaxeFonciereLegacyRisk({ collected: collectedWith(expense) }).kind, "none");
  });

  it("A9 — scalaire TF seul → none", () => {
    assert.equal(detectTaxeFonciereLegacyRisk({ collected: collectedWith(undefined, 150) }).kind, "none");
  });

  it("A10 — catégorie différente avec id ressemblant → none", () => {
    const expense = baseExpense({
      id: LEGACY_ID_1,
      decision: "confirmed",
      category: "divers",
    });
    assert.equal(detectTaxeFonciereLegacyRisk({ collected: collectedWith(expense) }).kind, "none");
  });

  it("A11 — quasi-collisions regex refusées", () => {
    const rejected = [
      "expense-doc-doc-X-prelevement:10-extra",
      "expense-doc-doc-X-prelevement:",
      "expense-doc-doc-X-prelevement:abc",
      "expense-doc-doc-X-prelevement:1.5",
      "expense-doc-doc-X-prelevement:10 ",
      " expense-doc-doc-X-prelevement:10",
      "expense-doc-doc-X-prelevement:10/foo",
      "expense-doc-doc-X-taxe-annuelle",
      "expense-doc-doc-X-taxe-fonciere-legacy",
      "doc-X:prelevement:10",
    ];
    for (const id of rejected) {
      const expense = baseExpense({ id, decision: "confirmed" });
      assert.equal(
        detectTaxeFonciereLegacyRisk({ collected: collectedWith(expense) }).kind,
        "none",
        `id ${JSON.stringify(id)} ne doit jamais matcher`,
      );
    }
  });

  it("id legacy + expense-manual-taxe-fonciere → none", () => {
    const expense = baseExpense({
      id: "expense-manual-taxe-fonciere-2024",
      decision: "confirmed",
      origin: "manual",
    });
    assert.equal(detectTaxeFonciereLegacyRisk({ collected: collectedWith(expense) }).kind, "none");
  });
});

describe("isTaxeFonciereIntegrityCheckValid — Lot A", () => {
  const expense = baseExpense({
    id: LEGACY_ID_10,
    decision: "confirmed",
    montant: 1500,
    documentId: "doc-X",
  });

  const validMatch: TaxeFonciereIntegrityCheck = {
    status: "verified_match",
    checkVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
    checkedAt: "2026-09-15T12:00:00.000Z",
    againstDocumentId: "doc-X",
    persistedMontantAtCheck: 150,
    resolvedMontant: 1500,
  };

  it("C — marker documentaire valid → true", () => {
    assert.equal(
      isTaxeFonciereIntegrityCheckValid({
        check: validMatch,
        expense,
        currentCheckVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
      }),
      true,
    );
  });

  it("check undefined → false", () => {
    assert.equal(
      isTaxeFonciereIntegrityCheckValid({
        check: undefined,
        expense,
        currentCheckVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
      }),
      false,
    );
  });

  it("checkVersion mismatch → false", () => {
    const stale = {
      ...validMatch,
      checkVersion: 99,
    } as unknown as TaxeFonciereIntegrityCheck;
    assert.equal(
      isTaxeFonciereIntegrityCheckValid({
        check: stale,
        expense,
        currentCheckVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
      }),
      false,
    );
  });

  it("D — montant Expense changé → false", () => {
    assert.equal(
      isTaxeFonciereIntegrityCheckValid({
        check: validMatch,
        expense: { ...expense, montant: 150 },
        currentCheckVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
      }),
      false,
    );
  });

  it("expense pending → false", () => {
    assert.equal(
      isTaxeFonciereIntegrityCheckValid({
        check: validMatch,
        expense: { ...expense, decision: "pending" },
        currentCheckVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
      }),
      false,
    );
  });

  it("doc différent → false", () => {
    assert.equal(
      isTaxeFonciereIntegrityCheckValid({
        check: validMatch,
        expense: { ...expense, documentId: "doc-Y" },
        currentCheckVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
      }),
      false,
    );
  });

  it("verified_match sans againstDocumentId → false", () => {
    const { againstDocumentId: _, ...withoutDoc } = validMatch;
    assert.equal(
      isTaxeFonciereIntegrityCheckValid({
        check: withoutDoc,
        expense,
        currentCheckVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
      }),
      false,
    );
  });

  it("verified_user_decision sans againstDocumentId → false", () => {
    const { againstDocumentId: _, ...withoutDoc } = validMatch;
    assert.equal(
      isTaxeFonciereIntegrityCheckValid({
        check: { ...withoutDoc, status: "verified_user_decision" },
        expense,
        currentCheckVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
      }),
      false,
    );
  });

  it("verified_match avec againstDocumentId mais Expense sans documentId → false", () => {
    assert.equal(
      isTaxeFonciereIntegrityCheckValid({
        check: validMatch,
        expense: { ...expense, documentId: undefined },
        currentCheckVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
      }),
      false,
    );
  });

  it("verified_user_decision avec againstDocumentId mais Expense sans documentId → false", () => {
    assert.equal(
      isTaxeFonciereIntegrityCheckValid({
        check: { ...validMatch, status: "verified_user_decision" },
        expense: { ...expense, documentId: undefined },
        currentCheckVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
      }),
      false,
    );
  });

  it("même doc + verified_user_decision → true", () => {
    assert.equal(
      isTaxeFonciereIntegrityCheckValid({
        check: { ...validMatch, status: "verified_user_decision" },
        expense,
        currentCheckVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
      }),
      true,
    );
  });

  it("user_attested_no_document sans againstDocumentId + montant identique → true", () => {
    const check: TaxeFonciereIntegrityCheck = {
      status: "user_attested_no_document",
      checkVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
      checkedAt: "2026-09-15T12:00:00.000Z",
      persistedMontantAtCheck: 150,
      resolvedMontant: 1500,
    };
    assert.equal(
      isTaxeFonciereIntegrityCheckValid({
        check,
        expense: { ...expense, montant: 1500 },
        currentCheckVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
      }),
      true,
    );
  });

  it("user_attested_no_document avec againstDocumentId → false", () => {
    const check: TaxeFonciereIntegrityCheck = {
      status: "user_attested_no_document",
      checkVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
      checkedAt: "2026-09-15T12:00:00.000Z",
      againstDocumentId: "doc-X",
      persistedMontantAtCheck: 150,
      resolvedMontant: 1500,
    };
    assert.equal(
      isTaxeFonciereIntegrityCheckValid({
        check,
        expense,
        currentCheckVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
      }),
      false,
    );
  });

  it("aucune tolérance : resolvedMontant 1500 vs expense 1499 → false", () => {
    assert.equal(
      isTaxeFonciereIntegrityCheckValid({
        check: validMatch,
        expense: { ...expense, montant: 1499 },
        currentCheckVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
      }),
      false,
    );
  });

  it("resolvedMontant NaN → false", () => {
    assert.equal(
      isTaxeFonciereIntegrityCheckValid({
        check: { ...validMatch, resolvedMontant: Number.NaN },
        expense,
        currentCheckVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
      }),
      false,
    );
  });

  it("resolvedMontant Infinity → false", () => {
    assert.equal(
      isTaxeFonciereIntegrityCheckValid({
        check: { ...validMatch, resolvedMontant: Number.POSITIVE_INFINITY },
        expense: { ...expense, montant: Number.POSITIVE_INFINITY },
        currentCheckVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
      }),
      false,
    );
  });

  it("resolvedMontant -Infinity → false", () => {
    assert.equal(
      isTaxeFonciereIntegrityCheckValid({
        check: { ...validMatch, resolvedMontant: Number.NEGATIVE_INFINITY },
        expense: { ...expense, montant: Number.NEGATIVE_INFINITY },
        currentCheckVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
      }),
      false,
    );
  });

  it("Expense montant NaN → false", () => {
    assert.equal(
      isTaxeFonciereIntegrityCheckValid({
        check: validMatch,
        expense: { ...expense, montant: Number.NaN },
        currentCheckVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
      }),
      false,
    );
  });

  it("Expense montant Infinity → false", () => {
    assert.equal(
      isTaxeFonciereIntegrityCheckValid({
        check: { ...validMatch, resolvedMontant: Number.POSITIVE_INFINITY },
        expense: { ...expense, montant: Number.POSITIVE_INFINITY },
        currentCheckVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
      }),
      false,
    );
  });

  it("persistedMontantAtCheck NaN → false", () => {
    assert.equal(
      isTaxeFonciereIntegrityCheckValid({
        check: { ...validMatch, persistedMontantAtCheck: Number.NaN },
        expense,
        currentCheckVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
      }),
      false,
    );
  });

  it("persistedMontantAtCheck Infinity → false", () => {
    assert.equal(
      isTaxeFonciereIntegrityCheckValid({
        check: { ...validMatch, persistedMontantAtCheck: Number.POSITIVE_INFINITY },
        expense,
        currentCheckVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
      }),
      false,
    );
  });

  it("traçabilité : persistedMontantAtCheck=A(150) ≠ Expense=B(1500) → marker documentaire toujours valide", () => {
    assert.equal(validMatch.persistedMontantAtCheck, 150);
    assert.equal(expense.montant, 1500);
    assert.equal(validMatch.resolvedMontant, 1500);
    assert.notEqual(validMatch.persistedMontantAtCheck, expense.montant);
    assert.equal(
      isTaxeFonciereIntegrityCheckValid({
        check: validMatch,
        expense,
        currentCheckVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
      }),
      true,
      "persistedMontantAtCheck est traçabilité A, pas identité avec l'Expense finale B",
    );
  });
});

describe("persistance marker — Lot A wiring", () => {
  it("toF012PersistedState / snapshot / resume shape conserve taxeFonciereIntegrityCheck", () => {
    const check: TaxeFonciereIntegrityCheck = {
      status: "verified_match",
      checkVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
      checkedAt: "2026-09-15T12:00:00.000Z",
      againstDocumentId: "doc-X",
      persistedMontantAtCheck: 150,
      resolvedMontant: 1500,
    };
    const state = {
      ...createInitialF012State(),
      step: "complete" as const,
      collected: collectedWith(
        baseExpense({ id: LEGACY_ID_10, decision: "confirmed", montant: 1500 }),
      ),
      taxeFonciereIntegrityCheck: check,
    };
    const persisted = toF012PersistedState(state, "2026-09-15T12:00:00.000Z");
    assert.deepEqual(persisted.taxeFonciereIntegrityCheck, check);

    const snap = snapshotF012State(state);
    assert.deepEqual(snap.taxeFonciereIntegrityCheck, check);
  });

  it("certainly_exposed && !validMarker reste dérivable (pas de status pending persisté)", () => {
    const expense = baseExpense({ id: LEGACY_ID_10, decision: "confirmed", montant: 150 });
    const risk = detectTaxeFonciereLegacyRisk({ collected: collectedWith(expense) });
    assert.equal(risk.kind, "certainly_exposed");
    const pendingDerived =
      risk.kind === "certainly_exposed" &&
      !isTaxeFonciereIntegrityCheckValid({
        check: undefined,
        expense,
        currentCheckVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
      });
    assert.equal(pendingDerived, true);
  });
});
