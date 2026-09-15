/**
 * Blocker #3 — Lot B : verifyTaxeFonciereAgainstSource + routage #1/#2.
 *
 * Run: npx tsx --test "src/runtime/assistants/f012-charges/taxe-fonciere-legacy-integrity-verify.test.ts"
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { deriveExpenseIdFromDocument, type Expense } from "../../capabilities/f012/expense";
import { F012ChargesAssistant } from "./assistant";
import { TAXE_FONCIERE_AMOUNT_TOLERANCE } from "./proposals-from-taxe-fonciere";
import {
  TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
  buildTaxeFonciereVerifiedMatchCheck,
  detectTaxeFonciereLegacyRisk,
  isTaxeFonciereIntegrityCheckValid,
  verifyTaxeFonciereAgainstSource,
} from "./taxe-fonciere-legacy-integrity";
import type { F012Deps, F012State } from "./types";
import { createInitialF012State, toF012PersistedState } from "./types";

const YEAR = 2024;
const ctx = { dossierId: "test", fiscalYear: YEAR, route: "/assistants/charges" };
const DEPS: F012Deps = { dateMiseEnService: "2023-01-01" };

const AVIS_1500_10x150 = `
Avis de taxe foncière — Année 2024
Net à payer : 1 500,00 EUR
${Array.from({ length: 10 }, (_, i) => `Prélèvement ${i + 1} : 150,00`).join("\n")}
Payé le 12/03/2024
`;

const AVIS_1600 = `
Avis de taxe foncière — Année 2024
Net à payer : 1 600,00 EUR
Prélèvement 1 : 800,00
Prélèvement 2 : 800,00
Payé le 12/03/2024
`;

/** Montant annuel 1500 vs prélèvements 300 — conflit interne Blocker #1. */
const AVIS_DIVERGENT = `
Avis de taxe foncière — Année 2024
Net à payer : 1 500,00 EUR
Prélèvement 1 : 150,00
Prélèvement 2 : 150,00
Payé le 12/03/2024
`;

function legacyExpense(montant: number, overrides: Partial<Expense> = {}): Expense {
  return {
    id: deriveExpenseIdFromDocument("doc-X", "prelevement:10"),
    exerciceFiscal: YEAR,
    montant,
    description: "Taxe foncière",
    origin: "document",
    documentId: "doc-X",
    fieldSources: { montant: "extracted" },
    category: "taxe_fonciere",
    decision: "confirmed",
    ...overrides,
  };
}

function stateWithLegacy(expense: Expense): F012State {
  return {
    ...createInitialF012State(),
    step: "category_collect",
    collected: {
      coproLignes: [],
      travaux: [],
      divers: [],
      skippedCategories: [],
      taxeFonciereExpense: expense,
    },
    familyInventory: ["impots"],
    currentFamilyIndex: 0,
    familyPhase: "card",
  };
}

function fileFromText(text: string): File {
  return new File([text], "avis.txt", { type: "text/plain" });
}

async function extractText(file: File): Promise<string> {
  return file.text();
}

