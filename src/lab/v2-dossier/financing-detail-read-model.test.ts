/**
 * R15 — read model Financement structuré : transport des données persistées, par prêt.
 * Les workspaces sont construits par l'assistant F011 réel et les builders réels (financing-test-support).
 *
 * Run: npx tsx --test src/lab/v2-dossier/financing-detail-read-model.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { LoanInstallment } from "@/lib/lmnp/types";
import { buildV3FinancingDetail } from "./financing-detail-read-model";
import {
  TEST_YEAR, confirmCorrectedLoan, confirmLoanFromDocument, confirmManualLoan, documentRow, newAssistant, startLoans, workspaceFromState,
} from "./financing-test-support";

const fact = (detail: ReturnType<typeof buildV3FinancingDetail>, loan: number, id: string) => detail.loans[loan]!.facts.find(item => item.id === id);
/** `Intl` (fr-FR) sépare les milliers par une espace insécable fine : comparer sur des espaces normales. */
const plain = (value: string | null | undefined) => value?.replace(/\s/g, " ");

async function oneDocumentLoan() {
  const a = newAssistant();
  const state = await confirmLoanFromDocument(a, await startLoans(a, 1), "doc-1");
  return workspaceFromState(state, [documentRow("doc-1", "Tableau réel.pdf")]);
}

test("R15 detail — un prêt réel : faits contractuels, origine Extrait et vrai document", async () => {
  const workspace = await oneDocumentLoan();
  const before = structuredClone(workspace);
  const detail = buildV3FinancingDetail(workspace);
  assert.equal(detail.state, "known");
  assert.equal(detail.year, TEST_YEAR);
  assert.equal(detail.loans.length, 1);
  assert.equal(detail.loans[0]!.label, "Prêt 1");
  assert.equal(plain(fact(detail, 0, "borrowedAmount")?.value), "120 000 €");
  assert.equal(plain(fact(detail, 0, "rate")?.value), "2 %");
  assert.equal(plain(fact(detail, 0, "durationMonths")?.value), "240 mois");
  assert.equal(plain(fact(detail, 0, "firstPaymentDate")?.value), "2025-08-05");
  assert.equal(plain(fact(detail, 0, "insurance")?.value), "240 €", "montant annuel réel en euros, jamais un pourcentage");
  assert.equal(plain(fact(detail, 0, "loanApplicationFees")?.value), "500 €");
  assert.deepEqual(fact(detail, 0, "borrowedAmount")?.origin, {
    source: "extracted", label: "Extrait", document: { id: "doc-1", label: "Tableau réel.pdf" },
  });
  assert.deepEqual(detail.documents, [{ id: "doc-1", label: "Tableau réel.pdf", status: "unknown" }]);
  assert.deepEqual(workspace, before, "aucune mutation");
});

test("R15 detail — totaux et exercice = les valeurs persistées, jamais recalculées", async () => {
  const workspace = await oneDocumentLoan();
  const output = workspace.declarationDraft!.financementCharges!;
  const detail = buildV3FinancingDetail(workspace);
  assert.deepEqual(detail.totals, {
    total: output.totalChargesFinancementExercice, interets: output.totalInteretsEmprunt, assurance: output.totalAssurance,
    capitalRembourse: output.totalCapitalRembourse, interetsPreExploitation: output.totalInteretsPreExploitation,
    ...(output.totalAssurancePreExploitation !== undefined ? { assurancePreExploitation: output.totalAssurancePreExploitation } : {}),
  });
  const pret = output.prets[0]!;
  assert.equal(detail.loans[0]!.exercise?.interets, pret.interetsEmpruntExercice);
  assert.equal(detail.loans[0]!.exercise?.assurance, pret.assuranceEmpruntExercice);
  assert.equal(detail.loans[0]!.exercise?.fraisDossier, pret.fraisDossierDeductibles);
  assert.equal(detail.loans[0]!.exercise?.capitalRestantDu, pret.capitalRestantDu31_12);
});

