/**
 * Lot 3 — pickTargetYear / cold restore year selection (exported resolve helpers).
 * Run: npx tsx --test src/lib/lmnp/store/lot3-cold-restore.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  pickTargetYear,
  resolveWorkspaceHydration,
  type WorkspaceSnapshotRecord,
} from "./workspace-snapshot-resolve";
import { serializeWorkspaceSnapshot } from "./workspace-snapshot";
import type { PersistedWorkspace } from "./persistence";

const NOW = "2026-09-01T00:00:00.000Z";

function envelope(year: number, id: string): unknown {
  const workspace: PersistedWorkspace = {
    fiscalYear: {
      id,
      year,
      status: "draft",
      regime: "reel",
      propertyIds: ["prop-1"],
      dossierId: "dossier-1",
      closures: [],
      createdAt: NOW,
      updatedAt: NOW,
    },
    properties: [
      { id: "prop-1", label: "Bien", address: "1 rue X", city: "Lyon", postalCode: "69000" },
    ],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: { completedSteps: [] },
  };
  const serialized = serializeWorkspaceSnapshot(workspace);
  assert.equal(serialized.ok, true);
  if (!serialized.ok) throw new Error("unreachable");
  return serialized.envelope;
}

function row(
  fiscalYear: number,
  opts?: Partial<WorkspaceSnapshotRecord>,
): WorkspaceSnapshotRecord {
  return {
    dossierId: "dossier-1",
    fiscalYear,
    schemaVersion: 1,
    revision: 1,
    payload: envelope(fiscalYear, `fy-${fiscalYear}`),
    updatedAt: NOW,
    closedAt: null,
    successorFiscalYear: null,
    ...opts,
  };
}

describe("Lot 3 pickTargetYear — cold restore", () => {
  it("prefers server activeFiscalYear when a snapshot exists for that year", () => {
    const snapshots = [row(2025, { closedAt: NOW, successorFiscalYear: 2026 }), row(2026)];
    assert.equal(pickTargetYear(null, snapshots, 2025, 2026), 2026);
  });

  it("ignores activeFiscalYear when no snapshot exists for it", () => {
    const snapshots = [row(2025)];
    assert.equal(pickTargetYear(null, snapshots, 2025, 2099), 2025);
  });

  it("falls back to local year when active pointer is absent", () => {
    const local = {
      fiscalYear: { year: 2024 },
    } as PersistedWorkspace;
    const snapshots = [row(2025), row(2026)];
    assert.equal(pickTargetYear(local, snapshots, 2025, null), 2024);
    assert.equal(pickTargetYear(local, snapshots, 2025, undefined), 2024);
  });

  it("falls back to fallbackYear then most recently updated when local and active are absent", () => {
    const snapshots = [
      row(2025, { updatedAt: "2026-01-01T00:00:00.000Z" }),
      row(2026, { updatedAt: "2026-02-01T00:00:00.000Z" }),
    ];
    assert.equal(pickTargetYear(null, snapshots, 2025, null), 2025);
    assert.equal(pickTargetYear(null, snapshots, 2099, null), 2026);
  });

  it("returns null when no local and no snapshots", () => {
    assert.equal(pickTargetYear(null, [], 2025, null), null);
  });

  it("resolveWorkspaceHydration uses active year for empty local cold restore", () => {
    const snapshots = [
      row(2025, { closedAt: NOW, successorFiscalYear: 2026 }),
      row(2026),
    ];
    const decision = resolveWorkspaceHydration({
      local: null,
      snapshots,
      fallbackYear: 2025,
      activeFiscalYear: 2026,
    });
    assert.equal(decision.source, "server");
    if (decision.source !== "server") throw new Error("unreachable");
    assert.equal(decision.workspace.fiscalYear.year, 2026);
    assert.equal(decision.blockWrites, false);
  });

  it("closed archive targeted via fallbackYear gets blockWrites true", () => {
    const snapshots = [row(2025, { closedAt: NOW, successorFiscalYear: 2026 })];
    const decision = resolveWorkspaceHydration({
      local: null,
      snapshots,
      fallbackYear: 2025,
      activeFiscalYear: null,
    });
    assert.equal(decision.source, "server");
    if (decision.source !== "server") throw new Error("unreachable");
    assert.equal(decision.blockWrites, true);
  });
});
