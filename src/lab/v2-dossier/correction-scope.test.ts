import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { RealWorkspaceLoad } from "./real-workspace";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import {
  readV3CorrectionQuery, readV3ReturnQuery, sameCorrectionScope,
  scopeFromRealWorkspace, scopeMatchesWorkspace, v3OwnerCorrectionHref, v3ReturnHref,
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
