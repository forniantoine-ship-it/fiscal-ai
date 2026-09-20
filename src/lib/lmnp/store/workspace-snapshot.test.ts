/**
 * P0 Lot 1 — snapshot v1: serialization, hydration rules, save gate.
 * Run: npx tsx --test src/lib/lmnp/store/workspace-snapshot.test.ts
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { PersistedWorkspace } from "./persistence";
import {
  parseWorkspaceSnapshot,
  serializeWorkspaceSnapshot,
  toPersistedWorkspace,
  WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
} from "./workspace-snapshot";
import { resolveWorkspaceHydration } from "./workspace-snapshot-resolve";
import type { WorkspaceSnapshotRecord } from "./workspace-snapshot-resolve";
import {
  __resetWorkspaceSnapshotSyncForTests,
  __setWorkspaceSnapshotStoreForTests,
  getWorkspaceSnapshotSyncGate,
  listWorkspaceSnapshots,
  saveWorkspaceSnapshotToServer,
  setWorkspaceSnapshotSyncGate,
} from "./workspace-snapshot-client";

function workspace(overrides: Partial<PersistedWorkspace> = {}): PersistedWorkspace {
  return {
    fiscalYear: {
      id: "fy-2025",
      year: 2025,
      status: "draft",
      regime: "reel",
      propertyIds: ["prop-1"],
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-06-01T00:00:00.000Z",
      dossierId: "dossier-A",
      ...overrides.fiscalYear,
    },
    properties: [
      {
        id: "prop-1",
        label: "Studio Lot1",
        address: "1 rue des Tests",
        city: "Lyon-P0-Lot1",
        postalCode: "69002",
      },
    ],
    documents: [
      {
        id: "doc-1",
        fiscalYearId: "fy-2025",
        propertyId: "prop-1",
        fileName: "avis-taxe.pdf",
        mimeType: "application/pdf",
        sizeBytes: 12,
        uploadedAt: "2025-03-01T00:00:00.000Z",
        category: "charges",
        documentType: "property_tax",
        status: "analyzed",
      },
    ],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: {
      completedSteps: ["activite"],
      siret: "12345678901234",
      exploitantLastName: "Dupont-Lot1",
      financementCharges: {
        exerciceFiscal: 2025,
        totalInteretsEmprunt: 2800,
        totalInteretsPreExploitation: 450,
        totalAssurance: 600,
        totalCapitalRembourse: 5200,
        totalChargesFinancementExercice: 3400,
        prets: [],
        fieldSources: {},
        computedAt: "2025-02-01T00:00:00.000Z",
      },
    },
    ...overrides,
  };
}

function record(
  partial: Partial<WorkspaceSnapshotRecord> & { payload: unknown; fiscalYear: number },
): WorkspaceSnapshotRecord {
  return {
    dossierId: "dossier-A",
    schemaVersion: WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
    revision: 1,
    updatedAt: "2026-09-20T10:00:00.000Z",
    ...partial,
  };
}

describe("A — roundtrip serialize → snapshot → deserialize", () => {
  it("conserve les champs métier identifiables et exclut fileRegistry", () => {
    const persisted = toPersistedWorkspace({
      ...workspace(),
      fileRegistry: new Map([["doc-1", { name: "secret.bin" }]]),
    });
    const serialized = serializeWorkspaceSnapshot(persisted);
    assert.equal(serialized.ok, true);
    if (!serialized.ok) return;
    assert.equal(serialized.envelope.schemaVersion, 1);
    assert.equal("fileRegistry" in serialized.envelope.workspace, false);
    const parsed = parseWorkspaceSnapshot(serialized.envelope);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const restored = parsed.envelope.workspace;
    assert.equal(restored.properties[0]?.city, "Lyon-P0-Lot1");
    assert.equal(restored.declarationDraft?.siret, "12345678901234");
    assert.equal(restored.declarationDraft?.exploitantLastName, "Dupont-Lot1");
    assert.equal(restored.declarationDraft?.financementCharges?.totalInteretsEmprunt, 2800);
    assert.equal(restored.documents[0]?.fileName, "avis-taxe.pdf");
    assert.equal(restored.fiscalYear.year, 2025);
  });
});

describe("H — sérialisation refuse File/Blob/NaN/Infinity et exclut fileRegistry", () => {
  it("toPersistedWorkspace retire fileRegistry du payload", () => {
    const persisted = toPersistedWorkspace({
      ...workspace(),
      fileRegistry: new Map([["doc-1", { name: "secret.bin" }]]),
    });
    assert.equal("fileRegistry" in persisted, false);
    const serialized = serializeWorkspaceSnapshot(persisted);
    assert.equal(serialized.ok, true);
    if (!serialized.ok) return;
    assert.equal(JSON.stringify(serialized.envelope).includes("fileRegistry"), false);
    assert.equal(JSON.stringify(serialized.envelope).includes("secret.bin"), false);
  });

  it("refuse un ArrayBuffer / Blob glissé dans le workspace métier", () => {
    const withBuffer = workspace();
    withBuffer.declarationDraft = {
      completedSteps: [],
      ...withBuffer.declarationDraft,
    };
    (withBuffer.declarationDraft as { rogue?: ArrayBuffer }).rogue = new ArrayBuffer(8);
    const bufferResult = serializeWorkspaceSnapshot(withBuffer);
    assert.equal(bufferResult.ok, false);
    if (!bufferResult.ok) assert.equal(bufferResult.reason, "unsupported_type");
  });

  it("refuse NaN / Infinity sans les convertir en null", () => {
    const nanWs = workspace();
    nanWs.declarationDraft = {
      completedSteps: [],
      financementCharges: {
        exerciceFiscal: 2025,
        totalInteretsEmprunt: Number.NaN,
        totalInteretsPreExploitation: 0,
        totalAssurance: 0,
        totalCapitalRembourse: 0,
        totalChargesFinancementExercice: 0,
        prets: [],
        fieldSources: {},
        computedAt: "2025-02-01T00:00:00.000Z",
      },
    };
    const nan = serializeWorkspaceSnapshot(nanWs);
    assert.equal(nan.ok, false);
    if (!nan.ok) assert.equal(nan.reason, "non_finite_number");

    const infWs = workspace();
    infWs.declarationDraft = {
      completedSteps: [],
      financementCharges: {
        exerciceFiscal: 2025,
        totalInteretsEmprunt: Number.POSITIVE_INFINITY,
        totalInteretsPreExploitation: 0,
        totalAssurance: 0,
        totalCapitalRembourse: 0,
        totalChargesFinancementExercice: 0,
        prets: [],
        fieldSources: {},
        computedAt: "2025-02-01T00:00:00.000Z",
      },
    };
    const inf = serializeWorkspaceSnapshot(infWs);
    assert.equal(inf.ok, false);
    if (!inf.ok) assert.equal(inf.reason, "non_finite_number");
  });
});

describe("B / D — serveur gagne, default ne wipe pas", () => {
  it("IDB vide + snapshot v1 riche → hydrate le workspace riche", () => {
    const rich = workspace();
    const serialized = serializeWorkspaceSnapshot(rich);
    assert.equal(serialized.ok, true);
    if (!serialized.ok) return;
    const decision = resolveWorkspaceHydration({
      local: null,
      snapshots: [record({ fiscalYear: 2025, payload: serialized.envelope })],
      fallbackYear: 2025,
    });
    assert.equal(decision.source, "server");
    if (decision.source !== "server") return;
    assert.equal(decision.workspace.properties[0]?.city, "Lyon-P0-Lot1");
    assert.equal(decision.blockWrites, false);
  });

  it("snapshot serveur riche + workspace local default → le default ne remplace jamais le serveur", () => {
    const rich = workspace();
    const serialized = serializeWorkspaceSnapshot(rich);
    assert.equal(serialized.ok, true);
    if (!serialized.ok) return;
    const localDefault = workspace({
      properties: [{ id: "prop-1", label: "Mon bien locatif", address: "", city: "", postalCode: "" }],
      documents: [],
      declarationDraft: { completedSteps: [] },
    });
    const decision = resolveWorkspaceHydration({
      local: localDefault,
      snapshots: [record({ fiscalYear: 2025, payload: serialized.envelope })],
      fallbackYear: 2025,
    });
    assert.equal(decision.source, "server");
    if (decision.source !== "server") return;
    assert.equal(decision.workspace.properties[0]?.city, "Lyon-P0-Lot1");
    assert.notEqual(decision.workspace.declarationDraft?.siret, undefined);
  });
});

describe("C — legacy IDB → serveur", () => {
  it("serveur vide + IDB riche → conserve le local et marque uploadLocal", () => {
    const local = workspace();
    const decision = resolveWorkspaceHydration({
      local,
      snapshots: [],
      fallbackYear: 2025,
    });
    assert.equal(decision.source, "local");
    if (decision.source !== "local") return;
    assert.equal(decision.uploadLocal, true);
    assert.equal(decision.workspace.declarationDraft?.siret, "12345678901234");
  });
});

describe("E — schema_version future fail closed", () => {
  it("ne pas hydrater comme v1 et bloquer les écritures", () => {
    const decision = resolveWorkspaceHydration({
      local: workspace({ properties: [{ id: "prop-1", label: "Local", address: "", city: "LocalCity", postalCode: "" }] }),
      snapshots: [
        record({
          fiscalYear: 2025,
          schemaVersion: 2,
          payload: { schemaVersion: 2, workspace: workspace() },
        }),
      ],
      fallbackYear: 2025,
    });
    assert.equal(decision.source, "blocked");
    if (decision.source !== "blocked") return;
    assert.equal(decision.blockWrites, true);
    assert.equal(decision.workspace?.properties[0]?.city, "LocalCity");
  });

  it("parse refuse un overwrite implicite de v2", () => {
    const parsed = parseWorkspaceSnapshot({ schemaVersion: 2, workspace: workspace() });
    assert.equal(parsed.ok, false);
    if (parsed.ok) return;
    assert.equal(parsed.reason, "unsupported_schema_version");
  });

  it("snapshot existant mais invalide → fail closed, pas de default ready", () => {
    const decision = resolveWorkspaceHydration({
      local: null,
      snapshots: [
        record({
          fiscalYear: 2025,
          payload: { schemaVersion: 1, workspace: { not: "a-workspace" } },
        }),
      ],
      fallbackYear: 2025,
    });
    assert.equal(decision.source, "blocked");
    if (decision.source !== "blocked") return;
    assert.equal(decision.blockWrites, true);
    assert.equal(decision.reason, "invalid_snapshot");
    assert.equal(decision.workspace, null);
  });
});

describe("F — isolation exercice", () => {
  it("2025 et 2026 du même dossier restent distincts", () => {
    const ws2025 = serializeWorkspaceSnapshot(workspace({ fiscalYear: { ...workspace().fiscalYear, year: 2025, id: "fy-2025" } }));
    const ws2026 = serializeWorkspaceSnapshot(
      workspace({
        fiscalYear: { ...workspace().fiscalYear, year: 2026, id: "fy-2026" },
        properties: [{ id: "prop-1", label: "2026", address: "", city: "Nantes-2026", postalCode: "" }],
      }),
    );
    assert.equal(ws2025.ok && ws2026.ok, true);
    if (!ws2025.ok || !ws2026.ok) return;
    const snapshots = [
      record({ fiscalYear: 2025, payload: ws2025.envelope, updatedAt: "2026-01-01T00:00:00.000Z" }),
      record({ fiscalYear: 2026, payload: ws2026.envelope, updatedAt: "2026-09-01T00:00:00.000Z" }),
    ];
    const d2025 = resolveWorkspaceHydration({
      local: workspace({ fiscalYear: { ...workspace().fiscalYear, year: 2025 } }),
      snapshots,
      fallbackYear: 2025,
    });
    const d2026 = resolveWorkspaceHydration({
      local: workspace({ fiscalYear: { ...workspace().fiscalYear, year: 2026, id: "fy-2026" } }),
      snapshots,
      fallbackYear: 2025,
    });
    assert.equal(d2025.source, "server");
    assert.equal(d2026.source, "server");
    if (d2025.source !== "server" || d2026.source !== "server") return;
    assert.equal(d2025.workspace.properties[0]?.city, "Lyon-P0-Lot1");
    assert.equal(d2026.workspace.properties[0]?.city, "Nantes-2026");
  });
});

describe("G — isolation dossier", () => {
  it("deux dossiers ne se mélangent pas", () => {
    const a = serializeWorkspaceSnapshot(workspace());
    const b = serializeWorkspaceSnapshot(
      workspace({
        fiscalYear: { ...workspace().fiscalYear, dossierId: "dossier-B" },
        properties: [{ id: "prop-1", label: "B", address: "", city: "Marseille-B", postalCode: "" }],
      }),
    );
    assert.equal(a.ok && b.ok, true);
    if (!a.ok || !b.ok) return;
    const decision = resolveWorkspaceHydration({
      local: null,
      snapshots: [record({ dossierId: "dossier-A", fiscalYear: 2025, payload: a.envelope })],
      fallbackYear: 2025,
    });
    assert.equal(decision.source, "server");
    if (decision.source !== "server") return;
    assert.equal(decision.workspace.properties[0]?.city, "Lyon-P0-Lot1");
    assert.notEqual(decision.workspace.properties[0]?.city, "Marseille-B");
  });
});

describe("BLOCKER — local newer than server after failed save", () => {
  it("conserve Lyon-NEWER-EDIT + siret, marque le repush, aucune perte", () => {
    const serverWs = workspace({
      properties: [
        { id: "prop-1", label: "Studio Lot1", address: "1 rue des Tests", city: "Lyon-OLD", postalCode: "69002" },
      ],
    });
    const localWs = workspace({
      properties: [
        {
          id: "prop-1",
          label: "Studio Lot1",
          address: "1 rue des Tests",
          city: "Lyon-NEWER-EDIT",
          postalCode: "69002",
        },
      ],
      declarationDraft: {
        completedSteps: ["activite"],
        siret: "12345678901234",
      },
    });
    const serialized = serializeWorkspaceSnapshot(serverWs);
    assert.equal(serialized.ok, true);
    if (!serialized.ok) return;
    const decision = resolveWorkspaceHydration({
      local: localWs,
      lastSyncedServerRevision: 1,
      snapshots: [record({ fiscalYear: 2025, revision: 1, payload: serialized.envelope })],
      fallbackYear: 2025,
    });
    assert.equal(decision.source, "local");
    if (decision.source !== "local") return;
    assert.equal(decision.uploadLocal, true);
    assert.equal(decision.workspace.properties[0]?.city, "Lyon-NEWER-EDIT");
    assert.equal(decision.workspace.declarationDraft?.siret, "12345678901234");
    assert.notEqual(decision.workspace.properties[0]?.city, "Lyon-OLD");
  });
});

describe("hydration freshness — lastSyncedServerRevision", () => {
  it("1. default local + server riche → SERVER", () => {
    const rich = workspace();
    const serialized = serializeWorkspaceSnapshot(rich);
    assert.equal(serialized.ok, true);
    if (!serialized.ok) return;
    const localDefault = workspace({
      properties: [{ id: "prop-1", label: "Mon bien locatif", address: "", city: "", postalCode: "" }],
      documents: [],
      declarationDraft: { completedSteps: [] },
    });
    const decision = resolveWorkspaceHydration({
      local: localDefault,
      snapshots: [record({ fiscalYear: 2025, payload: serialized.envelope })],
      fallbackYear: 2025,
    });
    assert.equal(decision.source, "server");
    if (decision.source !== "server") return;
    assert.equal(decision.workspace.properties[0]?.city, "Lyon-P0-Lot1");
  });

  it("2. local synchronisé revision N + server revision N → état cohérent", () => {
    const synced = workspace();
    const serialized = serializeWorkspaceSnapshot(synced);
    assert.equal(serialized.ok, true);
    if (!serialized.ok) return;
    const decision = resolveWorkspaceHydration({
      local: synced,
      lastSyncedServerRevision: 4,
      snapshots: [record({ fiscalYear: 2025, revision: 4, payload: serialized.envelope })],
      fallbackYear: 2025,
    });
    assert.equal(decision.source, "server");
    if (decision.source !== "server") return;
    assert.equal(decision.lastSyncedServerRevision, 4);
    assert.equal(decision.workspace.properties[0]?.city, "Lyon-P0-Lot1");
    assert.equal(decision.workspace.declarationDraft?.siret, "12345678901234");
  });

  it("3. local modifié depuis revision N + server revision N → LOCAL + repush", () => {
    const serverWs = workspace({
      properties: [{ id: "prop-1", label: "Studio Lot1", address: "", city: "Lyon-OLD", postalCode: "" }],
    });
    const localWs = workspace({
      properties: [{ id: "prop-1", label: "Studio Lot1", address: "", city: "Lyon-NEWER-EDIT", postalCode: "" }],
    });
    const serialized = serializeWorkspaceSnapshot(serverWs);
    assert.equal(serialized.ok, true);
    if (!serialized.ok) return;
    const decision = resolveWorkspaceHydration({
      local: localWs,
      lastSyncedServerRevision: 2,
      snapshots: [record({ fiscalYear: 2025, revision: 2, payload: serialized.envelope })],
      fallbackYear: 2025,
    });
    assert.equal(decision.source, "local");
    if (decision.source !== "local") return;
    assert.equal(decision.uploadLocal, true);
    assert.equal(decision.workspace.properties[0]?.city, "Lyon-NEWER-EDIT");
  });

  it("4. local basé sur revision N + server revision N+1 → SERVER", () => {
    const olderLocal = workspace({
      properties: [{ id: "prop-1", label: "Studio Lot1", address: "", city: "Lyon-NEWER-EDIT", postalCode: "" }],
    });
    const newerServer = workspace({
      properties: [{ id: "prop-1", label: "Studio Lot1", address: "", city: "Server-N-plus-1", postalCode: "" }],
    });
    const serialized = serializeWorkspaceSnapshot(newerServer);
    assert.equal(serialized.ok, true);
    if (!serialized.ok) return;
    const decision = resolveWorkspaceHydration({
      local: olderLocal,
      lastSyncedServerRevision: 3,
      snapshots: [record({ fiscalYear: 2025, revision: 4, payload: serialized.envelope })],
      fallbackYear: 2025,
    });
    assert.equal(decision.source, "server");
    if (decision.source !== "server") return;
    assert.equal(decision.workspace.properties[0]?.city, "Server-N-plus-1");
    assert.equal(decision.lastSyncedServerRevision, 4);
  });

  it("5. legacy local riche + serveur vide → LOCAL + first upload", () => {
    const local = workspace();
    const decision = resolveWorkspaceHydration({
      local,
      snapshots: [],
      fallbackYear: 2025,
    });
    assert.equal(decision.source, "local");
    if (decision.source !== "local") return;
    assert.equal(decision.uploadLocal, true);
    assert.equal(decision.workspace.declarationDraft?.siret, "12345678901234");
  });

  it("6. legacy local default + serveur riche → SERVER", () => {
    const rich = workspace();
    const serialized = serializeWorkspaceSnapshot(rich);
    assert.equal(serialized.ok, true);
    if (!serialized.ok) return;
    const localDefault = workspace({
      properties: [{ id: "prop-1", label: "Mon bien locatif", address: "", city: "", postalCode: "" }],
      documents: [],
      declarationDraft: { completedSteps: [] },
    });
    const decision = resolveWorkspaceHydration({
      local: localDefault,
      snapshots: [record({ fiscalYear: 2025, payload: serialized.envelope })],
      fallbackYear: 2025,
    });
    assert.equal(decision.source, "server");
    if (decision.source !== "server") return;
    assert.equal(decision.workspace.properties[0]?.city, "Lyon-P0-Lot1");
  });

  it("7. future schema → BLOCKED inchangé", () => {
    const decision = resolveWorkspaceHydration({
      local: workspace({
        properties: [{ id: "prop-1", label: "Local", address: "", city: "LocalCity", postalCode: "" }],
      }),
      lastSyncedServerRevision: 1,
      snapshots: [
        record({
          fiscalYear: 2025,
          schemaVersion: 2,
          payload: { schemaVersion: 2, workspace: workspace() },
        }),
      ],
      fallbackYear: 2025,
    });
    assert.equal(decision.source, "blocked");
    if (decision.source !== "blocked") return;
    assert.equal(decision.blockWrites, true);
    assert.equal(decision.workspace?.properties[0]?.city, "LocalCity");
  });
});

describe("save gate — unknown ne wipe pas, blocked n'écrit pas, ready upsert", () => {
  const memory = new Map<string, WorkspaceSnapshotRecord>();

  beforeEach(() => {
    memory.clear();
    __resetWorkspaceSnapshotSyncForTests();
    __setWorkspaceSnapshotStoreForTests({
      async listByDossier(dossierId) {
        return [...memory.values()].filter((row) => row.dossierId === dossierId);
      },
      async upsert(input) {
        const key = `${input.dossierId}:${input.fiscalYear}`;
        const prev = memory.get(key);
        const next: WorkspaceSnapshotRecord = {
          dossierId: input.dossierId,
          fiscalYear: input.fiscalYear,
          schemaVersion: input.schemaVersion,
          revision: (prev?.revision ?? 0) + 1,
          payload: input.payload,
          updatedAt: "2026-09-20T12:00:00.000Z",
        };
        memory.set(key, next);
        return { revision: next.revision };
      },
    });
  });

  it("gate unknown : aucun upsert (anti-default-wipe si le fetch n'a pas fini)", async () => {
    setWorkspaceSnapshotSyncGate("unknown");
    const result = await saveWorkspaceSnapshotToServer({
      dossierId: "dossier-A",
      workspace: workspace(),
    });
    assert.equal(result.status, "skipped");
    assert.equal(memory.size, 0);
  });

  it("gate blocked : aucun overwrite d'une version future", async () => {
    setWorkspaceSnapshotSyncGate("blocked");
    const result = await saveWorkspaceSnapshotToServer({
      dossierId: "dossier-A",
      workspace: workspace(),
    });
    assert.equal(result.status, "skipped");
    assert.equal(memory.size, 0);
  });

  it("gate ready : upsert puis list isole l'exercice, revision incrémente", async () => {
    setWorkspaceSnapshotSyncGate("ready", { dossierId: "dossier-A", fiscalYear: 2025 });
    const first = await saveWorkspaceSnapshotToServer({
      dossierId: "dossier-A",
      workspace: workspace(),
    });
    const second = await saveWorkspaceSnapshotToServer({
      dossierId: "dossier-A",
      workspace: workspace({
        fiscalYear: { ...workspace().fiscalYear, year: 2026, id: "fy-2026" },
        properties: [{ id: "prop-1", label: "2026", address: "", city: "Nantes-2026", postalCode: "" }],
      }),
    });
    assert.equal(first.status, "ok");
    assert.equal(second.status, "ok");
    const listed = await listWorkspaceSnapshots("dossier-A");
    assert.equal(listed.status, "ok");
    if (listed.status !== "ok") return;
    assert.equal(listed.snapshots.length, 2);
    const y2025 = listed.snapshots.find((row) => row.fiscalYear === 2025);
    const y2026 = listed.snapshots.find((row) => row.fiscalYear === 2026);
    assert.equal(y2025?.revision, 1);
    assert.equal(y2026?.revision, 1);
    const parsed2026 = parseWorkspaceSnapshot(y2026?.payload);
    assert.equal(parsed2026.ok, true);
    if (!parsed2026.ok) return;
    assert.equal(parsed2026.envelope.workspace.properties[0]?.city, "Nantes-2026");
    assert.equal(getWorkspaceSnapshotSyncGate(), "ready");
  });
});

describe("I — payment inchangé", () => {
  it("le code snapshot ne touche pas l'entitlement / la table paiements", () => {
    const files = [
      "src/lib/lmnp/store/workspace-snapshot.ts",
      "src/lib/lmnp/store/workspace-snapshot-resolve.ts",
      "src/lib/lmnp/store/workspace-snapshot-client.ts",
      "src/lib/lmnp/store/workspace-snapshot-anti-wipe.test.ts",
      "supabase/migrations/20260920120000_lmnp_workspace_snapshots.sql",
    ];
    for (const rel of files) {
      const src = readFileSync(path.join(process.cwd(), rel), "utf8")
        .split("\n")
        .map((l) => l.replace(/--.*$/, ""))
        .join("\n");
      assert.doesNotMatch(src, /lmnp_declaration_payments/);
      assert.doesNotMatch(src, /fetchPaymentEntitlement/);
      assert.doesNotMatch(src, /JOURNEY_SYNC_PAID_FROM_SERVER/);
      assert.doesNotMatch(src, /STRIPE/);
    }
  });
});
