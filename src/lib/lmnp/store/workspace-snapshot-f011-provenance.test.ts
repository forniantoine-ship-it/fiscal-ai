/**
 * F-011 — la provenance par prêt survit au chemin réel de sauvegarde / rechargement, sans migration Supabase :
 * assistant réel → `toF011PersistedState` + `buildCreditFinancingLoanFromF011` → `CONFIRM_CREDIT_FINANCING`
 * → `serializeWorkspaceSnapshot` → JSON (= colonne `payload jsonb`) → `parseWorkspaceSnapshot` → `HYDRATE` → `resume`.
 *
 * Run: npx tsx --test src/lib/lmnp/store/workspace-snapshot-f011-provenance.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F011FinancementAssistant } from "@/runtime/assistants/f011-financement/assistant";
import { toF011PersistedState, type F011State } from "@/runtime/assistants/f011-financement/types";
import { mapCreditExtractionToF011Prefill } from "@/lib/lmnp/services/f011/credit-bridge";
import { buildCreditFinancingLoanFromF011 } from "@/lib/lmnp/services/f011/f011-build-financement-charges";
import type { DeclarationDraft } from "@/lib/lmnp/types";
import type { PersistedWorkspace } from "./persistence";
import { parseWorkspaceSnapshot, serializeWorkspaceSnapshot, toPersistedWorkspace } from "./workspace-snapshot";

const ctx = { dossierId: "test", fiscalYear: 2022, route: "/assistants/financement" };
const TS = "2024-07-01T09:00:00.000Z";

async function confirmedLoanState(): Promise<F011State> {
  const a = new F011FinancementAssistant(ctx, { dateMiseEnService: "2021-01-01" });
  let turn = await a.handle(a.start().state, { type: "set_presence_emprunt", presence: true });
  turn = await a.handle(turn.state, { type: "set_nombre_prets", count: 1 });
  turn = await a.handle(turn.state, { type: "choose_loan_source", source: "document" });
  turn = await a.handle(turn.state, { type: "upload_document", documentId: "doc-1" });
  const prefill = mapCreditExtractionToF011Prefill(
    {
      amortization: { loanAmount: 120000, loanDurationMonths: 240, firstPaymentDate: "2022-01-01", yearlyInsuranceTotal: 240 },
      loanOffer: { loanType: "Prêt amortissable", interestRate: 2, applicationFees: 500 },
    },
    "doc-1",
    TS,
  );
  turn = await a.handle(turn.state, { type: "analysis_success", documentId: "doc-1", prefill });
  turn = await a.handle(turn.state, { type: "confirm_extraction" });
  turn = await a.handle(turn.state, { type: "set_insurance", assuranceType: "bancaire" });
  turn = await a.handle(turn.state, { type: "set_guarantee", typeGarantie: "aucune" });
  turn = await a.handle(turn.state, { type: "set_fees", souscritCetExercice: true, fraisDossier: 500 });
  turn = await a.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
  turn = await a.handle(turn.state, { type: "confirm_loan" });
  return turn.state;
}

function workspaceWith(draft: DeclarationDraft): PersistedWorkspace {
  return {
    fiscalYear: { id: "fy-2022", year: 2022, status: "draft", regime: "reel", propertyIds: ["p1"], createdAt: "2022-01-01", updatedAt: "2022-01-01" },
    properties: [{ id: "p1", label: "Bien", address: "1 rue X", city: "Lyon", postalCode: "69001" }],
    documents: [], extractions: [], validationItems: [], ledgerEntries: [],
    declarationDraft: draft,
  };
}

async function loadReducer() {
  // reducer.ts importe transitivement @/lib/supabase.ts (client construit au chargement) — même pattern que les autres tests reducer.
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.invalid.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const mod = await import("@/lib/lmnp/store/reducer");
  const persistence = await import("@/lib/lmnp/store/persistence");
  return { lmnpReducer: mod.lmnpReducer, createDefaultWorkspace: persistence.createDefaultWorkspace };
}

describe("F-011 provenance — sauvegarde / rechargement sans migration", () => {
  it("assistant → CONFIRM_CREDIT_FINANCING → snapshot JSON → parse → HYDRATE → resume : provenance intacte partout", async () => {
    const final = await confirmedLoanState();
    const loan = final.loans[0]!;
    assert.ok(loan.provenance, "précondition : provenance figée à confirm_loan");
    const profile = buildCreditFinancingLoanFromF011(loan, 0, 100000);
    assert.deepEqual(profile.provenance, loan.provenance, "F011LoanDraft.provenance → LoanProfile.provenance : transport pur");

    const { lmnpReducer, createDefaultWorkspace } = await loadReducer();
    const base = { ...createDefaultWorkspace(), fileRegistry: new Map() };
    const financing = {
      loans: [profile],
      summary: { fiscalYearLabel: "2022", annualInterest: 0, annualInsurance: 0, remainingCapital: 0 },
      installments: [],
    };
    const confirmed = lmnpReducer(base as never, { type: "CONFIRM_CREDIT_FINANCING", financing } as never);
    assert.deepEqual(confirmed.declarationDraft?.creditFinancing?.loans[0]?.provenance, loan.provenance, "le reducer conserve la provenance du prêt");

    const draft: DeclarationDraft = {
      ...(confirmed.declarationDraft as DeclarationDraft),
      financementAssistantState: toF011PersistedState(final, TS),
    };
    const serialized = serializeWorkspaceSnapshot(toPersistedWorkspace({ ...workspaceWith(draft), declarationDraft: draft }));
    assert.equal(serialized.ok, true);
    const jsonb = JSON.parse(JSON.stringify(serialized.ok ? serialized.envelope : null)); // ce qu'envoie / renvoie la colonne jsonb
    const parsed = parseWorkspaceSnapshot(jsonb);
    assert.equal(parsed.ok, true);
    const reloaded = parsed.ok ? parsed.envelope.workspace : null;
    assert.deepEqual(reloaded?.declarationDraft?.creditFinancing?.loans[0]?.provenance, loan.provenance);
    assert.deepEqual(reloaded?.declarationDraft?.financementAssistantState?.loans[0]?.provenance, loan.provenance);
    assert.deepEqual(reloaded?.declarationDraft?.financementAssistantState?.fieldDocumentIds, final.fieldDocumentIds);

    const hydrated = lmnpReducer(base as never, { type: "HYDRATE", payload: reloaded } as never);
    assert.deepEqual(hydrated.declarationDraft?.creditFinancing?.loans[0]?.provenance, loan.provenance);

    const a = new F011FinancementAssistant(ctx, { dateMiseEnService: "2021-01-01" });
    const resumed = a.resume(hydrated.declarationDraft!.financementAssistantState!).state;
    assert.deepEqual(resumed.loans[0]?.provenance, loan.provenance);
    assert.deepEqual(resumed.fieldDocumentIds, final.fieldDocumentIds);
  });

  it("dossier antérieur (prêts sans provenance) : snapshot valide, rechargement identique, rien n'est ajouté", async () => {
    const final = await confirmedLoanState();
    const legacyLoan = { ...final.loans[0]! };
    delete legacyLoan.provenance;
    const profile = buildCreditFinancingLoanFromF011(legacyLoan, 0, 100000);
    assert.equal("provenance" in profile, false, "aucune clé provenance fabriquée");

    const draft: DeclarationDraft = {
      completedSteps: [],
      creditFinancing: { loans: [profile], summary: { fiscalYearLabel: "2022", annualInterest: 0, annualInsurance: 0, remainingCapital: 0 }, installments: [] },
    };
    const serialized = serializeWorkspaceSnapshot(workspaceWith(draft));
    assert.equal(serialized.ok, true);
    const parsed = parseWorkspaceSnapshot(JSON.parse(JSON.stringify(serialized.ok ? serialized.envelope : null)));
    assert.equal(parsed.ok, true);
    // JSON (jsonb) supprime les clés `undefined` : la référence est la version normalisée par JSON, jamais l'objet mémoire.
    assert.deepEqual(parsed.ok ? parsed.envelope.workspace.declarationDraft?.creditFinancing : null, JSON.parse(JSON.stringify(draft.creditFinancing)));
  });

  it("la sérialisation reste fail-closed : un nombre non fini dans la provenance refuse la sauvegarde", async () => {
    const final = await confirmedLoanState();
    const profile = buildCreditFinancingLoanFromF011(final.loans[0]!, 0, 1);
    const bad = { ...profile, provenance: { capitalInitial: { source: "manual", n: Number.NaN } } } as unknown as typeof profile;
    const draft: DeclarationDraft = {
      completedSteps: [],
      creditFinancing: { loans: [bad], summary: { fiscalYearLabel: "2022", annualInterest: 0, annualInsurance: 0, remainingCapital: 0 }, installments: [] },
    };
    assert.equal(serializeWorkspaceSnapshot(workspaceWith(draft)).ok, false);
  });
});
