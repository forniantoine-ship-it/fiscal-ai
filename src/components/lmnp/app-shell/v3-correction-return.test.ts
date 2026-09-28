import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { performV3CorrectionReturn } from "./v3-correction-return";
import type { V3CorrectionScope } from "@/lab/v2-dossier/correction-scope";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";

const SCOPE: V3CorrectionScope = {
  dossierId: "dossier-id", fiscalYearId: "year-id", year: 2025,
  property: { kind: "not_applicable" },
};

function workspace(overrides: Partial<PersistedWorkspace["fiscalYear"]> = {}): PersistedWorkspace {
  return {
    fiscalYear: {
      id: "year-id", dossierId: "dossier-id", year: 2025, status: "draft", regime: "reel",
      propertyIds: [], createdAt: "2025-01-01", updatedAt: "2025-01-01", ...overrides,
    },
    properties: [], documents: [], extractions: [], validationItems: [], ledgerEntries: [],
  };
}

describe("V3 correction return — R12.2 §16/§17", () => {
  it("confirmed save + matching scope returns the internal V3 href", async () => {
    const outcome = await performV3CorrectionReturn({
      scope: SCOPE, workspace: workspace(),
      confirmWorkspaceSave: async () => ({ status: "confirmed", revision: 3 }),
    });
    assert.equal(outcome.status, "returning");
    if (outcome.status === "returning") assert.ok(outcome.href.startsWith("/lab/v2-dossier/real?"));
  });

  it("a failed server confirmation never returns as if it worked", async () => {
    const outcome = await performV3CorrectionReturn({
      scope: SCOPE, workspace: workspace(),
      confirmWorkspaceSave: async () => ({ status: "failed", reason: "server_unavailable" }),
    });
    assert.deepEqual(outcome, { status: "error" });
  });

  it("a confirmed save whose scope has drifted since entry still refuses to return", async () => {
    const outcome = await performV3CorrectionReturn({
      scope: SCOPE, workspace: workspace({ dossierId: "other-dossier" }),
      confirmWorkspaceSave: async () => ({ status: "confirmed", revision: 4 }),
    });
    assert.deepEqual(outcome, { status: "error" });
  });

  it("a closed exercise after the edit also refuses to return", async () => {
    const outcome = await performV3CorrectionReturn({
      scope: SCOPE, workspace: workspace({ status: "closed" }),
      confirmWorkspaceSave: async () => ({ status: "confirmed", revision: 5 }),
    });
    assert.deepEqual(outcome, { status: "error" });
  });
});
