/**
 * R15.7 — vérité de restitution des Charges : adapter pur, rendu, CTA sous coque V3, navigation F012, absence de fixture.
 * Sorties F012 réelles (charges-test-support). Un stub `require.extensions` rend le CSS module importable sous tsx.
 *
 * Run: npx tsx --test src/lab/v3-dossier/charges-restitution-truth.test.tsx
 */
import "@/lab/v2-dossier/test-public-env";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { lmnpReducer } from "@/lib/lmnp/store/reducer";
import { buildV3ChargesDetail } from "@/lab/v2-dossier/charges-detail-read-model";
import {
  F009_CONFIRMED_AT, PROFIL_SIMPLE, SERVICE_DATE, chargesAssistantFor, chargesFromTaxDocument, chargesWithAmortizableWorks,
  chargesWithFinancingOverlap, completeCharges, persistCharges, rewriteChargesSession, simpleCharges, step,
} from "@/lab/v2-dossier/charges-test-support";
import { v3CorrectionActionFor } from "@/lab/v2-dossier/correction-registry";
import { OWNER_ROUTES, type V3CorrectionScope } from "@/lab/v2-dossier/correction-scope";
import { docRow, property, stateOf, workspaceOf } from "@/lab/v2-dossier/housing-test-support";
import { V3_ASSISTANT_ROUTES, selectAssistantShell } from "./assistant-shell-model";
import { REVIEW_IN_F012_LABEL, buildChargesView, chargesRubrique } from "./charges-view-model";

function installCssStub() {
  const extensions = (require as unknown as { extensions: Record<string, (module: { exports: unknown }) => void> }).extensions;
  extensions[".css"] = module => { module.exports = new Proxy({}, { get: (_target, key) => (typeof key === "string" && key !== "__esModule" ? key : undefined) }); };
}
async function loadComponents() {
  installCssStub();
  return import("./RealCharges");
}

const DIR = path.dirname(new URL(import.meta.url).pathname);
const read = (file: string) => readFileSync(path.join(DIR, file), "utf8");
const V3_SCOPE: V3CorrectionScope = { dossierId: "dossier-1", fiscalYearId: "fy-2025", year: 2025, property: { kind: "required", propertyId: "home-1" }, shell: "v3" };
const ACTION = { label: REVIEW_IN_F012_LABEL, href: "/assistants/charges?scoped" };
const withDate = { draft: { dateMiseEnService: SERVICE_DATE, inpiConfirmedAt: F009_CONFIRMED_AT } };
const plain = (html: string) => html.replace(/\s/g, " ");
type View = ReturnType<typeof buildChargesView>;
type Known = Extract<View, { state: "known" }>;
const viewOf = (workspace: ReturnType<typeof workspaceOf>, propertyId: string | null = "home-1") =>
  buildChargesView(buildV3ChargesDetail(workspace, propertyId), ACTION);
const known = (view: View) => { assert.equal(view.state, "known"); return view as Known; };
const simple = async () => persistCharges(stateOf(withDate), await simpleCharges());
async function render(view: View, workspace = false) {
  const components = await loadComponents();
  return plain(renderToStaticMarkup(createElement(workspace ? components.RealChargesWorkspace : components.RealChargesReport, { view, back: null } as never)));
}

test("aucune sortie : « Charges non renseignées », jamais « 0 € » ; zéro confirmé : « 0 € » confirmé — la différence est immédiate", async () => {
  const none = known(viewOf(workspaceOf(stateOf())));
  assert.deepEqual([none.headline?.value, none.headline?.kind, none.headline?.stateLabel], ["Non renseigné", "unknown", "Non renseigné"]);
  const noneHtml = await render(none);
  assert.match(noneHtml, /Charges non renseignées/);
  assert.doesNotMatch(noneHtml, /0 €/);

  const zero = known(viewOf(workspaceOf(persistCharges(stateOf(withDate), await completeCharges({ nothingPaid: true })))));
  assert.deepEqual([zero.headline?.value, zero.headline?.kind, zero.headline?.stateLabel], ["0 €", "confirmed_zero", "Confirmé"]);
  assert.match(await render(zero), /Vous avez confirmé 0 € de charges déductibles/);
});

