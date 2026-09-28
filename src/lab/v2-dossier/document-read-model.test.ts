import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { SupabaseDocumentRow } from "@/lib/lmnp/dossier/supabase-dossier";
import { readRealDocumentRows } from "./document-read";
import { buildV3DocumentsReadModel } from "./document-read-model";

const workspace: PersistedWorkspace = {
  fiscalYear: {
    id: "year-id", dossierId: "dossier-id", year: 2025, status: "draft", regime: "reel",
    propertyIds: ["property-id"], createdAt: "2025-01-01", updatedAt: "2025-01-01",
  },
  properties: [{ id: "property-id", label: "", address: "", city: "", postalCode: "" }],
  documents: [], extractions: [], validationItems: [], ledgerEntries: [],
};
const row = {
  id: "server-doc", user_id: "user-id", dossier_id: "dossier-id", fiscal_year: 2025,
  property_id: "property-id", file_name: "server.pdf", file_path: "authorized/path",
  extraction_status: "completed", created_at: "2025-01-01", document_role: "annual_evidence",
} as SupabaseDocumentRow;

describe("R10 document read remains server scoped", () => {
  it("distinguishes a known empty server list from a read error", async () => {
    const scope = { userId: "user-id", dossierId: "dossier-id", fiscalYear: 2025 };
    const services = {
      authenticatedUserId: async () => "user-id",
      listRows: async () => ({ rows: [] as SupabaseDocumentRow[], error: false }),
    };
    const empty = await readRealDocumentRows(scope, services);
    assert.deepEqual(buildV3DocumentsReadModel({ read: empty, workspace, fiscalYear: 2025, legacyDocumentYears: [] }), {
      state: "known", documents: [],
    });
    const error = await readRealDocumentRows(scope, {
      ...services, listRows: async () => ({ rows: null, error: true }),
    });
    assert.deepEqual(buildV3DocumentsReadModel({ read: error, workspace, fiscalYear: 2025, legacyDocumentYears: [] }), {
      state: "unknown", documents: [],
    });
  });

  it("excludes foreign dossier/year rows and never promotes a workspace-only document", async () => {
    const scope = { userId: "user-id", dossierId: "dossier-id", fiscalYear: 2025 };
    const read = await readRealDocumentRows(scope, {
      authenticatedUserId: async () => "user-id",
      listRows: async () => ({ rows: [row, { ...row, id: "foreign", dossier_id: "other" },
        { ...row, id: "other-year", fiscal_year: 2026 }], error: false }),
    });
    const withLocalOnly = { ...workspace, documents: [{
      id: "local-only", fileName: "local.pdf", category: "autre" as const, status: "uploaded" as const,
      uploadedAt: "2025-01-01", fiscalYearId: "year-id",
    }] } as PersistedWorkspace;
    const model = buildV3DocumentsReadModel({ read, workspace: withLocalOnly, fiscalYear: 2025, legacyDocumentYears: [] });
    assert.equal(model.state, "known");
    assert.deepEqual(model.documents.map(document => document.id), ["server-doc"]);
  });
});
