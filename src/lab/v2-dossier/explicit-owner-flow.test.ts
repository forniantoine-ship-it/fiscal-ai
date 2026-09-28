import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import {
  readV3CorrectionQuery, readV3ReturnQuery, sameCorrectionScope, scopeMatchesWorkspace,
  v3OwnerHrefForResolvedScope, v3ReturnHref, v3ScopedNavigationHref, type V3CorrectionScope,
} from "./correction-scope";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const propertyA = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const propertyB = "bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb";

function scope(dossierId: string, propertyId: string): V3CorrectionScope {
  return { dossierId, fiscalYearId: `fy-${dossierId}`, year: 2025,
    property: { kind: "required", propertyId } };
}

function workspace(dossierId: string, propertyId: string): PersistedWorkspace {
  return {
    fiscalYear: { id: `fy-${dossierId}`, dossierId, year: 2025, status: "draft", regime: "reel",
      propertyIds: [propertyId], createdAt: "2025-01-01", updatedAt: "2025-01-01" },
    properties: [{ id: propertyId, label: "", address: "", city: "", postalCode: "" }],
    documents: [], extractions: [], validationItems: [], ledgerEntries: [],
    declarationDraft: { completedSteps: [] },
  };
}

test("F009–F014 et Documents conservent le scope A/B exact, dont le step Documents", () => {
  const routes = ["/assistants/activite", "/assistants/logement", "/assistants/financement",
    "/assistants/charges", "/assistants/revenus", "/assistants/amortissements", "/documents?step=validation"];
  for (const [dossierId, propertyId] of [[A, propertyA], [B, propertyB]]) {
    const expected = scope(dossierId, propertyId);
    for (const route of routes) {
      const href = v3OwnerHrefForResolvedScope(route, expected);
      assert.ok(href, route);
      const url = new URL(href, "http://localhost");
      const query = readV3CorrectionQuery(url.pathname, url.searchParams);
      assert.equal(query.kind, "scope", route);
      if (query.kind !== "scope") continue;
      assert.equal(query.scope.dossierId, dossierId);
      assert.equal(query.scope.fiscalYearId, expected.fiscalYearId);
      assert.equal(query.scope.year, 2025);
      assert.equal(query.scope.property.kind, route === "/assistants/activite" ? "not_applicable" : "required");
      assert.equal(sameCorrectionScope(query.scope, expected), true);
      assert.equal(scopeMatchesWorkspace(query.scope, workspace(dossierId, propertyId)), true);
      assert.equal(scopeMatchesWorkspace(query.scope, workspace(dossierId === A ? B : A, dossierId === A ? propertyB : propertyA)), false);
      if (url.pathname === "/documents") assert.equal(url.searchParams.get("step"), "validation");
    }
  }
});

test("propriété B dans A, année fermée ou discordante et liens non autorisés échouent", () => {
  const a = scope(A, propertyA);
  for (const route of ["/assistants/logement", "/assistants/amortissements", "/documents"]) {
    const href = v3OwnerHrefForResolvedScope(route, { ...a, property: { kind: "required", propertyId: propertyB } });
    assert.ok(href);
    const url = new URL(href, "http://localhost");
    const query = readV3CorrectionQuery(url.pathname, url.searchParams);
    assert.equal(query.kind, "scope");
    if (query.kind === "scope") assert.equal(scopeMatchesWorkspace(query.scope, workspace(A, propertyA)), false);
  }
  assert.equal(scopeMatchesWorkspace({ ...a, year: 2026 }, workspace(A, propertyA)), false);
  assert.equal(scopeMatchesWorkspace(a, { ...workspace(A, propertyA), fiscalYear: { ...workspace(A, propertyA).fiscalYear, status: "closed" } }), false);
  assert.equal(v3OwnerHrefForResolvedScope("https://elsewhere.invalid", a), null);
  assert.equal(v3OwnerHrefForResolvedScope("/assistants/financement?dossierId=forged", a), null);
  assert.equal(v3OwnerHrefForResolvedScope("/documents", null), null);
});

test("retour A/B attend la confirmation serveur et garde le dossier après relecture", () => {
  for (const [dossierId, propertyId] of [[A, propertyA], [B, propertyB]]) {
    const current = scope(dossierId, propertyId);
    assert.equal(v3ReturnHref({ scope: current, scopeStillMatches: true, changed: true,
      save: { status: "failed", reason: "server" } }), null);
    const href = v3ReturnHref({ scope: current, scopeStillMatches: true, changed: true,
      save: { status: "confirmed", revision: dossierId === A ? 2 : 8 } });
    assert.ok(href?.startsWith(`/lab/v2-dossier/real?dossierId=${dossierId}`));
    const returned = readV3ReturnQuery(new URL(href!, "http://localhost").searchParams);
    assert.deepEqual(returned, { kind: "scope", scope: current });
  }
});

