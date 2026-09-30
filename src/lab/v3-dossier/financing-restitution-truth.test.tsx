/**
 * R15.2 — vérité de restitution du Financement : ce que la V3 affiche représente fidèlement les données et états existants.
 * Workspaces construits par l'assistant F011 réel et les builders réels ; aucune valeur recalculée par la V3.
 * Un stub `require.extensions` (avant tout import) rend le CSS module importable sous tsx pour les tests de rendu.
 *
 * Run: npx tsx --test src/lab/v3-dossier/financing-restitution-truth.test.tsx
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { LoanInstallment } from "@/lib/lmnp/types";
import { buildV3FinancingDetail } from "@/lab/v2-dossier/financing-detail-read-model";
import {
  TEST_YEAR, assistantFor, confirmLoanFromDocument, confirmManualLoan, documentRow, newAssistant, startLoans, workspaceFromState,
} from "@/lab/v2-dossier/financing-test-support";
import { REVIEW_IN_F011_LABEL, VERIFICATION_TITLE, buildFinancingView, financingRubrique } from "./financing-view-model";

function installCssStub() {
  const extensions = (require as unknown as { extensions: Record<string, (module: { exports: unknown }) => void> }).extensions;
  extensions[".css"] = module => { module.exports = new Proxy({}, { get: (_target, key) => (typeof key === "string" && key !== "__esModule" ? key : undefined) }); };
}
async function loadComponents() {
  installCssStub();
  const [real, financement] = await Promise.all([import("./V3RealPrototype"), import("./RealFinancement")]);
  return { ...real, ...financement };
}

const ACTION = { label: REVIEW_IN_F011_LABEL, href: "/assistants/financement?scoped" };
const cents = (value: number) => Math.round(value * 100);
const plain = (html: string) => html.replace(/\s/g, " ");
const DIR = path.dirname(new URL(import.meta.url).pathname);

/** Independent oracle: the persisted per-loan fields, added the way the engine does — never read from the V3 code. */
function oracleTotal(workspace: ReturnType<typeof workspaceFromState>): number {
  const output = workspace.declarationDraft!.financementCharges!;
  return (cents(output.totalInteretsEmprunt) + cents(output.totalAssurance) +
    output.prets.reduce((acc, pret) => acc + cents(pret.fraisDossierDeductibles) + cents(pret.garantieDeductible) + cents(pret.iraDeductible), 0)) / 100;
}

function viewOf(workspace: ReturnType<typeof workspaceFromState>) {
  return buildFinancingView(buildV3FinancingDetail(workspace), ACTION);
}

function assertReconciled(workspace: ReturnType<typeof workspaceFromState>) {
  const persisted = workspace.declarationDraft!.financementCharges!.totalChargesFinancementExercice;
  const view = viewOf(workspace);
  const displayed = view.headline!.lines.reduce((acc, item) => acc + cents(item.value), 0);
  assert.equal(displayed, cents(persisted), "la somme des lignes affichées = le total persisté, au centime");
  assert.equal(persisted, oracleTotal(workspace), "oracle indépendant = total persisté");
  assert.equal(view.headline!.reconciliation, "exact");
  return view;
}

// ── 2. réconciliation du total ───────────────────────────────────────────────────────────────────────────────
test("R15.2 oracle — frais de dossier + garantie : le total est reconstitué par les lignes affichées", async () => {
  const a = newAssistant();
  const state = await confirmLoanFromDocument(a, await startLoans(a, 1), "doc-1", undefined, { guarantee: 400 });
  const workspace = workspaceFromState(state, [documentRow("doc-1", "T.pdf")]);
  const view = assertReconciled(workspace);
  const byLabel = Object.fromEntries(view.headline!.lines.map(item => [item.label, item.value]));
  assert.equal(byLabel["Frais de dossier"], 500);
  assert.equal(byLabel["Garantie"], 400);
  assert.equal(view.headline!.lines.some(item => item.label.includes("IRA")), false, "IRA à zéro : absente");
});