describe("verifyTaxeFonciereAgainstSource — Lot B pure", () => {
  it("source_missing quand sourceFile null — aucune mutation legacy", async () => {
    const legacy = legacyExpense(150);
    const before = JSON.stringify(legacy);
    const result = await verifyTaxeFonciereAgainstSource({
      legacyExpense: legacy,
      fiscalYear: YEAR,
      sourceFile: null,
      extractText,
    });
    assert.equal(result.kind, "source_missing");
    assert.equal(JSON.stringify(legacy), before);
  });

  it("source_unreadable quand extraction vide", async () => {
    const result = await verifyTaxeFonciereAgainstSource({
      legacyExpense: legacyExpense(150),
      fiscalYear: YEAR,
      sourceFile: fileFromText("   "),
      extractText,
    });
    assert.equal(result.kind, "source_unreadable");
  });

  it("match — legacy 1500 vs avis 1500 (tolérance existante)", async () => {
    const result = await verifyTaxeFonciereAgainstSource({
      legacyExpense: legacyExpense(1500),
      fiscalYear: YEAR,
      sourceFile: fileFromText(AVIS_1500_10x150),
      extractText,
    });
    assert.equal(result.kind, "match");
    if (result.kind !== "match") return;
    assert.equal(result.resolvedMontant, 1500);
    assert.ok(Math.abs(1500 - result.resolvedMontant) <= TAXE_FONCIERE_AMOUNT_TOLERANCE);
    assert.equal(result.candidate.montantConflict, undefined);
  });

  it("B1 — match tolérance +1 (1500 vs 1501) : verify.match, resolvedMontant doc = 1501", async () => {
    const avis1501 = `
Avis de taxe foncière — Année 2024
Net à payer : 1 501,00 EUR
Prélèvement 1 : 750,50
Prélèvement 2 : 750,50
Payé le 12/03/2024
`;
    const result = await verifyTaxeFonciereAgainstSource({
      legacyExpense: legacyExpense(1500),
      fiscalYear: YEAR,
      sourceFile: fileFromText(avis1501),
      extractText,
    });
    assert.equal(result.kind, "match");
    if (result.kind !== "match") return;
    assert.equal(result.resolvedMontant, 1501);
  });

  it("B1 — match tolérance -1 (1500 vs 1499)", async () => {
    const avis1499 = `
Avis de taxe foncière — Année 2024
Net à payer : 1 499,00 EUR
Prélèvement 1 : 749,50
Prélèvement 2 : 749,50
Payé le 12/03/2024
`;
    const result = await verifyTaxeFonciereAgainstSource({
      legacyExpense: legacyExpense(1500),
      fiscalYear: YEAR,
      sourceFile: fileFromText(avis1499),
      extractText,
    });
    assert.equal(result.kind, "match");
  });

  it("B1 — > tolérance (1500 vs 1502) → amount_divergence", async () => {
    const avis1502 = `
Avis de taxe foncière — Année 2024
Net à payer : 1 502,00 EUR
Prélèvement 1 : 751,00
Prélèvement 2 : 751,00
Payé le 12/03/2024
`;
    const result = await verifyTaxeFonciereAgainstSource({
      legacyExpense: legacyExpense(1500),
      fiscalYear: YEAR,
      sourceFile: fileFromText(avis1502),
      extractText,
    });
    assert.equal(result.kind, "amount_divergence");
  });

  it("B2 — sans documentId + File → source_unreadable, pas de candidate synthétique", async () => {
    const result = await verifyTaxeFonciereAgainstSource({
      legacyExpense: legacyExpense(150, { documentId: undefined }),
      fiscalYear: YEAR,
      sourceFile: fileFromText(AVIS_1500_10x150),
      extractText,
    });
    assert.equal(result.kind, "source_unreadable");
    assert.equal("candidate" in result, false);
  });

  it("amount_divergence — legacy 150 vs avis 1500", async () => {
    const result = await verifyTaxeFonciereAgainstSource({
      legacyExpense: legacyExpense(150),
      fiscalYear: YEAR,
      sourceFile: fileFromText(AVIS_1500_10x150),
      extractText,
    });
    assert.equal(result.kind, "amount_divergence");
    if (result.kind !== "amount_divergence") return;
    assert.equal(result.legacyMontant, 150);
    assert.equal(result.resolvedMontant, 1500);
  });

  it("amount_divergence — legacy 1500 vs avis 1600", async () => {
    const result = await verifyTaxeFonciereAgainstSource({
      legacyExpense: legacyExpense(1500),
      fiscalYear: YEAR,
      sourceFile: fileFromText(AVIS_1600),
      extractText,
    });
    assert.equal(result.kind, "amount_divergence");
  });

  it("internal_amount_conflict — avis divergent montant/prélèvements", async () => {
    const result = await verifyTaxeFonciereAgainstSource({
      legacyExpense: legacyExpense(150),
      fiscalYear: YEAR,
      sourceFile: fileFromText(AVIS_DIVERGENT),
      extractText,
    });
    assert.equal(result.kind, "internal_amount_conflict");
    if (result.kind !== "internal_amount_conflict") return;
    assert.ok(result.candidate.montantConflict);
  });

  it("pureté — collected/legacy non mutés", async () => {
    const legacy = legacyExpense(150);
    const collected = { taxeFonciereExpense: legacy };
    const before = JSON.stringify({ legacy, collected });
    await verifyTaxeFonciereAgainstSource({
      legacyExpense: legacy,
      fiscalYear: YEAR,
      sourceFile: fileFromText(AVIS_1500_10x150),
      extractText,
    });
    assert.equal(JSON.stringify({ legacy, collected }), before);
  });
});

