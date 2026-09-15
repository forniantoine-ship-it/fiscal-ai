/**
 * Blocker #3 — Lot C : statut, attestation, gate génération, resume.
 *
 * Run: npx tsx --test "src/runtime/assistants/f012-charges/taxe-fonciere-legacy-integrity-lot-c.test.ts"
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { deriveExpenseIdFromDocument, type Expense } from "../../capabilities/f012/expense";
import { F012ChargesAssistant } from "./assistant";
import {
  TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
  buildTaxeFonciereUserAttestedCheck,
  buildTaxeFonciereVerifiedMatchCheck,
  detectTaxeFonciereLegacyRisk,
  isTaxeFonciereIntegrityCheckValid,
  resolveTaxeFonciereIntegrityStatus,
} from "./taxe-fonciere-legacy-integrity";
import type { F012Deps, F012State } from "./types";
import { createInitialF012State, toF012PersistedState } from "./types";
import { resolveF012ResumeDecision } from "@/lib/lmnp/services/f012/f012-resume";
import {
  TAXE_FONCIERE_LEGACY_INTEGRITY_UNRESOLVED,
  runDeclarationGeneration,
} from "@/lib/lmnp/services/declaration/run-declaration-generation";
import type { DeclarationDraft } from "@/lib/lmnp/types/domain";

const YEAR = 2024;
const ctx = { dossierId: "test", fiscalYear: YEAR, route: "/assistants/charges" };
const DEPS: F012Deps = { dateMiseEnService: "2023-01-01" };
const TS = "2024-06-01T12:00:00.000Z";

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

function stateWithLegacy(expense: Expense, overrides: Partial<F012State> = {}): F012State {
  return {
    ...createInitialF012State(),
    step: "complete",
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
    ...overrides,
  };
}

function draftWithChargesState(state: F012State): DeclarationDraft {
  const chargesAssistantState = toF012PersistedState(state, TS);
  return {
    completedSteps: [],
    siret: "12345678901234",
    siren: "123456789",
    exploitantFirstName: "Marie",
    exploitantLastName: "Dupont",
    dateMiseEnService: "2020-01-01",
    revenusAssistant: { exerciceFiscal: YEAR, totalRecettes: 12000 },
    chargesAssistant: {
      exerciceFiscal: YEAR,
      totalDeductible: expenseMontant(state),
      totalPreExploitation: 0,
    },
    amortissementAssistant: { exerciceFiscal: YEAR, totalDotations: 1000, status: "validated" },
    chargesAssistantState,
  } as unknown as DeclarationDraft;
}

function expenseMontant(state: F012State): number {
  return state.collected.taxeFonciereExpense?.montant ?? 0;
}

describe("resolveTaxeFonciereIntegrityStatus — Lot C", () => {
  it("none si id moderne", () => {
    const expense = legacyExpense(1500, {
      id: deriveExpenseIdFromDocument("doc-X", "taxe-annuelle"),
    });
    const status = resolveTaxeFonciereIntegrityStatus({
      collected: { ...stateWithLegacy(expense).collected },
      check: undefined,
    });
    assert.equal(status.kind, "none");
  });

  it("unresolved si certainly_exposed sans marker", () => {
    const expense = legacyExpense(150);
    const status = resolveTaxeFonciereIntegrityStatus({
      collected: stateWithLegacy(expense).collected,
      check: undefined,
    });
    assert.equal(status.kind, "unresolved");
    if (status.kind !== "unresolved") return;
    assert.equal(status.expense.montant, 150);
    assert.equal(status.attestationRequired, false);
  });

  it("unresolved + attestationRequired flag", () => {
    const expense = legacyExpense(150);
    const status = resolveTaxeFonciereIntegrityStatus({
      collected: stateWithLegacy(expense).collected,
      check: undefined,
      attestationRequired: true,
    });
    assert.equal(status.kind, "unresolved");
    if (status.kind !== "unresolved") return;
    assert.equal(status.attestationRequired, true);
  });

  it("resolved si marker valid", () => {
    const expense = legacyExpense(150);
    const check = buildTaxeFonciereVerifiedMatchCheck({
      legacyExpense: expense,
      checkedAt: TS,
    });
    assert.ok(check);
    const status = resolveTaxeFonciereIntegrityStatus({
      collected: stateWithLegacy(expense).collected,
      check,
    });
    assert.equal(status.kind, "resolved");
  });

  it("unresolved si montant divergé du marker", () => {
    const expense = legacyExpense(150);
    const check = buildTaxeFonciereVerifiedMatchCheck({
      legacyExpense: expense,
      checkedAt: TS,
    });
    const mutated = { ...expense, montant: 200, decision: "modified" as const };
    const status = resolveTaxeFonciereIntegrityStatus({
      collected: stateWithLegacy(mutated).collected,
      check,
    });
    assert.equal(status.kind, "unresolved");
  });
});

describe("attest_taxe_fonciere_annual_amount — Lot C", () => {
  it("I — attestation manuelle → marker user_attested_no_document + Expense modified", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const expense = legacyExpense(150);
    const turn = await assistant.handle(stateWithLegacy(expense), {
      type: "attest_taxe_fonciere_annual_amount",
      amount: 1500,
      checkedAt: TS,
    });
    assert.equal(turn.state.taxeFonciereIntegrityCheck?.status, "user_attested_no_document");
    assert.equal(turn.state.taxeFonciereIntegrityCheck?.resolvedMontant, 1500);
    assert.equal(turn.state.taxeFonciereIntegrityCheck?.againstDocumentId, undefined);
    assert.equal(turn.state.collected.taxeFonciereExpense?.montant, 1500);
    assert.equal(turn.state.collected.taxeFonciereExpense?.decision, "modified");
    assert.equal(turn.state.collected.taxeFonciereExpense?.fieldSources.montant, "manual");
    assert.equal(turn.state.taxeFonciereIntegrityAttestationRequired, undefined);
    assert.equal(turn.state.step, "complete");
    assert.ok(
      isTaxeFonciereIntegrityCheckValid({
        check: turn.state.taxeFonciereIntegrityCheck,
        expense: turn.state.collected.taxeFonciereExpense,
        currentCheckVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
      }),
    );
  });

  it("refuse montant ≤ 0", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const turn = await assistant.handle(stateWithLegacy(legacyExpense(150)), {
      type: "attest_taxe_fonciere_annual_amount",
      amount: 0,
      checkedAt: TS,
    });
    assert.equal(turn.state.taxeFonciereIntegrityCheck, undefined);
    assert.equal(turn.state.collected.taxeFonciereExpense?.montant, 150);
  });

  it("buildTaxeFonciereUserAttestedCheck — pas d'againstDocumentId", () => {
    const check = buildTaxeFonciereUserAttestedCheck({
      legacyExpense: legacyExpense(150),
      resolvedMontant: 1500,
      checkedAt: TS,
    });
    assert.ok(check);
    assert.equal(check?.status, "user_attested_no_document");
    assert.equal(check?.againstDocumentId, undefined);
    assert.equal(check?.persistedMontantAtCheck, 150);
    assert.equal(check?.resolvedMontant, 1500);
  });
});

describe("resolveF012ResumeDecision — integrity_verification_required", () => {
  it("K — resume_complete + legacy unresolved → integrity_verification_required", () => {
    const state = stateWithLegacy(legacyExpense(150), { step: "complete" });
    const persisted = toF012PersistedState(state, TS);
    const decision = resolveF012ResumeDecision({
      persisted,
      isLegacyComplete: true,
    });
    assert.deepEqual(decision, {
      kind: "integrity_verification_required",
      underlying: "resume_complete",
    });
  });

  it("L — resume_complete + verified_match → resume_complete (pas de re-prompt)", () => {
    const expense = legacyExpense(150);
    const check = buildTaxeFonciereVerifiedMatchCheck({
      legacyExpense: expense,
      checkedAt: TS,
    });
    const state = stateWithLegacy(expense, {
      step: "complete",
      taxeFonciereIntegrityCheck: check,
    });
    const decision = resolveF012ResumeDecision({
      persisted: toF012PersistedState(state, TS),
      isLegacyComplete: true,
    });
    assert.deepEqual(decision, { kind: "resume_complete" });
  });

  it("legacy_complete sans state persisté → pas de détection inventée", () => {
    const decision = resolveF012ResumeDecision({
      persisted: undefined,
      isLegacyComplete: true,
    });
    assert.deepEqual(decision, { kind: "legacy_complete" });
  });

  it("risk certainly_exposed sur persisted", () => {
    const persisted = toF012PersistedState(stateWithLegacy(legacyExpense(150)), TS);
    assert.equal(
      detectTaxeFonciereLegacyRisk({ collected: persisted.collected }).kind,
      "certainly_exposed",
    );
  });
});

describe("runDeclarationGeneration — gate Blocker #3", () => {
  it("R — unresolved → blocked + TAXE_FONCIERE_LEGACY_INTEGRITY_UNRESOLVED", () => {
    const draft = draftWithChargesState(stateWithLegacy(legacyExpense(150)));
    const generation = runDeclarationGeneration(draft, YEAR);
    assert.equal(generation.status, "blocked");
    if (generation.status !== "blocked") return;
    assert.ok(
      generation.anomalies.some(
        (a) =>
          a.severity === "error" &&
          a.field === "chargesAssistant" &&
          a.message === TAXE_FONCIERE_LEGACY_INTEGRITY_UNRESOLVED,
      ),
    );
  });

  it("H — source missing / attestation requise sans marker → toujours blocked", () => {
    const draft = draftWithChargesState(
      stateWithLegacy(legacyExpense(150), {
        taxeFonciereIntegrityAttestationRequired: true,
      }),
    );
    const generation = runDeclarationGeneration(draft, YEAR);
    assert.equal(generation.status, "blocked");
  });

  it("I/S — après attestation → generated", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const turn = await assistant.handle(stateWithLegacy(legacyExpense(150)), {
      type: "attest_taxe_fonciere_annual_amount",
      amount: 1500,
      checkedAt: TS,
    });
    const draft = draftWithChargesState(turn.state);
    const generation = runDeclarationGeneration(draft, YEAR);
    assert.equal(generation.status, "generated");
  });

  it("S — après verified_match → generated", () => {
    const expense = legacyExpense(1500);
    const check = buildTaxeFonciereVerifiedMatchCheck({
      legacyExpense: expense,
      checkedAt: TS,
    });
    const draft = draftWithChargesState(
      stateWithLegacy(expense, { taxeFonciereIntegrityCheck: check }),
    );
    const generation = runDeclarationGeneration(draft, YEAR);
    assert.equal(generation.status, "generated");
  });

  it("pas de blocage si chargesAssistantState absent (limite V1)", () => {
    const draft = {
      completedSteps: [],
      siret: "12345678901234",
      siren: "123456789",
      exploitantFirstName: "Marie",
      exploitantLastName: "Dupont",
      dateMiseEnService: "2020-01-01",
      revenusAssistant: { exerciceFiscal: YEAR, totalRecettes: 12000 },
      chargesAssistant: { exerciceFiscal: YEAR, totalDeductible: 150, totalPreExploitation: 0 },
      amortissementAssistant: { exerciceFiscal: YEAR, totalDotations: 1000, status: "validated" },
    } as unknown as DeclarationDraft;
    const generation = runDeclarationGeneration(draft, YEAR);
    assert.equal(generation.status, "generated");
  });
});
