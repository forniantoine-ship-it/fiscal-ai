/**
 * R15 — le chemin RÉEL de V3 : rendu, isolation des fixtures, liens F011 scopés, gardes de la route.
 * Les composants importent un CSS module : un stub `require.extensions` (avant tout import) le rend importable sous tsx.
 *
 * Run: npx tsx --test src/lab/v3-dossier/real-v3.test.tsx
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { V3CorrectionScope } from "@/lab/v2-dossier/correction-scope";
import { v3CorrectionActionFor } from "@/lab/v2-dossier/correction-registry";
import { buildV3FinancingDetail } from "@/lab/v2-dossier/financing-detail-read-model";
import {
  TEST_YEAR, confirmCorrectedLoan, confirmLoanFromDocument, documentRow, newAssistant, startLoans, workspaceFromState,
} from "@/lab/v2-dossier/financing-test-support";
import { REVIEW_IN_F011_LABEL, buildFinancingView } from "./financing-view-model";

function installCssStub() {
  const extensions = (require as unknown as { extensions: Record<string, (module: { exports: unknown }) => void> }).extensions;
  extensions[".css"] = module => { module.exports = new Proxy({}, { get: (_target, key) => (typeof key === "string" && key !== "__esModule" ? key : undefined) }); };
}

async function load() {
  installCssStub();
  const [real, financement] = await Promise.all([import("./V3RealPrototype"), import("./RealFinancement")]);
  return { ...real, ...financement };
}

const SCOPE: V3CorrectionScope = { dossierId: "dossier-1", fiscalYearId: "fy-2026", year: TEST_YEAR, property: { kind: "required", propertyId: "home-1" }, shell: "v3" };
const plain = (html: string) => html.replace(/\s/g, " ");

async function twoLoansWorkspace() {
  const a = newAssistant();
  let state = await startLoans(a, 2);
  state = await confirmLoanFromDocument(a, state, "doc-1");
  state = await confirmCorrectedLoan(a, state, "doc-2");
  return workspaceFromState(state, [documentRow("doc-1", "Tableau réel.pdf"), documentRow("doc-2", "Offre réelle.pdf")]);
}

const DEMO_CONSTANTS = ["140 000", "Offre de prêt.pdf", "Échéancier.pdf", "Échéancier initial", "Avenant au prêt", "2 450", "2 100", "3,45", "0,25 %",
  "Antoine Martin", "12 documents", "Résultat fiscal estimé", "Simulation", "données fictives", "Attestation INSEE", "Facture mobilier", "Bail meublé"];

test("R15 real — panneau Financement : deux prêts, provenance réelle, résultat réel, action F011 unique", async () => {
  const { RealFinancementReport } = await load();
  const workspace = await twoLoansWorkspace();
  const action = v3CorrectionActionFor("financing", SCOPE)!;
  const view = buildFinancingView(buildV3FinancingDetail(workspace), { label: REVIEW_IN_F011_LABEL, href: action.href });
  const html = plain(renderToStaticMarkup(<RealFinancementReport view={view} />));
  assert.ok(html.includes("Prêt 1") && html.includes("Prêt 2"));
  assert.ok(html.includes("Tableau réel.pdf") && html.includes("Offre réelle.pdf"), "documents issus des vrais documentId");
  assert.ok(html.includes("Extrait") && html.includes("Corrigé") && html.includes("Saisi"));
  assert.ok(html.includes(plain(view.headline!.amount)), "résultat = totalChargesFinancementExercice réel");
  assert.ok(html.includes(REVIEW_IN_F011_LABEL));
  assert.equal(html.includes("Ajouter une pièce"), false, "« Ajouter une pièce » masqué en réel");
  assert.equal(/<(input|form|textarea|select)/.test(html), false, "aucune correction inline : aucun champ de saisie");
  const buttons = html.match(/<button[^>]*>/g) ?? [];
  assert.ok(buttons.every(tag => tag.includes("sourceButton")), "les seuls boutons sont les infobulles de source (lecture)");
  assert.ok(!/>Corriger</.test(html));
  assert.equal(html.includes("Déductible"), false, "pas de colonne Déductible");
  assert.equal(html.includes("Estimé"), false);
  for (const demo of DEMO_CONSTANTS) assert.equal(html.includes(demo), false, `« ${demo} » ne doit pas apparaître`);
});

test("R15 real — le lien F011 porte le scope vérifié et le marqueur de retour V3, sans aucune donnée métier", async () => {
  const action = v3CorrectionActionFor("financing", SCOPE)!;
  const url = new URL(action.href, "http://v3.local");
  assert.equal(url.pathname, "/assistants/financement");
  assert.equal(url.searchParams.get("v3Correction"), "1");
  assert.equal(url.searchParams.get("v3Shell"), "v3");
  assert.equal(url.searchParams.get("dossierId"), "dossier-1");
  assert.equal(url.searchParams.get("fiscalYearId"), "fy-2026");
  assert.equal(url.searchParams.get("year"), String(TEST_YEAR));
  assert.equal(url.searchParams.get("propertyId"), "home-1");
  assert.deepEqual([...url.searchParams.keys()].sort(), ["dossierId", "fiscalYearId", "propertyId", "v3Correction", "v3Shell", "year"]);
  assert.equal(v3CorrectionActionFor("financing", null), null, "sans scope vérifié : aucun lien");
  const { RealFinancementReport } = await load();
  const view = buildFinancingView(buildV3FinancingDetail(await twoLoansWorkspace()), null);
  const html = renderToStaticMarkup(<RealFinancementReport view={view} />);
  assert.ok(html.includes("n’est pas disponible tant que le dossier"), "pas de lien sans scope vérifié");
  assert.equal(html.includes("href="), false);
});

test("R15 real — échéancier : tableau réel sans Déductible ni source mensuelle, ou état neutre", async () => {
  const { RealFinancementReport } = await load();
  const a = newAssistant();
  const state = await confirmLoanFromDocument(a, await startLoans(a, 1), "doc-1");
  const workspace = workspaceFromState(state, [documentRow("doc-1", "T.pdf")]);
  const neutral = plain(renderToStaticMarkup(<RealFinancementReport view={buildFinancingView(buildV3FinancingDetail(workspace), null)} />));
  assert.ok(neutral.includes("Aucun échéancier importé"));
  assert.equal(neutral.includes("<table") && neutral.includes("Mensualité"), false);

  workspace.declarationDraft!.creditFinancing!.installments = Array.from({ length: 12 }, (_, index) => ({
    date: `${TEST_YEAR}-${String(index + 1).padStart(2, "0")}-05`, totalPayment: 900, principal: 700, interest: 180, insurance: 20, fees: 0,
    remainingCapital: 50000 - 700 * (index + 1), rank: 10 + index,
  }));
  const table = plain(renderToStaticMarkup(<RealFinancementReport view={buildFinancingView(buildV3FinancingDetail(workspace), null)} />));
  for (const header of ["Mois", "Mensualité", "Intérêts", "Assurance", "Capital"]) assert.ok(table.includes(`>${header}<`), `colonne ${header}`);
  assert.ok(table.includes("Janvier 2026") && table.includes("Décembre 2026"));
  assert.equal(table.includes("Déductible"), false);
  assert.equal(/échéance (janvier|février)/i.test(table), false, "aucune source mensuelle");
});

test("R15 real — états none et missing : aucune valeur fabriquée", async () => {
  const { RealFinancementReport, RealFinancementWorkspace } = await load();
  const base = await twoLoansWorkspace();
  const none = structuredClone(base);
  none.declarationDraft = { completedSteps: [], creditDeclaredNoneAt: "2026-03-01T00:00:00Z" };
  const noneHtml = plain(renderToStaticMarkup(<RealFinancementReport view={buildFinancingView(buildV3FinancingDetail(none), null)} />));
  assert.ok(noneHtml.includes("Vous avez déclaré ne pas avoir de prêt"));
  const missing = structuredClone(base);
  missing.declarationDraft = { completedSteps: [] };
  const workspaceHtml = plain(renderToStaticMarkup(<RealFinancementWorkspace view={buildFinancingView(buildV3FinancingDetail(missing), { label: REVIEW_IN_F011_LABEL, href: "/x" })} back={null} />));
  assert.ok(workspaceHtml.includes("Aucun financement n’est enregistré"));
  for (const demo of DEMO_CONSTANTS) assert.equal(workspaceHtml.includes(demo) || noneHtml.includes(demo), false, demo);
});

test("R15 real — espace de travail : ce que je sais / ce qu'il me manque / mes pièces, sans ajout de pièce", async () => {
  const { RealFinancementWorkspace } = await load();
  const workspace = await twoLoansWorkspace();
  workspace.declarationDraft!.creditFinancing!.loans[0]!.firstPaymentDate = "";
  const view = buildFinancingView(buildV3FinancingDetail(workspace), { label: REVIEW_IN_F011_LABEL, href: "/assistants/financement?x=1" });
  const html = plain(renderToStaticMarkup(<RealFinancementWorkspace view={view} back={<span>retour</span>} />));
  for (const zone of ["Ce que je sais", "Ce qu’il me manque", "Mes pièces"]) assert.ok(html.includes(zone), zone);
  assert.ok(html.includes("Prêt 1 · Date de première mensualité"), "manque réel du prêt 1");
  assert.ok(html.includes("La date de première mensualité du prêt n’est pas connue."), "cause réelle, sans « exclu du calcul »");
  assert.equal(/exclu du calcul/i.test(html), false);
  assert.ok(html.includes(REVIEW_IN_F011_LABEL));
  assert.equal(html.includes("Ajouter une pièce"), false);
  assert.equal(html.includes("Renseigner manuellement"), false, "aucune saisie inline");
  for (const demo of DEMO_CONSTANTS) assert.equal(html.includes(demo), false, demo);
});

test("R15 real — dossier complet en rendu : six rubriques issues des read models, aucun résultat fiscal fictif", async () => {
  const { V3RealPrototype } = await load();
  const workspace = await twoLoansWorkspace();
  const html = plain(renderToStaticMarkup(<V3RealPrototype workspace={workspace} scope={SCOPE} documents={{ state: "known", documents: [] }} />));
  for (const label of ["Activité", "Logement", "Financement", "Loyers", "Dépenses", "Amortissements"]) assert.ok(html.includes(label), `rubrique ${label} visible`);
  assert.ok(html.includes("dossier réel") && html.includes(`exercice ${TEST_YEAR}`));
  for (const demo of DEMO_CONSTANTS) assert.equal(html.includes(demo), false, `« ${demo} » ne doit pas apparaître dans le rendu réel`);
  assert.equal(/Résultat fiscal/i.test(html), false, "le résultat fiscal démo est absent tant qu'il n'est pas alimenté honnêtement");
});

// ── isolation statique : aucune fixture dans le chemin réel ─────────────────────────────────────────────────
const DIR = path.dirname(new URL(import.meta.url).pathname);
const REAL_ENTRY = ["V3RealPrototype.tsx", "RealFinancement.tsx", "financing-view-model.ts", "real-user-actions.ts", "shell.tsx", "restitution.tsx", "source-ref.ts"];
const DEMO_ONLY = new Set(["fixtures.ts", "model.ts", "V3Prototype.tsx"]);

function localImports(file: string): string[] {
  const code = readFileSync(path.join(DIR, file), "utf8");
  const found = [...code.matchAll(/(?:import|export)[^"';]*?from\s+["'](\.\/[^"']+)["']/g)].map(match => match[1]!);
  return found.map(spec => {
    const base = spec.slice(2).replace(/\.module\.css$/, ".module.css");
    for (const candidate of [`${base}.tsx`, `${base}.ts`, base]) {
      try { readFileSync(path.join(DIR, candidate)); return candidate; } catch { /* next */ }
    }
    return base;
  });
}