test("R15 detail — deux prêts : chacun garde ses données et sa provenance, sans contamination", async () => {
  const a = newAssistant();
  let state = await startLoans(a, 2);
  state = await confirmLoanFromDocument(a, state, "doc-1");
  state = await confirmManualLoan(a, state, { capital: 60000, taux: 0.03, date: "2025-09-01" });
  const detail = buildV3FinancingDetail(workspaceFromState(state, [documentRow("doc-1", "Tableau réel.pdf")]));
  assert.deepEqual(detail.loans.map(loan => loan.label), ["Prêt 1", "Prêt 2"]);
  assert.equal(plain(fact(detail, 0, "borrowedAmount")?.value), "120 000 €");
  assert.equal(plain(fact(detail, 1, "borrowedAmount")?.value), "60 000 €");
  assert.equal(fact(detail, 0, "borrowedAmount")?.origin?.label, "Extrait");
  assert.equal(fact(detail, 1, "borrowedAmount")?.origin?.label, "Saisi");
  assert.equal(fact(detail, 1, "borrowedAmount")?.origin?.document, undefined, "le prêt 2 n'hérite d'aucun document du prêt 1");
  assert.ok(detail.loans[1]!.facts.every(item => item.origin?.document === undefined));
  assert.equal(detail.loans[0]!.exercise !== undefined && detail.loans[1]!.exercise !== undefined, true);
  assert.notEqual(detail.loans[0]!.exercise?.interets, detail.loans[1]!.exercise?.interets);
});

test("R15 detail — Extrait / Saisi / Corrigé, document d'origine conservé après correction", async () => {
  const a = newAssistant();
  let state = await startLoans(a, 2);
  state = await confirmLoanFromDocument(a, state, "doc-1");
  state = await confirmCorrectedLoan(a, state, "doc-2");
  const detail = buildV3FinancingDetail(workspaceFromState(state, [documentRow("doc-1", "A.pdf"), documentRow("doc-2", "B.pdf")]));
  assert.equal(fact(detail, 0, "borrowedAmount")?.origin?.label, "Extrait");
  assert.deepEqual(fact(detail, 1, "borrowedAmount")?.origin, { source: "user_correction", label: "Corrigé", document: { id: "doc-2", label: "B.pdf" } });
  assert.equal(fact(detail, 1, "rate")?.origin?.label, "Saisi");
  assert.deepEqual(detail.documents.map(doc => doc.id), ["doc-1", "doc-2"]);
});

test("R15 detail — statut d'analyse du document repris du read model documents, jamais supposé", async () => {
  const workspace = await oneDocumentLoan();
  const known = buildV3FinancingDetail(workspace, {
    state: "known", documents: [{ id: "doc-1", label: "x", fileName: "Tableau réel.pdf", processingStatus: "analyzed" }],
  });
  assert.equal(known.documents[0]!.status, "analyzed");
  const unknown = buildV3FinancingDetail(workspace, { state: "unknown", documents: [] });
  assert.equal(unknown.documents[0]!.status, "unknown");
});

test("R15 detail — document supprimé : l'origine reste, le document n'est pas substitué", async () => {
  const detail = buildV3FinancingDetail(workspaceFromStateWithoutDocs(await oneDocumentLoan()));
  assert.equal(fact(detail, 0, "borrowedAmount")?.origin?.label, "Extrait");
  assert.equal(fact(detail, 0, "borrowedAmount")?.origin?.document, undefined);
  assert.deepEqual(detail.documents, []);
});

function workspaceFromStateWithoutDocs<T extends { documents: unknown[] }>(workspace: T): T {
  return { ...workspace, documents: [] };
}

test("R15 detail — ancien dossier sans provenance : provenance indisponible, document dossier en repli", async () => {
  const workspace = await oneDocumentLoan();
  const legacy = structuredClone(workspace);
  for (const loan of legacy.declarationDraft!.creditFinancing!.loans) delete loan.provenance;
  legacy.declarationDraft!.creditDocumentId = "doc-1";
  const detail = buildV3FinancingDetail(legacy);
  assert.equal(detail.state, "known");
  assert.ok(detail.loans[0]!.facts.every(item => item.origin === undefined), "aucune provenance inventée");
  assert.deepEqual(detail.documents.map(doc => doc.id), ["doc-1"]);
});

test("R15 detail — états none / missing / unsupported", async () => {
  const base = await oneDocumentLoan();
  const none = structuredClone(base);
  none.declarationDraft = { completedSteps: [], creditDeclaredNoneAt: "2026-03-01T00:00:00Z" };
  assert.equal(buildV3FinancingDetail(none).state, "none");
  const missing = structuredClone(base);
  missing.declarationDraft = { completedSteps: [] };
  assert.equal(buildV3FinancingDetail(missing).state, "missing");
  assert.deepEqual(buildV3FinancingDetail(missing).loans, []);
  const multi = structuredClone(base);
  multi.fiscalYear.propertyIds.push("home-2");
  assert.equal(buildV3FinancingDetail(multi).state, "unsupported");
});

