/**
 * Lot 6A — historique / archive server-backed (cold IDB vide).
 *
 * Run: npx tsx --test src/lib/lmnp/store/lot6a-server-backed-history.test.ts
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  archivedLiasseRecordFromWorkspace,
  listClosedFiscalYearArchives,
  loadArchivedWorkspaceFromServer,
  parseArchivedFiscalYearParam,
} from "./fiscal-year-archive";
import {
  __setWorkspaceSnapshotStoreForTests,
  __resetWorkspaceSnapshotSyncForTests,
} from "./workspace-snapshot-client";
import { serializeWorkspaceSnapshot } from "./workspace-snapshot";
import type { PersistedWorkspace } from "./persistence";
import { pickTargetYear, type WorkspaceSnapshotRecord } from "./workspace-snapshot-resolve";
import { resolveArchivedLiasseDownload } from "@/lib/lmnp/services/declaration/resolve-archived-liasse-download";
import { archivedDeclarationRoute } from "@/lib/lmnp/routes";
import type { DeclarationDraft } from "@/lib/lmnp/types/domain";

const NOW = "2026-09-01T00:00:00.000Z";
const DOSSIER = "dossier-1";

function closedNWorkspace(): PersistedWorkspace {
  const declarationDraft = {
    completedSteps: ["siren"],
    fiscalResult: { exercice: 2025, resultatFiscal: 4200, deficitNouveau: 0 },
    rfs: { exercice: 2025 },
    declaration: { currentVersionId: "ver-n-2025", versions: [] },
  } as unknown as DeclarationDraft;

  return {
    fiscalYear: {
      id: "fy-2025",
      year: 2025,
      status: "closed",
      regime: "reel",
      propertyIds: ["prop-1"],
      dossierId: DOSSIER,
      closures: [
        {
          id: "closure-n",
          fiscalYearId: "fy-2025",
          dossierId: DOSSIER,
          stocks: { deficits: [], amortissementsReportes: 0 },
          sourceDeclarationVersionId: "ver-n-2025",
          computedAt: NOW,
          closedAt: NOW,
        },
      ],
      createdAt: NOW,
      updatedAt: NOW,
    },
    properties: [{ id: "prop-1", label: "Bien", address: "1 rue X", city: "Lyon", postalCode: "69000" }],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft,
  };
}

function openN1Workspace(): PersistedWorkspace {
  return {
    fiscalYear: {
      id: "fy-2026",
      year: 2026,
      status: "draft",
      regime: "reel",
      propertyIds: ["prop-1"],
      dossierId: DOSSIER,
      previousFiscalYearId: "fy-2025",
      closures: [],
      createdAt: NOW,
      updatedAt: NOW,
    },
    properties: [{ id: "prop-1", label: "Bien", address: "1 rue X", city: "Lyon", postalCode: "69000" }],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: { completedSteps: [], exploitantFirstName: "Marie" },
  };
}

function envelope(workspace: PersistedWorkspace): unknown {
  const serialized = serializeWorkspaceSnapshot(workspace);
  assert.equal(serialized.ok, true);
  if (!serialized.ok) throw new Error("unreachable");
  return serialized.envelope;
}

function closedRow(workspace: PersistedWorkspace): WorkspaceSnapshotRecord {
  return {
    dossierId: DOSSIER,
    fiscalYear: workspace.fiscalYear.year,
    schemaVersion: 1,
    revision: 3,
    payload: envelope(workspace),
    updatedAt: NOW,
    closedAt: NOW,
    successorFiscalYear: workspace.fiscalYear.year + 1,
  };
}

function openRow(workspace: PersistedWorkspace): WorkspaceSnapshotRecord {
  return {
    dossierId: DOSSIER,
    fiscalYear: workspace.fiscalYear.year,
    schemaVersion: 1,
    revision: 1,
    payload: envelope(workspace),
    updatedAt: NOW,
    closedAt: null,
    successorFiscalYear: null,
  };
}

describe("Lot 6A — parseArchivedFiscalYearParam / route", () => {
  it("accepte une année civile 4 chiffres", () => {
    assert.equal(parseArchivedFiscalYearParam("2025"), 2025);
    assert.equal(archivedDeclarationRoute(2025), "/declarations/2025");
  });

  it("refuse UUID IndexedDB et valeurs hors plage", () => {
    assert.equal(parseArchivedFiscalYearParam("fy-2025"), null);
    assert.equal(parseArchivedFiscalYearParam("abc"), null);
    assert.equal(parseArchivedFiscalYearParam("1999"), null);
  });
});

describe("Lot 6A — cold IDB vide : liste + charge archive serveur", () => {
  const n = closedNWorkspace();
  const n1 = openN1Workspace();
  let snapshots: WorkspaceSnapshotRecord[];

  beforeEach(() => {
    snapshots = [closedRow(n), openRow(n1)];
    __setWorkspaceSnapshotStoreForTests({
      listByDossier: async () => snapshots,
      upsert: async () => {
        throw new Error("archive path must never upsert");
      },
    });
  });

  afterEach(() => {
    __resetWorkspaceSnapshotSyncForTests();
  });

  it("A — IDB vide : historique liste N clôturé depuis le serveur", async () => {
    const listed = await listClosedFiscalYearArchives(DOSSIER);
    assert.equal(listed.status, "ok");
    if (listed.status !== "ok") throw new Error("unreachable");
    assert.deepEqual(
      listed.archives.map((a) => a.fiscalYear),
      [2025],
    );
    assert.equal(listed.archives[0]?.successorFiscalYear, 2026);
    assert.ok(listed.archives.every((a) => a.closedAt != null));
  });

  it("B — ouverture N charge le workspace depuis le serveur", async () => {
    const loaded = await loadArchivedWorkspaceFromServer({
      dossierId: DOSSIER,
      fiscalYear: 2025,
    });
    assert.equal(loaded.status, "ok");
    if (loaded.status !== "ok") throw new Error("unreachable");
    assert.equal(loaded.workspace.fiscalYear.year, 2025);
    assert.equal(loaded.workspace.fiscalYear.status, "closed");
    assert.equal(loaded.workspace.declarationDraft?.declaration?.currentVersionId, "ver-n-2025");
  });

  it("C — N reste read-only (blockWrites)", async () => {
    const loaded = await loadArchivedWorkspaceFromServer({
      dossierId: DOSSIER,
      fiscalYear: 2025,
    });
    assert.equal(loaded.status, "ok");
    if (loaded.status !== "ok") throw new Error("unreachable");
    assert.equal(loaded.readOnly, true);
    assert.equal(loaded.blockWrites, true);
  });

  it("D/E — activeFiscalYear cold restore reste N+1 ; snapshot N+1 inchangé", async () => {
    const active = pickTargetYear(null, snapshots, 2025, 2026);
    assert.equal(active, 2026, "cold restore préfère active N+1");

    const before = JSON.stringify(snapshots.find((s) => s.fiscalYear === 2026)?.payload);
    await loadArchivedWorkspaceFromServer({ dossierId: DOSSIER, fiscalYear: 2025 });
    const after = JSON.stringify(snapshots.find((s) => s.fiscalYear === 2026)?.payload);
    assert.equal(before, after, "charger N n'altère pas le snapshot N+1");

    const n1Reload = await loadArchivedWorkspaceFromServer({
      dossierId: DOSSIER,
      fiscalYear: 2026,
    });
    assert.equal(n1Reload.status, "error", "N+1 ouvert n'est pas une archive consultable");
  });

  it("H — reload/cold : même liste + même archive N", async () => {
    const first = await listClosedFiscalYearArchives(DOSSIER);
    const second = await listClosedFiscalYearArchives(DOSSIER);
    assert.deepEqual(first, second);

    const a = await loadArchivedWorkspaceFromServer({ dossierId: DOSSIER, fiscalYear: 2025 });
    const b = await loadArchivedWorkspaceFromServer({ dossierId: DOSSIER, fiscalYear: 2025 });
    assert.equal(a.status, "ok");
    assert.equal(b.status, "ok");
    if (a.status !== "ok" || b.status !== "ok") throw new Error("unreachable");
    assert.equal(a.workspace.fiscalYear.year, b.workspace.fiscalYear.year);
    assert.equal(
      a.workspace.declarationDraft?.declaration?.currentVersionId,
      b.workspace.declarationDraft?.declaration?.currentVersionId,
    );
  });

  it("I — N+1 existant : pas de reseed (liste = un seul N clôturé)", async () => {
    const listed = await listClosedFiscalYearArchives(DOSSIER);
    assert.equal(listed.status, "ok");
    if (listed.status !== "ok") throw new Error("unreachable");
    assert.equal(listed.archives.length, 1);
    assert.equal(listed.archives[0]?.fiscalYear, 2025);
  });
});

describe("Lot 6A — record archive → download year (entitlement N)", () => {
  it("F — record dérivé de N porte fiscalYear N pour la livraison", () => {
    const record = archivedLiasseRecordFromWorkspace(closedNWorkspace());
    assert.equal(record.year, 2025);
    assert.equal(record.declarationDraft?.declaration?.currentVersionId, "ver-n-2025");
    // Download may be unavailable without full liasseRfs — year for entitlement stays N.
    const resolved = resolveArchivedLiasseDownload(record);
    if (resolved.status === "ready") {
      assert.equal(resolved.input.fiscalYear, 2025);
    }
    assert.equal(record.year, 2025);
  });

  it("G — année N du record n'est jamais confondue avec N+1", () => {
    const recordN = archivedLiasseRecordFromWorkspace(closedNWorkspace());
    const recordN1 = archivedLiasseRecordFromWorkspace(openN1Workspace());
    assert.equal(recordN.year, 2025);
    assert.equal(recordN1.year, 2026);
    assert.notEqual(recordN.year, recordN1.year);
  });
});

describe("Lot 6A — UI branchée sur helpers serveur (source)", () => {
  it("historique + page archive utilisent les helpers Lot 3", () => {
    const historique = readFileSync(
      path.join(process.cwd(), "src/app/(dashboard)/declarations/historique/page.tsx"),
      "utf-8",
    );
    const archivePage = readFileSync(
      path.join(
        process.cwd(),
        "src/app/(dashboard)/declarations/[fiscalYearId]/ArchivedDeclarationPageClient.tsx",
      ),
      "utf-8",
    );
    const stripComments = (src: string) =>
      src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const historiqueCode = stripComments(historique);
    const archiveCode = stripComments(archivePage);
    assert.ok(historiqueCode.includes("listClosedFiscalYearArchives"));
    assert.equal(historiqueCode.includes("listFiscalYearsForDossier"), false);
    assert.ok(archiveCode.includes("loadArchivedWorkspaceFromServer"));
    assert.equal(archiveCode.includes("loadArchivedFiscalYear"), false);
    assert.equal(archiveCode.includes("useLmnp"), false);
  });
});