test("R15 real — le chemin réel n'importe jamais fixtures, model ni V3Prototype (fermeture transitive)", () => {
  const seen = new Set<string>();
  const queue = [...REAL_ENTRY];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file) || file.endsWith(".css")) continue;
    seen.add(file);
    for (const dependency of localImports(file)) queue.push(dependency);
  }
  for (const demo of DEMO_ONLY) assert.equal(seen.has(demo), false, `${demo} ne doit pas être atteignable depuis le chemin réel`);
  assert.ok(seen.has("source-ref.ts") && seen.has("shell.tsx"), "la fermeture est bien parcourue");
});

test("R15 real — aucun identifiant de démonstration dans les sources du chemin réel", () => {
  for (const file of ["V3RealPrototype.tsx", "RealFinancement.tsx", "financing-view-model.ts", "real-user-actions.ts", "shell.tsx"]) {
    const code = readFileSync(path.join(DIR, file), "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const forbidden of ["DEMO", "DOCUMENTS", "LOAN_FACTS", "MONTHLY_SCHEDULE", "LOAN_FINDINGS", "DocumentReading", "RESTITUTION_SHAPES"]) {
      assert.equal(new RegExp(`\\b${forbidden}\\b`).test(code), false, `${file} ne doit jamais référencer ${forbidden}`);
    }
  }
});

test("R15 route — /lab/v3-dossier/real reprend les gardes de la route V2 réelle et monte la coque V3", () => {
  const v3 = readFileSync(path.join(DIR, "../../app/lab/v3-dossier/real/page.tsx"), "utf8");
  const v2 = readFileSync(path.join(DIR, "../../app/lab/v2-dossier/real/page.tsx"), "utf8");
  assert.match(v3, /process\.env\.NODE_ENV === "production" && !isV3RealTestRouteEnabled\(\)\) notFound\(\)/);
  assert.match(v3, /<RealWorkspaceRoute[^>]*shell="v3"/);
  assert.match(v3, /readV3ReturnQuery\(params\)/);
  assert.match(v3, /readExplicitDossierId\(params\)/);
  assert.equal(v2.includes("shell="), false, "la route V2 réelle est inchangée");
});