test("R15.2 cas réel observé — 1 361,60 € entièrement réconcilié, pré-exploitation à part (non-régression du moteur existant)", async () => {
  // Non-régression, pas une règle : mêmes termes que le dossier réel testé, passés par le vrai assistant F011 et le vrai moteur.
  // 131 481,96 € · 3,84 % · 317 mois · 1re mensualité 2024-06-24 · assurance 660,72 €/an · frais 500 € + garantie 400 € souscrits
  // sur l'exercice · mise en service le 2025-12-01.
  const a = assistantFor(2025, "2025-12-01");
  let turn = await a.handle(a.start().state, { type: "set_presence_emprunt", presence: true });
  turn = await a.handle(turn.state, { type: "set_nombre_prets", count: 1 });
  turn = await a.handle(turn.state, { type: "choose_loan_source", source: "manual" });
  turn = await a.handle(turn.state, { type: "set_loan_type", typePret: "amortissable" });
  turn = await a.handle(turn.state, { type: "submit_loan_terms", capitalInitial: 131481.96, tauxNominal: 0.0384, dureeMois: 317, datePremiereMensualite: "2024-06-24" });
  turn = await a.handle(turn.state, { type: "set_insurance", assuranceType: "externe", assuranceAnnuelle: 660.72 });
  turn = await a.handle(turn.state, { type: "set_guarantee", typeGarantie: "caution", commissionCaution: 400 });
  turn = await a.handle(turn.state, { type: "set_fees", souscritCetExercice: true, fraisDossier: 500 });
  turn = await a.handle(turn.state, { type: "set_ira", remboursementAnticipe: false });
  turn = await a.handle(turn.state, { type: "confirm_loan" });
  const workspace = workspaceFromState(turn.state, [], {}, 2025);
  const output = workspace.declarationDraft!.financementCharges!;
  // Le moteur reste celui qui produit ces montants : toute dérive de calcul ferait échouer ces références.
  assert.equal(output.totalChargesFinancementExercice, 1361.6);
  assert.equal(output.totalInteretsEmprunt, 406.54);
  assert.equal(output.totalAssurance, 55.06);
  assert.equal(output.totalInteretsPreExploitation, 4524.85);
  assert.equal(output.totalAssurancePreExploitation, 605.66);

  const view = assertReconciled(workspace);
  assert.equal(plain(view.headline!.amount), "1 361,60 €");
  assert.deepEqual(view.headline!.lines.map(item => [item.label, item.value]), [
    ["Intérêts d’emprunt", 406.54], ["Assurance emprunteur", 55.06], ["Frais de dossier", 500], ["Garantie", 400],
  ]);
  assert.deepEqual(view.headline!.preExploitation!.lines.map(item => [item.label, item.value]), [
    ["Intérêts de pré-exploitation", 4524.85], ["Assurance de pré-exploitation", 605.66],
  ]);
  const mainSum = view.headline!.lines.reduce((acc, item) => acc + cents(item.value), 0);
  assert.equal(mainSum, 136160, "1 361,60 € = 406,54 + 55,06 + 500,00 + 400,00");
  assert.equal(mainSum + cents(4524.85) + cents(605.66) === 136160, false, "la pré-exploitation n'est jamais ajoutée au total de tête");
});

test("R15.2 oracle — IRA seule", async () => {
  const a = newAssistant();
  const state = await confirmLoanFromDocument(a, await startLoans(a, 1), "doc-1", undefined, { fees: null, ira: 900 });
  const view = assertReconciled(workspaceFromState(state, [documentRow("doc-1", "T.pdf")]));
  const ira = view.headline!.lines.find(item => item.label.includes("IRA"));
  assert.equal(ira?.value, 900);
  assert.equal(view.headline!.lines.some(item => item.label === "Frais de dossier" || item.label === "Garantie"), false);
});

test("R15.2 oracle — cas observé en test réel : 900 € de frais/garantie/IRA + intérêts + assurance = total", async () => {
  const a = newAssistant();
  const state = await confirmLoanFromDocument(a, await startLoans(a, 1), "doc-1", undefined, { fees: 500, guarantee: 400 });
  const workspace = workspaceFromState(state, [documentRow("doc-1", "T.pdf")]);
  const view = assertReconciled(workspace);
  const extras = view.headline!.lines.filter(item => !["Intérêts d’emprunt", "Assurance emprunteur"].includes(item.label));
  assert.equal(extras.reduce((acc, item) => acc + cents(item.value), 0), 90000, "900,00 € visibles en toutes lettres dans la ventilation");
});