describe("apply_taxe_fonciere_integrity_verify — routage #1/#2", () => {
  it("match → marker verified_match, Registry inchangé (Expense A reste)", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const expense = legacyExpense(1500);
    let state = stateWithLegacy(expense);
    const result = await verifyTaxeFonciereAgainstSource({
      legacyExpense: expense,
      fiscalYear: YEAR,
      sourceFile: fileFromText(AVIS_1500_10x150),
      extractText,
    });
    assert.equal(result.kind, "match");
    const turn = await assistant.handle(state, {
      type: "apply_taxe_fonciere_integrity_verify",
      result,
      checkedAt: "2026-09-15T20:00:00.000Z",
    });
    assert.ok(turn.state.taxeFonciereIntegrityCheck);
    assert.equal(turn.state.taxeFonciereIntegrityCheck?.status, "verified_match");
    assert.equal(turn.state.taxeFonciereIntegrityCheck?.resolvedMontant, 1500);
    assert.equal(turn.state.taxeFonciereIntegrityCheck?.persistedMontantAtCheck, 1500);
    assert.equal(turn.state.collected.taxeFonciereExpense?.montant, 1500);
    assert.equal(turn.state.pendingTaxeFonciereExpense, undefined);
    assert.equal(turn.state.pendingTaxeFonciereReplace, undefined);
    assert.equal(
      isTaxeFonciereIntegrityCheckValid({
        check: turn.state.taxeFonciereIntegrityCheck,
        expense: turn.state.collected.taxeFonciereExpense,
        currentCheckVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
      }),
      true,
    );
  });

  it("B1 — match tolérance +1 : Expense reste 1500, marker.resolvedMontant=1500, valide", async () => {
    const avis1501 = `
Avis de taxe foncière — Année 2024
Net à payer : 1 501,00 EUR
Prélèvement 1 : 750,50
Prélèvement 2 : 750,50
Payé le 12/03/2024
`;
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const expense = legacyExpense(1500);
    const result = await verifyTaxeFonciereAgainstSource({
      legacyExpense: expense,
      fiscalYear: YEAR,
      sourceFile: fileFromText(avis1501),
      extractText,
    });
    assert.equal(result.kind, "match");
    if (result.kind === "match") assert.equal(result.resolvedMontant, 1501);
    const turn = await assistant.handle(stateWithLegacy(expense), {
      type: "apply_taxe_fonciere_integrity_verify",
      result,
      checkedAt: "t",
    });
    assert.equal(turn.state.collected.taxeFonciereExpense?.montant, 1500);
    assert.equal(turn.state.taxeFonciereIntegrityCheck?.resolvedMontant, 1500);
    assert.equal(turn.state.taxeFonciereIntegrityCheck?.persistedMontantAtCheck, 1500);
    assert.equal(turn.state.pendingTaxeFonciereReplace, undefined);
    assert.equal(
      isTaxeFonciereIntegrityCheckValid({
        check: turn.state.taxeFonciereIntegrityCheck,
        expense: turn.state.collected.taxeFonciereExpense,
        currentCheckVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
      }),
      true,
    );
  });

  it("B1 — > tolérance → divergence, aucun marker, #2", async () => {
    const avis1502 = `
Avis de taxe foncière — Année 2024
Net à payer : 1 502,00 EUR
Prélèvement 1 : 751,00
Prélèvement 2 : 751,00
Payé le 12/03/2024
`;
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const expense = legacyExpense(1500);
    const result = await verifyTaxeFonciereAgainstSource({
      legacyExpense: expense,
      fiscalYear: YEAR,
      sourceFile: fileFromText(avis1502),
      extractText,
    });
    assert.equal(result.kind, "amount_divergence");
    const turn = await assistant.handle(stateWithLegacy(expense), {
      type: "apply_taxe_fonciere_integrity_verify",
      result,
      checkedAt: "t",
    });
    assert.equal(turn.state.taxeFonciereIntegrityCheck, undefined);
    assert.equal(turn.state.pendingTaxeFonciereReplace?.openedBy, "legacy_integrity");
    assert.equal(turn.state.collected.taxeFonciereExpense?.montant, 1500);
  });

  it("B2 — sans documentId → apply source_unreadable : aucun marker, A inchangée", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const expense = legacyExpense(150, { documentId: undefined });
    const result = await verifyTaxeFonciereAgainstSource({
      legacyExpense: expense,
      fiscalYear: YEAR,
      sourceFile: fileFromText(AVIS_1500_10x150),
      extractText,
    });
    assert.equal(result.kind, "source_unreadable");
    const turn = await assistant.handle(stateWithLegacy(expense), {
      type: "apply_taxe_fonciere_integrity_verify",
      result,
      checkedAt: "t",
    });
    assert.equal(turn.state.taxeFonciereIntegrityCheck, undefined);
    assert.equal(turn.state.taxeFonciereIntegrityAttestationRequired, true);
    assert.equal(turn.state.collected.taxeFonciereExpense?.montant, 150);
    assert.equal(turn.state.pendingTaxeFonciereReplace, undefined);
    assert.equal(turn.state.pendingTaxeFonciereExpense, undefined);
  });

  it("amount_divergence → pendingTaxeFonciereReplace openedBy legacy_integrity ; A reste actif", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const expense = legacyExpense(150);
    let state = stateWithLegacy(expense);
    const result = await verifyTaxeFonciereAgainstSource({
      legacyExpense: expense,
      fiscalYear: YEAR,
      sourceFile: fileFromText(AVIS_1500_10x150),
      extractText,
    });
    assert.equal(result.kind, "amount_divergence");
    const turn = await assistant.handle(state, {
      type: "apply_taxe_fonciere_integrity_verify",
      result,
      checkedAt: "2026-09-15T20:00:00.000Z",
    });
    assert.ok(turn.state.pendingTaxeFonciereReplace);
    assert.equal(turn.state.pendingTaxeFonciereReplace?.openedBy, "legacy_integrity");
    assert.equal(turn.state.pendingTaxeFonciereReplace?.existing.montant, 150);
    assert.equal(turn.state.pendingTaxeFonciereReplace?.candidate.montant, 1500);
    assert.equal(turn.state.collected.taxeFonciereExpense?.montant, 150, "A reste seul actif avant décision");
    assert.equal(turn.state.taxeFonciereIntegrityCheck, undefined);
  });

  it("accept replace legacy_integrity → B actif + marker verified_user_decision", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const expense = legacyExpense(150);
    let state = stateWithLegacy(expense);
    const result = await verifyTaxeFonciereAgainstSource({
      legacyExpense: expense,
      fiscalYear: YEAR,
      sourceFile: fileFromText(AVIS_1500_10x150),
      extractText,
    });
    state = (await assistant.handle(state, {
      type: "apply_taxe_fonciere_integrity_verify",
      result,
      checkedAt: "2026-09-15T20:00:00.000Z",
    })).state;
    const accepted = await assistant.handle(state, { type: "confirm_taxe_fonciere_replace" });
    assert.equal(accepted.state.pendingTaxeFonciereReplace, undefined);
    assert.equal(accepted.state.collected.taxeFonciereExpense?.montant, 1500);
    assert.equal(accepted.state.taxeFonciereIntegrityCheck?.status, "verified_user_decision");
    assert.equal(accepted.state.taxeFonciereIntegrityAttestationRequired, undefined);
    assert.equal(
      isTaxeFonciereIntegrityCheckValid({
        check: accepted.state.taxeFonciereIntegrityCheck,
        expense: accepted.state.collected.taxeFonciereExpense,
        currentCheckVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
      }),
      true,
    );
  });

  it("decline replace legacy_integrity → A conservé, PAS de marker, attestationRequired", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const expense = legacyExpense(150);
    let state = stateWithLegacy(expense);
    const result = await verifyTaxeFonciereAgainstSource({
      legacyExpense: expense,
      fiscalYear: YEAR,
      sourceFile: fileFromText(AVIS_1500_10x150),
      extractText,
    });
    state = (await assistant.handle(state, {
      type: "apply_taxe_fonciere_integrity_verify",
      result,
      checkedAt: "2026-09-15T20:00:00.000Z",
    })).state;
    const declined = await assistant.handle(state, { type: "decline_taxe_fonciere_replace" });
    assert.equal(declined.state.pendingTaxeFonciereReplace, undefined);
    assert.equal(declined.state.collected.taxeFonciereExpense?.montant, 150);
    assert.equal(declined.state.taxeFonciereIntegrityCheck, undefined);
    assert.equal(declined.state.taxeFonciereIntegrityAttestationRequired, true);
  });

  it("internal_amount_conflict → pending #1 + bridge ; puis correct ouvre replace legacy_integrity", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const expense = legacyExpense(150);
    let state = stateWithLegacy(expense);
    const result = await verifyTaxeFonciereAgainstSource({
      legacyExpense: expense,
      fiscalYear: YEAR,
      sourceFile: fileFromText(AVIS_DIVERGENT),
      extractText,
    });
    assert.equal(result.kind, "internal_amount_conflict");
    state = (await assistant.handle(state, {
      type: "apply_taxe_fonciere_integrity_verify",
      result,
      checkedAt: "2026-09-15T20:00:00.000Z",
    })).state;
    assert.ok(state.pendingTaxeFonciereExpense?.montantConflict);
    assert.equal(state.taxeFonciereIntegrityBlocker1Bridge, true);
    assert.equal(state.pendingTaxeFonciereReplace, undefined);
    assert.equal(state.collected.taxeFonciereExpense?.montant, 150);

    const afterCorrect = await assistant.handle(state, {
      type: "correct_taxe_fonciere_expense",
      montant: 1500,
    });
    assert.equal(afterCorrect.state.pendingTaxeFonciereExpense, undefined);
    assert.ok(afterCorrect.state.pendingTaxeFonciereReplace);
    assert.equal(afterCorrect.state.pendingTaxeFonciereReplace?.openedBy, "legacy_integrity");
    assert.equal(afterCorrect.state.pendingTaxeFonciereReplace?.candidate.montant, 1500);
    assert.equal(afterCorrect.state.collected.taxeFonciereExpense?.montant, 150);
    assert.equal(afterCorrect.state.taxeFonciereIntegrityBlocker1Bridge, undefined);
  });

  it("source_missing → attestationRequired, pas de pending #1/#2", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const expense = legacyExpense(150);
    const state = stateWithLegacy(expense);
    const result = await verifyTaxeFonciereAgainstSource({
      legacyExpense: expense,
      fiscalYear: YEAR,
      sourceFile: null,
      extractText,
    });
    const turn = await assistant.handle(state, {
      type: "apply_taxe_fonciere_integrity_verify",
      result,
      checkedAt: "2026-09-15T20:00:00.000Z",
    });
    assert.equal(turn.state.taxeFonciereIntegrityAttestationRequired, true);
    assert.equal(turn.state.pendingTaxeFonciereExpense, undefined);
    assert.equal(turn.state.pendingTaxeFonciereReplace, undefined);
    assert.equal(turn.state.collected.taxeFonciereExpense?.montant, 150);
  });

  it("exclusion mutuelle — pending replace déjà ouvert → apply no-op", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const expense = legacyExpense(150);
    const state: F012State = {
      ...stateWithLegacy(expense),
      pendingTaxeFonciereReplace: {
        existing: expense,
        candidate: { ...expense, id: "expense-doc-doc-B-taxe-annuelle", documentId: "doc-B", montant: 1600 },
        openedBy: "user_document",
      },
    };
    const result = await verifyTaxeFonciereAgainstSource({
      legacyExpense: expense,
      fiscalYear: YEAR,
      sourceFile: fileFromText(AVIS_1500_10x150),
      extractText,
    });
    const turn = await assistant.handle(state, {
      type: "apply_taxe_fonciere_integrity_verify",
      result,
      checkedAt: "2026-09-15T20:00:00.000Z",
    });
    assert.equal(turn.state.pendingTaxeFonciereReplace?.openedBy, "user_document");
    assert.equal(turn.state.taxeFonciereIntegrityCheck, undefined);
    assert.deepEqual(turn.state.pendingTaxeFonciereReplace, state.pendingTaxeFonciereReplace);
  });

  it("decline Blocker #2 nominal (sans openedBy) → PAS d'attestationRequired", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const expense = legacyExpense(1500, {
      id: deriveExpenseIdFromDocument("doc-A", "taxe-annuelle"),
      documentId: "doc-A",
    });
    const state: F012State = {
      ...stateWithLegacy(expense),
      pendingTaxeFonciereReplace: {
        existing: expense,
        candidate: {
          ...expense,
          id: deriveExpenseIdFromDocument("doc-B", "taxe-annuelle"),
          documentId: "doc-B",
          montant: 1600,
        },
      },
    };
    const declined = await assistant.handle(state, { type: "decline_taxe_fonciere_replace" });
    assert.equal(declined.state.collected.taxeFonciereExpense?.montant, 1500);
    assert.equal(declined.state.taxeFonciereIntegrityAttestationRequired, undefined);
  });

  it("B3 — ignore pendant #1 legacy_integrity : A exacte, bridge clear, attestation, risk exposed", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const expense = legacyExpense(150);
    const Ajson = JSON.stringify(expense);
    const result = await verifyTaxeFonciereAgainstSource({
      legacyExpense: expense,
      fiscalYear: YEAR,
      sourceFile: fileFromText(AVIS_DIVERGENT),
      extractText,
    });
    assert.equal(result.kind, "internal_amount_conflict");
    let state = (
      await assistant.handle(stateWithLegacy(expense), {
        type: "apply_taxe_fonciere_integrity_verify",
        result,
        checkedAt: "t",
      })
    ).state;
    assert.equal(state.collected.taxeFonciereExpense?.montant, 150);
    assert.ok(state.pendingTaxeFonciereExpense);
    assert.equal(state.taxeFonciereIntegrityBlocker1Bridge, true);

    const ignored = await assistant.handle(state, { type: "ignore_taxe_fonciere_expense" });
    assert.equal(JSON.stringify(ignored.state.collected.taxeFonciereExpense), Ajson);
    assert.equal(ignored.state.pendingTaxeFonciereExpense, undefined);
    assert.equal(ignored.state.pendingTaxeFonciereReplace, undefined);
    assert.equal(ignored.state.taxeFonciereIntegrityCheck, undefined);
    assert.equal(ignored.state.taxeFonciereIntegrityBlocker1Bridge, undefined);
    assert.equal(ignored.state.taxeFonciereIntegrityAttestationRequired, true);
    assert.equal(
      detectTaxeFonciereLegacyRisk({ collected: ignored.state.collected }).kind,
      "certainly_exposed",
    );

    const pers = toF012PersistedState(ignored.state, "now");
    const resumed = await assistant.resume(pers);
    assert.equal(JSON.stringify(resumed.state.collected.taxeFonciereExpense), Ajson);
    assert.equal(resumed.state.taxeFonciereIntegrityAttestationRequired, true);
    assert.equal(resumed.state.taxeFonciereIntegrityBlocker1Bridge, undefined);
    assert.equal(
      detectTaxeFonciereLegacyRisk({ collected: resumed.state.collected }).kind,
      "certainly_exposed",
    );
  });

  it("B3 — ignore nominal (hors bridge) inchangé : nouveau doc ≠ A → A conservée", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const expense = legacyExpense(1500, {
      id: deriveExpenseIdFromDocument("doc-A", "taxe-annuelle"),
      documentId: "doc-A",
    });
    const pendingB = {
      ...expense,
      id: deriveExpenseIdFromDocument("doc-B", "taxe-annuelle"),
      documentId: "doc-B",
      montant: 1600,
      decision: "pending" as const,
      montantExtrait: 1600,
    };
    const before = JSON.stringify(expense);
    const state: F012State = {
      ...stateWithLegacy(expense),
      pendingTaxeFonciereExpense: pendingB,
    };
    const ignored = await assistant.handle(state, { type: "ignore_taxe_fonciere_expense" });
    assert.equal(JSON.stringify(ignored.state.collected.taxeFonciereExpense), before);
    assert.equal(ignored.state.pendingTaxeFonciereExpense, undefined);
    assert.equal(ignored.state.taxeFonciereIntegrityAttestationRequired, undefined);
    assert.equal(ignored.state.taxeFonciereIntegrityBlocker1Bridge, undefined);
  });

  it("B3 — après ignore bridge, nouveau #2 nominal n'est PAS legacy_integrity", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const expense = legacyExpense(150);
    const result = await verifyTaxeFonciereAgainstSource({
      legacyExpense: expense,
      fiscalYear: YEAR,
      sourceFile: fileFromText(AVIS_DIVERGENT),
      extractText,
    });
    let state = (
      await assistant.handle(stateWithLegacy(expense), {
        type: "apply_taxe_fonciere_integrity_verify",
        result,
        checkedAt: "t",
      })
    ).state;
    state = (await assistant.handle(state, { type: "ignore_taxe_fonciere_expense" })).state;
    assert.equal(state.taxeFonciereIntegrityBlocker1Bridge, undefined);

    const pendingB = {
      id: deriveExpenseIdFromDocument("doc-B", "taxe-annuelle"),
      exerciceFiscal: YEAR,
      montant: 1600,
      description: "Taxe foncière",
      origin: "document" as const,
      documentId: "doc-B",
      fieldSources: { montant: "extracted" as const },
      category: "taxe_fonciere" as const,
      decision: "pending" as const,
      montantExtrait: 1600,
    };
    state = { ...state, pendingTaxeFonciereExpense: pendingB };
    const after = await assistant.handle(state, { type: "confirm_taxe_fonciere_expense" });
    assert.ok(after.state.pendingTaxeFonciereReplace);
    assert.equal(after.state.pendingTaxeFonciereReplace?.openedBy, undefined);
    assert.equal(after.state.taxeFonciereIntegrityBlocker1Bridge, undefined);
  });
});

describe("buildTaxeFonciereVerifiedMatchCheck — helper Lot B", () => {
  it("refuse sans documentId", () => {
    const check = buildTaxeFonciereVerifiedMatchCheck({
      legacyExpense: legacyExpense(1500, { documentId: undefined }),
      checkedAt: "t",
    });
    assert.equal(check, undefined);
  });

  it("resolvedMontant = A.montant (pas un montant documentaire distinct)", () => {
    const check = buildTaxeFonciereVerifiedMatchCheck({
      legacyExpense: legacyExpense(1500),
      checkedAt: "t",
    });
    assert.equal(check?.resolvedMontant, 1500);
    assert.equal(check?.persistedMontantAtCheck, 1500);
    assert.equal(check?.againstDocumentId, "doc-X");
  });
});
