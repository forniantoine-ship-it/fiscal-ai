/**
 * R15 — adapter pur de présentation : donnée persistée structurée → ce qu'affichent les composants V3 réels.
 *
 * Run: npx tsx --test src/lab/v3-dossier/financing-view-model.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { buildV3FinancingDetail } from "@/lab/v2-dossier/financing-detail-read-model";
import {
  TEST_YEAR, confirmCorrectedLoan, confirmLoanFromDocument, confirmManualLoan, documentRow, newAssistant, startLoans, workspaceFromState,
} from "@/lab/v2-dossier/financing-test-support";
import { REVIEW_IN_F011_LABEL, buildFinancingView } from "./financing-view-model";

const plain = (value: string | null | undefined) => value?.replace(/\s/g, " ");
const ACTION = { label: REVIEW_IN_F011_LABEL, href: "/assistants/financement?scoped" };

async function twoLoans() {
  const a = newAssistant();
  let state = await startLoans(a, 2);
  state = await confirmLoanFromDocument(a, state, "doc-1");
  state = await confirmCorrectedLoan(a, state, "doc-2");
  return workspaceFromState(state, [documentRow("doc-1", "A.pdf"), documentRow("doc-2", "B.pdf", "uploaded")]);
}

test("R15 view — résultat = totalChargesFinancementExercice réel, ventilation = totaux persistés uniquement", async () => {
  const workspace = await twoLoans();
  const output = workspace.declarationDraft!.financementCharges!;
  const view = buildFinancingView(buildV3FinancingDetail(workspace), ACTION);
  const format = (value: number) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value)} €`;
  assert.equal(view.headline?.amount, format(output.totalChargesFinancementExercice));
  assert.equal(view.headline?.caption, `de charges de financement en ${TEST_YEAR}`);
  const labels = view.headline!.breakdown.map(line => line.label);
  assert.deepEqual(labels.slice(0, 2), ["Intérêts d’emprunt", "Assurance emprunteur"]);
  assert.equal(view.headline!.breakdown[0]!.amount, format(output.totalInteretsEmprunt));
  assert.equal(view.headline!.breakdown[1]!.amount, format(output.totalAssurance));
  assert.ok(labels.every(label => !/Calculé|Estimé/i.test(label)), "aucun nouveau vocabulaire « calculé »");
});

test("R15 view — frais, garantie et IRA : détaillés par prêt, avec une note ; jamais sommés en tête", async () => {
  const view = buildFinancingView(buildV3FinancingDetail(await twoLoans()), ACTION);
  const withFees = view.loans[0]!.exercise.find(line => line.label === "Frais de dossier");
  assert.ok(withFees, "le prêt 1 a des frais de dossier déductibles");
  assert.equal(view.headline?.note, "Les frais, la garantie et les IRA éventuels sont détaillés prêt par prêt.");
  assert.equal(view.headline!.breakdown.some(line => /Frais|Garantie|IRA/.test(line.label)), false);
});

test("R15 view — deux prêts : 'Prêt 1', 'Prêt 2', provenance Extrait puis Corrigé, pièces avec état réel", async () => {
  const view = buildFinancingView(buildV3FinancingDetail(await twoLoans(), {
    state: "known",
    documents: [
      { id: "doc-1", label: "A", fileName: "A.pdf", processingStatus: "analyzed" },
      { id: "doc-2", label: "B", fileName: "B.pdf", processingStatus: "uploaded" },
    ],
  }), ACTION);
  assert.deepEqual(view.loans.map(loan => loan.label), ["Prêt 1", "Prêt 2"]);
  const capital = (index: number) => view.loans[index]!.facts.find(fact => fact.id === "borrowedAmount")!;
  assert.deepEqual(capital(0).origin, { label: "Extrait", tone: "ok", document: "A.pdf" });
  assert.deepEqual(capital(1).origin, { label: "Corrigé", tone: "corrected", document: "B.pdf" });
  assert.equal(plain(capital(1).value), "75 000 €");
  assert.deepEqual(view.pieces, [{ name: "A.pdf", state: "done" }, { name: "B.pdf", state: "reading" }]);
});

test("R15 view — état d'analyse jamais supposé : 'unknown' sans read model documents", async () => {
  const view = buildFinancingView(buildV3FinancingDetail(await twoLoans()), ACTION);
  assert.ok(view.pieces.every(piece => piece.state === "unknown"));
});

test("R15 view — échéancier : tableau réel (mois, mensualité, intérêts, assurance, capital) ou état neutre", async () => {
  const a = newAssistant();
  const state = await confirmLoanFromDocument(a, await startLoans(a, 1), "doc-1");
  const workspace = workspaceFromState(state, [documentRow("doc-1", "T.pdf")]);
  const neutral = buildFinancingView(buildV3FinancingDetail(workspace), ACTION);
  assert.equal(neutral.schedule.kind, "neutral");
  assert.match(neutral.schedule.kind === "neutral" ? neutral.schedule.message : "", /Aucun échéancier importé/);

  workspace.declarationDraft!.creditFinancing!.installments = Array.from({ length: 12 }, (_, index) => ({
    date: `${TEST_YEAR}-${String(index + 1).padStart(2, "0")}-05`, totalPayment: 900, principal: 700, interest: 180, insurance: 20, fees: 0,
    remainingCapital: 50000 - 700 * (index + 1), rank: 10 + index,
  }));
  const table = buildFinancingView(buildV3FinancingDetail(workspace), ACTION);
  assert.equal(table.schedule.kind, "table");
  if (table.schedule.kind !== "table") return;
  assert.equal(table.schedule.rows.length, 12);
  assert.deepEqual(Object.keys(table.schedule.rows[0]!).sort(), ["assurance", "capital", "interets", "key", "mensualite", "month"]);
  assert.equal(plain(table.schedule.rows[0]!.mensualite), "900 €");
  assert.equal(table.schedule.rows[0]!.month, "Janvier 2026");
});

test("R15 view — prêt exclu : vraie cause ou libellé neutre, jamais 'date inconnue' par défaut", async () => {
  const a = newAssistant();
  const state = await confirmLoanFromDocument(a, await startLoans(a, 1), "doc-1");
  const workspace = workspaceFromState(state, [documentRow("doc-1", "T.pdf")]);
  const undetermined = structuredClone(workspace);
  undetermined.declarationDraft!.financementCharges = { ...undetermined.declarationDraft!.financementCharges!, prets: [], excludedLoanIds: [undetermined.declarationDraft!.creditFinancing!.loans[0]!.id] };
  const view = buildFinancingView(buildV3FinancingDetail(undetermined), ACTION);
  assert.deepEqual(view.loans[0]!.attention, ["Prêt exclu du calcul : cause non déterminable à partir des données enregistrées."]);

  const noDate = structuredClone(workspace);
  noDate.declarationDraft!.creditFinancing!.loans[0]!.firstPaymentDate = "";
  const withCause = buildFinancingView(buildV3FinancingDetail(noDate), ACTION);
  assert.deepEqual(withCause.loans[0]!.attention, ["Prêt exclu du calcul : date de première mensualité inconnue."]);
  assert.ok(withCause.missing.includes("Prêt 1 · Date de première mensualité"));
});

test("R15 view — none / missing / unsupported : aucune donnée fabriquée, action conservée", async () => {
  const base = await twoLoans();
  const none = structuredClone(base);
  none.declarationDraft = { completedSteps: [], creditDeclaredNoneAt: "2026-03-01T00:00:00Z" };
  const noneView = buildFinancingView(buildV3FinancingDetail(none), ACTION);
  assert.deepEqual([noneView.state, noneView.loans.length, noneView.headline], ["none", 0, undefined]);
  const missing = structuredClone(base);
  missing.declarationDraft = { completedSteps: [] };
  const missingView = buildFinancingView(buildV3FinancingDetail(missing), ACTION);
  assert.deepEqual([missingView.state, missingView.loans.length, missingView.headline, missingView.pieces], ["missing", 0, undefined, []]);
  assert.deepEqual(missingView.action, ACTION);
});

test("R15 view — ancien dossier sans provenance : aucune origine", async () => {
  const legacy = structuredClone(await twoLoans());
  for (const loan of legacy.declarationDraft!.creditFinancing!.loans) delete loan.provenance;
  const view = buildFinancingView(buildV3FinancingDetail(legacy), ACTION);
  assert.ok(view.loans.every(loan => loan.facts.every(fact => fact.origin === undefined)));
});

test("R15 view — assurance en euros annuels, jamais en pourcentage", async () => {
  const a = newAssistant();
  const state = await confirmManualLoan(a, await startLoans(a, 1), { capital: 60000, taux: 0.03, date: "2025-09-01" });
  const view = buildFinancingView(buildV3FinancingDetail(workspaceFromState(state)), ACTION);
  const insurance = view.loans[0]!.facts.find(fact => fact.id === "insurance")!;
  assert.equal(insurance.label, "Assurance annuelle");
  assert.equal(plain(insurance.value), "300 €");
});