test("R15.2 oracle — aucune composante additionnelle : seules intérêts et assurance, total identique", async () => {
  const a = newAssistant();
  const state = await confirmLoanFromDocument(a, await startLoans(a, 1), "doc-1", undefined, { fees: null });
  const view = assertReconciled(workspaceFromState(state, [documentRow("doc-1", "T.pdf")]));
  assert.deepEqual(view.headline!.lines.map(item => item.label), ["Intérêts d’emprunt", "Assurance emprunteur"]);
});

test("R15.2 oracle — deux prêts : les composantes de chaque prêt s'additionnent au total, sans contamination", async () => {
  const a = newAssistant();
  let state = await startLoans(a, 2);
  state = await confirmLoanFromDocument(a, state, "doc-1", undefined, { fees: 500 });
  state = await confirmLoanFromDocument(a, state, "doc-2", undefined, { fees: null, ira: 300, guarantee: undefined });
  const workspace = workspaceFromState(state, [documentRow("doc-1", "A.pdf"), documentRow("doc-2", "B.pdf")]);
  const view = assertReconciled(workspace);
  const perLoan = (index: number, label: string) => view.loans[index]!.exercise.find(item => item.label === label)?.value;
  assert.match(perLoan(0, "Frais de dossier") ?? "", /500/);
  assert.equal(perLoan(1, "Frais de dossier"), undefined, "les frais du prêt 1 ne passent pas sur le prêt 2");
  assert.match(perLoan(1, "Indemnités de remboursement anticipé (IRA)") ?? "", /300/);
  assert.equal(perLoan(0, "Indemnités de remboursement anticipé (IRA)"), undefined, "l'IRA du prêt 2 ne passe pas sur le prêt 1");
});

test("R15.2 oracle — écart entre détail et total persisté : signalé, jamais comblé par un montant inventé", async () => {
  const a = newAssistant();
  const state = await confirmLoanFromDocument(a, await startLoans(a, 1), "doc-1");
  const workspace = workspaceFromState(state, [documentRow("doc-1", "T.pdf")]);
  const tampered = structuredClone(workspace);
  const output = tampered.declarationDraft!.financementCharges!;
  output.totalChargesFinancementExercice = output.totalChargesFinancementExercice + 1;
  const view = viewOf(tampered);
  assert.equal(view.headline!.reconciliation, "unexplained");
  assert.match(view.headline!.reconciliationNote ?? "", /ne permet pas de reconstituer exactement/);
  assert.equal(view.headline!.lines.reduce((acc, item) => acc + cents(item.value), 0), cents(oracleTotal(workspace)), "les lignes restent celles des valeurs persistées");
  assert.equal(cents(view.headline!.lines.reduce((acc, item) => acc + item.value, 0)) === cents(output.totalChargesFinancementExercice), false);
});

test("R15.2 aucune valeur recalculée : la V3 transporte les nombres persistés tels quels", async () => {
  const a = newAssistant();
  const state = await confirmLoanFromDocument(a, await startLoans(a, 1), "doc-1");
  const workspace = workspaceFromState(state, [documentRow("doc-1", "T.pdf")]);
  const output = workspace.declarationDraft!.financementCharges!;
  output.prets[0]!.interetsEmpruntExercice = 1234.56;
  output.totalInteretsEmprunt = 1234.56;
  output.totalChargesFinancementExercice = 1234.56 + output.totalAssurance + output.prets[0]!.fraisDossierDeductibles;
  const view = viewOf(workspace);
  assert.equal(view.headline!.lines[0]!.value, 1234.56);
  assert.equal(view.loans[0]!.exercise.find(item => item.label === "Intérêts d’emprunt")?.value.replace(/\s/g, " "), "1 234,56 €");
  assert.equal(view.headline!.reconciliation, "exact");
});

test("R15.2 calcul fiscal inchangé — la construction de la vue ne modifie jamais les données persistées", async () => {
  const workspace = await reconstructedAndBlocked();
  const before = structuredClone(workspace);
  viewOf(workspace);
  buildV3FinancingDetail(workspace);
  assert.deepEqual(workspace, before, "financementCharges, creditFinancing et provenance restent strictement identiques");
});

