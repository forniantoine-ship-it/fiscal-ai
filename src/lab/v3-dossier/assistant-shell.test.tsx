/**
 * R15.1 — coque V3 des assistants propriétaires : sélection fail-closed, rendu, navigation, retour avec sauvegarde
 * confirmée, et preuve que le comportement historique est inchangé hors V3.
 * Un stub `require.extensions` (avant tout import) rend le CSS module importable sous tsx.
 *
 * Run: npx tsx --test src/lab/v3-dossier/assistant-shell.test.tsx
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { performV3CorrectionReturn } from "@/components/lmnp/app-shell/v3-correction-return";
import { scopedOwnerTarget } from "@/components/lmnp/app-shell/scoped-owner-target";
import { shellVocabulary } from "@/components/lmnp/app-shell/shell-vocabulary";
import { v3CorrectionActionFor } from "@/lab/v2-dossier/correction-registry";
import { v3ScopedNavigationHref, type V3CorrectionScope } from "@/lab/v2-dossier/correction-scope";
import { V3_ASSISTANT_ROUTES, selectAssistantShell, v3AssistantTitle } from "./assistant-shell-model";

function installCssStub() {
  const extensions = (require as unknown as { extensions: Record<string, (module: { exports: unknown }) => void> }).extensions;
  extensions[".css"] = module => { module.exports = new Proxy({}, { get: (_target, key) => (typeof key === "string" && key !== "__esModule" ? key : undefined) }); };
}
async function loadShell() {
  installCssStub();
  return import("./V3AssistantShell");
}

const SCOPE: V3CorrectionScope = { dossierId: "dossier-1", fiscalYearId: "fy-2026", year: 2026, property: { kind: "required", propertyId: "home-1" } };
const V3_SCOPE: V3CorrectionScope = { ...SCOPE, shell: "v3" };
const DIR = path.dirname(new URL(import.meta.url).pathname);
const read = (relative: string) => readFileSync(path.join(DIR, relative), "utf8");

// ── sélection pure et liste explicite ───────────────────────────────────────────────────────────────────────
test("R15.1 select — les six assistants propriétaires, et seulement eux, sous un scope V3", () => {
  assert.deepEqual(Object.keys(V3_ASSISTANT_ROUTES).sort(), [
    "/assistants/activite", "/assistants/amortissements", "/assistants/charges",
    "/assistants/financement", "/assistants/logement", "/assistants/revenus",
  ]);
  const titles: Record<string, string> = {
    "/assistants/activite": "Activité", "/assistants/logement": "Logement", "/assistants/financement": "Financement",
    "/assistants/charges": "Charges", "/assistants/revenus": "Revenus", "/assistants/amortissements": "Amortissements",
  };
  for (const [route, title] of Object.entries(titles)) {
    assert.deepEqual(selectAssistantShell(V3_SCOPE, route), { kind: "v3-assistant", title }, route);
  }
  assert.deepEqual(selectAssistantShell(V3_SCOPE, "/assistants/financement/"), { kind: "v3-assistant", title: "Financement" }, "barre finale tolérée");
});

test("R15.1 select — fail-closed : routes exclues, préfixes, casse, chemins absents", () => {
  const excluded = ["/documents", "/declarations", "/declarations/historique", "/declarations/2025", "/dashboard", "/depenses", "/revenus", "/amortissements",
    "/assistants/fiscal", "/assistants/liasse", "/assistants/financement/extra", "/assistants/financement-x", "/Assistants/financement",
    "/lab/v3-dossier/real", "/lab/v2-dossier/real/activity", "/", "", "/assistants"];
  for (const route of excluded) assert.deepEqual(selectAssistantShell(V3_SCOPE, route), { kind: "legacy" }, route);
  assert.deepEqual(selectAssistantShell(V3_SCOPE, null), { kind: "legacy" });
  assert.deepEqual(selectAssistantShell(V3_SCOPE, undefined), { kind: "legacy" });
  assert.equal(v3AssistantTitle("/assistants/__proto__"), null);
  assert.equal(v3AssistantTitle("/assistants/constructor"), null);
});

test("R15.1 select — sans scope ni marqueur : coque historique, quelle que soit la route", () => {
  for (const route of Object.keys(V3_ASSISTANT_ROUTES)) {
    assert.deepEqual(selectAssistantShell(null, route), { kind: "legacy" }, `${route} sans scope`);
    assert.deepEqual(selectAssistantShell(undefined, route), { kind: "legacy" }, `${route} scope indéfini`);
    assert.deepEqual(selectAssistantShell(SCOPE, route), { kind: "legacy" }, `${route} scope V2 sans marqueur`);
  }
  assert.deepEqual(selectAssistantShell({ shell: "other" as never }, "/assistants/financement"), { kind: "legacy" }, "valeur hors liste blanche");
});

// ── vocabulaire ─────────────────────────────────────────────────────────────────────────────────────────────
test("R15.1 vocabulaire — 'Mon dossier' sous coque V3 uniquement, mots historiques partout ailleurs", () => {
  assert.deepEqual(shellVocabulary(V3_SCOPE), { dashboard: "Mon dossier", backToDashboard: "Retour à mon dossier" });
  for (const scope of [null, undefined, SCOPE]) {
    assert.deepEqual(shellVocabulary(scope), { dashboard: "Tableau de bord", backToDashboard: "Retour au tableau de bord" });
  }
});

// ── ScopedOwnerLink : comportement historique prouvé, sortie V3 par sauvegarde confirmée ────────────────────────
test("R15.1 ScopedOwnerLink — hors V3 le rendu est exactement celui d'avant (lien, href scopé, ou désactivé)", () => {
  const hrefs = ["/dashboard", "/assistants/revenus", "/assistants/activite", "/documents?step=validation", "/declarations", "/login", "/inconnu", "/assistants/financement?x=1"];
  for (const scope of [null, SCOPE]) {
    for (const href of hrefs) {
      const before = v3ScopedNavigationHref(href, scope);
      const target = scopedOwnerTarget(href, scope);
      assert.deepEqual(target, before ? { kind: "link", href: before } : { kind: "disabled" }, `${href} · scope ${scope ? "V2" : "aucun"}`);
      assert.notEqual(target.kind, "exit");
    }
  }
  assert.deepEqual(scopedOwnerTarget("/dashboard", null), { kind: "link", href: "/dashboard" }, "sans scope, le lien reste /dashboard");
});

test("R15.1 ScopedOwnerLink — sous coque V3 : /dashboard = sortie confirmée, le reste inchangé", () => {
  assert.deepEqual(scopedOwnerTarget("/dashboard", V3_SCOPE), { kind: "exit" });
  assert.deepEqual(scopedOwnerTarget("/dashboard?x=1", V3_SCOPE), { kind: "exit" });
  for (const href of ["/assistants/revenus", "/assistants/activite", "/documents?step=validation", "/declarations", "/login", "/inconnu"]) {
    const before = v3ScopedNavigationHref(href, V3_SCOPE);
    assert.deepEqual(scopedOwnerTarget(href, V3_SCOPE), before ? { kind: "link", href: before } : { kind: "disabled" }, href);
  }
  const revenus = scopedOwnerTarget("/assistants/revenus", V3_SCOPE);
  assert.ok(revenus.kind === "link" && revenus.href.includes("v3Shell=v3"), "la coque V3 est conservée d'un assistant à l'autre");
});

test("R15.1 ScopedOwnerLink — garde statique : contrat historique conservé, sortie jamais en simple href", () => {
  const nav = read("../../components/lmnp/app-shell/scoped-owner-navigation.tsx");
  assert.match(nav, /v3ScopedNavigationHref\(href, scope\)/, "contrat testé par explicit-owner-flow");
  assert.match(nav, /useV3CorrectionReturn\(\)/);
  const exit = nav.slice(nav.indexOf("function V3DossierExit"), nav.indexOf("export function ScopedOwnerLink"));
  assert.doesNotMatch(exit, /<Link|href=|window\.location|router\./, "la sortie ne navigue jamais par elle-même");
  const hook = read("../../components/lmnp/app-shell/useV3CorrectionReturn.ts");
  assert.match(hook, /performV3CorrectionReturn\(\{ scope, workspace, confirmWorkspaceSave \}\)/);
  assert.match(hook, /outcome\.status === "error"[\s\S]*return;[\s\S]*window\.location\.assign\(outcome\.href\)/, "aucune navigation avant une sauvegarde confirmée");
  const bar = read("../../components/lmnp/app-shell/V3CorrectionReturnBar.tsx");
  assert.match(bar, /useV3CorrectionReturn\(\)/, "la barre de retour utilise le même hook");
});

// ── retour : sauvegarde confirmée obligatoire ───────────────────────────────────────────────────────────────
const WORKSPACE: PersistedWorkspace = {
  fiscalYear: { id: "fy-2026", dossierId: "dossier-1", year: 2026, status: "draft", regime: "reel", propertyIds: ["home-1"], createdAt: "2026-01-01", updatedAt: "2026-01-01" },
  properties: [{ id: "home-1", label: "L", address: "a", city: "c", postalCode: "1" }],
  documents: [], extractions: [], validationItems: [], ledgerEntries: [],
};

test("R15.1 retour — sauvegarde échouée : aucun href, jamais de navigation", async () => {
  const outcome = await performV3CorrectionReturn({ scope: V3_SCOPE, workspace: WORKSPACE, confirmWorkspaceSave: async () => ({ status: "failed", reason: "server_unavailable" }) });
  assert.deepEqual(outcome, { status: "error" });
});

test("R15.1 retour — sauvegarde confirmée : retour vers la coque V3 réelle, avec le scope", async () => {
  const outcome = await performV3CorrectionReturn({ scope: V3_SCOPE, workspace: WORKSPACE, confirmWorkspaceSave: async () => ({ status: "confirmed", revision: 3 }) });
  assert.equal(outcome.status, "returning");
  const url = new URL(outcome.status === "returning" ? outcome.href : "", "http://v3.local");
  assert.equal(url.pathname, "/lab/v3-dossier/real");
  assert.equal(url.searchParams.get("v3Return"), "1");
  assert.equal(url.searchParams.get("dossierId"), "dossier-1");
});

test("R15.1 retour — dossier inchangé (clean) : retour sans écriture ; scope qui ne correspond plus : refus", async () => {
  const clean = await performV3CorrectionReturn({ scope: V3_SCOPE, workspace: WORKSPACE, confirmWorkspaceSave: async () => ({ status: "clean" }) });
  assert.equal(clean.status, "returning");
  const mismatch = await performV3CorrectionReturn({
    scope: { ...V3_SCOPE, dossierId: "other" }, workspace: WORKSPACE, confirmWorkspaceSave: async () => ({ status: "confirmed", revision: 2 }),
  });
  assert.deepEqual(mismatch, { status: "error" });
  const legacy = await performV3CorrectionReturn({ scope: SCOPE, workspace: WORKSPACE, confirmWorkspaceSave: async () => ({ status: "confirmed", revision: 2 }) });
  assert.ok(legacy.status === "returning" && legacy.href.startsWith("/lab/v2-dossier/real?"), "scope sans marqueur : retour V2 inchangé");
});

// ── rendu de la coque ───────────────────────────────────────────────────────────────────────────────────────
test("R15.1 rendu — marque V3, rubrique et exercice, enfants, retour ; aucun « Fiscal AI »", async () => {
  const { V3AssistantShell, V3ReturnControl } = await loadShell();
  const html = renderToStaticMarkup(
    <V3AssistantShell title="Financement" year={2026} autosaveStatus="saved" persistenceUserId="user-1"
      returnControl={<V3ReturnControl available status="idle" onReturn={() => undefined} />}>
      <section id="assistant-content">Contenu de l’assistant F011</section>
    </V3AssistantShell>,
  ).replace(/\s/g, " ");
  assert.ok(html.includes("L’Assistant du Réel"));
  assert.ok(html.includes("Financement · 2026") && html.includes("exercice 2026"));
  assert.ok(html.includes("← Retour à mon dossier"));
  assert.ok(html.includes('id="assistant-content"') && html.includes("Contenu de l’assistant F011"), "enfants rendus tels quels");
  assert.ok(html.includes("Dossier enregistré"), "état d'enregistrement issu de resolveAutosaveDisplay");
  assert.ok(html.includes("assistantRoot") && !html.includes('class="root"'), "classe dédiée, pas les remises à zéro de .root");
  assert.equal(/Fiscal AI/i.test(html), false);
  assert.equal(html.includes("Accompagnement LMNP"), false);
});

test("R15.1 rendu — indicateur d'enregistrement : discret, absent sans information, jamais inventé", async () => {
  const { V3AssistantShell } = await loadShell();
  const render = (status: "idle" | "saving" | "error" | "saved", userId: string | null) => renderToStaticMarkup(
    <V3AssistantShell title="Logement" year={2026} autosaveStatus={status} persistenceUserId={userId} returnControl={null}>x</V3AssistantShell>,
  );
  assert.equal(render("idle", "user-1").includes("saveState"), false, "rien à afficher tant que rien n'est en cours");
  assert.ok(render("saving", "user-1").includes("Enregistrement…"));
  assert.ok(render("error", "user-1").includes('data-tone="error"'));
  assert.ok(render("idle", null).includes("Non enregistré"), "message existant de resolveAutosaveDisplay pour une session non persistée");
});

test("R15.1 rendu — contrôle de retour : états d'enregistrement et d'erreur", async () => {
  const { V3ReturnControl } = await loadShell();
  assert.equal(renderToStaticMarkup(<V3ReturnControl available={false} status="idle" onReturn={() => undefined} />), "");
  const saving = renderToStaticMarkup(<V3ReturnControl available status="saving" onReturn={() => undefined} />);
  assert.ok(saving.includes("Enregistrement en cours…") && saving.includes("disabled"));
  const error = renderToStaticMarkup(<V3ReturnControl available status="error" onReturn={() => undefined} />);
  assert.ok(error.includes('role="alert"') && error.includes("La sauvegarde n’a pas pu être confirmée"));
});

// ── gardes statiques : DashboardShell, coque, panneau F011 ──────────────────────────────────────────────────
test("R15.1 DashboardShell — chaîne de sécurité intacte, coque choisie seulement à l'intérieur, historique conservé", () => {
  const shell = read("../../app/(dashboard)/DashboardShell.tsx");
  const order = ["<V3CorrectionEntryGate>", "<ExplicitDossierScopeGate>", "<DossierProvider", "<LmnpProvider", "<FeedbackProvider>", "<DashboardLayoutBridge>"].map(token => shell.indexOf(token));
  assert.ok(order.every(index => index >= 0), "toutes les couches sont présentes");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "ordre des gates et providers inchangé");
  assert.match(shell, /selectAssistantShell\(scope, pathname\)/);
  assert.match(shell, /<DashboardLayout[\s\S]*chapterJourney=\{chapterJourney\}[\s\S]*<V3CorrectionReturnBar \/>/, "coque historique et barre de retour conservées");
  assert.equal(shell.split("<V3AssistantShell").length - 1, 1, "coque V3 rendue une seule fois, dans le Bridge");
  assert.ok(shell.indexOf("function DashboardLayoutBridge") < shell.indexOf("<V3AssistantShell"), "choix dans le Bridge, après les providers");
});

test("R15.1 V3AssistantShell — aucune marque V1, aucune fixture, aucune donnée de démonstration", () => {
  for (const file of ["V3AssistantShell.tsx", "assistant-shell-model.ts"]) {
    const code = read(file).replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.equal(/Fiscal AI/i.test(code), false, `${file}: pas de « Fiscal AI »`);
    assert.equal(/from ["']\.\/(fixtures|model|V3Prototype)["']/.test(code), false, `${file}: pas de fixtures`);
    assert.equal(/\b(DEMO|LOAN_FACTS|MONTHLY_SCHEDULE)\b/.test(code), false);
  }
});

test("R15.1 F011 — le panneau ne change que de vocabulaire ; aucune marque ; sorties toujours via ScopedOwnerLink", () => {
  const panel = read("../../components/lmnp/assistants/F011FinancementAssistantPanel.tsx");
  assert.match(panel, /useShellVocabulary\(\)/);
  assert.match(panel, /\{words\.dashboard\}/);
  assert.equal((panel.match(/\{words\.backToDashboard\}/g) ?? []).length, 2);
  assert.equal(/Fiscal AI/.test(panel), false);
  assert.equal(/Tableau de bord/.test(panel.replace(/\/\/.*$/gm, "")), false, "plus de libellé V1 en dur dans le panneau");
  assert.match(panel, /import \{ ScopedOwnerLink as Link \}/);
});

test("R15.1 CTA F011 de R15 — mène à un assistant autorisé, avec le marqueur V3", () => {
  const action = v3CorrectionActionFor("financing", V3_SCOPE)!;
  const url = new URL(action.href, "http://v3.local");
  assert.equal(selectAssistantShell({ shell: url.searchParams.get("v3Shell") === "v3" ? "v3" : undefined }, url.pathname).kind, "v3-assistant");
});
