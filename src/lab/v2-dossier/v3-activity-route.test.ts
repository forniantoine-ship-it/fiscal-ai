import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { v3CorrectionActionFor } from "./correction-registry";
import { readV3CorrectionQuery, type V3CorrectionScope } from "./correction-scope";

const SCOPE_NO_PROPERTY: V3CorrectionScope = {
  dossierId: "dossier-id", fiscalYearId: "year-id", year: 2025,
  property: { kind: "not_applicable" },
};

describe("R14.4A — F009 mounted inside V3 without leaving V3's shell", () => {
  it("the domain-level F009 action now targets the V3-native route, scoped, no property", () => {
    const action = v3CorrectionActionFor("activity", SCOPE_NO_PROPERTY);
    assert.ok(action);
    assert.equal(action!.owner, "F009");
    assert.ok(action!.href.startsWith("/lab/v2-dossier/real/activity?"));
    assert.ok(!action!.href.includes("propertyId"));
    const url = new URL(action!.href, "http://localhost");
    assert.deepEqual(readV3CorrectionQuery(url.pathname, url.searchParams), { kind: "scope", scope: SCOPE_NO_PROPERTY });
  });

  it("the legacy /assistants/activite route is still a registered, scoped owner route (untouched, V1 keeps working)", () => {
    const url = new URL("/assistants/activite?v3Correction=1&dossierId=dossier-id&fiscalYearId=year-id&year=2025", "http://localhost");
    assert.deepEqual(readV3CorrectionQuery(url.pathname, url.searchParams), { kind: "scope", scope: SCOPE_NO_PROPERTY });
  });

  it("static guard — V3ActivityRoute reuses F009's engine and the R14.3B gates, never the legacy shell", () => {
    const route = readFileSync(new URL("./V3ActivityRoute.tsx", import.meta.url), "utf8");
    // Business owner reused, not duplicated.
    assert.match(route, /F009ActiviteAssistantPanel/);
    // Same scope/persistence gates as the legacy correction path (DashboardShell) — no second engine.
    assert.match(route, /V3CorrectionEntryGate/);
    assert.match(route, /ExplicitDossierScopeGate/);
    assert.match(route, /LmnpProvider/);
    assert.match(route, /DossierProvider/);
    assert.match(route, /V3CorrectionReturnBar/);
    // Never the legacy dashboard shell/carousel, and never a link back to the legacy panel.
    assert.doesNotMatch(route, /DashboardLayout/);
    assert.doesNotMatch(route, /DashboardWorkflow/);
    assert.doesNotMatch(route, /workflow-carousel-engine/);
    assert.doesNotMatch(route, /\/assistants\/activite/);
    assert.doesNotMatch(route, /["'`]\/dashboard["'`]/);
  });

  it("static guard — the new page keeps the same production gate as the other V3 lab route", () => {
    const page = readFileSync(new URL("../../app/lab/v2-dossier/real/activity/page.tsx", import.meta.url), "utf8");
    assert.match(page, /isV3RealTestRouteEnabled/);
    assert.match(page, /notFound/);
    assert.doesNotMatch(page, /DashboardLayout|DashboardWorkflow/);
  });

  it("static guard — V3's 'Besoin de vous' action redirects only F009's own href, via the shared registry", () => {
    const prototype = readFileSync(new URL("./V2Prototype.tsx", import.meta.url), "utf8");
    assert.match(prototype, /action\.domain === "activite" && action\.href === LMNP_ROUTES\.activite/);
    assert.match(prototype, /v3CorrectionActionFor\("activity", correctionScope\)/);
    // The generic fallback for every other domain is untouched (same invariant explicit-owner-flow.test.ts checks).
    assert.match(prototype, /v3OwnerHrefForResolvedScope\(action\.href, correctionScope\)/);
  });
});
