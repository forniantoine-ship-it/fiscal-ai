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
import { parseWorkspaceSnapshot, serializeWorkspaceSnapshot } from "./workspace-snapshot";
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

function local(year: number, status: "draft" | "closed" = "draft"): PersistedWorkspace {
  const parsed = parseWorkspaceSnapshot(envelope(year, `fy-${year}`));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("invalid test workspace");
  return { ...parsed.envelope.workspace, fiscalYear: { ...parsed.envelope.workspace.fiscalYear, status } };
}

describe("Lot 3 pickTargetYear — cold restore", () => {
  it("prefers server activeFiscalYear when a snapshot exists for that year", () => {
    const snapshots = [row(2025, { closedAt: NOW, successorFiscalYear: 2026 }), row(2026)];
    assert.deepEqual(pickTargetYear(null, snapshots, 2025, 2026), { status: "resolved", year: 2026 });
  });

  it("blocks an activeFiscalYear with no matching snapshot", () => {
    const snapshots = [row(2025)];
    assert.deepEqual(pickTargetYear(null, snapshots, 2025, 2099), { status: "ambiguous", reason: "active_snapshot_missing" });
  });

  it("blocks multiple plausible years when active pointer is absent", () => {
    const local = {
      fiscalYear: { year: 2024 },
    } as PersistedWorkspace;
    const snapshots = [row(2025), row(2026)];
    assert.deepEqual(pickTargetYear(local, snapshots, 2025, null), { status: "ambiguous", reason: "multiple_candidates" });
    assert.deepEqual(pickTargetYear(local, snapshots, 2025, undefined), { status: "ambiguous", reason: "multiple_candidates" });
  });

  it("does not choose by civil year or update date when multiple open years remain", () => {
    const snapshots = [
      row(2025, { updatedAt: "2026-01-01T00:00:00.000Z" }),
      row(2026, { updatedAt: "2026-02-01T00:00:00.000Z" }),
    ];
    assert.deepEqual(pickTargetYear(null, snapshots, 2025, null), { status: "ambiguous", reason: "multiple_candidates" });
    assert.deepEqual(pickTargetYear(null, snapshots, 2099, null), { status: "ambiguous", reason: "multiple_candidates" });
  });

  it("returns no_year when no local and no snapshots", () => {
    assert.deepEqual(pickTargetYear(null, [], 2025, null), { status: "no_year" });
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

  it("a closed archive alone is not an active-year candidate", () => {
    const snapshots = [row(2025, { closedAt: NOW, successorFiscalYear: 2026 })];
    const decision = resolveWorkspaceHydration({
      local: null,
      snapshots,
      fallbackYear: 2025,
      activeFiscalYear: null,
    });
    assert.deepEqual(decision, { source: "none", workspace: null, blockWrites: false });
  });
});

describe("R8.2 — canonical active-year matrix", () => {
  const resolved = (year: number) => ({ status: "resolved", year });
  const ambiguous = { status: "ambiguous", reason: "multiple_candidates" };

  it("A/J — a valid pointer wins over an open peer and multiple archives", () => {
    assert.deepEqual(pickTargetYear(null, [row(2025), row(2026)], 2025, 2026), resolved(2026));
    assert.deepEqual(pickTargetYear(null, [row(2023, { closedAt: NOW }), row(2024, { closedAt: NOW }), row(2025)], 2026, 2025), resolved(2025));
  });

  it("B/C/G — only open server years are candidates without a pointer", () => {
    assert.deepEqual(pickTargetYear(null, [row(2025)], 2026, null), resolved(2025));
    assert.deepEqual(pickTargetYear(null, [row(2025), row(2026)], 2025, null), ambiguous);
    assert.deepEqual(pickTargetYear(null, [row(2024, { closedAt: NOW }), row(2025)], 2024, null), resolved(2025));
  });

  it("D/E — a valid pointer beats a newer local year; a missing target blocks", () => {
    assert.deepEqual(pickTargetYear(local(2026), [row(2025)], 2026, 2025), resolved(2025));
    assert.deepEqual(pickTargetYear(local(2025), [row(2025)], 2025, 2026),
      { status: "ambiguous", reason: "active_snapshot_missing" });
  });

  it("F/H/I — distinct local year conflicts, the same year coalesces, no year stays empty", () => {
    assert.deepEqual(pickTargetYear(local(2025), [row(2026)], 2025, null), ambiguous);
    assert.deepEqual(pickTargetYear(local(2025), [row(2025)], 2026, null), resolved(2025));
    assert.deepEqual(pickTargetYear(null, [], 2025, null), { status: "no_year" });
  });

  it("K — ambiguous resolution hydrates no workspace and blocks writes", () => {
    assert.deepEqual(resolveWorkspaceHydration({ local: local(2025), snapshots: [row(2026)], fallbackYear: 2025, activeFiscalYear: null }),
      { source: "blocked", workspace: null, blockWrites: true, reason: "ambiguous_fiscal_year" });
    assert.deepEqual(resolveWorkspaceHydration({ local: local(2025), snapshots: [row(2025)], fallbackYear: 2025, activeFiscalYear: 2026 }),
      { source: "blocked", workspace: null, blockWrites: true, reason: "active_snapshot_missing" });
  });

  it("closed local/server copies cannot turn an archive into an active candidate", () => {
    assert.deepEqual(pickTargetYear(local(2024), [row(2024, { closedAt: NOW }), row(2025)], 2024, null), resolved(2025));
    assert.deepEqual(pickTargetYear(local(2024, "closed"), [row(2025)], 2024, null), resolved(2025));
  });
});
