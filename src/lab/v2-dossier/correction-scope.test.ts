import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { RealWorkspaceLoad } from "./real-workspace";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import {
  readV3CorrectionQuery, readV3ReturnQuery, sameCorrectionScope,
  scopeFromRealWorkspace, scopeMatchesWorkspace, v3CorrectionHrefForResolvedScope, v3OwnerCorrectionHref,
  v3OwnerHrefForResolvedScope, v3ReturnHref,
} from "./correction-scope";

const WORKSPACE: PersistedWorkspace = {
  fiscalYear: {
    id: "year-id", dossierId: "dossier-id", year: 2025, status: "draft", regime: "reel",
    propertyIds: ["property-id"], createdAt: "2025-01-01", updatedAt: "2025-01-01",
  },
  properties: [{ id: "property-id", label: "", address: "", city: "", postalCode: "" }],
  documents: [], extractions: [], validationItems: [], ledgerEntries: [],
};
const NO_PROPERTY_WORKSPACE: PersistedWorkspace = {
  fiscalYear: { ...WORKSPACE.fiscalYear, propertyIds: [] },
  properties: [], documents: [], extractions: [], validationItems: [], ledgerEntries: [],
};
const LOAD: RealWorkspaceLoad = {
  status: "ready", workspace: WORKSPACE, dossierId: "dossier-id", userId: "user-id",
  fiscalYear: 2025, source: "server", serverScopeVerified: true, legacyDocumentYears: [],
};
const NO_PROPERTY_LOAD: RealWorkspaceLoad = { ...LOAD, workspace: NO_PROPERTY_WORKSPACE };
const SCOPE = { dossierId: "dossier-id", fiscalYearId: "year-id", year: 2025, property: { kind: "required" as const, propertyId: "property-id" } };
const NOT_APPLICABLE_SCOPE = { dossierId: "dossier-id", fiscalYearId: "year-id", year: 2025, property: { kind: "not_applicable" as const } };

function altered(patch: Partial<PersistedWorkspace["fiscalYear"]>, propertyIds?: string[]): RealWorkspaceLoad {
  return {
    ...LOAD,
    workspace: {
      ...WORKSPACE,
      fiscalYear: { ...WORKSPACE.fiscalYear, ...patch },
      ...(propertyIds ? { properties: propertyIds.map(id => ({ ...WORKSPACE.properties[0]!, id })) } : {}),
    },
  };
}

