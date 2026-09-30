/**
 * R15.8 — vérité de restitution des Amortissements : adapter pur, rendu, CTA sous coque V3, navigation F014, vocabulaire
 * comptable/fiscal, reprise fail-closed, absence de fixture. Sorties F010/F012/F014 réelles (amortization-test-support).
 * Un stub `require.extensions` rend le CSS module importable sous tsx.
 *
 * Run: npx tsx --test src/lab/v3-dossier/amortization-restitution-truth.test.tsx
 */
import "@/lab/v2-dossier/test-public-env";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { lmnpReducer, type LmnpState } from "@/lib/lmnp/store/reducer";
import { available, unavailable } from "@/lib/lmnp/services/fiscal-year-opening/opening-fact";
import type { FiscalYearOpening } from "@/lib/lmnp/services/fiscal-year-opening/types";
import { buildV3AmortizationDetail } from "@/lab/v2-dossier/amortization-detail-read-model";
import { HOUSING_YEAR, amortizedWithFurniture, amortizedWithWorks, nativeAmortizedState } from "@/lab/v2-dossier/amortization-test-support";
import { v3CorrectionActionFor } from "@/lab/v2-dossier/correction-registry";
import { OWNER_ROUTES, type V3CorrectionScope } from "@/lab/v2-dossier/correction-scope";
import { confirmedState, property, workspaceOf } from "@/lab/v2-dossier/housing-test-support";
import { V3_ASSISTANT_ROUTES, selectAssistantShell } from "./assistant-shell-model";
import { REVIEW_IN_F014_LABEL, amortizationRubrique, buildAmortizationView } from "./amortization-view-model";

function installCssStub() {
  const extensions = (require as unknown as { extensions: Record<string, (module: { exports: unknown }) => void> }).extensions;
  extensions[".css"] = module => { module.exports = new Proxy({}, { get: (_target, key) => (typeof key === "string" && key !== "__esModule" ? key : undefined) }); };
}
async function loadComponents() {
  installCssStub();
  return import("./RealAmortization");
}

const DIR = path.dirname(new URL(import.meta.url).pathname);
const read = (file: string) => readFileSync(path.join(DIR, file), "utf8");
const V3_SCOPE: V3CorrectionScope = { dossierId: "dossier-1", fiscalYearId: "fy-2025", year: 2025, property: { kind: "required", propertyId: "home-1" }, shell: "v3" };
const ACTION = { label: REVIEW_IN_F014_LABEL, href: "/assistants/amortissements?scoped" };
const plain = (html: string) => html.replace(/\s/g, " ");
type View = ReturnType<typeof buildAmortizationView>;
type Known = Extract<View, { state: "known" }>;
const viewOf = (state: LmnpState, propertyId: string | null = "home-1") =>
  buildAmortizationView(buildV3AmortizationDetail(workspaceOf(state), propertyId), ACTION);
const known = (view: View) => { assert.equal(view.state, "known"); return view as Known; };
const patch = (state: LmnpState, draft: Record<string, unknown>) => lmnpReducer(state, { type: "DECLARATION_PATCH_DRAFT", patch: draft });
const eur = (value: number) => `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 }).format(value)} €`;
async function render(view: View, workspace = false) {
  const components = await loadComponents();
  return plain(renderToStaticMarkup(createElement(workspace ? components.RealAmortizationWorkspace : components.RealAmortizationReport, { view, back: null } as never)));
}

function takeoverOf(state: LmnpState): LmnpState {
  const opening: FiscalYearOpening = {
    openingId: "o1", revision: 1, targetFiscalYear: HOUSING_YEAR, dossierId: "dossier-1",
    source: { kind: "external_takeover", takeoverId: "t1", sourceFiscalYear: HOUSING_YEAR - 1 },
    stocks: { deficits: unavailable(), amortissementsReportes: unavailable() },
    assets: available([
      { id: "a1", propertyId: "home-1", label: "Bâti", categorie: "batiment", coutBrut: available(100), cumulOuverture: available(10), plan: unavailable() },
      { id: "a2", label: "Sans bien", categorie: "batiment", coutBrut: available(1), cumulOuverture: available(0), plan: unavailable() },
    ] as never),
    loans: unavailable(), patrimoine: { ouvertureCompteExploitant: unavailable(), ran: unavailable(), tresorerieOuverture: unavailable() },
    properties: unavailable(), identity: unavailable(), provenance: {},
    validation: { status: "validated", openingRevision: 1, contentHash: "h", validatedAt: "2026-01-01", validator: "test" },
  };
  return { ...state, fiscalYear: { ...state.fiscalYear, priorHistoryDeclaration: { status: "EXTERNAL_HISTORY", declaredAt: "2026-01-01" }, externalTakeoverOpening: { sourceRef: "t1", opening } } };
}

