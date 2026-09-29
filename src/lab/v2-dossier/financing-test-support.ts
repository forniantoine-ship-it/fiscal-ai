/**
 * Test support (not a test): builds REAL persisted financing data by driving the real F011 assistant and the real
 * builders (`buildFinancementCharges`, `buildCreditFinancingLoanFromF011`) — never hand-written provenance.
 */
import { F011FinancementAssistant } from "@/runtime/assistants/f011-financement/assistant";
import type { F011State } from "@/runtime/assistants/f011-financement/types";
import { mapCreditExtractionToF011Prefill } from "@/lib/lmnp/services/f011/credit-bridge";
import { buildCreditFinancingLoanFromF011, buildFinancementCharges } from "@/lib/lmnp/services/f011/f011-build-financement-charges";
import { documentaryInstallmentsForCreditFinancing } from "@/lib/lmnp/services/f011/f011-documentary-installments";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { DeclarationDraft, LmnpDocument } from "@/lib/lmnp/types";

export const TEST_YEAR = 2026;
const ctx = { dossierId: "test", fiscalYear: TEST_YEAR, route: "/assistants/financement" };
const TS = "2026-07-01T09:00:00.000Z";

export const newAssistant = () => new F011FinancementAssistant(ctx, { dateMiseEnService: "2025-06-01" });

export function documentPrefill(documentId: string, extraction: Parameters<typeof mapCreditExtractionToF011Prefill>[0]) {
  return mapCreditExtractionToF011Prefill(extraction, documentId, TS);
}

export const FULL_DOCUMENT = {
  amortization: { loanAmount: 120000, loanDurationMonths: 240, firstPaymentDate: "2025-08-05", yearlyInsuranceTotal: 240 },
  loanOffer: { loanType: "Prêt amortissable", interestRate: 2, applicationFees: 500 },
};

export async function startLoans(a: F011FinancementAssistant, count: number): Promise<F011State> {
  let turn = await a.handle(a.start().state, { type: "set_presence_emprunt", presence: true });
  turn = await a.handle(turn.state, { type: "set_nombre_prets", count });
  return turn.state;
}

/** Imports one document then walks the loan to confirmation (fees re-affirmed as extracted). */
export async function confirmLoanFromDocument(a: F011FinancementAssistant, state: F011State, documentId: string, extraction = FULL_DOCUMENT): Promise<F011State> {
  let turn = await a.handle(state, { type: "choose_loan_source", source: "document" });
  turn = await a.handle(turn.state, { type: "upload_document", documentId });
  turn = await a.handle(turn.state, { type: "analysis_success", documentId, prefill: documentPrefill(documentId, extraction) });
  turn = await a.handle(turn.state, { type: "confirm_extraction" });
  turn = await a.handle(turn.state, { type: "set_insurance", assuranceType: "bancaire" });
  turn = await a.handle(turn.state, { type: "set_guarantee", typeGarantie: "aucune" });
  turn = await a.handle(turn.state, { type: "set_fees", souscritCetExercice: true, fraisDossier: 500 });
  turn = await a.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
  turn = await a.handle(turn.state, { type: "confirm_loan" });
  return turn.state;
}

/** Fully manual loan: every field 'Saisi', no document. */
export async function confirmManualLoan(a: F011FinancementAssistant, state: F011State, terms: { capital: number; taux: number; date: string }): Promise<F011State> {
  let turn = await a.handle(state, { type: "choose_loan_source", source: "manual" });
  turn = await a.handle(turn.state, { type: "set_loan_type", typePret: "in_fine" });
  turn = await a.handle(turn.state, { type: "submit_loan_terms", capitalInitial: terms.capital, tauxNominal: terms.taux, dureeMois: 120, datePremiereMensualite: terms.date });
  turn = await a.handle(turn.state, { type: "set_insurance", assuranceType: "externe", assuranceAnnuelle: 300 });
  turn = await a.handle(turn.state, { type: "set_guarantee", typeGarantie: "aucune" });
  turn = await a.handle(turn.state, { type: "set_fees", souscritCetExercice: false });
  turn = await a.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
  turn = await a.handle(turn.state, { type: "confirm_loan" });
  return turn.state;
}

/** Capital imported from a document then corrected by the user: 'Corrigé', original document kept. */
export async function confirmCorrectedLoan(a: F011FinancementAssistant, state: F011State, documentId: string): Promise<F011State> {
  const partial = documentPrefill(documentId, { amortization: { loanAmount: 80000 } });
  let turn = await a.handle(state, { type: "choose_loan_source", source: "document" });
  turn = await a.handle(turn.state, { type: "upload_document", documentId });
  turn = await a.handle(turn.state, { type: "analysis_success", documentId, prefill: partial });
  turn = await a.handle(turn.state, { type: "confirm_extraction" });
  turn = await a.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
  turn = await a.handle(turn.state, { type: "submit_loan_terms", capitalInitial: 75000, tauxNominal: 0.03, dureeMois: 200, datePremiereMensualite: "2025-09-01" });
  turn = await a.handle(turn.state, { type: "set_insurance", assuranceType: "externe", assuranceAnnuelle: 120 });
  turn = await a.handle(turn.state, { type: "set_guarantee", typeGarantie: "aucune" });
  turn = await a.handle(turn.state, { type: "set_fees", souscritCetExercice: false });
  turn = await a.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
  turn = await a.handle(turn.state, { type: "confirm_loan" });
  return turn.state;
}

export function documentRow(id: string, fileName: string, status: LmnpDocument["status"] = "analyzed"): LmnpDocument {
  return {
    id, fiscalYearId: "fy-2026", fiscalYear: TEST_YEAR, fileName, mimeType: "application/pdf", sizeBytes: 100,
    category: "autre", documentType: "unknown", status, uploadedAt: "2026-02-01",
  };
}

/** Real persisted workspace from a confirmed F011 state (the same builders as the panel's `persistCompletion`). */
export function workspaceFromState(state: F011State, documents: LmnpDocument[] = [], overrides: Partial<DeclarationDraft> = {}): PersistedWorkspace {
  const result = state.result;
  if (!result) throw new Error("state has no result: the last loan must be confirmed");
  const financementCharges = buildFinancementCharges(result.charges, state.fieldSources, TS);
  const draft: DeclarationDraft = {
    completedSteps: [],
    financementCharges,
    creditConfirmedAt: TS,
    creditFinancing: {
      loans: state.loans.map((loan, index) => buildCreditFinancingLoanFromF011(loan, index, result.charges.prets[index]?.capitalRestantDu31_12 ?? 0)),
      summary: { fiscalYearLabel: String(TEST_YEAR), annualInterest: result.charges.totalInteretsEmprunt, annualInsurance: result.charges.totalAssurance, remainingCapital: 0 },
      installments: documentaryInstallmentsForCreditFinancing(state.loans),
    },
    ...overrides,
  };
  return {
    fiscalYear: { id: "fy-2026", dossierId: "dossier-1", year: TEST_YEAR, status: "draft", regime: "reel", propertyIds: ["home-1"], createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    properties: [{ id: "home-1", label: "Logement", address: "1 rue X", city: "Lyon", postalCode: "69001" }],
    documents, extractions: [], validationItems: [], ledgerEntries: [], declarationDraft: draft,
  };
}