test("montant principal : « Charges déductibles de l’exercice 2025 » = totalDeductible persisté ; jamais « Total des charges »", async () => {
  const state = persistCharges(stateOf(withDate), await completeCharges());
  const view = known(viewOf(workspaceOf(state)));
  assert.equal(view.headlineTitle, "Charges déductibles de l’exercice 2025");
  assert.equal(view.headline?.value, "787,50 €");
  assert.equal(state.declarationDraft!.chargesAssistant!.totalDeductible, 787.5);
  assert.deepEqual([view.headline?.kind, view.headline?.stateLabel], ["known_amount", "Confirmé"]);
  assert.equal(view.summary, "Vos charges sont complètes pour cet exercice.");
  const html = await render(view);
  assert.match(html, /Charges déductibles de l’exercice 2025/);
  assert.doesNotMatch(html, /Total des charges/i);
  assert.match(await render(view, true), /Charges déductibles de l’exercice 2025/);
});

test("tableau par catégorie : Nature | Montant déductible | Source | État, provenance réelle, aucune ligne à 0", async () => {
  const view = known(viewOf(workspaceOf(await simple())));
  assert.deepEqual(view.rows.map(row => [row.label, row.value, row.source?.label, row.stateLabel]), [
    ["Taxe foncière", "700 €", "Saisi par vous", "Saisi"],
    ["Assurance PNO", "87,50 €", "Saisi par vous", "Saisi"],
  ]);
  const html = await render(view);
  for (const column of ["Nature", "Montant déductible", "Source", "État"]) assert.ok(html.includes(column), column);
  assert.doesNotMatch(html, /Assurance GLI|Copropriété|Travaux|Frais bancaires/, "aucune catégorie absente n'est affichée");
  const document = known(viewOf(workspaceOf(persistCharges(stateOf({ documents: [docRow("doc-tf", "Avis TF.pdf")], ...withDate }), await chargesFromTaxDocument()))));
  assert.deepEqual(document.rows.map(row => [row.source?.label, row.stateLabel]), [["Extrait d’un document", "Extrait"]]);
  assert.deepEqual(document.pieces, [{ name: "Avis TF.pdf", state: "unknown" }]);
});

test("sortie sans confirmation ou après suppression d'un document : jamais « confirmées », montant présenté comme ancienne sortie à confirmer", async () => {
  const unconfirmed = known(viewOf(workspaceOf(persistCharges(stateOf(withDate), await simpleCharges(), { confirmed: false }))));
  const before = persistCharges(stateOf({ documents: [docRow("doc-tf", "Avis TF.pdf")], ...withDate }), await chargesFromTaxDocument());
  const deleted = known(viewOf(workspaceOf(lmnpReducer(before, { type: "REMOVE_DOCUMENT", documentId: "doc-tf" }))));
  for (const view of [unconfirmed, deleted]) {
    assert.deepEqual([view.headline?.kind, view.headline?.stateLabel], ["unconfirmed", "À confirmer"]);
    assert.ok(view.rows.every(row => row.stateLabel === "À confirmer" && row.tone === "attention"));
    assert.match(view.headline!.caption, /n’est plus confirmée/);
    const html = await render(view);
    assert.doesNotMatch(html, /sont confirmées|Résultat retenu|Confirmé|Vous avez confirmé/);
    assert.match(html, /À confirmer/);
    assert.match(html, /revoyez-la et reconfirmez-la dans l’Assistant Charges/);
  }
  assert.equal(deleted.headline?.value, "875 €", "la sortie n'est ni supprimée ni recalculée");
  assert.deepEqual(deleted.pieces, [], "le document supprimé n'est plus présenté");
});

test("registre périmé : montant marqué « À revoir », provenance et documents masqués", async () => {
  const fresh = persistCharges(stateOf({ documents: [docRow("doc-tf", "Avis TF.pdf")], ...withDate }), await chargesFromTaxDocument());
  const stale = known(viewOf(workspaceOf(rewriteChargesSession(fresh))));
  assert.deepEqual([stale.headline?.kind, stale.headline?.stateLabel], ["stale", "À revoir"]);
  assert.deepEqual(stale.rows.map(row => [row.source, row.stateLabel]), [[null, "À revoir"]]);
  assert.deepEqual(stale.pieces, []);
  const html = await render(stale);
  assert.doesNotMatch(html, /Avis TF|Extrait|sont confirmées|Résultat retenu/);
});