test("aucune sortie : « Non renseigné », jamais « 0 € » ; dotation nulle confirmée : « 0 € » confirmé", async () => {
  const none = known(viewOf(await confirmedState()));
  assert.deepEqual([none.headline?.value, none.headline?.kind, none.headline?.stateLabel], ["Non renseigné", "unknown", "Non renseigné"]);
  const noneHtml = await render(none);
  assert.match(noneHtml, /Amortissements calculés pour l’exercice 2025/);
  assert.doesNotMatch(noneHtml, /0 €/);
  assert.deepEqual(none.rows, []);

  let state = await confirmedState();
  const housing = state.declarationDraft!.logementAmortissement!;
  state = patch(state, { logementAmortissement: { ...housing, plan: { ...housing.plan, totalAnnuelExercice: 0, lignes: housing.plan.lignes.map(line => ({ ...line, dotationExercice: 0 })) } } });
  const { persistAmortissements } = await import("@/lab/v2-dossier/amortization-test-support");
  const zero = known(viewOf(await persistAmortissements(state)));
  assert.deepEqual([zero.headline?.value, zero.headline?.kind, zero.headline?.stateLabel], ["0 €", "known_amount", "Confirmé"]);
});

test("hero : « Amortissements calculés pour l’exercice 2025 » = totalDotations persisté ; sous-texte et note fiscale discrète", async () => {
  const state = await nativeAmortizedState();
  const view = known(viewOf(state));
  const persisted = state.declarationDraft!.amortissementAssistant!.totalDotations;
  assert.equal(view.headline?.title, "Amortissements calculés pour l’exercice 2025");
  assert.equal(view.headline?.value, eur(persisted));
  assert.equal(view.headline?.caption, "Dotation calculée pour l’exercice.");
  assert.equal(view.headline?.fiscalNote, "Le montant fiscalement déduit est déterminé lors du calcul de votre déclaration.");
  assert.deepEqual([view.headline?.kind, view.headline?.stateLabel, view.summary], ["known_amount", "Confirmé", "Vos amortissements sont calculés pour cet exercice."]);
  for (const html of [await render(view), await render(view, true)]) {
    assert.match(html, /Amortissements calculés pour l’exercice 2025/);
    assert.match(html, new RegExp(eur(persisted).replace(/\s/g, " ")));
    assert.match(html, /Dotation calculée pour l’exercice\./);
    assert.match(html, /Le montant fiscalement déduit est déterminé lors du calcul de votre déclaration\./);
  }
});

test("tableau : Élément | Base amortissable | Durée | Dotation 2025 | Source | État — sources honnêtes, aucune provenance de ligne inventée", async () => {
  const state = await amortizedWithWorks();
  const view = known(viewOf(state));
  const housing = view.rows.filter(row => row.source?.label === "Issu du logement");
  const charges = view.rows.filter(row => row.source?.label === "Issu des charges");
  assert.equal(housing.length + charges.length, view.rows.length);
  assert.equal(charges.length, 1);
  assert.deepEqual([charges[0]!.label, plain(charges[0]!.base), charges[0]!.duration, charges[0]!.note], ["Cuisine équipée", "5 000 €", "18 ans", "à partir du 15/03/2025"]);
  assert.ok(view.rows.every(row => row.stateLabel === "Calculé" && row.tone === "ok"));
  const html = await render(view);
  for (const heading of ["Élément", "Base amortissable", "Durée", "Dotation 2025", "Source", "État"]) assert.match(html, new RegExp(`>${heading}<`));
  assert.doesNotMatch(html, /Extrait|Saisi par vous|Corrigé|Saisi</, "aucune provenance de ligne fabriquée");
});

