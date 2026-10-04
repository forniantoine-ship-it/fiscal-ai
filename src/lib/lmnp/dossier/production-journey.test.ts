/**
 * MB-MULTI-JOURNEY-COMPLETION-2 — le parcours multi-bien est atteignable PAR LES ROUTES DE PRODUCTION (aucun drapeau LAB), sans ouvrir la
 * capacité d'ÉDITION : scope de production, pré-contrôle de domaine avant ADD_PROPERTY, issue d'enregistrement véridique, navigation par bien,
 * retour au dossier. L'édition reste fermée : les chemins « ouverts » sont exercés par capacités injectées.
 *
 * Run: npx tsx --test src/lib/lmnp/dossier/production-journey.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { resolveAddPropertyOutcome, toConfirmedSave } from "@/components/lmnp/biens/add-property-return";
import { buildPropertySelectorItems } from "@/components/lmnp/biens/property-selector-model";
import { shouldShowV3PropertiesSection } from "@/components/lmnp/biens/V3PropertiesSection";
import { readV3CorrectionQuery, v3ReturnHref, type V3CorrectionScope } from "@/lab/v2-dossier/correction-scope";
import { planAddProperty, resolveAddPropertyEligibility } from "@/lib/lmnp/dossier/add-property-plan";
import { resolveUploadPropertyScope } from "@/lib/lmnp/dossier/bien-scope";
import {
  MULTI_PROPERTY_CAPABILITIES,
  type MultiPropertyCapabilities,
} from "@/lib/lmnp/dossier/multi-property-activation";
import { MULTI_PROPERTY_DOMAIN_REASON_CODES as REASON } from "@/lib/lmnp/dossier/multi-property-domain";
import {
  PRODUCTION_VALIDATION_HREF,
  deriveProductionScope,
  productionOwnerHref,
} from "@/lib/lmnp/dossier/production-dossier-scope";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";

import { A, B, Y, monoWorkspace, multiWorkspace } from "@/lib/lmnp/services/declaration/multi-property-test-support";

const ROOT = process.cwd();
const source = (relative: string) => readFileSync(path.join(ROOT, relative), "utf8");
const clone = <V>(value: V): V => JSON.parse(JSON.stringify(value));
const DOSSIER = "11111111-1111-4111-8111-111111111111";
const EDITION_CLOSED = { edition: false, generation: true, delivery: true, payment: true, closing: false, nextYear: false } as MultiPropertyCapabilities;
const EDITION_OPEN = { edition: true, generation: true, delivery: true, payment: true, closing: false, nextYear: false } as MultiPropertyCapabilities;

const withDossier = (workspace: PersistedWorkspace): PersistedWorkspace => {
  const ws = clone(workspace);
  (ws.fiscalYear as { dossierId?: string }).dossierId = DOSSIER;
  return ws;
};
const mono = () => withDossier(monoWorkspace());
const multi = () => withDossier(multiWorkspace());
const tweak = (workspace: PersistedWorkspace, patch: (ws: PersistedWorkspace) => void) => {
  const ws = clone(workspace);
  patch(ws);
  return ws;
};
const fy = (ws: PersistedWorkspace) => ws.fiscalYear as unknown as Record<string, unknown>;
const draft = (ws: PersistedWorkspace) => ws.declarationDraft as unknown as Record<string, unknown>;

// ===========================================================================
// 1. ROUTAGE DE PRODUCTION — aucune dépendance au drapeau LAB
// ===========================================================================
describe("routage de production : le parcours multi n'a besoin d'aucun drapeau LAB", () => {
  it("A/B — le scope de production revient vers une route de PRODUCTION (« Mes biens »), jamais vers /lab", () => {
    const scope = deriveProductionScope(multi(), B);
    assert.ok(scope, "scope de production dérivé du dossier chargé");
    assert.equal(scope!.shell, "dossier");
    const back = v3ReturnHref({ scope: scope!, scopeStillMatches: true, changed: false });
    assert.ok(back && back.startsWith("/assistants/biens?"), String(back));
    assert.equal(back!.includes("/lab"), false);
  });

  it("A/B — les liens de production vers chaque assistant par bien ne contiennent ni /lab ni drapeau de test", () => {
    for (const route of ["/assistants/logement", "/assistants/financement", "/assistants/charges", "/assistants/revenus", "/assistants/amortissements", "/documents"]) {
      const href = productionOwnerHref(route, multi(), B);
      assert.ok(href, route);
      assert.equal(/\/lab|ENABLE_V3|v3Return/.test(href!), false, href!);
    }
    assert.equal(PRODUCTION_VALIDATION_HREF, "/documents?step=validation");
  });

  it("A — les routes de production du parcours ne lisent jamais le drapeau LAB", () => {
    for (const file of [
      "src/app/(dashboard)/assistants/biens/page.tsx",
      "src/app/(dashboard)/documents/page.tsx",
      "src/app/(dashboard)/assistants/logement/page.tsx",
      "src/app/(dashboard)/dashboard/page.tsx",
      "src/components/lmnp/biens/PropertiesManager.tsx",
      "src/components/lmnp/biens/ProductionPropertiesEntry.tsx",
    ]) {
      assert.doesNotMatch(source(file), /ENABLE_V3_REAL_TEST_ROUTE|isV3RealTestRouteEnabled|["'`]\/lab\//, file);
    }
  });

  it("A — le dossier de production expose l'entrée « Mes biens » (route de production, scopée)", () => {
    assert.match(source("src/app/(dashboard)/DashboardShell.tsx"), /ProductionPropertiesEntry/);
    assert.match(source("src/components/lmnp/assistants/BienScopeGate.tsx"), /deriveProductionScope/);
  });

  it("O — les routes LAB restent fermées en production sans drapeau ; les labs non liés ne sont pas promus", () => {
    for (const file of [
      "src/app/lab/v2-dossier/real/page.tsx",
      "src/app/lab/v2-dossier/real/biens/page.tsx",
      "src/app/lab/v2-dossier/real/activity/page.tsx",
      "src/app/lab/v3-dossier/real/page.tsx",
    ]) {
      assert.match(source(file), /NODE_ENV === "production" && !isV3RealTestRouteEnabled\(\)\) notFound\(\)/, file);
    }
    for (const file of ["src/app/lab/v2-dossier/page.tsx", "src/app/lab/v3-dossier/page.tsx"]) {
      assert.match(source(file), /NODE_ENV === "production"\) notFound\(\)/, file);
    }
    for (const file of ["src/components/lmnp/biens/ProductionPropertiesEntry.tsx", "src/app/(dashboard)/DashboardShell.tsx", "src/lib/lmnp/dossier/production-dossier-scope.ts"]) {
      assert.doesNotMatch(source(file), /advisor-scene|ux-dossier|lab\/v3-dossier\/V3Prototype/, file);
    }
  });

  it("N — la capacité d'ÉDITION est ouverte (MB-MULTI-EDITION-FLIP-1) ; sous capacité fermée l'entrée « Mes biens » n'apparaît pas pour un mono", () => {
    assert.equal(MULTI_PROPERTY_CAPABILITIES.edition, true);
    assert.equal(MULTI_PROPERTY_CAPABILITIES.closing, false);
    assert.equal(MULTI_PROPERTY_CAPABILITIES.nextYear, false);
    assert.equal(shouldShowV3PropertiesSection(mono(), EDITION_CLOSED), false);
    assert.equal(shouldShowV3PropertiesSection(mono(), EDITION_OPEN), true);
    assert.equal(shouldShowV3PropertiesSection(multi()), true);
  });
});

// ===========================================================================
// 2. SCOPE DE PRODUCTION ET NAVIGATION PAR BIEN
// ===========================================================================
describe("navigation par bien en production : dossier, exercice et bien sont préservés", () => {
  it("L — chaque assistant par bien reçoit dossierId + fiscalYearId + year + propertyId exacts ; les owners d'activité n'embarquent aucun bien", () => {
    const ws = multi();
    for (const route of ["/assistants/logement", "/assistants/financement", "/assistants/charges", "/assistants/revenus", "/assistants/amortissements", "/documents"]) {
      const href = productionOwnerHref(route, ws, B)!;
      const url = new URL(href, "http://x");
      const parsed = readV3CorrectionQuery(url.pathname, url.searchParams);
      assert.equal(parsed.kind, "scope", route);
      if (parsed.kind !== "scope") continue;
      assert.deepEqual(
        { dossierId: parsed.scope.dossierId, fiscalYearId: parsed.scope.fiscalYearId, year: parsed.scope.year, property: parsed.scope.property, shell: parsed.scope.shell },
        { dossierId: DOSSIER, fiscalYearId: "fy-2026", year: Y, property: { kind: "required", propertyId: B }, shell: "dossier" },
        route,
      );
    }
    for (const route of ["/assistants/activite", "/assistants/biens"]) {
      const href = productionOwnerHref(route, ws)!;
      assert.equal(new URL(href, "http://x").searchParams.has("propertyId"), false, route);
    }
  });

  it("L — multi : jamais « le premier bien » ; un bien étranger au dossier est refusé", () => {
    assert.equal(productionOwnerHref("/assistants/logement", multi()), null, "sans bien choisi, aucun lien de bien");
    assert.equal(productionOwnerHref("/assistants/logement", multi(), "bien-inconnu"), null);
  });

  it("L — le sélecteur de production a de vrais liens (scope dérivé du dossier chargé, sans URL préalable)", () => {
    const ws = multi();
    const items = buildPropertySelectorItems({
      properties: ws.properties, propertyIds: ws.fiscalYear.propertyIds, activePropertyId: undefined,
      scope: deriveProductionScope(ws), pathname: "/assistants/logement",
    });
    assert.equal(items.length, 2);
    assert.ok(items.every((item) => item.href && /propertyId=/.test(item.href) && !item.href.includes("/lab")));
  });

  it("P — mono inchangé : le scope de production résout le bien unique, sans lien exposé tant que l'édition est fermée", () => {
    const scope = deriveProductionScope(mono());
    assert.deepEqual(scope?.property, { kind: "required", propertyId: A });
    assert.equal(deriveProductionScope(tweak(mono(), (ws) => { delete fy(ws).dossierId; })), null, "sans dossier identifié : aucun scope inventé");
    assert.equal(deriveProductionScope(tweak(mono(), (ws) => { fy(ws).status = "closed"; })), null, "exercice clos : aucun scope");
  });

  it("M — documents : sans bien actif en multi, aucun téléversement silencieusement non attribué ; avec un bien actif, il est explicite", () => {
    const ws = multi();
    assert.deepEqual(resolveUploadPropertyScope(ws, undefined), { propertyId: undefined, requirePropertyId: true });
    assert.deepEqual(resolveUploadPropertyScope(ws, B), { propertyId: B, requirePropertyId: true });
  });
});

// ===========================================================================
// 3. PRÉ-CONTRÔLE DE DOMAINE AVANT ADD_PROPERTY
// ===========================================================================
describe("ADD_PROPERTY : le domaine est vérifié AVANT l'entrée irréversible en multi", () => {
  it("D — dossier mono de première année, natif : éligible ; le plan produit le second bien (capacités injectées)", () => {
    assert.deepEqual(resolveAddPropertyEligibility(mono(), { capabilities: EDITION_OPEN }), { status: "eligible" });
    const plan = planAddProperty(mono(), { label: "Studio" }, { capabilities: EDITION_OPEN, newId: () => "bien-2" });
    assert.equal(plan.ok, true);
  });

  it("D — les attestations absentes et les documents non attribués ne bloquent pas l'ajout (récupérables après)", () => {
    assert.equal(resolveAddPropertyEligibility(mono(), { capabilities: EDITION_OPEN }).status, "eligible");
  });

  const unsupported: Array<[string, (ws: PersistedWorkspace) => void, string]> = [
    ["exercice non initial (exercice précédent)", (ws) => { fy(ws).previousFiscalYearId = "fy-2025"; }, REASON.notFirstYear],
    ["reprise d'historique en continuité", (ws) => { fy(ws).repriseHistoriqueEnContinuite = true; }, REASON.takeoverNotSupported],
    ["déficit antérieur d'ouverture", (ws) => { fy(ws).stocksOuverture = { sourceClosureId: "c", stocks: { deficits: [{ millesime: 2024, montant: 1500 }], amortissementsReportes: 0, deficitsExpires: [] } }; }, REASON.priorDeficitNotSupported],
    ["ARD d'ouverture", (ws) => { fy(ws).stocksOuverture = { sourceClosureId: "c", stocks: { deficits: [], amortissementsReportes: 800, deficitsExpires: [] } }; }, REASON.historicalArdNotSupported],
    ["LMP", (ws) => { draft(ws).activityType = "LMP"; }, REASON.lmpNotSupported],
    ["détention indirecte (indivision déclarée)", (ws) => { draft(ws).indivision = true; }, REASON.indirectHoldingNotSupported],
    ["régime non réel", (ws) => { fy(ws).regime = "micro"; }, REASON.regimeNotSupported],
  ];
  for (const [label, patch, code] of unsupported) {
    it(`C — ${label} : refus AVANT tout dispatch (${code})`, () => {
      const ws = tweak(mono(), patch);
      const eligibility = resolveAddPropertyEligibility(ws, { capabilities: EDITION_OPEN });
      assert.equal(eligibility.status, "unsupported");
      if (eligibility.status === "unsupported") assert.ok(eligibility.reasons.some((reason) => reason.code === code), JSON.stringify(eligibility.reasons));
      const plan = planAddProperty(ws, { label: "Studio" }, { capabilities: EDITION_OPEN, newId: () => "bien-2" });
      assert.equal(plan.ok, false);
      if (!plan.ok) assert.equal(plan.reason, "domain_unsupported");
    });
  }

  it("N — l'édition fermée prime : refus d'édition, indépendamment du domaine (capacité explicitement fermée)", () => {
    assert.deepEqual(resolveAddPropertyEligibility(mono(), { capabilities: EDITION_CLOSED }), { status: "edition_not_enabled" });
    assert.deepEqual(planAddProperty(mono(), { label: "Studio" }, { capabilities: EDITION_CLOSED }), { ok: false, reason: "edition_not_enabled" });
  });

  it("l'écran « Mes biens » ne dispatche ADD_PROPERTY qu'après un plan accepté et affiche le motif de domaine avant le clic", () => {
    const code = source("src/components/lmnp/biens/PropertiesManager.tsx");
    assert.match(code, /resolveAddPropertyEligibility/);
    assert.ok(code.indexOf("if (!plan.ok)") < code.indexOf('type: "ADD_PROPERTY"'));
  });
});

// ===========================================================================
// 4. ISSUE D'ENREGISTREMENT VÉRIDIQUE
// ===========================================================================
describe("ADD_PROPERTY : l'issue d'enregistrement reflète la persistance réelle", () => {
  const after = () => {
    const ws = multi();
    return { ws, newId: B };
  };

  it("E — enregistrement confirmé SANS scope d'URL (production) : succès, jamais « n'a pas pu être enregistré » ; redirection vers le nouveau bien", () => {
    const { ws, newId } = after();
    const outcome = resolveAddPropertyOutcome({ workspace: ws, scope: null, newPropertyId: newId, save: { status: "confirmed", revision: 3 } });
    assert.equal(outcome.kind, "navigate");
    if (outcome.kind === "navigate") {
      assert.ok(outcome.href.startsWith("/assistants/logement?"), outcome.href);
      assert.match(outcome.href, new RegExp(`propertyId=${newId}`));
      assert.equal(outcome.href.includes("/lab"), false);
    }
  });

  it("E — enregistrement confirmé AVEC scope d'URL : retour existant inchangé", () => {
    const { ws, newId } = after();
    const scope: V3CorrectionScope = { dossierId: DOSSIER, fiscalYearId: "fy-2026", year: Y, property: { kind: "not_applicable" }, shell: "v3" };
    const outcome = resolveAddPropertyOutcome({ workspace: ws, scope, newPropertyId: newId, save: { status: "confirmed", revision: 3 } });
    assert.equal(outcome.kind, "navigate");
    if (outcome.kind === "navigate") assert.ok(outcome.href.startsWith("/lab/v3-dossier/real?"), outcome.href);
  });

  it("E — enregistrement confirmé mais dossier non identifiable : « enregistré » sans redirection (jamais un échec affiché)", () => {
    const { ws, newId } = after();
    const noDossier = tweak(ws, (w) => { delete fy(w).dossierId; });
    const outcome = resolveAddPropertyOutcome({ workspace: noDossier, scope: null, newPropertyId: newId, save: { status: "confirmed", revision: 3 } });
    assert.equal(outcome.kind, "saved");
  });

  it("E — « rien en attente » (déjà persisté) n'est jamais un échec : la révision confirmée est reprise telle quelle", () => {
    assert.deepEqual(toConfirmedSave({ status: "ok", revision: 4 }), { status: "confirmed", revision: 4 });
    assert.deepEqual(toConfirmedSave({ status: "failed", reason: "network" }), { status: "failed", reason: "network" });
    const code = source("src/components/lmnp/biens/PropertiesManager.tsx");
    assert.match(code, /resolveDeliveryRevision/);
    assert.doesNotMatch(code, /confirmWorkspaceSave/);
  });

  it("F — enregistrement ÉCHOUÉ : jamais de succès ni de redirection ; l'utilisateur peut réessayer l'enregistrement", () => {
    const { ws, newId } = after();
    for (const scope of [null, { dossierId: DOSSIER, fiscalYearId: "fy-2026", year: Y, property: { kind: "not_applicable" }, shell: "v3" } as V3CorrectionScope]) {
      const outcome = resolveAddPropertyOutcome({ workspace: ws, scope, newPropertyId: newId, save: { status: "failed", reason: "network" } });
      assert.equal(outcome.kind, "unsaved");
    }
    const code = source("src/components/lmnp/biens/PropertiesManager.tsx");
    assert.match(code, /resolveAddPropertyOutcome/);
    assert.match(code, /Réessayer l.enregistrement/);
  });
});