// ── 3. pré-exploitation, hors du total principal ─────────────────────────────────────────────────────────────
test("R15.2 pré-exploitation — présentée à part, hors du total principal, avec sa brève explication", async () => {
  const a = newAssistant("2026-06-15");
  const state = await confirmLoanFromDocument(a, await startLoans(a, 1), "doc-1", undefined, { fees: null });
  const workspace = workspaceFromState(state, [documentRow("doc-1", "T.pdf")]);
  const output = workspace.declarationDraft!.financementCharges!;
  assert.ok(output.totalInteretsPreExploitation > 0, "précondition : des échéances précèdent la mise en service");
  const view = assertReconciled(workspace);
  const pre = view.headline!.preExploitation!;
  assert.equal(pre.title, "Charges antérieures à la mise en service");
  assert.deepEqual(pre.lines.map(item => item.label), ["Intérêts de pré-exploitation", "Assurance de pré-exploitation"].slice(0, pre.lines.length));
  assert.equal(pre.lines[0]!.value, output.totalInteretsPreExploitation);
  assert.match(pre.note, /traitées séparément/);
  assert.match(pre.note, /ne sont pas comprises dans le total/);
  const mainLines = view.headline!.lines.reduce((acc, item) => acc + cents(item.value), 0);
  assert.equal(mainLines, cents(output.totalChargesFinancementExercice), "le total principal ne contient pas la pré-exploitation");
  assert.equal(view.headline!.lines.some(item => /pré-exploitation/i.test(item.label)), false);
});

test("R15.2 pré-exploitation — absente quand elle est nulle", async () => {
  const a = newAssistant();
  const state = await confirmLoanFromDocument(a, await startLoans(a, 1), "doc-1");
  assert.equal(viewOf(workspaceFromState(state, [documentRow("doc-1", "T.pdf")])).headline!.preExploitation, undefined);
});

// ── 1 & 4. jamais « exclu du calcul » ; blocage documentaire honnête ─────────────────────────────────────────
function gapSchedule(): LoanInstallment[] {
  return Array.from({ length: 12 }, (_, index) => ({
    date: `${TEST_YEAR}-${String(index + 1).padStart(2, "0")}-05`, totalPayment: 900, principal: 700, interest: 180, insurance: 20, fees: 0,
    remainingCapital: 50000 - 700 * (index + 1), rank: 10 + index,
  })).filter((_, index) => index !== 5);
}

async function reconstructedAndBlocked() {
  const a = newAssistant();
  const state = await confirmLoanFromDocument(a, await startLoans(a, 1), "doc-1");
  const workspace = workspaceFromState(state, [documentRow("doc-1", "Tableau d’amortissement.pdf")]);
  // The real situation: F011 persisted amounts computed by reconstruction, while the imported table is not usable.
  workspace.declarationDraft!.creditFinancing!.installments = gapSchedule();
  return workspace;
}

test("R15.2 blocage documentaire — calcul reconstruit : jamais « exclu du calcul », vérification nécessaire, déclaration non prête", async () => {
  const workspace = await reconstructedAndBlocked();
  const detail = buildV3FinancingDetail(workspace);
  assert.equal(detail.loans[0]!.computed, true, "F011 a produit des montants pour ce prêt");
  assert.deepEqual(detail.loans[0]!.blockers.map(cause => cause.code), ["schedule_not_usable"]);
  assert.equal(detail.stepStatus, "incomplete", "état existant du dossier : le financement n'est pas prêt");
  const view = buildFinancingView(detail, ACTION);
  assert.ok(view.headline, "le résultat reste disponible");
  assert.equal(view.verification?.title, VERIFICATION_TITLE);
  assert.deepEqual(view.verification?.paragraphs, [
    "J’ai pu calculer vos charges à partir des caractéristiques de votre prêt, mais votre tableau d’amortissement ne permet pas encore de sécuriser l’échéancier pour la déclaration.",
    "Ce document devra être remplacé ou complété avant la finalisation de votre déclaration.",
    "Tant que ce point n’est pas réglé, le financement n’est pas prêt pour la déclaration.",
  ]);
  assert.deepEqual(view.loans[0]!.notices, ["Le tableau d’amortissement importé ne permet pas encore de sécuriser l’échéancier de ce prêt pour la déclaration."]);
  const serialized = JSON.stringify(view);
  assert.equal(/exclu/i.test(serialized), false, "aucune formulation « exclu »");
  // The precise rejection condition is not persisted: none is claimed.
  for (const claimed of ["lacunaire", "doublon", "mensuel", "capital restant dû non lu", "interrompu", "assurance déclarée", "illisible"]) {
    assert.equal(serialized.toLowerCase().includes(claimed), false, `la condition précise ne doit pas être prétendue : ${claimed}`);
  }
});