test("mobilier : « Mobilier (lot) » est une seule ligne, « Issu du logement »", async () => {
  const view = known(viewOf(await amortizedWithFurniture()));
  const furniture = view.rows.filter(row => /Mobilier/.test(row.label));
  assert.equal(furniture.length, 1);
  assert.deepEqual([furniture[0]!.label, plain(furniture[0]!.base), furniture[0]!.source?.label], ["Mobilier (lot)", "8 000 €", "Issu du logement"]);
});

test("terrain : « Terrain — Non amorti » à part, jamais une ligne du tableau", async () => {
  const state = await nativeAmortizedState();
  const view = known(viewOf(state));
  assert.deepEqual(view.land, { label: "Terrain", value: eur(state.declarationDraft!.logementAmortissement!.valeurTerrain), note: "Non amorti" });
  assert.ok(view.rows.every(row => !/terrain/i.test(row.label)));
  assert.match(await render(view), /Terrain<small>Non amorti<\/small>/);
});

test("statut utilisateur : confirmée → « Confirmé » ; sans confirmedAt → « À confirmer » ; dérive → « À revoir » (détail masqué) ; aucune sortie → « Non renseigné »", async () => {
  const state = await nativeAmortizedState();
  assert.equal(known(viewOf(state)).headline?.stateLabel, "Confirmé");

  const unconfirmed = known(viewOf(patch(state, { amortissementConfirmedAt: undefined })));
  assert.equal(unconfirmed.headline?.stateLabel, "À confirmer");
  assert.ok(unconfirmed.rows.every(row => row.stateLabel === "À confirmer"));
  assert.doesNotMatch(await render(unconfirmed), /Confirmé|sont calculés pour cet exercice/);

  const persisted = state.declarationDraft!.amortissementAssistant!;
  const drifted = buildAmortizationView(buildV3AmortizationDetail({
    ...workspaceOf(state), declarationDraft: { ...state.declarationDraft!, amortissementAssistant: { ...persisted, totalDotations: persisted.totalDotations + 10 } },
  }, "home-1"), ACTION);
  const stale = known(drifted);
  assert.equal(stale.headline?.stateLabel, "À revoir");
  assert.deepEqual([stale.rows, stale.land], [[], null]);
  assert.match(stale.todo.notes.join(" "), /revalidez le plan/);
  const html = await render(stale);
  assert.ok(html.includes(plain(eur(persisted.totalDotations + 10))), "ancien total visible comme ancienne sortie");
  assert.doesNotMatch(html, /Confirmé|Structure du bâtiment|Terrain/);

  assert.equal(known(viewOf(await confirmedState())).headline?.stateLabel, "Non renseigné");
});

test("contestation : sortie « contested » → « À confirmer », jamais confirmée", async () => {
  const state = await nativeAmortizedState();
  const contested = patch(state, { amortissementAssistant: { ...state.declarationDraft!.amortissementAssistant!, status: "contested" } });
  const view = known(viewOf(contested));
  assert.equal(view.headline?.stateLabel, "À confirmer");
  assert.match(view.headline?.caption ?? "", /contesté/);
});

test("plan bloqué (date en conflit) : la raison est listée dans « Ce qui reste à régler », le statut n'est pas « Confirmé »", async () => {
  const state = await nativeAmortizedState();
  const conflict: LmnpState = { ...state, properties: [property("home-1", { amortissementBase: { composants: [], dateMiseEnService: "2024-05-02" } })] };
  const view = known(viewOf(conflict));
  assert.match(view.todo.decisions.join(" "), /deux valeurs différentes/);
  assert.notEqual(view.headline?.stateLabel, "Confirmé");
  assert.equal(view.headline?.stateLabel, "À revoir");
});

