/** Upload → real UI mapper → reducer → snapshot/hydration regression.
 * Only Supabase I/O is substituted; assignment and persistence code are real.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import { monoWorkspace, multiWorkspace, A, B } from "../services/declaration/multi-property-test-support";
import { lmnpReducer, type LmnpAction, type LmnpState } from "./reducer";
import { serializeWorkspaceSnapshot, toPersistedWorkspace } from "./workspace-snapshot";
import { resolveWorkspaceHydration } from "./workspace-snapshot-resolve";
import { reconcileWorkspaceDocuments } from "../dossier/reconcile-workspace-documents";
import { resolveDocumentScope, resolveMonoPropertyId } from "../dossier/property-scope";
import { resolveUploadPropertyScope } from "../dossier/bien-scope";
import { resolveMultiPropertyDomainReadiness } from "../dossier/multi-property-readiness";
import type { SupabaseDocumentRow } from "../dossier/supabase-dossier";

const DOSSIER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const root = process.cwd();
const file = new File(["local evidence"], "preuve.pdf", { type: "application/pdf" });
function state(multi = true): LmnpState {
  const workspace = multi ? multiWorkspace() : monoWorkspace();
  return { ...workspace, fiscalYear: { ...workspace.fiscalYear, dossierId: DOSSIER }, fileRegistry: new Map() };
}
function compile(source: string, filename: string) {
  return ts.transpileModule(source, { fileName: filename, compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
}

/** Execute every actual UPLOAD_DOCUMENTS file mapper, including alternate branches. */
function productionFiles(path: string, propertyId: string, documentId = "persisted-document") {
  const absolute = resolve(root, path);
  const ast = ts.createSourceFile(absolute, readFileSync(absolute, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const expressions: ts.Expression[] = [];
  function visit(node: ts.Node) {
    if (ts.isObjectLiteralExpression(node) && node.properties.some(p => ts.isPropertyAssignment(p) &&
      p.name.getText(ast) === "type" && ts.isStringLiteral(p.initializer) && p.initializer.text === "UPLOAD_DOCUMENTS")) {
      const entry = node.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(ast) === "files");
      assert.ok(entry && ts.isPropertyAssignment(entry));
      expressions.push(entry.initializer);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(expressions.length, `upload mapper exists: ${path}`);
  const workspace = state();
  const bindings = {
    files: [file], uploadedFiles: [file], uploadedFile: file, file,
    documentId, documentIds: [documentId], filePaths: ["local/proof.pdf"], storagePath: "local/proof.pdf",
    meta: { supabaseDocumentIds: [documentId], filePaths: ["local/proof.pdf"] },
    workspace, fiscalYear: workspace.fiscalYear.year,
    uploadScope: resolveUploadPropertyScope(workspace, propertyId),
    bienScope: { propertyId }, activePropertyId: propertyId,
    document: { category: "autre" }, result: { uploadedFile: file, documentId, storagePath: "local/proof.pdf" },
    step: { category: "autre" }, category: "amortissement", LOGEMENT_UPLOAD_CATEGORY: "autre",
    CREDIT_UPLOAD_CATEGORY: "emprunt", REVENUS_UPLOAD_CATEGORY: "revenus", CHARGES_UPLOAD_CATEGORY: "charges",
    IMPOTS_UPLOAD_CATEGORY: "charges", DOCUMENTARY_REVIEW_UPLOAD_CATEGORY: "charges",
  };
  return expressions.map(expression => new Function(...Object.keys(bindings),
    compile(`return (${expression.getText(ast)});`, absolute))(...Object.values(bindings)) as Extract<LmnpAction, { type: "UPLOAD_DOCUMENTS" }>["files"]);
}

function uploader() {
  const rows: SupabaseDocumentRow[] = [];
  const fake = {
    storage: { from: () => ({ upload: async (path: string) => ({ data: { path }, error: null }) }) },
    from: () => ({ insert: (input: Omit<SupabaseDocumentRow, "id" | "created_at">) => {
      const row = { ...input, id: `doc-${rows.length}`, created_at: "2026-01-01T00:00:00Z", property_id: input.property_id ?? null };
      rows.push(row);
      return { select: () => ({ single: async () => ({ data: { id: row.id }, error: null }) }) };
    } }),
  };
  const filename = resolve(root, "src/lib/uploadDocument.ts");
  const nativeRequire = createRequire(filename);
  const exports: Partial<typeof import("@/lib/uploadDocument")> = {};
  new Function("require", "exports", compile(readFileSync(filename, "utf8"), filename))(
    (id: string) => id === "@/lib/supabase" ? { supabase: fake } : nativeRequire(id.startsWith("@/") ? resolve(root, "src", id.slice(2)) : id), exports);
  return { rows, upload: exports.uploadFilesForUser! };
}

function reload(workspace: LmnpState, revision = 1): LmnpState {
  const serialized = serializeWorkspaceSnapshot(toPersistedWorkspace(workspace));
  assert.ok(serialized.ok);
  const decision = resolveWorkspaceHydration({ local: null, fallbackYear: workspace.fiscalYear.year,
    snapshots: [{ dossierId: DOSSIER, fiscalYear: workspace.fiscalYear.year, revision,
      schemaVersion: serialized.envelope.schemaVersion, payload: JSON.parse(JSON.stringify(serialized.envelope)), updatedAt: "2026-01-01" }] });
  assert.equal(decision.source, "server");
  assert.ok(decision.workspace);
  return lmnpReducer(state(), { type: "HYDRATE", payload: decision.workspace });
}

const paths = [
  "src/components/lmnp/documents/LogementDocumentStep.tsx",
  "src/components/lmnp/documents/CreditDocumentStep.tsx",
  "src/components/lmnp/documents/RevenusDocumentStep.tsx",
  "src/components/lmnp/documents/ChargesDocumentStep.tsx",
  "src/components/lmnp/documents/AmortissementDocumentStep.tsx",
  "src/components/lmnp/documents/DocumentsWorkspace.tsx",
  "src/components/lmnp/assistants/F010LogementAssistantPanel.tsx",
  "src/components/lmnp/assistants/F011FinancementAssistantPanel.tsx",
  "src/components/lmnp/assistants/F012ChargesAssistantPanel.tsx",
];
for (const path of paths) test(`actual ${path}: each upload branch carries the explicit persisted scope`, () => {
  for (const propertyId of [A, B]) for (const files of productionFiles(path, propertyId)) {
    assert.equal(files[0].propertyId, propertyId);
  }
});

for (const propertyId of [A, B]) test(`DB ${propertyId} → UI → snapshot → reload → unrelated autosave retains assignment`, async () => {
  const { upload, rows } = uploader();
  const uploaded = await upload([file], "local-user", { dossierId: DOSSIER, fiscalYear: 2026,
    documentRole: "durable_reference", ...resolveUploadPropertyScope(state(), propertyId) });
  assert.equal(rows[0].property_id, propertyId, "real upload insert already persists correct scope");
  let workspace = lmnpReducer(state(), { type: "UPLOAD_DOCUMENTS",
    files: productionFiles(paths[0], propertyId, uploaded.documentIds[0])[1] });
  assert.equal(workspace.documents[0].propertyId, rows[0].property_id, "scope must exist BEFORE hydration reconciliation");
  workspace = reload(workspace);
  assert.equal(workspace.documents[0].propertyId, propertyId);
  for (const active of [A, B, A]) {
    assert.equal(resolveUploadPropertyScope(workspace, active).propertyId, active);
    assert.equal(workspace.documents[0].propertyId, propertyId, "navigation never reassigns existing evidence");
  }
  workspace = lmnpReducer(workspace, { type: "DECLARATION_PATCH_DRAFT", patch: { exploitantFirstName: "Edited" } });
  workspace = reload(workspace, 2);
  assert.equal(workspace.documents[0].propertyId, propertyId);
  const reconciled = reconcileWorkspaceDocuments({ localDocuments: workspace.documents, supabaseDocuments: rows,
    fiscalYearId: workspace.fiscalYear.id, fiscalYear: 2026, propertyId: resolveMonoPropertyId(workspace),
    localBlobDocumentIds: new Set(), localExtractedDocumentIds: new Set() });
  assert.equal(reconciled.documents[0].propertyId, propertyId);
});

test("reducer retains explicit B independently of the UI mapper and document status updates", () => {
  const files = [{ file, category: "autre" as const, propertyId: B, documentId: "doc-B" }];
  let workspace = lmnpReducer(state(), { type: "UPLOAD_DOCUMENTS", files });
  workspace = lmnpReducer(workspace, { type: "DOCUMENT_SET_STATUS", documentId: "doc-B", status: "analyzed" });
  assert.equal(reload(workspace).documents[0].propertyId, B);
});

test("a real upload callback started on B keeps B when navigation changes before completion", async () => {
  const filename = resolve(root, "src/design-system/components/UploadZone.tsx");
  const ast = ts.createSourceFile(filename, readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "handleFiles") expression = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(expression);
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const pending = new Promise<void>(resolve => { release = resolve; });
  const { upload, rows } = uploader();
  let workspace = state();
  let active = B;
  const capturedScope = resolveUploadPropertyScope(workspace, active);
  const bindings = {
    ...capturedScope, dossierId: DOSSIER, fiscalYear: 2026, documentRole: "annual_evidence",
    supabase: { auth: { getUser: async () => ({ data: { user: { id: "local" } } }) } },
    uploadFilesForUser: async (...args: Parameters<typeof upload>) => { entered(); await pending; return upload(...args); },
    onFiles: (_files: File[], meta: { supabaseDocumentIds: string[] }) => {
      workspace = lmnpReducer(workspace, { type: "UPLOAD_DOCUMENTS",
        files: productionFiles(paths[5], capturedScope.propertyId!, meta.supabaseDocumentIds[0])[0] });
    },
    alert: (message: string) => assert.fail(message),
  };
  const callback = new Function(...Object.keys(bindings), compile(`return (${expression.getText(ast)});`, filename))(...Object.values(bindings));
  const completion = callback([file]);
  await started;
  active = A;
  assert.equal(resolveUploadPropertyScope(workspace, active).propertyId, A);
  release();
  await completion;
  assert.equal(rows[0].property_id, B);
  assert.equal(reload(workspace).documents[0].propertyId, B);
});

test("legacy mono upload and NULL remote relation retain deterministic single-property compatibility", () => {
  const workspace = lmnpReducer(state(false), { type: "UPLOAD_DOCUMENTS", files: [{ file, category: "autre", documentId: "legacy" }] });
  assert.equal(reload(workspace).documents[0].propertyId, A);
  workspace.documents = reconcileWorkspaceDocuments({ localDocuments: workspace.documents,
    supabaseDocuments: [{ id: "legacy", user_id: "local", dossier_id: DOSSIER, file_name: file.name,
      file_path: "local/legacy.pdf", extraction_status: "pending", fiscal_year: 2026, document_role: "annual_evidence",
      created_at: "2026-01-01", property_id: null }], fiscalYearId: workspace.fiscalYear.id, fiscalYear: 2026,
    propertyId: resolveMonoPropertyId(workspace), localBlobDocumentIds: new Set(), localExtractedDocumentIds: new Set() }).documents;
  assert.equal(workspace.documents[0].propertyId, A);
});

test("unassigned multi upload is refused; legacy missing relation remains fail-closed after reload", async () => {
  const { upload, rows } = uploader();
  const uploaded = await upload([file], "local", { dossierId: DOSSIER, fiscalYear: 2026, ...resolveUploadPropertyScope(state(), undefined) });
  assert.equal(uploaded.files.length, 0);
  assert.equal(rows.length, 0);
  const workspace = reload(lmnpReducer(state(), { type: "UPLOAD_DOCUMENTS", files: [{ file, category: "autre" }] }));
  assert.equal(workspace.documents[0].propertyId, undefined);
  assert.equal(resolveDocumentScope(workspace, workspace.documents[0]).kind, "unresolved");
  const readiness = resolveMultiPropertyDomainReadiness(workspace);
  assert.equal(readiness.status, "unsupported");
});
