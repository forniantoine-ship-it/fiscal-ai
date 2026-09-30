/**
 * R15.5 — vérité de restitution du Logement : adapter pur, rendu, CTA sous coque V3, navigation F010, absence de fixture.
 * États F010 réels (housing-test-support). Un stub `require.extensions` rend le CSS module importable sous tsx.
 *
 * Run: npx tsx --test src/lab/v3-dossier/housing-restitution-truth.test.tsx
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { v3CorrectionActionFor } from "@/lab/v2-dossier/correction-registry";
import type { V3CorrectionScope } from "@/lab/v2-dossier/correction-scope";
import { buildV3HousingDetail } from "@/lab/v2-dossier/housing-detail-read-model";
import {
  SERVICE_DATE, analysedThenReview, assistantFor, confirmedState, docRow, persistSession, property, stateOf, workspaceOf,
} from "@/lab/v2-dossier/housing-test-support";
import { REVIEW_IN_F010_LABEL, buildHousingView } from "./housing-view-model";
import { scopedOwnerTarget } from "@/components/lmnp/app-shell/scoped-owner-target";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";

function installCssStub() {
  const extensions = (require as unknown as { extensions: Record<string, (module: { exports: unknown }) => void> }).extensions;
  extensions[".css"] = module => { module.exports = new Proxy({}, { get: (_target, key) => (typeof key === "string" && key !== "__esModule" ? key : undefined) }); };
}
async function loadComponents() {
  installCssStub();
  return import("./RealHousing");
}

const DIR = path.dirname(new URL(import.meta.url).pathname);
const read = (file: string) => readFileSync(path.join(DIR, file), "utf8");
const V3_SCOPE: V3CorrectionScope = { dossierId: "dossier-1", fiscalYearId: "fy-2025", year: 2025, property: { kind: "required", propertyId: "home-1" }, shell: "v3" };
const ACTION = { label: REVIEW_IN_F010_LABEL, href: "/assistants/logement?scoped" };
const plain = (html: string) => html.replace(/\s/g, " ");
const viewOf = (workspace: ReturnType<typeof workspaceOf>, propertyId: string | null = "home-1") =>
  buildHousingView(buildV3HousingDetail(workspace, propertyId), ACTION);
type Known = Extract<ReturnType<typeof viewOf>, { state: "known" }>;
const known = (view: ReturnType<typeof viewOf>) => { assert.equal(view.state, "known"); return view as Known; };

test("confirmé : Saisi / Extrait / Corrigé selon la preuve, montants persistés, situation d'entrée non déterminée sans réponse", async () => {
  const view = known(viewOf(workspaceOf(await confirmedState())));
  assert.equal(view.confirmed, true);
  assert.match(view.summary, /confirmé dans votre dossier/);
  assert.ok(view.facts.every(item => item.stateLabel !== "À confirmer"));
  assert.equal(view.facts.find(item => item.id === "acquisitionDate")?.stateLabel, "Saisi");
  assert.equal(view.facts.find(item => item.id === "landShare")?.stateLabel, "Choix de jugement");
  assert.deepEqual(view.computed.map(item => item.label), ["Prix de revient", "Valeur du terrain", "Valeur du bâti", "Base amortissable du bâti", "Dotation annuelle"]);
  assert.equal(view.entry, null, "situation non déterminée : rien n’est affiché, rien n’est inféré");
  assert.deepEqual(view.todo, { questions: [], toConfirm: [], decisions: [], notes: [] });
});

test("date de mise en service : donnée du bien, Saisi par vous ; jamais Extrait ; absente = à renseigner dans l'Activité", async () => {
  const view = known(viewOf(workspaceOf(await confirmedState())));
  const row = view.facts.find(item => item.id === "serviceDate")!;
  assert.deepEqual([row.label, row.value, row.source, row.stateLabel], ["Date de mise en service", "01/06/2025", { label: "Saisi par vous" }, "Saisi"]);
  const without = known(viewOf(workspaceOf(stateOf())));
  assert.equal(without.facts.find(item => item.id === "serviceDate"), undefined);
  assert.ok(without.todo.notes.some(text => text.includes("à renseigner dans l’Assistant Activité")));
});

test("conflit de date : aucune ligne de date, deux valeurs exposées, aucune retenue", async () => {
  const state = await confirmedState({ properties: [property("home-1", { amortissementBase: { composants: [], dateMiseEnService: "2024-05-02" } })] });
  const view = known(viewOf(workspaceOf(state)));
  assert.equal(view.facts.find(item => item.id === "serviceDate"), undefined);
  const text = view.todo.decisions.find(item => item.startsWith("Date de mise en service"));
  assert.ok(text?.includes("02/05/2024") && text.includes("01/06/2025") && text.includes("Aucune n’est retenue"));
});

test("en cours : valeurs « À confirmer », jamais « Retenu » ; questions et confirmations distinctes", async () => {
  const assistant = assistantFor();
  const review = await analysedThenReview(assistant, "doc-acte", { prixAcquisition: 200000, typeBien: "appartement" });
  const state = persistSession(stateOf({ documents: [docRow("doc-acte", "Acte.pdf")], draft: { dateMiseEnService: SERVICE_DATE } }), review, "doc-acte");
  const view = known(viewOf(workspaceOf(state)));
  const proposed = view.facts.filter(item => item.id === "acquisitionPrice" || item.id === "propertyType");
  assert.ok(proposed.length === 2 && proposed.every(item => item.stateLabel === "À confirmer" && item.tone === "attention"));
  assert.match(view.summary, /pas encore confirmé/);
  assert.deepEqual(view.todo.toConfirm.sort(), ["Prix d’acquisition", "Type de bien"]);
  assert.deepEqual(view.todo.questions, ["Date d’acquisition", "Frais de notaire", "Traitement des frais", "Mobilier", "Part de terrain"]);
  assert.deepEqual(view.pieces, [{ name: "Acte.pdf", state: "unknown" }], "état d'analyse non déterminé, jamais « lecture en cours »");
});

test("scope non résolu : message neutre, aucune donnée, AUCUN lien vers F010 même si un lien est fourni", async () => {
  const workspace = workspaceOf(await confirmedState());
  for (const id of [null, "ghost"]) {
    const view = viewOf(workspace, id);
    assert.equal(view.state, "scope_unresolved");
    assert.equal(view.action, null);
    const { RealHousingReport } = await loadComponents();
    const html = renderToStaticMarkup(createElement(RealHousingReport, { view }));
    assert.doesNotMatch(html, /href=|Revoir dans/);
    assert.doesNotMatch(html, /200\s?000/, "aucune donnée globale affichée");
  }
});

test("multi-biens : « Non supporté actuellement », aucune sortie F010 globale attribuée, situation non déterminée", async () => {
  const single = await confirmedState();
  const multi = stateOf({ properties: [property("home-1", { address: "Adresse A" }), property("home-2")], draft: single.declarationDraft });
  const view = known(viewOf(workspaceOf(multi)));
  assert.equal(view.support, "facts_only");
  assert.match(view.unsupportedNotice ?? "", /Non supporté actuellement/);
  assert.deepEqual(view.computed, []);
  assert.equal(view.entry, null, "situation non déterminée : rien n’est affiché, rien n’est inféré");
  const { RealHousingReport } = await loadComponents();
  const html = plain(renderToStaticMarkup(createElement(RealHousingReport, { view })));
  assert.match(html, /Non supporté actuellement/);
  assert.doesNotMatch(html, /200 000|Dotation annuelle|Prix de revient/);
});

test("rendu : sections de la grammaire, tableau Information | Valeur | Source | État, CTA « Revoir dans l’Assistant Logement »", async () => {
  const { RealHousingReport, RealHousingWorkspace } = await loadComponents();
  const view = viewOf(workspaceOf(await confirmedState()));
  const html = plain(renderToStaticMarkup(createElement(RealHousingReport, { view })));
  for (const text of ["Ce que ça donne", "Ce que j’ai retenu", "Ce qui reste à régler", "Documents utilisés", "Information", "Valeur", "Source", "État", "Revoir dans l’Assistant Logement"]) {
    assert.match(html, new RegExp(text), text);
  }
  assert.match(html, /Rien ne reste à régler/);
  assert.doesNotMatch(html, /Situation d’entrée|Non déterminée/, "entrée non déterminée : ligne et texte masqués");
  const workspaceHtml = plain(renderToStaticMarkup(createElement(RealHousingWorkspace, { view, back: null })));
  assert.match(workspaceHtml, /Revoir dans l’Assistant Logement/);
});

test("CTA V3 : /assistants/logement avec dossierId, fiscalYearId, year, propertyId, v3Correction=1, v3Shell=v3 ; pas de scope = pas de lien", () => {
  const action = v3CorrectionActionFor("property", V3_SCOPE)!;
  const url = new URL(action.href, "http://x");
  assert.equal(url.pathname, "/assistants/logement");
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    dossierId: "dossier-1", fiscalYearId: "fy-2025", year: "2025", propertyId: "home-1", v3Shell: "v3", v3Correction: "1",
  });
  assert.equal(v3CorrectionActionFor("property", null), null);
  assert.equal(v3CorrectionActionFor("property", { ...V3_SCOPE, property: { kind: "not_applicable" } }), null, "F010 exige un bien résolu");
});

test("navigation F010 : sous V3 la sortie « tableau de bord » est le retour confirmé ; legacy inchangé", () => {
  const panel = readFileSync(path.join(DIR, "../../components/lmnp/assistants/F010LogementAssistantPanel.tsx"), "utf8");
  assert.doesNotMatch(panel, /<Link[\s\S]*?<Button/, "pas de lien englobant un bouton");
  assert.equal((panel.match(/<DashboardExitButton /g) ?? []).length, 3, "les trois sorties dashboard");
  assert.match(panel, /exit\.active[\s\S]*?exit\.run\(\)/);
  assert.match(panel, /<Button href=\{dashboardHref \?\? undefined\}/, "legacy : href historique conservé");
  assert.doesNotMatch(panel, /href=\{dashboardHref \?\? undefined\}[\s\S]{0,40}v3/);
  // The R15.1 rule for a dashboard link under the V3 shell is an exit through the confirmed save.
  assert.deepEqual(scopedOwnerTarget(LMNP_ROUTES.dashboard, V3_SCOPE), { kind: "exit" });
  assert.deepEqual(scopedOwnerTarget(LMNP_ROUTES.dashboard, null), { kind: "link", href: LMNP_ROUTES.dashboard });
});

test("aucune fixture DEMO, aucun premier bien implicite, aucune date fabriquée dans le chemin réel Logement", () => {
  const files = ["RealHousing.tsx", "housing-view-model.ts", "../v2-dossier/housing-detail-read-model.ts", "../v2-dossier/property-service-date.ts"];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /from\s+["'][^"']*(fixtures|\/model|V3Prototype)["']/, file);
    assert.doesNotMatch(source, /DocumentReading|setTimeout|Math\.random/, file);
    assert.doesNotMatch(source, /properties\[0\]|propertyIds\[0\]|properties\.at\(0\)/, file);
    assert.doesNotMatch(source, /new Date\(|Date\.now|-01-01|-06-01/, file);
    assert.doesNotMatch(source, /fieldSources\.prixRevient/, file);
  }
  const prototype = read("V3RealPrototype.tsx");
  assert.doesNotMatch(prototype, /properties\[0\]|propertyIds\[0\]/);
  assert.match(prototype, /buildV3HousingDetail\(workspace, housingPropertyId, documents\)/);
  assert.match(prototype, /scope\?\.property\.kind === "required"/);
});

test("le gate multi-biens n'est pas étendu : propertyScopeFor reste mono-bien uniquement", async () => {
  const { propertyScopeFor } = await import("@/lab/v2-dossier/correction-scope");
  assert.deepEqual(propertyScopeFor(["a"], [{ id: "a" }]), { kind: "required", propertyId: "a" });
  assert.equal(propertyScopeFor(["a", "b"], [{ id: "a" }, { id: "b" }]), null);
  assert.equal(propertyScopeFor(["a"], [{ id: "a" }, { id: "b" }]), null);
  assert.deepEqual(propertyScopeFor([], []), { kind: "not_applicable" });
});

test("moteur F010 inchangé : nextMissingF010Field = premier de remainingF010Fields, helpers de conflit réexportés à l'identique", async () => {
  const assistantSource = readFileSync(path.join(DIR, "../../runtime/assistants/f010-logement/assistant.ts"), "utf8");
  assert.match(assistantSource, /function nextMissingF010Field\(state: F010State\): F010FieldKey \| null \{\s*return remainingF010Fields\(state\)\[0\] \?\? null;/);
  const pure = await import("@/lib/lmnp/services/f010/f010-review-conflicts");
  assert.equal(typeof pure.collectF010ReviewConflictFields, "function");
  const panelSource = readFileSync(path.join(DIR, "../../components/lmnp/assistants/F010LogementAssistantPanel.tsx"), "utf8");
  assert.match(panelSource, /export \{\s*collectF010ReviewConflictFields,\s*computeF010ReviewVisibleEntries,\s*f010ReviewFieldCurrentValue,\s*isF010ReviewFieldConflict,\s*\};/);
  assert.doesNotMatch(panelSource, /export function isF010ReviewFieldConflict|export function collectF010ReviewConflictFields/);
});

test("situation d'entrée déterminée : toujours affichée ; « Non déterminée » jamais transformée en autre chose", async () => {
  const { RealHousingReport } = await loadComponents();
  const first = viewOf(workspaceOf(stateOf({ fiscalYear: { priorHistoryDeclaration: { status: "FIRST_REAL_YEAR", declaredAt: "x" } } })));
  assert.equal(known(first).entry?.label, "Première déclaration");
  assert.match(plain(renderToStaticMarkup(createElement(RealHousingReport, { view: first }))), /Situation d’entrée : <strong>Première déclaration/);
  const undetermined = viewOf(workspaceOf(stateOf()));
  assert.equal(known(undetermined).entry, null);
  assert.doesNotMatch(renderToStaticMarkup(createElement(RealHousingReport, { view: undetermined })), /Première déclaration|Situation d’entrée/);
});

test("wording F010 : l'intitulé d'exercice décrit la valeur amortissable, millésime dynamique", () => {
  const panel = readFileSync(path.join(DIR, "../../components/lmnp/assistants/F010LogementAssistantPanel.tsx"), "utf8");
  assert.match(panel, /Exercice \{fiscalYear\} — nous allons déterminer la valeur amortissable de votre logement et calculer l’amortissement correspondant\./);
  assert.doesNotMatch(panel, /vous fait économiser chaque année/);
});