test("R15.2 blocage documentaire — état de la rubrique : résultat disponible, vérification nécessaire (jamais « À compléter »)", async () => {
  const blocked = viewOf(await reconstructedAndBlocked());
  assert.deepEqual(financingRubrique(blocked, { summary: "Financement à compléter", complete: false }), { summary: "Résultat disponible · vérification nécessaire", tone: "attention" });
  const healthyWorkspace = await (async () => { const a = newAssistant(); return workspaceFromState(await confirmLoanFromDocument(a, await startLoans(a, 1), "doc-1"), [documentRow("doc-1", "T.pdf")]); })();
  const healthy = viewOf(healthyWorkspace);
  assert.equal(healthy.verification, undefined, "dossier sain : aucune vérification inventée");
  assert.equal(buildV3FinancingDetail(healthyWorkspace).stepStatus, "complete");
  assert.deepEqual(financingRubrique(healthy, { summary: "Financement analysé", complete: true }), { summary: "Financement analysé", tone: "ok" });
  const none = structuredClone(healthyWorkspace);
  none.declarationDraft = { completedSteps: [] };
  assert.deepEqual(financingRubrique(viewOf(none), { summary: "Aucun financement enregistré", complete: false }), { summary: "Aucun financement enregistré", tone: "attention" }, "sans résultat, l'état existant est conservé");
});

test("R15.2 blocage documentaire — plusieurs prêts : chaque prêt garde son propre état, sans contamination", async () => {
  const a = newAssistant();
  let state = await startLoans(a, 2);
  state = await confirmLoanFromDocument(a, state, "doc-1");
  state = await confirmManualLoan(a, state, { capital: 60000, taux: 0.03, date: "2025-09-01" });
  const workspace = workspaceFromState(state, [documentRow("doc-1", "A.pdf")]);
  workspace.declarationDraft!.creditFinancing!.loans[1]!.firstPaymentDate = "";
  const view = viewOf(workspace);
  assert.deepEqual(view.loans[0]!.notices, [], "le prêt 1 est sain");
  assert.deepEqual(view.loans[1]!.notices, ["La date de première mensualité du prêt n’est pas connue."]);
  assert.match(view.verification?.paragraphs.join(" ") ?? "", /Une information du prêt reste à confirmer/);
  assert.equal(/exclu/i.test(JSON.stringify(view)), false);
});

test("R15.2 vrai non-calcul — prêt absent du résultat persisté : dit qu'il n'est pas pris en compte, sans « exclu »", async () => {
  const a = newAssistant();
  const state = await confirmLoanFromDocument(a, await startLoans(a, 1), "doc-1");
  const workspace = workspaceFromState(state, [documentRow("doc-1", "T.pdf")]);
  workspace.declarationDraft!.creditFinancing!.loans[0]!.firstPaymentDate = "";
  workspace.declarationDraft!.financementCharges = { ...workspace.declarationDraft!.financementCharges!, prets: [], totalChargesFinancementExercice: 0, totalInteretsEmprunt: 0, totalAssurance: 0 };
  const view = viewOf(workspace);
  assert.deepEqual(view.loans[0]!.notices, ["Ce prêt n’est pas encore pris en compte dans le calcul : date de première mensualité inconnue."]);
  assert.match(view.verification?.paragraphs.join(" ") ?? "", /Au moins un prêt n’est pas encore pris en compte/);
  assert.equal(/exclu/i.test(JSON.stringify(view)), false);
});