describe("V3 correction scope — before provider and on return", () => {
  it("accepts only the exact active, open, mono-property server scope", () => {
    assert.deepEqual(scopeFromRealWorkspace(LOAD), SCOPE);
    assert.equal(scopeMatchesWorkspace(SCOPE, WORKSPACE), true);
    assert.equal(sameCorrectionScope(SCOPE, scopeFromRealWorkspace(LOAD)), true);
    assert.deepEqual(scopeFromRealWorkspace({ ...LOAD, source: "local" }), SCOPE);
    assert.equal(scopeFromRealWorkspace({ ...LOAD, source: "local", serverScopeVerified: false }), null);
  });

  it("rejects another dossier, year id, year, closed year and inconsistent property", () => {
    for (const load of [
      altered({ dossierId: "other" }), altered({ id: "other" }),
      altered({ year: 2026 }), altered({ status: "closed" }),
      altered({ propertyIds: ["other"] }), altered({ propertyIds: ["property-id", "other"] }, ["property-id", "other"]),
    ]) assert.equal(sameCorrectionScope(SCOPE, scopeFromRealWorkspace(load)), false);
    assert.equal(scopeMatchesWorkspace(SCOPE, altered({ id: "other" }).status === "ready" ? altered({ id: "other" }).workspace : WORKSPACE), false);
  });

  it("keeps historical assistant routes unscoped and refuses forged/duplicate scoped parameters", () => {
    assert.deepEqual(readV3CorrectionQuery("/assistants/logement", new URLSearchParams()), { kind: "none" });
    const href = v3OwnerCorrectionHref("/assistants/logement", LOAD);
    assert.ok(href);
    const url = new URL(href, "http://localhost");
    assert.deepEqual(readV3CorrectionQuery(url.pathname, url.searchParams), { kind: "scope", scope: SCOPE });
    url.searchParams.set("dossierId", "forged");
    const forged = readV3CorrectionQuery(url.pathname, url.searchParams);
    assert.equal(forged.kind, "scope");
    if (forged.kind === "scope") assert.equal(sameCorrectionScope(forged.scope, scopeFromRealWorkspace(LOAD)), false);
    url.searchParams.append("dossierId", "dossier-id");
    assert.deepEqual(readV3CorrectionQuery(url.pathname, url.searchParams), { kind: "invalid" });
    assert.equal(v3OwnerCorrectionHref("https://other.invalid", LOAD), null);
  });

  it("F009 — clips property identity out of the URL and correction scope entirely, whether or not a property exists", () => {
    const withProperty = v3OwnerCorrectionHref("/assistants/activite", LOAD);
    assert.ok(withProperty);
    const url1 = new URL(withProperty, "http://localhost");
    assert.equal(url1.searchParams.has("propertyId"), false);
    assert.deepEqual(readV3CorrectionQuery(url1.pathname, url1.searchParams), { kind: "scope", scope: NOT_APPLICABLE_SCOPE });
    assert.equal(sameCorrectionScope(NOT_APPLICABLE_SCOPE, scopeFromRealWorkspace(LOAD)), true);

    const withoutProperty = v3OwnerCorrectionHref("/assistants/activite", NO_PROPERTY_LOAD);
    assert.ok(withoutProperty);
    const url2 = new URL(withoutProperty, "http://localhost");
    assert.deepEqual(readV3CorrectionQuery(url2.pathname, url2.searchParams), { kind: "scope", scope: NOT_APPLICABLE_SCOPE });
    assert.equal(sameCorrectionScope(NOT_APPLICABLE_SCOPE, scopeFromRealWorkspace(NO_PROPERTY_LOAD)), true);
  });

  it("F010 — refuses to build or accept a correction when no property is resolved", () => {
    assert.equal(v3OwnerCorrectionHref("/assistants/logement", NO_PROPERTY_LOAD), null);
    const forgedUrl = new URL("http://localhost/assistants/logement?v3Correction=1&dossierId=dossier-id&fiscalYearId=year-id&year=2025&propertyId=forged");
    const forged = readV3CorrectionQuery(forgedUrl.pathname, forgedUrl.searchParams);
    assert.equal(forged.kind, "scope");
    if (forged.kind === "scope") assert.equal(sameCorrectionScope(forged.scope, scopeFromRealWorkspace(NO_PROPERTY_LOAD)), false);
  });

  it("rejects a property-required route missing propertyId, and a property-not-applicable route carrying one", () => {
    const missing = new URL("http://localhost/assistants/logement?v3Correction=1&dossierId=dossier-id&fiscalYearId=year-id&year=2025");
    assert.deepEqual(readV3CorrectionQuery(missing.pathname, missing.searchParams), { kind: "invalid" });
    const extra = new URL("http://localhost/assistants/activite?v3Correction=1&dossierId=dossier-id&fiscalYearId=year-id&year=2025&propertyId=property-id");
    assert.deepEqual(readV3CorrectionQuery(extra.pathname, extra.searchParams), { kind: "invalid" });
  });

  it("returns only to the fixed V3 route, after a confirmed write when changed", () => {
    assert.equal(v3ReturnHref({ scope: SCOPE, scopeStillMatches: true, changed: true }), null);
    assert.equal(v3ReturnHref({ scope: SCOPE, scopeStillMatches: true, changed: true, save: { status: "failed", reason: "server_unavailable" } }), null);
    const href = v3ReturnHref({ scope: SCOPE, scopeStillMatches: true, changed: true, save: { status: "confirmed", revision: 2 } });
    assert.ok(href?.startsWith("/lab/v2-dossier/real?"));
    assert.deepEqual(readV3ReturnQuery(new URL(href!, "http://localhost").searchParams), { kind: "scope", scope: SCOPE });
    assert.ok(v3ReturnHref({ scope: SCOPE, scopeStillMatches: true, changed: false }));
    assert.equal(v3ReturnHref({ scope: SCOPE, scopeStillMatches: false, changed: false }), null);
    assert.equal(sameCorrectionScope(SCOPE, scopeFromRealWorkspace(altered({ id: "other" }))), false);
    assert.equal(scopeMatchesWorkspace(NOT_APPLICABLE_SCOPE, NO_PROPERTY_WORKSPACE), true);
    assert.equal(scopeMatchesWorkspace(NOT_APPLICABLE_SCOPE, WORKSPACE), true);
    assert.equal(scopeMatchesWorkspace(SCOPE, NO_PROPERTY_WORKSPACE), false);
  });
});

