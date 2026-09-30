/**
 * R15.3 — vérité de restitution Activité : adapter pur, rendu, CTA sous coque V3, marque, absence de fixture.
 * États F009 réels (activity-test-support). Un stub `require.extensions` rend le CSS module importable sous tsx.
 *
 * Run: npx tsx --test src/lab/v3-dossier/activity-restitution-truth.test.tsx
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildV3ActivityDetail } from "@/lab/v2-dossier/activity-detail-read-model";
import { NOW, analysedInProgress, confirmedState, docRow, handle, persisted, workspaceOf } from "@/lab/v2-dossier/activity-test-support";
import { v3CorrectionActionFor } from "@/lab/v2-dossier/correction-registry";
import { V3CorrectionScopeContext } from "@/lab/v2-dossier/correction-context";
import type { V3CorrectionScope } from "@/lab/v2-dossier/correction-scope";
import { REVIEW_IN_F009_LABEL, buildActivityView } from "./activity-view-model";

function installCssStub() {
  const extensions = (require as unknown as { extensions: Record<string, (module: { exports: unknown }) => void> }).extensions;
  extensions[".css"] = module => { module.exports = new Proxy({}, { get: (_target, key) => (typeof key === "string" && key !== "__esModule" ? key : undefined) }); };
}
async function loadComponents() {
  installCssStub();
  return import("./RealActivity");
}

const DIR = path.dirname(new URL(import.meta.url).pathname);
const V3_SCOPE: V3CorrectionScope = { dossierId: "dossier-1", fiscalYearId: "fy-2025", year: 2025, property: { kind: "required", propertyId: "home-1" }, shell: "v3" };
const ACTION = { label: REVIEW_IN_F009_LABEL, href: "/assistants/activite?scoped" };
const plain = (html: string) => html.replace(/\s/g, " ");
const doc = () => [docRow("doc-inpi", "Extrait RNE.pdf")];

async function inProgressWorkspace() {
  return workspaceOf(persisted(await analysedInProgress(), false, { inpiDocumentId: "doc-inpi" }), doc());
}
async function confirmedWorkspace() {
  return workspaceOf(persisted(await confirmedState(), true, { inpiDocumentId: "doc-inpi" }), doc(), { regimeConfirmedAt: NOW });
}
const viewOf = (workspace: ReturnType<typeof workspaceOf>) => buildActivityView(buildV3ActivityDetail(workspace), ACTION);

test("1. confirmé : « Retenu » / « Extrait » / « Saisi » selon la preuve, pas d'« À confirmer »", async () => {
  const view = viewOf(await confirmedWorkspace());
  assert.equal(view.confirmed, true);
  assert.match(view.summary, /confirmée dans votre dossier/);
  assert.ok(view.facts.every(fact => fact.stateLabel !== "À confirmer"));
  assert.equal(view.facts.find(fact => fact.id === "regime")?.stateLabel, "Retenu");
  assert.equal(view.facts.find(fact => fact.id === "regime")?.value, "Réel");
  assert.deepEqual(view.todo, { questions: [], decisions: [] });
});

test("2/3. en cours : valeurs intermédiaires présentées « À confirmer », jamais « Retenu »", async () => {
  const view = viewOf(await inProgressWorkspace());
  assert.equal(view.confirmed, false);
  assert.match(view.summary, /pas encore confirmée/);
  assert.ok(view.facts.length > 0);
  assert.ok(view.facts.every(fact => fact.stateLabel === "À confirmer" && fact.tone === "attention"));
  assert.ok(view.facts.every(fact => fact.stateLabel !== "Retenu"));
  const html = plain(renderToStaticMarkup(createElement((await loadComponents()).RealActivityReport, { view })));
  assert.match(html, /80890035100020/);
  assert.match(html, /À confirmer/);
  assert.doesNotMatch(html, />Retenu</);
});

test("4. date de mise en service : « Saisi par vous », jamais « Extrait »", async () => {
  let state = await analysedInProgress();
  state = await handle(state, { type: "review_all" });
  state = await handle(state, { type: "answer", values: { date: "2025-06-01" } });
  const inProgress = viewOf(workspaceOf(persisted(state, false, { inpiDocumentId: "doc-inpi" }), doc()));
  const row = inProgress.facts.find(fact => fact.id === "serviceDate")!;
  assert.deepEqual([row.label, row.value, row.source], ["Date de mise en service", "01/06/2025", { label: "Saisi par vous" }]);
  const confirmed = viewOf(await confirmedWorkspace()).facts.find(fact => fact.id === "serviceDate")!;
  assert.equal(confirmed.stateLabel, "Saisi");
  assert.notEqual(confirmed.stateLabel, "Extrait");
  assert.deepEqual(confirmed.source, { label: "Saisi par vous" });
});

test("5. provenance inconnue : source « — », aucun document ni « Extrait »", () => {
  const draft = { completedSteps: [], siret: "80890035100020", exploitantLastName: "Dupont", exploitantFirstName: "Marie", inpiConfirmedAt: NOW };
  const view = viewOf(workspaceOf(draft, [docRow("doc-x", "Kbis.pdf")]));
  for (const fact of view.facts) { assert.equal(fact.source, null); assert.equal(fact.stateLabel, "Retenu"); }
  assert.deepEqual(view.pieces, []);
});

test("6/7. document INPI réellement associé affiché avec son état ; sans document : phrase neutre", async () => {
  const view = viewOf(await inProgressWorkspace());
  assert.deepEqual(view.pieces, [{ name: "Extrait RNE.pdf", state: "unknown" }]);
  assert.ok(view.facts.some(fact => fact.source?.document === "Extrait RNE.pdf"), "provenance documentaire prouvée par l'état F009");
  const { RealActivityReport } = await loadComponents();
  assert.match(renderToStaticMarkup(createElement(RealActivityReport, { view })), /Extrait RNE\.pdf/);
  const none = plain(renderToStaticMarkup(createElement(RealActivityReport, { view: viewOf(workspaceOf({ completedSteps: [] })) })));
  assert.match(none, /Aucun document n’est rattaché/);
});

test("8/9/10. ce qui reste à régler : questions du helper F009, conflits ; rien quand complet", async () => {
  const view = viewOf(await inProgressWorkspace());
  assert.deepEqual(view.todo.questions, ["Date de mise en service"]);
  const confirmed = await confirmedState();
  const other = (await import("@/lab/v2-dossier/activity-test-support")).projection();
  other.siret = "80890035100038"; other.siretCandidates = [];
  const conflicted = await handle({ ...confirmed, step: "review", history: [] }, { type: "analysis_success", projection: other });
  const withConflict = viewOf(workspaceOf(persisted(conflicted, false, { inpiDocumentId: "doc-inpi" }), doc()));
  assert.ok(withConflict.todo.decisions.some(text => text.includes("SIRET") && text.includes("80890035100038")));
  assert.deepEqual(viewOf(await confirmedWorkspace()).todo, { questions: [], decisions: [] });
  const { RealActivityReport } = await loadComponents();
  assert.match(plain(renderToStaticMarkup(createElement(RealActivityReport, { view: viewOf(await confirmedWorkspace()) }))), /Rien ne reste à régler/);
});

test("11/12. CTA : /assistants/activite avec scope et v3Shell=v3 ; V3ActivityRoute n'est plus la destination", () => {
  const action = v3CorrectionActionFor("activity", V3_SCOPE)!;
  const url = new URL(action.href, "http://x");
  assert.equal(url.pathname, "/assistants/activite");
  assert.equal(url.searchParams.get("v3Shell"), "v3");
  assert.equal(url.searchParams.get("v3Correction"), "1");
  assert.equal(url.searchParams.get("dossierId"), "dossier-1");
  assert.equal(url.searchParams.get("fiscalYearId"), "fy-2025");
  assert.equal(url.searchParams.get("propertyId"), null, "F009 n'exige pas de logement");
  // Hors coque V3 (V2 réel) : route historique inchangée.
  assert.ok(v3CorrectionActionFor("activity", { ...V3_SCOPE, shell: undefined })!.href.startsWith("/lab/v2-dossier/real/activity?"));
  assert.equal(v3CorrectionActionFor("activity", null), null);
  const prototype = readFileSync(path.join(DIR, "V3RealPrototype.tsx"), "utf8");
  assert.doesNotMatch(prototype, /V3ActivityRoute|real\/activity/);
  assert.match(prototype, /REVIEW_IN_F009_LABEL/);
});

test("CTA rendu : libellé « Revoir dans l’Assistant Activité » ; indisponible sans scope vérifié", async () => {
  const { RealActivityReport } = await loadComponents();
  const workspace = await confirmedWorkspace();
  const action = v3CorrectionActionFor("activity", V3_SCOPE)!;
  const html = renderToStaticMarkup(createElement(RealActivityReport, { view: buildActivityView(buildV3ActivityDetail(workspace), { label: REVIEW_IN_F009_LABEL, href: action.href }) }));
  assert.match(html, /Revoir dans l’Assistant Activité/);
  assert.match(html, /href="\/assistants\/activite\?/);
  assert.match(renderToStaticMarkup(createElement(RealActivityReport, { view: buildActivityView(buildV3ActivityDetail(workspace), null) })), /n’est pas disponible/);
});

test("13. aucune fixture DEMO, aucune simulation dans le REAL Activité", () => {
  for (const file of ["RealActivity.tsx", "activity-view-model.ts", "../v2-dossier/activity-detail-read-model.ts"]) {
    const source = readFileSync(path.join(DIR, file), "utf8");
    assert.doesNotMatch(source, /from\s+["'][^"']*(fixtures|\/model|V3Prototype)["']/, file);
    assert.doesNotMatch(source, /DocumentReading|setTimeout|Math\.random/, file);
    assert.doesNotMatch(source, /\b(APE|NAF|SIRENE|TVA)\b|forme juridique/i, file);
  }
});

test("marque : aucun « Fiscal AI » visible sous la coque V3 ; comportement legacy conservé hors V3", async () => {
  installCssStub();
  // The view reaches the Supabase client module through the scoped navigation; a dummy public URL keeps it inert (no call is made).
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const { F009ActiviteView } = await import("@/components/lmnp/assistants/F009ActiviteView");
  const base = { year: 2025, busy: false, documents: [], onAction() {}, onFile() {}, onExistingDocument() {}, onCompanion() {} };
  const states = [
    { version: 2 as const, step: "document" as const, fieldSources: {} },
    { version: 2 as const, step: "pending_registration" as const, registration: "no" as const, fieldSources: {} },
    { version: 2 as const, step: "complete" as const, deferred: true, fieldSources: {} },
  ];
  for (const state of states) {
    const v3 = renderToStaticMarkup(createElement(V3CorrectionScopeContext.Provider, { value: V3_SCOPE }, createElement(F009ActiviteView, { ...base, state })));
    assert.doesNotMatch(v3, /Fiscal AI/, state.step);
    const legacy = renderToStaticMarkup(createElement(F009ActiviteView, { ...base, state }));
    assert.match(legacy, /Fiscal AI/, `legacy ${state.step}`);
  }
  const html = renderToStaticMarkup(createElement(V3CorrectionScopeContext.Provider, { value: V3_SCOPE }, createElement(F009ActiviteView, { ...base, state: states[0]! })));
  assert.match(html, /L’Assistant du Réel récupérera/);
});

test("15. F009 métier inchangé : aucune modification hors export du helper (source des règles)", () => {
  const source = readFileSync(path.join(DIR, "../../runtime/assistants/f009-activite/assistant.ts"), "utf8");
  assert.match(source, /export function nextMissingQuestion\(state: F009State\): F009QuestionStep \| undefined \{\s*return remainingQuestions\(state\)\[0\];/);
  const read = readFileSync(path.join(DIR, "../v2-dossier/activity-detail-read-model.ts"), "utf8");
  assert.match(read, /remainingQuestions/);
  assert.doesNotMatch(read, /validActivityDate\(state\.dateMiseEnService\)|hasIdentifier/, "les règles de questions ne sont pas recopiées");
});