test("navigation entre owners, dashboard et déclarations garde A/B, année et bien ; le legacy reste inchangé", () => {
  for (const [dossierId, propertyId] of [[A, propertyA], [B, propertyB]]) {
    const current = scope(dossierId, propertyId);
    const next = v3ScopedNavigationHref("/assistants/revenus", current);
    assert.ok(next?.includes(`dossierId=${dossierId}`));
    assert.ok(next?.includes("v3Correction=1"));
    for (const route of ["/dashboard", "/declarations", "/declarations/historique", "/declarations/2024"]) {
      const href = v3ScopedNavigationHref(route, current);
      assert.ok(href, route);
      const url = new URL(href, "http://localhost");
      assert.equal(url.pathname, route);
      assert.deepEqual(readV3CorrectionQuery(url.pathname, url.searchParams), { kind: "scope", scope: current });
      assert.equal(scopeMatchesWorkspace(current, workspace(dossierId, propertyId)), true);
      assert.equal(scopeMatchesWorkspace(current, workspace(dossierId === A ? B : A, dossierId === A ? propertyB : propertyA)), false);
    }
    assert.equal(v3ScopedNavigationHref("/declarations/unrecognized", current), null);
    assert.equal(v3ScopedNavigationHref("/assistants/fiscal", current), null);
    assert.equal(v3ScopedNavigationHref("/dashboard", null), "/dashboard");
    assert.equal(v3ScopedNavigationHref("/declarations", null), "/declarations");
    assert.equal(v3ScopedNavigationHref("/documents?step=charges", current)?.includes(`dossierId=${dossierId}`), true);
    assert.equal(v3ScopedNavigationHref("/assistants/revenus", null), "/assistants/revenus");
  }
});

test("F009 sans bien peut revenir à V3 ; les écrans legacy qui exigent un bien échouent fermés", () => {
  const activityScope: V3CorrectionScope = { dossierId: A, fiscalYearId: `fy-${A}`, year: 2025,
    property: { kind: "not_applicable" } };
  assert.ok(v3ReturnHref({ scope: activityScope, scopeStillMatches: true, changed: false }));
  assert.equal(v3ScopedNavigationHref("/dashboard", activityScope), null);
  assert.equal(v3ScopedNavigationHref("/declarations", activityScope), null);
});

test("gardes statiques : liens V3, entry gate, provider et upload explicite", () => {
  const prototype = readFileSync(new URL("./V2Prototype.tsx", import.meta.url), "utf8");
  const gate = readFileSync(new URL("../../components/lmnp/app-shell/V3CorrectionEntryGate.tsx", import.meta.url), "utf8");
  const provider = readFileSync(new URL("../../lib/lmnp/store/provider.tsx", import.meta.url), "utf8");
  const upload = readFileSync(new URL("../../lib/uploadDocument.ts", import.meta.url), "utf8");
  const nav = readFileSync(new URL("../../components/lmnp/app-shell/scoped-owner-navigation.tsx", import.meta.url), "utf8");
  const validation = readFileSync(new URL("../../components/lmnp/documents/ValidationDocumentStep.tsx", import.meta.url), "utf8");
  const declarations = readFileSync(new URL("../../app/(dashboard)/declarations/page.tsx", import.meta.url), "utf8");
  assert.match(prototype, /v3OwnerHrefForResolvedScope\(action\.href, correctionScope\)/);
  assert.match(gate, /loadRealWorkspace\(data\.user\.id, undefined, expectedScope\.dossierId\)/);
  assert.match(provider, /scopeMatchesWorkspace\(correctionScope, baseWorkspace\)/);
  assert.match(upload, /resolveUploadDossierId\(options\.dossierId\)/);
  assert.match(upload, /\.insert\(documentInsertForUpload\(/);
  assert.match(nav, /v3ScopedNavigationHref\(href, scope\)/);
  assert.match(validation, /declarationsHref = useScopedOwnerHref\(LMNP_ROUTES\.declarations\)/);
  assert.doesNotMatch(validation, /router\.push\(LMNP_ROUTES\.declarations\)/);
  const checkout = validation.slice(validation.indexOf("const handleStartCheckout"), validation.indexOf("const handleBilanPatrimonialChange"));
  assert.match(checkout, /if \(correctionScope\) throw new Error/);
  assert.match(checkout, /requestCheckout\(/);
  assert.ok(checkout.indexOf("if (correctionScope) throw") < checkout.indexOf("requestCheckout("));
  assert.match(declarations, /validationHref = useScopedOwnerHref\(LMNP_ROUTES\.validation\)/);
  assert.doesNotMatch(declarations, /router\.replace\(LMNP_ROUTES\.validation\)/);
});