describe("R15 — marqueur de coque V3 (v3Shell) : liste blanche, sans autorité", () => {
  const V3_SCOPE = { ...SCOPE, shell: "v3" as const };
  const owner = (scope: typeof V3_SCOPE | typeof SCOPE) => v3CorrectionHrefForResolvedScope("/assistants/financement", scope)!;

  it("émis seulement pour la coque V3 ; la route V2 réelle et ses liens restent strictement identiques", () => {
    assert.equal(new URL(owner(SCOPE), "http://x").searchParams.has("v3Shell"), false);
    assert.equal(new URL(owner(V3_SCOPE), "http://x").searchParams.get("v3Shell"), "v3");
  });

  it("aller-retour : le marqueur est relu ; sans marqueur, la portée n'a aucune clé shell", () => {
    const withShell = readV3CorrectionQuery("/assistants/financement", new URL(owner(V3_SCOPE), "http://x").searchParams);
    assert.deepEqual(withShell, { kind: "scope", scope: V3_SCOPE });
    const without = readV3CorrectionQuery("/assistants/financement", new URL(owner(SCOPE), "http://x").searchParams);
    assert.deepEqual(without, { kind: "scope", scope: SCOPE });
    assert.equal("shell" in (without.kind === "scope" ? without.scope : {}), false);
  });

  it("toute autre valeur, un doublon ou une valeur vide invalident la portée entière (jamais une URL, jamais un défaut)", () => {
    const base = new URL(owner(SCOPE), "http://x").searchParams;
    for (const bad of [["other"], ["V3"], ["/lab/x"], ["https://evil.example"], [""], ["v3", "v3"]]) {
      const params = new URLSearchParams(base);
      for (const value of bad) params.append("v3Shell", value);
      assert.deepEqual(readV3CorrectionQuery("/assistants/financement", params), { kind: "invalid" }, JSON.stringify(bad));
    }
  });

  it("retour F011 : coque V3 → /lab/v3-dossier/real, sinon V2 ; même sauvegarde confirmée exigée", () => {
    const back = (scope: typeof V3_SCOPE | typeof SCOPE) => v3ReturnHref({ scope, scopeStillMatches: true, changed: true, save: { status: "confirmed", revision: 2 } });
    assert.ok(back(V3_SCOPE)?.startsWith("/lab/v3-dossier/real?"));
    assert.ok(back(SCOPE)?.startsWith("/lab/v2-dossier/real?"));
    assert.equal(v3ReturnHref({ scope: V3_SCOPE, scopeStillMatches: true, changed: true, save: { status: "failed", reason: "x" } }), null);
    assert.equal(v3ReturnHref({ scope: V3_SCOPE, scopeStillMatches: false, changed: false }), null);
    const href = back(V3_SCOPE)!;
    assert.deepEqual(readV3ReturnQuery(new URL(href, "http://localhost").searchParams), { kind: "scope", scope: V3_SCOPE });
  });

  it("aucune autorité : l'égalité de portée et la portée du workspace ignorent la coque", () => {
    assert.equal(sameCorrectionScope(V3_SCOPE, SCOPE), true);
    assert.equal(sameCorrectionScope(SCOPE, V3_SCOPE), true);
    assert.equal(sameCorrectionScope(V3_SCOPE, { ...SCOPE, year: 2024 }), false);
    assert.equal(scopeMatchesWorkspace(V3_SCOPE, WORKSPACE), true);
  });

  it("un href déjà porteur du marqueur est refusé (jamais deux marqueurs)", () => {
    assert.equal(v3OwnerHrefForResolvedScope("/assistants/financement?v3Shell=v3", V3_SCOPE), null);
    assert.ok(v3OwnerHrefForResolvedScope("/assistants/financement", V3_SCOPE)?.includes("v3Shell=v3"));
  });
});