test("invariant : jamais « Confirmé » en même temps qu'un élément dans « Ce qui reste à régler » (hero comme carte)", async () => {
  const native = await nativeAmortizedState();
  const pending = patch(native, { activiteAssistantState: { ...(native.declarationDraft!.activiteAssistantState ?? {}), dateMiseEnService: "2025-09-09" } });
  const states = [native, await amortizedWithWorks(), await amortizedWithFurniture(), await confirmedState(), pending, patch(native, { amortissementConfirmedAt: undefined })];
  for (const state of states) {
    const view = known(viewOf(state));
    const listed = view.todo.decisions.length + view.todo.notes.length;
    const html = await render(view);
    if (listed > 0) {
      assert.notEqual(view.headline?.stateLabel, "Confirmé");
      assert.equal(amortizationRubrique(view, { summary: "Amortissements calculés", complete: true }).tone, "attention");
      assert.doesNotMatch(html, /Vos amortissements sont calculés pour cet exercice/);
    } else if (view.headline?.stateLabel === "Confirmé") {
      assert.equal(amortizationRubrique(view, { summary: "x", complete: false }).tone, "ok");
    }
  }
});

test("carte du tableau de bord : dérivée du même statut que le hero", async () => {
  const existing = { summary: "Amortissements calculés", complete: true };
  const native = await nativeAmortizedState();
  assert.deepEqual(amortizationRubrique(viewOf(native), existing), { summary: "Amortissements calculés", tone: "ok" });
  assert.deepEqual(amortizationRubrique(viewOf(patch(native, { amortissementConfirmedAt: undefined })), existing), { summary: "Amortissements à confirmer", tone: "attention" });
  assert.deepEqual(amortizationRubrique(viewOf(await confirmedState()), { summary: "x", complete: true }), { summary: "Amortissements à compléter", tone: "attention" });
  const persisted = native.declarationDraft!.amortissementAssistant!;
  const stale = buildAmortizationView(buildV3AmortizationDetail({ ...workspaceOf(native), declarationDraft: { ...native.declarationDraft!, amortissementAssistant: { ...persisted, totalDotations: 1 } } }, "home-1"), ACTION);
  assert.deepEqual(amortizationRubrique(stale, existing), { summary: "Amortissements à revoir", tone: "attention" });
});

test("reprise comptable : aucun total F014 du draft, aucun détail ; texte neutre ; faits d'Opening démontrables seulement", async () => {
  const native = await nativeAmortizedState();
  const persistedTotal = native.declarationDraft!.amortissementAssistant!.totalDotations;
  const view = known(viewOf(takeoverOf(native)));
  assert.equal(view.headline?.value, null);
  assert.equal(view.headline?.title, "Amortissements issus de la reprise comptable");
  assert.equal(view.headline?.stateLabel, "Reprise comptable");
  assert.equal(view.headline?.caption, "Le plan d’amortissement est repris à partir de votre historique comptable et sera intégré à la déclaration.");
  assert.deepEqual([view.rows, view.land, view.headline?.fiscalNote], [[], null, null]);
  assert.deepEqual(view.takeoverFacts, ["1 élément(s) de votre historique sont rattachés à ce logement.", "1 élément(s) de votre historique n’ont pas de logement renseigné."]);
  for (const html of [await render(view), await render(view, true)]) {
    assert.match(html, /Amortissements issus de la reprise comptable/);
    assert.doesNotMatch(html, new RegExp(String(Math.round(persistedTotal))), "le total du draft n'apparaît nulle part");
    assert.doesNotMatch(html, /Amortissements calculés pour l’exercice|montant retenu|déduit/i);
    assert.doesNotMatch(html, /Structure du bâtiment|Terrain/);
  }
  assert.deepEqual(amortizationRubrique(view, { summary: "Amortissements calculés", complete: true }), { summary: "Amortissements issus de la reprise comptable", tone: "ok" });
  assert.equal(amortizationRubrique(view, { summary: "x", complete: false }).tone, "attention");
});

test("reprise + nouvel actif F012 : aucun total consolidé exposé", async () => {
  const state = takeoverOf(await amortizedWithWorks());
  const view = known(viewOf(state));
  const html = await render(view);
  assert.equal(view.headline?.value, null);
  assert.doesNotMatch(html, new RegExp(String(Math.round(state.declarationDraft!.amortissementAssistant!.totalDotations))));
  assert.doesNotMatch(html, /Cuisine équipée/);
});

