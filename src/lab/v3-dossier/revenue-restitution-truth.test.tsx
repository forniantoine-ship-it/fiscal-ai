/**
 * R15.6 — vérité de restitution des Revenus : adapter pur, rendu, CTA sous coque V3, navigation F013, absence de fixture.
 * Sorties F013 réelles (revenue-test-support). Un stub `require.extensions` rend le CSS module importable sous tsx.
 *
 * Run: npx tsx --test src/lab/v3-dossier/revenue-restitution-truth.test.tsx
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { v3CorrectionActionFor } from "@/lab/v2-dossier/correction-registry";
import { OWNER_ROUTES, type V3CorrectionScope } from "@/lab/v2-dossier/correction-scope";
import { property, stateOf, workspaceOf } from "@/lab/v2-dossier/housing-test-support";
import { buildV3RevenueDetail } from "@/lab/v2-dossier/revenue-detail-read-model";
import {
  DEFAULT_TRANSACTIONS, F009_CONFIRMED_AT, SERVICE_DATE, assistantWithoutDate, conversationalConfirmed, documentSession,
  persistConversational, persistDocumentChannel,
} from "@/lab/v2-dossier/revenue-test-support";
import { V3_ASSISTANT_ROUTES, selectAssistantShell } from "./assistant-shell-model";
import { REVIEW_IN_F013_LABEL, buildRevenueView } from "./revenue-view-model";

function installCssStub() {
  const extensions = (require as unknown as { extensions: Record<string, (module: { exports: unknown }) => void> }).extensions;
  extensions[".css"] = module => { module.exports = new Proxy({}, { get: (_target, key) => (typeof key === "string" && key !== "__esModule" ? key : undefined) }); };
}
async function loadComponents() {
  installCssStub();
  return import("./RealRevenue");
}

const DIR = path.dirname(new URL(import.meta.url).pathname);
const read = (file: string) => readFileSync(path.join(DIR, file), "utf8");
const V3_SCOPE: V3CorrectionScope = { dossierId: "dossier-1", fiscalYearId: "fy-2025", year: 2025, property: { kind: "required", propertyId: "home-1" }, shell: "v3" };
const ACTION = { label: REVIEW_IN_F013_LABEL, href: "/assistants/revenus?scoped" };
const withDate = { draft: { dateMiseEnService: SERVICE_DATE, inpiConfirmedAt: F009_CONFIRMED_AT } };
const plain = (html: string) => html.replace(/\s/g, " ");
type View = ReturnType<typeof buildRevenueView>;
type Known = Extract<View, { state: "known" }>;
const viewOf = (workspace: ReturnType<typeof workspaceOf>, propertyId: string | null = "home-1") =>
  buildRevenueView(buildV3RevenueDetail(workspace, propertyId), ACTION);
const known = (view: View) => { assert.equal(view.state, "known"); return view as Known; };
const conversational = async (over: Parameters<typeof stateOf>[0] = withDate) => persistConversational(stateOf(over), await conversationalConfirmed());

test("aucune sortie : « Non renseigné », jamais « 0 € » ; zéro confirmé : « 0 € » avec état confirmé — la différence est immédiate", async () => {
  const { RealRevenueReport } = await loadComponents();
  const none = known(viewOf(workspaceOf(stateOf())));
  assert.deepEqual([none.headline?.value, none.headline?.kind, none.headline?.stateLabel], ["Non renseigné", "unknown", "Non renseigné"]);
  const noneHtml = plain(renderToStaticMarkup(createElement(RealRevenueReport, { view: none })));
  assert.match(noneHtml, /Non renseigné/);
  assert.doesNotMatch(noneHtml, /0 €/);
  const zeroState = persistDocumentChannel(stateOf(withDate), documentSession([]), [], { confirmAfterBridge: true });
  const zero = known(viewOf(workspaceOf(zeroState)));
  assert.deepEqual([zero.headline?.value, zero.headline?.kind, zero.headline?.stateLabel], ["0 €", "confirmed_zero", "Confirmé"]);
  assert.match(plain(renderToStaticMarkup(createElement(RealRevenueReport, { view: zero }))), /Vous avez confirmé 0 € de recettes/);
});

test("total confirmé : le montant persisté, « Recettes retenues — exercice 2025 », détail par nature", async () => {
  const state = await conversational();
  const view = known(viewOf(workspaceOf(state)));
  assert.equal(view.headlineTitle, "Recettes retenues — exercice 2025");
  assert.equal(plain(view.headline!.value), "6 400 €");
  assert.equal(view.headline!.stateLabel, "Confirmé");
  assert.deepEqual(view.rows.map(row => [row.label, plain(row.value), row.source?.label, row.stateLabel]), [["Loyers encaissés", "6 400 €", "Saisi par vous", "Saisi"]]);
  const { RealRevenueReport, RealRevenueWorkspace } = await loadComponents();
  const html = plain(renderToStaticMarkup(createElement(RealRevenueReport, { view })));
  for (const text of ["Recettes retenues — exercice 2025", "Ce que j’ai retenu", "Ce qui reste à régler", "Documents utilisés", "Nature", "Montant", "Source", "État", "Revoir dans l’Assistant Revenus", "Date de mise en service : 01/06/2025"]) {
    assert.match(html, new RegExp(text), text);
  }
  assert.match(html, /Rien ne reste à régler/);
  assert.match(plain(renderToStaticMarkup(createElement(RealRevenueWorkspace, { view, back: null }))), /Revoir dans l’Assistant Revenus/);
});

test("ajustement janvier/décembre : information sur la ligne, jamais une ligne ni une somme ajoutée", async () => {
  const view = known(viewOf(workspaceOf(await conversational())));
  assert.equal(view.rows.length, 1);
  assert.match(view.rows[0]!.note ?? "", /dont ajustement janvier\/décembre de 800 €, déjà compris/);
  const html = plain(renderToStaticMarkup(createElement((await loadComponents()).RealRevenueReport, { view })));
  assert.doesNotMatch(html, /7 200/, "la somme loyers + ajustement n'apparaît pas");
});

test("non confirmé : « À confirmer » partout, rien de retenu", async () => {
  const state = persistConversational(stateOf(withDate), await conversationalConfirmed(), { confirmed: false });
  const view = known(viewOf(workspaceOf(state)));
  assert.deepEqual([view.headline?.kind, view.headline?.stateLabel], ["unconfirmed", "À confirmer"]);
  assert.ok(view.rows.every(row => row.stateLabel === "À confirmer" && row.tone === "attention"));
  assert.match(view.summary, /pas encore confirmés/);
});

test("estimation d'après le bail : zone secondaire distincte, jamais le montant principal", async () => {
  const { RealRevenueReport } = await loadComponents();
  const view = known(viewOf(workspaceOf(await conversational())));
  assert.equal(view.estimation?.title, "Estimation d’après le bail");
  assert.equal(plain(view.estimation!.lines[0]!.value), "5 600 €");
  assert.notEqual(view.headline?.value, view.estimation!.lines[0]!.value);
  assert.match(view.estimation!.note, /pas un revenu encaissé/);
  const html = plain(renderToStaticMarkup(createElement(RealRevenueReport, { view })));
  assert.match(html, /Estimation d’après le bail/);
  const hidden = known(viewOf(workspaceOf(persistConversational(stateOf({ draft: { inpiConfirmedAt: F009_CONFIRMED_AT } }), await conversationalConfirmed(assistantWithoutDate())))));
  assert.equal(hidden.estimation, null, "date absente : aucune estimation, aucune date par défaut");
  assert.ok(hidden.todo.notes.some(text => text.includes("à renseigner dans l’Assistant Activité")));
});

test("conflit de date : visible dans « ce qui reste à régler », aucun dérivé affiché", async () => {
  const state = await conversational({ ...withDate, properties: [property("home-1", { amortissementBase: { composants: [], dateMiseEnService: "2024-05-02" } })] });
  const view = known(viewOf(workspaceOf(state)));
  assert.equal(view.estimation, null);
  assert.equal(view.serviceDateLine, null);
  const text = view.todo.decisions.find(item => item.startsWith("Date de mise en service"));
  assert.ok(text?.includes("02/05/2024") && text.includes("01/06/2025") && text.includes("Aucune n’est retenue"));
});

test("anomalie bloquante persistée : message tel quel, confirmation non affirmée", async () => {
  const state = structuredClone(await conversational());
  state.declarationDraft!.revenusAssistant!.anomalies = [{ severity: "error", message: "Indemnité GLI signalée comme perçue mais montant non renseigné.", field: "indemnites" }];
  const view = known(viewOf(workspaceOf(state)));
  assert.deepEqual(view.todo.blocking, ["Indemnité GLI signalée comme perçue mais montant non renseigné."]);
  assert.match(view.summary, /vérification reste nécessaire/);
});

test("documents : seulement des documents réels, état neutre sans lecture fiable ; conversationnel : aucun", async () => {
  const documentState = persistDocumentChannel(stateOf({ documents: [{ ...(await import("@/lab/v2-dossier/housing-test-support")).docRow("doc-rev", "Releve.pdf") }], ...withDate }), documentSession(DEFAULT_TRANSACTIONS()), ["doc-rev", "ghost"], { confirmAfterBridge: true });
  const view = known(viewOf(workspaceOf(documentState)));
  assert.deepEqual(view.pieces, [{ name: "Releve.pdf", state: "unknown" }]);
  assert.deepEqual(known(viewOf(workspaceOf(await conversational()))).pieces, []);
});

test("scope non résolu : message neutre, aucune donnée, AUCUN lien vers F013 même si un lien est fourni", async () => {
  const workspace = workspaceOf(await conversational());
  const { RealRevenueReport } = await loadComponents();
  for (const id of [null, "ghost"]) {
    const view = viewOf(workspace, id);
    assert.equal(view.state, "scope_unresolved");
    assert.equal(view.action, null);
    const html = renderToStaticMarkup(createElement(RealRevenueReport, { view }));
    assert.doesNotMatch(html, /href=|Revoir dans/);
    assert.doesNotMatch(html, /6\s?400/, "aucune donnée globale affichée");
  }
});

test("multi-biens : « Non supporté actuellement », aucun total ni détail global, ni fausse valeur", async () => {
  const single = await conversational();
  const multi = stateOf({ properties: [property("home-1"), property("home-2")], draft: single.declarationDraft });
  const view = known(viewOf(workspaceOf(multi)));
  assert.equal(view.support, "facts_only");
  assert.equal(view.headline, null);
  assert.match(view.unsupportedNotice ?? "", /Non supporté actuellement/);
  assert.deepEqual([view.rows, view.pieces], [[], []]);
  const html = plain(renderToStaticMarkup(createElement((await loadComponents()).RealRevenueReport, { view })));
  assert.match(html, /Non supporté actuellement/);
  assert.doesNotMatch(html, /6 400|5 600|Recettes retenues/);
});

test("situation d'entrée : affichée si déterminée, masquée (ligne et texte) si non déterminée", async () => {
  const { RealRevenueReport } = await loadComponents();
  const first = viewOf(workspaceOf(stateOf({ ...withDate, fiscalYear: { priorHistoryDeclaration: { status: "FIRST_REAL_YEAR", declaredAt: "x" } } })));
  assert.equal(known(first).entry?.label, "Première déclaration");
  assert.match(renderToStaticMarkup(createElement(RealRevenueReport, { view: first })), /Situation d’entrée/);
  const undetermined = viewOf(workspaceOf(stateOf(withDate)));
  assert.equal(known(undetermined).entry, null);
  assert.doesNotMatch(renderToStaticMarkup(createElement(RealRevenueReport, { view: undetermined })), /Situation d’entrée|Non déterminée/);
});

test("V3 → F013 : le CTA ouvre /assistants/revenus avec le scope complet, sous la coque V3", () => {
  const action = v3CorrectionActionFor("revenues", V3_SCOPE)!;
  const url = new URL(action.href, "http://x");
  assert.equal(url.pathname, "/assistants/revenus");
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    dossierId: "dossier-1", fiscalYearId: "fy-2025", year: "2025", propertyId: "home-1", v3Shell: "v3", v3Correction: "1",
  });
  assert.equal(v3CorrectionActionFor("revenues", null), null);
  assert.equal(v3CorrectionActionFor("revenues", { ...V3_SCOPE, property: { kind: "not_applicable" } }), null, "F013 exige un bien résolu");
  assert.equal(OWNER_ROUTES["/assistants/revenus"], true);
  assert.equal(V3_ASSISTANT_ROUTES["/assistants/revenus"], "Revenus");
  assert.deepEqual(selectAssistantShell(V3_SCOPE, url.pathname), { kind: "v3-assistant", title: "Revenus" });
  assert.deepEqual(selectAssistantShell({}, url.pathname), { kind: "legacy" });
  const page = readFileSync(path.join(DIR, "../../app/(dashboard)/assistants/revenus/page.tsx"), "utf8");
  assert.match(page, /F013RevenusAssistantPanel/);
});

test("F013 → V3 : retour par le mécanisme R15.1 (ScopedOwnerLink), aucune sortie directe, aucun libellé « Fiscal AI »", () => {
  const panel = readFileSync(path.join(DIR, "../../components/lmnp/assistants/F013RevenusAssistantPanel.tsx"), "utf8");
  assert.match(panel, /import \{ ScopedOwnerLink as Link \} from "@\/components\/lmnp\/app-shell\/scoped-owner-navigation"/);
  assert.equal((panel.match(/<Link href=\{LMNP_ROUTES\.dashboard\}/g) ?? []).length, 3, "toutes les sorties dashboard passent par le lien scopé");
  assert.doesNotMatch(panel, /href=["'{]\s*["'`]?\/(dashboard|documents)/, "aucune sortie en dur");
  assert.doesNotMatch(panel, /Fiscal AI/);
});

test("aucune fixture DEMO, aucun premier bien implicite, aucune date ni donnée fabriquée dans le chemin réel Revenus", () => {
  const files = ["RealRevenue.tsx", "revenue-view-model.ts", "../v2-dossier/revenue-detail-read-model.ts", "../v2-dossier/v3-property-scope.ts"];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /from\s+["'][^"']*(fixtures|\/model|V3Prototype)["']/, file);
    assert.doesNotMatch(source, /DocumentReading|setTimeout|Math\.random/, file);
    assert.doesNotMatch(source, /properties\[0\]|propertyIds\[0\]|properties\.at\(0\)/, file);
    assert.doesNotMatch(source, /new Date\(|Date\.now|`\$\{[^}]*\}-01-01|-06-01/, file);
    assert.doesNotMatch(source, /revenueGptSession|Bordeaux|Lyon Part-Dieu|Gambetta/, `${file} : la session documentaire (libellés fictifs) n'est jamais lue`);
    assert.doesNotMatch(source, /computeRecettesExercice|reconcileRevenus|computeRevenuTheorique|computeMoisLocation/, file);
  }
  const model = read("../v2-dossier/revenue-detail-read-model.ts");
  assert.doesNotMatch(model, /loyersEncaisses\s*\+|\+\s*[a-z.]*ajustementsJanDec/, "aucune reconstruction du total");
  assert.match(model, /output\.totalRecettes/);
  const prototype = read("V3RealPrototype.tsx");
  assert.match(prototype, /buildV3RevenueDetail\(workspace, housingPropertyId, documents\)/);
  assert.doesNotMatch(prototype, /properties\[0\]|propertyIds\[0\]/);
});

test("le gate multi-biens n'est pas étendu et F013 n'est pas modifié", () => {
  const scope = read("../v2-dossier/correction-scope.ts");
  assert.match(scope, /export function propertyScopeFor/);
  const assistant = read("../../runtime/assistants/f013-revenus/assistant.ts");
  assert.match(assistant, /dateMiseEnService: this\.deps\.dateMiseEnService \?\? `\$\{this\.ctx\.fiscalYear\}-01-01`/, "dette backend historique laissée en l'état");
});