test("amortissable et composants : zone « Orienté vers l’amortissement », jamais dans les charges déductibles", async () => {
  const view = known(viewOf(workspaceOf(persistCharges(stateOf(withDate), await chargesWithAmortizableWorks()))));
  assert.equal(view.headline?.value, "700 €");
  assert.deepEqual(view.rows.map(row => row.label), ["Taxe foncière"]);
  const block = view.secondary.find(item => item.id === "amortizable");
  assert.equal(block?.title, "Orienté vers l’amortissement");
  assert.deepEqual([plain(block!.amount), block!.lines.map(line => [line.label, plain(line.value)])], ["5 000 €", [["Cuisine équipée", "5 000 €"]]]);
  assert.match(block!.note, /ne sont pas des charges déductibles/);
  const html = await render(view);
  assert.match(html, /Orienté vers l’amortissement/);
  assert.doesNotMatch(html, /5 700|5\s?700/);
});

test("F011 : « Déjà compté dans Financement » à part, jamais réadditionné ; l'exclusion est un « Non retenu »", async () => {
  const view = known(viewOf(workspaceOf(persistCharges(stateOf(withDate), await chargesWithFinancingOverlap()))));
  assert.equal(view.headline?.value, "700 €");
  assert.deepEqual(view.secondary.map(item => [item.id, item.title, item.amount]).sort(), [
    ["financing", "Déjà compté dans Financement", "300 €"], ["pre_exploitation", "Avant mise en location", "500 €"],
  ]);
  assert.deepEqual(view.notRetained, [{ label: "Assurance emprunteur", value: "300 €", reason: "déjà compté dans Financement" }]);
  assert.deepEqual(view.rows.map(row => row.value), ["700 €"]);
  const html = await render(view);
  assert.match(html, /Déjà compté dans Financement/);
  assert.match(html, /ne sont pas ajoutés aux charges/);
  assert.doesNotMatch(html, /1 000 €|1\s?000\s?€/);
});

test("non déductible : zone « Non déductibles » séparée, sans raison inventée", async () => {
  const state = structuredClone(await simple());
  state.declarationDraft!.chargesAssistant!.totalNonDeductible = 90;
  state.declarationDraft!.chargesAssistant!.parCategorieNonDeductible = { divers: 90 };
  const view = known(viewOf(workspaceOf(state)));
  const block = view.secondary.find(item => item.id === "non_deductible")!;
  assert.deepEqual([block.title, block.amount, block.lines], ["Non déductibles", "90 €", [{ label: "Divers", value: "90 €" }]]);
  assert.equal(view.headline?.value, "787,50 €");
  assert.doesNotMatch(block.note, /car|parce que|personnel/i, "aucune raison inventée");
});

test("avant mise en location : présenté seulement avec une date réelle démontrée, sinon aucun chiffre ni date fabriquée", async () => {
  const withReal = known(viewOf(workspaceOf(await simple())));
  assert.equal(withReal.secondary.find(item => item.id === "pre_exploitation")?.amount, "562,50 €");
  assert.match(withReal.serviceDateLine ?? "", /01\/06\/2025/);
  const absent = persistCharges(stateOf({ draft: { inpiConfirmedAt: F009_CONFIRMED_AT } }), await simpleCharges(chargesAssistantFor({})));
  const view = known(viewOf(workspaceOf(absent)));
  assert.equal(view.secondary.find(item => item.id === "pre_exploitation"), undefined);
  assert.equal(view.serviceDateLine, null);
  assert.ok(view.todo.notes.some(note => note.startsWith("Date de mise en service · à renseigner")));
  assert.doesNotMatch(await render(view), /01\/06|2025-06-01|Avant mise en location/);
  const conflict = known(viewOf(workspaceOf(persistCharges(stateOf({ ...withDate, properties: [property("home-1", { amortissementBase: { composants: [], dateMiseEnService: "2024-05-02" } })] }), await simpleCharges()))));
  assert.equal(conflict.secondary.find(item => item.id === "pre_exploitation"), undefined);
  assert.ok(conflict.todo.decisions.some(text => text.includes("02/05/2024") && text.includes("01/06/2025") && text.includes("Aucune n’est retenue")));
});