test("multi-biens : facts_only — aucun montant ni ligne attribués", async () => {
  const native = await nativeAmortizedState();
  const multi: LmnpState = { ...native, properties: [...native.properties, property("home-2")], fiscalYear: { ...native.fiscalYear, propertyIds: ["home-1", "home-2"] } };
  const view = known(viewOf(multi));
  assert.equal(view.support, "facts_only");
  assert.equal(view.headline, null);
  assert.match(view.unsupportedNotice ?? "", /Non supporté actuellement/);
  assert.deepEqual([view.rows, view.land], [[], null]);
  const html = await render(view);
  assert.match(html, /Non supporté actuellement/);
  assert.doesNotMatch(html, /Amortissements calculés pour l’exercice|Structure du bâtiment/);
  assert.equal(amortizationRubrique(view, { summary: "Dossier multi-biens non pris en charge dans ce lot.", complete: false }).summary, "Dossier multi-biens non pris en charge dans ce lot.");
});

test("propertyId absent / faux : vue fail-closed, aucun lien vers F014", async () => {
  const state = await nativeAmortizedState();
  for (const id of [null, "nope"]) {
    const view = viewOf(state, id);
    assert.equal(view.state, "scope_unresolved");
    assert.equal(view.action, null);
    const html = await render(view);
    assert.doesNotMatch(html, /Amortissements calculés|href=/);
  }
});

test("documents : aucun document n'est rattaché au calcul d'amortissement (canal historique jamais lu)", async () => {
  const view = known(viewOf(await amortizedWithWorks()));
  assert.equal(view.documentsNote, "Aucun document n’est directement rattaché au calcul d’amortissement.");
  const html = await render(view);
  assert.match(html, /Documents utilisés/);
  assert.match(html, /Aucun document n’est directement rattaché au calcul d’amortissement\./);
  for (const file of ["RealAmortization.tsx", "amortization-view-model.ts", "../v2-dossier/amortization-detail-read-model.ts", "../v2-dossier/amortization-plan-seam.ts"]) {
    assert.doesNotMatch(read(file), /amortissementDocumentIds|amortissementVentilation/, `${file} : canal historique jamais lu`);
  }
});

test("vocabulaire : dotation CALCULÉE — jamais « économie fiscale », « amortissement déductible », « montant déduit », « déduction fiscale » (source F014 seule)", async () => {
  const banned = /économie fiscale|amortissements? déductibles?|montant déduit|déduction fiscale|fiscalement déduits?[^.]*retenu/i;
  const states = [await nativeAmortizedState(), await amortizedWithWorks(), await amortizedWithFurniture(), await confirmedState(), takeoverOf(await nativeAmortizedState())];
  for (const state of states) {
    const view = known(viewOf(state));
    for (const html of [await render(view), await render(view, true)]) assert.doesNotMatch(html, banned);
    assert.doesNotMatch(JSON.stringify(view), banned);
  }
  const native = known(viewOf(await nativeAmortizedState()));
  assert.match(await render(native), /Amortissements calculés/);
});

test("comptable ≠ fiscal : un résultat F006 plafonné ne transforme jamais la dotation en « déduite » ; F006 n'est jamais lu", async () => {
  const state = await nativeAmortizedState();
  const total = state.declarationDraft!.amortissementAssistant!.totalDotations;
  const capped = patch(state, { fiscalResult: { exercice: HOUSING_YEAR, amortDeduct: 1000, amortNonDeduitExercice: total - 1000, trace: { journal: [{ trf: "TRF-0012", label: "x", value: total }] } } });
  const view = known(viewOf(capped));
  const html = await render(view);
  assert.equal(view.headline?.value, eur(total));
  assert.doesNotMatch(html, /1 000 €|1000/);
  assert.match(html, /Amortissements calculés/);
  assert.doesNotMatch(html, /fiscalement déduits/);
  for (const file of ["RealAmortization.tsx", "amortization-view-model.ts", "../v2-dossier/amortization-detail-read-model.ts"]) {
    assert.doesNotMatch(read(file), /fiscalResult|amortDeduct|produceFiscalResult|fiscalResultMatchesAmortissementTotal/, file);
  }
});