test("R15 detail — vraie cause d'exclusion, ou aucune cause supposée", async () => {
  const workspace = await oneDocumentLoan();
  const noDate = structuredClone(workspace);
  noDate.declarationDraft!.creditFinancing!.loans[0]!.firstPaymentDate = "";
  assert.deepEqual(buildV3FinancingDetail(noDate).loans[0]!.exclusion.map(cause => cause.code), ["first_payment_date_missing"]);

  const fees = structuredClone(workspace);
  const loan = fees.declarationDraft!.creditFinancing!.loans[0]!;
  loan.loanApplicationFees = 500;
  delete loan.souscritCetExercice;
  assert.deepEqual(buildV3FinancingDetail(fees).loans[0]!.exclusion.map(cause => cause.code), ["subscription_year_unknown"]);

  const undetermined = structuredClone(workspace);
  undetermined.declarationDraft!.financementCharges = { ...undetermined.declarationDraft!.financementCharges!, prets: [], excludedLoanIds: [undetermined.declarationDraft!.creditFinancing!.loans[0]!.id] };
  const detail = buildV3FinancingDetail(undetermined);
  assert.deepEqual(detail.loans[0]!.exclusion, []);
  assert.equal(detail.loans[0]!.exclusionUndetermined, true, "cause non re-dérivable : libellé neutre");
  assert.equal(detail.loans[0]!.exercise, undefined);
});

function monthlyRows(year: number): LoanInstallment[] {
  return Array.from({ length: 12 }, (_, index) => ({
    date: `${year}-${String(index + 1).padStart(2, "0")}-05`,
    totalPayment: 1115, principal: 1000, interest: 100, insurance: 15, fees: 0,
    remainingCapital: 100000 - 1000 * (index + 1), rank: 20 + index,
  }));
}

test("R15 detail — échéancier documentaire exploitable : lignes lues telles quelles, sans recalcul", async () => {
  const workspace = await oneDocumentLoan();
  const withSchedule = structuredClone(workspace);
  withSchedule.declarationDraft!.creditFinancing!.installments = monthlyRows(TEST_YEAR);
  const detail = buildV3FinancingDetail(withSchedule);
  assert.equal(detail.schedule.state, "available");
  if (detail.schedule.state !== "available") return;
  assert.equal(detail.schedule.rows.length, 12);
  assert.deepEqual(detail.schedule.rows[0], { date: `${TEST_YEAR}-01-05`, month: "Janvier 2026", mensualite: 1115, interets: 100, assurance: 15, capital: 1000 });
  assert.equal(detail.schedule.rows[11]!.month, "Décembre 2026");
});

test("R15 detail — échéancier indisponible : absent, non exploitable, ou non attribuable à plusieurs prêts", async () => {
  const workspace = await oneDocumentLoan();
  assert.deepEqual(buildV3FinancingDetail(workspace).schedule, { state: "unavailable", reason: "absent" });

  const gap = structuredClone(workspace);
  gap.declarationDraft!.creditFinancing!.installments = monthlyRows(TEST_YEAR).filter((_, index) => index !== 5);
  assert.deepEqual(buildV3FinancingDetail(gap).schedule, { state: "unavailable", reason: "not_usable" }, "un mois manquant : jamais reconstruit");

  const a = newAssistant();
  let state = await startLoans(a, 2);
  state = await confirmLoanFromDocument(a, state, "doc-1");
  state = await confirmManualLoan(a, state, { capital: 60000, taux: 0.03, date: "2025-09-01" });
  const two = workspaceFromState(state, [documentRow("doc-1", "A.pdf")]);
  two.declarationDraft!.creditFinancing!.installments = monthlyRows(TEST_YEAR);
  assert.deepEqual(buildV3FinancingDetail(two).schedule, { state: "unavailable", reason: "not_usable" });
});

test("R15 detail — jamais de valeur de démonstration dans le détail réel", async () => {
  const serialized = JSON.stringify(buildV3FinancingDetail(await oneDocumentLoan()));
  for (const demo of ["140 000", "Offre de prêt.pdf", "Échéancier.pdf", "2 450", "3,45", "Antoine Martin"]) {
    assert.equal(serialized.includes(demo), false, `« ${demo} » ne doit jamais apparaître`);
  }
});