test("ce qui reste à régler : familles « je ne sais pas », choix en attente ; « rien payé » n'y figure pas", async () => {
  const view = known(viewOf(workspaceOf(await simple())));
  assert.deepEqual(view.todo.decisions, ["Autre chose payé pour ce logement · à compléter."]);
  const deleted = known(viewOf(workspaceOf(lmnpReducer(persistCharges(stateOf({ documents: [docRow("doc-tf", "Avis TF.pdf")], ...withDate }), await chargesFromTaxDocument()), { type: "REMOVE_DOCUMENT", documentId: "doc-tf" }))));
  assert.ok(deleted.todo.decisions.some(text => text.startsWith("Taxe foncière · un choix")));
  const assistant = chargesAssistantFor();
  let state = await step(assistant, assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
  state = await step(assistant, state, { type: "none_category" });
  while (state.step === "category_collect") state = await step(assistant, state, { type: "skip_category" });
  state = await step(assistant, state, { type: "confirm_completeness", hasOther: false });
  const none = known(viewOf(workspaceOf(persistCharges(stateOf(withDate), (await assistant.handle(state, { type: "confirm_all" })).state))));
  assert.deepEqual(none.coverageNotes, ["Vous avez indiqué n’avoir rien payé : Impôts du logement."]);
  assert.equal(none.todo.decisions.some(text => text.startsWith("Impôts du logement")), false);
});

test("scope non résolu : message neutre, aucune donnée, AUCUN lien vers F012 même si un lien est fourni", async () => {
  const workspace = workspaceOf(await simple());
  for (const id of [null, "ghost"]) {
    const view = viewOf(workspace, id);
    assert.equal(view.state, "scope_unresolved");
    assert.equal(view.action, null);
    const html = await render(view);
    assert.doesNotMatch(html, /href=|Revoir dans/);
    assert.doesNotMatch(html, /787|700/, "aucune donnée globale affichée");
  }
});

test("multi-biens : « Non supporté actuellement », aucun total ni détail global, ni fausse valeur", async () => {
  const single = await simple();
  const multi = stateOf({ properties: [property("home-1"), property("home-2")], draft: single.declarationDraft });
  const view = known(viewOf(workspaceOf(multi)));
  assert.equal(view.support, "facts_only");
  assert.equal(view.headline, null);
  assert.match(view.unsupportedNotice ?? "", /Non supporté actuellement/);
  assert.deepEqual([view.rows, view.secondary, view.notRetained, view.pieces], [[], [], [], []]);
  const html = await render(view);
  assert.match(html, /Non supporté actuellement/);
  assert.doesNotMatch(html, /787|700|Charges déductibles de l’exercice/);
});

test("situation d'entrée : affichée si déterminée, masquée (ligne et texte) si non déterminée", async () => {
  const first = viewOf(workspaceOf(persistCharges(stateOf({ ...withDate, fiscalYear: { priorHistoryDeclaration: { status: "FIRST_REAL_YEAR", declaredAt: "x" } } }), await simpleCharges())));
  assert.equal(known(first).entry?.label, "Première déclaration");
  assert.match(await render(first), /Situation d’entrée/);
  const undetermined = viewOf(workspaceOf(await simple()));
  assert.equal(known(undetermined).entry, null);
  assert.doesNotMatch(await render(undetermined), /Situation d’entrée|Non déterminée/);
});

test("statut utilisateur : confirmée + rien à régler → « Confirmé » ; confirmée + reste à régler → « À compléter » avec le montant conservé ; non confirmée → « À confirmer » ; périmée → « À revoir » ; aucune sortie → « Non renseigné »", async () => {
  const complete = known(viewOf(workspaceOf(persistCharges(stateOf(withDate), await completeCharges()))));
  assert.deepEqual([complete.headline?.stateLabel, complete.summary], ["Confirmé", "Vos charges sont complètes pour cet exercice."]);
  assert.deepEqual([complete.todo.decisions, complete.todo.notes], [[], []]);

  const incomplete = known(viewOf(workspaceOf(await simple())));
  assert.ok(incomplete.todo.decisions.length > 0);
  assert.deepEqual([incomplete.headline?.stateLabel, incomplete.headline?.kind, incomplete.headline?.value], ["À compléter", "known_amount", "787,50 €"], "montant conservé, jamais dégradé en non confirmé");
  assert.equal(incomplete.summary, "Certaines informations restent à renseigner avant de finaliser vos charges.");
  const html = await render(incomplete);
  assert.doesNotMatch(html, /Confirmé|sont confirmées|sont complètes/);
  assert.match(html, /À compléter/);
  assert.match(html, /787,50 €/);

  const unconfirmed = known(viewOf(workspaceOf(persistCharges(stateOf(withDate), await completeCharges(), { confirmed: false }))));
  assert.equal(unconfirmed.headline?.stateLabel, "À confirmer");
  const stale = known(viewOf(workspaceOf(rewriteChargesSession(persistCharges(stateOf(withDate), await completeCharges())))));
  assert.equal(stale.headline?.stateLabel, "À revoir");
  assert.equal(known(viewOf(workspaceOf(stateOf()))).headline?.stateLabel, "Non renseigné");
});

test("carte du tableau de bord : dérivée du même statut que le hero", async () => {
  const existing = { summary: "Charges classées", complete: true };
  const complete = viewOf(workspaceOf(persistCharges(stateOf(withDate), await completeCharges())));
  assert.deepEqual(chargesRubrique(complete, existing), { summary: "Charges classées", tone: "ok" });
  const incomplete = viewOf(workspaceOf(await simple()));
  assert.deepEqual(chargesRubrique(incomplete, existing), { summary: "Charges à compléter", tone: "attention" }, "confirmée + reste à régler");
  const unconfirmed = viewOf(workspaceOf(persistCharges(stateOf(withDate), await completeCharges(), { confirmed: false })));
  assert.deepEqual(chargesRubrique(unconfirmed, existing), { summary: "Charges à confirmer", tone: "attention" });
  const stale = viewOf(workspaceOf(rewriteChargesSession(await simple())));
  assert.deepEqual(chargesRubrique(stale, existing), { summary: "Charges à revoir", tone: "attention" });
  assert.equal(chargesRubrique(viewOf(workspaceOf(stateOf())), { summary: "x", complete: true }).tone, "attention", "aucune sortie");
  assert.equal(chargesRubrique(viewOf(workspaceOf(stateOf())), { summary: "x", complete: true }).summary, "Charges à compléter");
});

test("invariant : jamais « Confirmé » en même temps qu'un élément dans « Ce qui reste à régler » (hero comme carte)", async () => {
  const workspaces = [
    workspaceOf(persistCharges(stateOf(withDate), await completeCharges())),
    workspaceOf(persistCharges(stateOf(withDate), await completeCharges({ nothingPaid: true }))),
    workspaceOf(await simple()),
    workspaceOf(persistCharges(stateOf(withDate), await chargesWithFinancingOverlap())),
    workspaceOf(persistCharges(stateOf(withDate), await chargesWithAmortizableWorks())),
    workspaceOf(persistCharges(stateOf({ draft: { inpiConfirmedAt: F009_CONFIRMED_AT } }), await simpleCharges(chargesAssistantFor({})))),
    workspaceOf(persistCharges(stateOf({ ...withDate, properties: [property("home-1", { amortissementBase: { composants: [], dateMiseEnService: "2024-05-02" } })] }), await completeCharges())),
    workspaceOf(persistCharges(stateOf({ documents: [docRow("doc-tf", "Avis TF.pdf")], ...withDate }), await chargesFromTaxDocument())),
    workspaceOf(lmnpReducer(persistCharges(stateOf({ documents: [docRow("doc-tf", "Avis TF.pdf")], ...withDate }), await chargesFromTaxDocument()), { type: "REMOVE_DOCUMENT", documentId: "doc-tf" })),
    workspaceOf(rewriteChargesSession(await simple())),
    workspaceOf(stateOf()),
  ];
  for (const workspace of workspaces) {
    const view = known(viewOf(workspace));
    const listed = view.todo.decisions.length + view.todo.notes.length;
    const html = await render(view);
    if (listed > 0) {
      assert.notEqual(view.headline?.stateLabel, "Confirmé");
      assert.doesNotMatch(html, /Confirmé|sont confirmées|sont complètes/);
      assert.equal(chargesRubrique(view, { summary: "Charges classées", complete: true }).tone, "attention");
    } else if (view.headline?.stateLabel === "Confirmé") {
      assert.equal(chargesRubrique(view, { summary: "x", complete: false }).tone, "ok");
    }
  }
});

test("V3 → F012 : le CTA « Revoir dans l’Assistant Charges » ouvre /assistants/charges avec le scope complet, sous la coque V3", () => {
  assert.equal(REVIEW_IN_F012_LABEL, "Revoir dans l’Assistant Charges");
  const action = v3CorrectionActionFor("charges", V3_SCOPE)!;
  const url = new URL(action.href, "http://x");
  assert.equal(url.pathname, "/assistants/charges");
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    dossierId: "dossier-1", fiscalYearId: "fy-2025", year: "2025", propertyId: "home-1", v3Shell: "v3", v3Correction: "1",
  });
  assert.equal(v3CorrectionActionFor("charges", null), null);
  assert.equal(OWNER_ROUTES["/assistants/charges"], true);
  assert.equal(V3_ASSISTANT_ROUTES["/assistants/charges"], "Charges");
  assert.deepEqual(selectAssistantShell(V3_SCOPE, url.pathname), { kind: "v3-assistant", title: "Charges" });
  assert.deepEqual(selectAssistantShell({}, url.pathname), { kind: "legacy" });
  const page = readFileSync(path.join(DIR, "../../app/(dashboard)/assistants/charges/page.tsx"), "utf8");
  assert.match(page, /F012ChargesAssistantPanel/);
});