test("R15.2 ancien dossier sans provenance — même restitution, totaux réconciliés, aucune origine inventée", async () => {
  const a = newAssistant();
  const state = await confirmLoanFromDocument(a, await startLoans(a, 1), "doc-1", undefined, { guarantee: 400 });
  const workspace = workspaceFromState(state, [documentRow("doc-1", "T.pdf")]);
  for (const loan of workspace.declarationDraft!.creditFinancing!.loans) delete loan.provenance;
  const view = assertReconciled(workspace);
  assert.ok(view.loans.every(loan => loan.facts.every(fact => fact.origin === undefined)));
});

// ── rendu ────────────────────────────────────────────────────────────────────────────────────────────────────
const DEMO_CONSTANTS = ["140 000", "Offre de prêt.pdf", "Échéancier.pdf", "2 450", "2 100", "3,45", "0,25 %", "Antoine Martin", "Résultat fiscal estimé", "Simulation"];

test("R15.2 rendu — vérification nécessaire, ventilation complète, pré-exploitation à part ; aucun « exclu du calcul »", async () => {
  const { RealFinancementReport } = await loadComponents();
  const a = newAssistant("2026-06-15");
  const state = await confirmLoanFromDocument(a, await startLoans(a, 1), "doc-1", undefined, { fees: 500, guarantee: 400 });
  const workspace = workspaceFromState(state, [documentRow("doc-1", "Tableau d’amortissement.pdf")]);
  workspace.declarationDraft!.creditFinancing!.installments = gapSchedule();
  const html = plain(renderToStaticMarkup(<RealFinancementReport view={viewOf(workspace)} />));
  assert.ok(html.includes(VERIFICATION_TITLE));
  assert.ok(html.includes("J’ai pu calculer vos charges à partir des caractéristiques de votre prêt"));
  assert.ok(html.includes("votre tableau d’amortissement ne permet pas encore de sécuriser l’échéancier pour la déclaration"));
  assert.ok(html.includes("Ce document devra être remplacé ou complété avant la finalisation de votre déclaration"));
  assert.ok(html.includes("le financement n’est pas prêt pour la déclaration"), "blocage de déclaration toujours visible");
  assert.ok(html.includes("Frais de dossier") && html.includes("Garantie"), "composantes du total visibles");
  assert.ok(html.includes("Charges antérieures à la mise en service") && html.includes("traitées séparément"));
  assert.equal(/exclu/i.test(html), false);
  for (const demo of DEMO_CONSTANTS) assert.equal(html.includes(demo), false, demo);
});

test("R15.2 rendu — la rubrique Financement n'est pas « À compléter » quand un résultat existe mais reste à sécuriser", async () => {
  const { V3RealPrototype } = await loadComponents();
  const workspace = await reconstructedAndBlocked();
  const scope = { dossierId: "dossier-1", fiscalYearId: "fy-2026", year: TEST_YEAR, property: { kind: "required" as const, propertyId: "home-1" }, shell: "v3" as const };
  const html = plain(renderToStaticMarkup(<V3RealPrototype workspace={workspace} scope={scope} documents={{ state: "known", documents: [] }} />));
  assert.ok(html.includes("Résultat disponible · vérification nécessaire"));
  assert.ok(html.includes("Vérification nécessaire"));
  assert.equal(/exclu/i.test(html), false);
});

// ── aucune nouvelle logique métier ───────────────────────────────────────────────────────────────────────────
test("R15.2 aucune nouvelle logique métier — la couche V3 n'importe ni moteur de calcul ni générateur d'échéancier", () => {
  const files = ["../v2-dossier/financing-detail-read-model.ts", "../v2-dossier/financing-shared.ts", "financing-view-model.ts", "RealFinancement.tsx", "V3RealPrototype.tsx"];
  for (const file of files) {
    const code = readFileSync(path.join(DIR, file), "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const forbidden of ["compute-financement-exercice", "generate-loan-schedule", "isolate-pre-exploitation", "extract-interests-exercice", "compute-in-fine", "computeFinancementExercice", "generateLoanSchedule", "isolatePreExploitationInterests"]) {
      assert.equal(code.includes(forbidden), false, `${file} ne doit pas référencer ${forbidden}`);
    }
    assert.equal(/from ["']\.\/(fixtures|model|V3Prototype)["']/.test(code), false, `${file}: aucune fixture`);
  }
});