test("V3 → F014 : le CTA « Revoir dans l’Assistant Amortissements » ouvre /assistants/amortissements avec le scope complet, sous la coque V3", () => {
  assert.equal(REVIEW_IN_F014_LABEL, "Revoir dans l’Assistant Amortissements");
  const action = v3CorrectionActionFor("depreciation", V3_SCOPE)!;
  const url = new URL(action.href, "http://x");
  assert.equal(url.pathname, "/assistants/amortissements");
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    dossierId: "dossier-1", fiscalYearId: "fy-2025", year: "2025", propertyId: "home-1", v3Shell: "v3", v3Correction: "1",
  });
  assert.equal(v3CorrectionActionFor("depreciation", null), null);
  assert.equal(OWNER_ROUTES["/assistants/amortissements"], true);
  assert.equal(V3_ASSISTANT_ROUTES["/assistants/amortissements"], "Amortissements");
  assert.deepEqual(selectAssistantShell(V3_SCOPE, url.pathname), { kind: "v3-assistant", title: "Amortissements" });
  assert.deepEqual(selectAssistantShell({}, url.pathname), { kind: "legacy" });
  const page = readFileSync(path.join(DIR, "../../app/(dashboard)/assistants/amortissements/page.tsx"), "utf8");
  assert.match(page, /F014AmortissementsAssistantPanel/);
});

test("F014 → V3 : retour par le mécanisme R15.1 (ScopedOwnerLink), aucune sortie directe, aucun libellé « Fiscal AI »", () => {
  const panel = readFileSync(path.join(DIR, "../../components/lmnp/assistants/F014AmortissementsAssistantPanel.tsx"), "utf8");
  assert.match(panel, /import \{ ScopedOwnerLink as Link, useScopedOwnerHref \} from "@\/components\/lmnp\/app-shell\/scoped-owner-navigation"/);
  assert.match(panel, /<Link href=\{LMNP_ROUTES\.dashboard\}/);
  assert.doesNotMatch(panel, /<a\s[^>]*href=["'{]\s*["'`]?\/(dashboard|documents)/, "aucune sortie en dur");
  assert.doesNotMatch(panel, /Fiscal AI/);
});

test("câblage : la V3 réelle passe le propertyId vérifié du scope, sans premier bien implicite ; 6 rubriques sans fixture", () => {
  const prototype = read("V3RealPrototype.tsx");
  assert.match(prototype, /buildV3AmortizationDetail\(workspace, housingPropertyId\)/);
  assert.match(prototype, /v3CorrectionActionFor\("depreciation", scope\)/);
  assert.doesNotMatch(prototype, /properties\[0\]|propertyIds\[0\]/);
  assert.doesNotMatch(prototype, /from\s+["'][^"']*(fixtures|\/model|V3Prototype)["']/);
  for (const file of ["RealActivity.tsx", "RealHousing.tsx", "RealFinancement.tsx", "RealRevenue.tsx", "RealCharges.tsx", "RealAmortization.tsx"]) {
    assert.doesNotMatch(read(file), /from\s+["'][^"']*(fixtures|\/model|V3Prototype)["']|DocumentReading|Math\.random/, file);
  }
});

test("aucune fixture DEMO, aucun premier bien implicite, aucune date fabriquée dans le chemin réel Amortissements", () => {
  for (const file of ["RealAmortization.tsx", "amortization-view-model.ts", "../v2-dossier/amortization-detail-read-model.ts", "../v2-dossier/amortization-plan-seam.ts"]) {
    const source = read(file);
    assert.doesNotMatch(source, /from\s+["'][^"']*(fixtures|\/model|V3Prototype)["']/, file);
    assert.doesNotMatch(source, /setTimeout|Math\.random|Date\.now|new Date\(|`\$\{[^}]*\}-01-01|-06-01/, file);
  }
  assert.match(read("../v2-dossier/amortization-plan-seam.ts"), /resolveV3PropertyServiceDate/, "accessor R15.5 réutilisé");
  assert.match(read("../v2-dossier/amortization-plan-seam.ts"), /from "\.\/v3-property-scope"/, "resolver R15.6 réutilisé");
  assert.match(read("../v2-dossier/amortization-detail-read-model.ts"), /hasAmortissementDrifted/, "définition de dérive existante réutilisée");
});