test("F012 → V3 : retour par le mécanisme R15.1 (ScopedOwnerLink), aucune sortie directe, aucun libellé « Fiscal AI »", () => {
  const panel = readFileSync(path.join(DIR, "../../components/lmnp/assistants/F012ChargesAssistantPanel.tsx"), "utf8");
  assert.match(panel, /import \{ ScopedOwnerLink as Link \} from "@\/components\/lmnp\/app-shell\/scoped-owner-navigation"/);
  assert.ok((panel.match(/<Link href=\{LMNP_ROUTES\.dashboard\}/g) ?? []).length >= 2, "les sorties dashboard passent par le lien scopé");
  assert.doesNotMatch(panel, /<a\s[^>]*href=["'{]\s*["'`]?\/(dashboard|documents)/, "aucune sortie en dur");
  assert.doesNotMatch(panel, /Fiscal AI/);
});

test("aucune fixture DEMO, aucun premier bien implicite, aucune date ni donnée fabriquée, aucun recalcul dans le chemin réel Charges", () => {
  const files = ["RealCharges.tsx", "charges-view-model.ts", "../v2-dossier/charges-detail-read-model.ts"];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /from\s+["'][^"']*(fixtures|\/model|V3Prototype)["']/, file);
    assert.doesNotMatch(source, /DocumentReading|setTimeout|Math\.random/, file);
    assert.doesNotMatch(source, /properties\[0\]|propertyIds\[0\]|properties\.at\(0\)/, file);
    assert.doesNotMatch(source, /new Date\(|Date\.now|`\$\{[^}]*\}-01-01|-06-01/, file);
    assert.doesNotMatch(source, /chargesDocumentIds|chargesAmortizationDecisions/, `${file} : canal historique jamais lu`);
    assert.doesNotMatch(source, /computeChargesExercice|computeCoproDeductible|qualifyTravail|detectFinancementOverlap|computeRecouvrement|teomRecuperee|prorata/i, file);
  }
  const model = read("../v2-dossier/charges-detail-read-model.ts");
  assert.match(model, /output\.totalDeductible/);
  assert.doesNotMatch(model, /totalDeductible\s*=[^=]|totalDeductible:\s*[^o]*reduce/, "aucune reconstruction du total déductible");
  const prototype = read("V3RealPrototype.tsx");
  assert.match(prototype, /buildV3ChargesDetail\(workspace, housingPropertyId, documents\)/);
  assert.doesNotMatch(prototype, /properties\[0\]|propertyIds\[0\]/);
  assert.match(read("../v2-dossier/charges-detail-read-model.ts"), /from "\.\/v3-property-scope"/, "resolver R15.6 réutilisé");
  assert.match(read("../v2-dossier/charges-detail-read-model.ts"), /resolveV3PropertyServiceDate/, "accessor R15.5 réutilisé");
});

test("le gate multi-biens n'est pas étendu et F012 n'est pas modifié (repli historique conservé, non exposé)", () => {
  const scope = read("../v2-dossier/correction-scope.ts");
  assert.match(scope, /export function propertyScopeFor/);
  const assistant = read("../../runtime/assistants/f012-charges/assistant.ts");
  assert.match(assistant, /dateMiseEnService: this\.deps\.dateMiseEnService \?\? `\$\{this\.ctx\.fiscalYear\}-06-01`/, "dette backend historique laissée en l'état");
});
