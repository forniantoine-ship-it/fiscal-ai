/** Behavioral regression of the actual provider callbacks and rendered Documents entry.
 * No DOM test dependency: TypeScript loads the production code with UI-only stubs.
 * Persistence, reducer, domain evaluator and navigation contracts remain real.
 */
import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import ts from "typescript";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { monoWorkspace, multiWorkspace, A, B } from "../services/declaration/multi-property-test-support";
import { scopeMatchesWorkspace, v3ScopedNavigationHref, type V3CorrectionScope } from "@/lab/v2-dossier/correction-scope";
import { trackedWorkspaceReducer, workspaceCanPersist, workspaceIsDirty, workspaceScopeKey, type TrackedWorkspace } from "./workspace-dirty";
import { serializeWorkspaceSnapshot, toPersistedWorkspace } from "./workspace-snapshot";
import { putWorkspaceRecord } from "./db";
import { resolveAddPropertyOutcome, toConfirmedSave } from "@/components/lmnp/biens/add-property-return";
import { startCheckoutAfterFlush } from "../services/payment/checkout-flush";
import { buildStripeReturnUrls, readStripeReturnContext } from "../services/payment/stripe-return-context";
import { readExplicitDossierId } from "../dossier/explicit-dossier-id";
import type { PersistedWorkspace } from "./persistence";
import type { WorkspaceSnapshotRecord } from "./workspace-snapshot-resolve";

const DOSSIER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const DEFAULT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const root = process.cwd();
let providerId = 0;
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "local-test-only";
(globalThis as unknown as { window: unknown }).window = globalThis;

function compile(code: string, filename: string) {
  return ts.transpileModule(code, { fileName: filename, compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  } }).outputText;
}

/** Execute the production callback with provider refs; never copy its implementation. */
function providerCallback<T>(name: string, bindings: Record<string, unknown>): T {
  const filename = resolve(root, "src/lib/lmnp/store/provider.tsx");
  const ast = ts.createSourceFile(filename, readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name && node.initializer) expression = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(expression, `production callback ${name} exists`);
  const js = compile(`const callback = ${expression.getText(ast)};`, filename);
  return new Function(...Object.keys(bindings), `${js}\nreturn callback;`)(...Object.values(bindings)) as T;
}

/** Stub only module boundaries needed for rendering; fiscal/domain modules are real. */
function loadUi(filename: string, stubs: Record<string, unknown>, stubPresentation = false): Record<string, unknown> {
  const absolute = resolve(root, filename);
  const nativeRequire = createRequire(absolute);
  const exports = {};
  const req = (id: string): unknown => {
    if (id in stubs) return stubs[id];
    if (stubPresentation && id.startsWith("@/components/") && !id.includes("/biens/")) {
      return new Proxy({}, { get: (_, name) => (props: { children?: React.ReactNode }) => React.createElement("div", { "data-component": String(name) }, props.children) });
    }
    return nativeRequire(id.startsWith("@/") ? resolve(root, "src", id.slice(2)) : id);
  };
  new Function("require", "exports", compile(readFileSync(absolute, "utf8"), absolute))(req, exports);
  return exports as Record<string, unknown>;
}

let api: typeof import("./persistence") & typeof import("./workspace-snapshot-client");
let server: WorkspaceSnapshotRecord;
let fail = false;
beforeEach(async () => {
  api = { ...await import("./persistence"), ...await import("./workspace-snapshot-client") };
  api.__testResetWorkspaceSaveChain();
  fail = false;
});

async function provider(workspace: PersistedWorkspace, correctionScope: V3CorrectionScope | null = null) {
  const userId = `defect-local-user-${++providerId}`;
  workspace = { ...workspace, fiscalYear: { ...workspace.fiscalYear, dossierId: DOSSIER } };
  const state = { ...workspace, fileRegistry: new Map() };
  const trackedRef = { current: { workspace: state, appliedActions: 0, incarnation: 1, version: 1, savedVersion: 0, scopeKey: workspaceScopeKey(userId, state) } as TrackedWorkspace };
  const envelope = serializeWorkspaceSnapshot(workspace);
  assert.ok(envelope.ok);
  server = { dossierId: DOSSIER, fiscalYear: workspace.fiscalYear.year, revision: 1, schemaVersion: envelope.envelope.schemaVersion, payload: envelope.envelope, updatedAt: "2026-01-01" };
  await putWorkspaceRecord(userId, workspace, { lastSyncedServerRevision: 1 });
  api.__setWorkspaceSnapshotStoreForTests({
    async listByDossier() { return [server]; },
    async getMeta() { return { revision: server.revision, closedAt: null, schemaVersion: server.schemaVersion }; },
    async upsert(input) { if (fail) throw new Error("offline"); server = { ...server, revision: server.revision + 1, payload: input.payload }; return { revision: server.revision }; },
    async casUpdate(input) {
      if (fail) throw new Error("offline");
      if (input.expectedRevision !== server.revision) return { status: "conflict" as const };
      server = { ...server, revision: server.revision + 1, payload: input.payload };
      return { status: "ok" as const, revision: server.revision };
    },
  });
  api.setWorkspaceSnapshotSyncGate("ready", { dossierId: DOSSIER, fiscalYear: workspace.fiscalYear.year });
  const stateRef = { current: state };
  const bindings = {
    useCallback: (fn: unknown) => fn, awaitCommittedActions: async () => {},
    authUserIdRef: { current: userId }, hydrationBlockedRef: { current: false }, isReady: true,
    correctionScope, stateRef, trackedRef, scopeMatchesWorkspace, toPersisted: toPersistedWorkspace,
    workspaceCanPersist, workspaceIsDirty, workspaceScopeKey, flushWorkspaceSaveConfirmed: api.flushWorkspaceSaveConfirmed,
    readLastSyncedServerRevision: api.readLastSyncedServerRevision,
    dispatchTracked: (action: Parameters<typeof trackedWorkspaceReducer>[1]) => { trackedRef.current = trackedWorkspaceReducer(trackedRef.current, action); },
  };
  const confirmWorkspaceSave = providerCallback<() => Promise<import("./persistence").ConfirmedWorkspaceSaveResult>>("confirmWorkspaceSave", bindings);
  const resolveDeliveryRevision = providerCallback<() => Promise<{ status: "ok"; revision: number } | { status: "failed"; reason: string }>>("resolveDeliveryRevision", { ...bindings, confirmWorkspaceSave });
  const apply = (action: import("./reducer").LmnpAction) => {
    bindings.dispatchTracked({ type: "apply", action, userId });
    stateRef.current = trackedRef.current.workspace;
  };
  return { workspace, confirmWorkspaceSave, resolveDeliveryRevision, trackedRef, bindings, stateRef, apply };
}

for (const [mode, fixture] of [["mono", monoWorkspace], ["multi", multiWorkspace]] as const) {
  test(`D1 ${mode}: standard route edit -> persisted revision -> checkout without URL scope`, async () => {
    const p = await provider(fixture());
    p.stateRef.current.declarationDraft = { ...p.stateRef.current.declarationDraft!, exploitantFirstName: "Edited" };
    let checkout = false;
    await startCheckoutAfterFlush({ resolveDeliveryRevision: p.resolveDeliveryRevision, start: async () => { checkout = true; } });
    assert.equal(checkout, true);
    assert.equal(server.revision, 2);
    assert.equal((server.payload as { workspace: PersistedWorkspace }).workspace.declarationDraft?.exploitantFirstName, "Edited");
    assert.equal(p.trackedRef.current.savedVersion, 1);
    assert.deepEqual(await p.resolveDeliveryRevision(), { status: "ok", revision: 2 });
  });
}
test("D1 explicit scope still confirms; a foreign scope fails before persistence", async () => {
  const scope: V3CorrectionScope = { dossierId: DOSSIER, fiscalYearId: "fy-mono", year: 2026, property: { kind: "not_applicable" } };
  assert.equal((await (await provider(monoWorkspace(), scope)).confirmWorkspaceSave()).status, "confirmed");
  const p = await provider(monoWorkspace(), { ...scope, dossierId: DEFAULT });
  assert.deepEqual(await p.confirmWorkspaceSave(), { status: "failed", reason: "scope_mismatch" });
  assert.equal(server.revision, 1);
});
test("D1 ADD_PROPERTY: confirmed persisted second property gives truthful navigation", async () => {
  const p = await provider(monoWorkspace());
  p.apply({ type: "ADD_PROPERTY", property: { id: B, label: "New B", address: "", city: "", postalCode: "" } });
  assert.equal(p.stateRef.current.properties.length, 2);
  const save = toConfirmedSave(await p.resolveDeliveryRevision());
  assert.equal(resolveAddPropertyOutcome({ workspace: toPersistedWorkspace(p.stateRef.current), scope: null, newPropertyId: B, save }).kind, "navigate");
  assert.equal((server.payload as { workspace: PersistedWorkspace }).workspace.properties.length, 2);
});
test("D1 server failure keeps the addition unsaved and prevents checkout", async () => {
  const p = await provider(monoWorkspace());
  p.apply({ type: "ADD_PROPERTY", property: { id: B, label: "New B", address: "", city: "", postalCode: "" } });
  fail = true;
  const result = await p.resolveDeliveryRevision();
  assert.deepEqual(result, { status: "failed", reason: "server_unavailable" });
  assert.equal(resolveAddPropertyOutcome({ workspace: toPersistedWorkspace(p.stateRef.current), scope: null, newPropertyId: B, save: toConfirmedSave(result) }).kind, "unsaved");
  await assert.rejects(startCheckoutAfterFlush({ resolveDeliveryRevision: p.resolveDeliveryRevision, start: async () => assert.fail("checkout forbidden") }));
  assert.equal(server.revision, 1);
});
test("D1 absent dossier, hydration blocked and changed auth refuse confirmation", async () => {
  const p = await provider(monoWorkspace());
  delete p.stateRef.current.fiscalYear.dossierId;
  assert.equal((await p.confirmWorkspaceSave()).status, "failed");
  assert.equal(server.revision, 1);
  for (const overrides of [{ hydrationBlockedRef: { current: true } }, { authUserIdRef: { current: null } }]) {
    const confirm = providerCallback<() => Promise<{ status: string }>>("confirmWorkspaceSave", { ...p.bindings, ...overrides });
    assert.equal((await confirm()).status, "failed");
  }
});

function documents(workspace: PersistedWorkspace, step = "inpi", activePropertyId?: string) {
  workspace = { ...workspace, fiscalYear: { ...workspace.fiscalYear, dossierId: DOSSIER } };
  const stubs = {
    "next/navigation": { useSearchParams: () => new URLSearchParams({ step }), usePathname: () => "/documents" },
    "@/lib/lmnp/store": { useLmnp: () => ({ workspace, activePropertyId }), useUploadPropertyScope: () => ({ requirePropertyId: true }) },
    "@/lab/v2-dossier/correction-context": { useV3CorrectionScope: () => activePropertyId ? {
      dossierId: DOSSIER, fiscalYearId: workspace.fiscalYear.id, year: workspace.fiscalYear.year,
      property: { kind: "required", propertyId: activePropertyId }, shell: "dossier",
    } : null },
  };
  const uiModule = loadUi("src/components/lmnp/documents/DocumentsWorkspace.tsx", stubs, true);
  const entry = loadUi("src/components/lmnp/biens/ProductionPropertiesEntry.tsx", stubs);
  return renderToStaticMarkup(React.createElement(React.Fragment, null,
    React.createElement(entry.ProductionPropertiesEntry as React.ComponentType),
    React.createElement(uiModule.DocumentsWorkspace as React.ComponentType)));

}
for (const step of ["inpi", "validation"]) {
  test(`D3 supported multi renders the existing ${step} step`, () => {
    const html = documents(multiWorkspace(), step);
    assert.ok(html.includes(step === "validation" ? "FrozenValidationDocumentStep" : "FrozenActiviteDocumentStep"), html);
    assert.ok(!html.includes("n’est pas disponible"));
  });
}
test("D3 mono retains the existing Documents entry", () => assert.ok(documents(monoWorkspace()).includes("FrozenActiviteDocumentStep")));
test("D3 unsupported multi and unassigned property documents remain blocked", () => {
  const bad = multiWorkspace({ root: { multiPropertyAttestations: undefined } });
  assert.ok(!documents(bad, "validation").includes("FrozenValidationDocumentStep"));
  const unassigned = multiWorkspace();
  unassigned.documents.push({ id: "unassigned", fileName: "acte.pdf", fiscalYearId: "fy-2026", mimeType: "application/pdf", sizeBytes: 20, documentType: "acte_acquisition", category: "acte-acquisition", status: "uploaded", uploadedAt: "2026-01-01" } as unknown as PersistedWorkspace["documents"][number]);
  assert.ok(!documents(unassigned, "validation").includes("FrozenValidationDocumentStep"));
});
test("D3 selector shows exact active property B with no implicit selection", () => {
  const html = documents(multiWorkspace(), "inpi", B);
  assert.equal(html.split('aria-label="Biens du dossier"').length - 1, 1, 'reuse exactly one existing selector');
  assert.ok(html.includes(`aria-current="true"`) && html.includes(`Bien ${B}`));
  assert.ok(html.includes(`propertyId=${A}`));
  assert.ok(!documents(multiWorkspace()).includes('aria-current="true"'));
});

function ownerHref(workspace: PersistedWorkspace, scope: V3CorrectionScope | null = null) {
  const uiModule = loadUi("src/components/lmnp/app-shell/scoped-owner-navigation.tsx", {
    "@/lab/v2-dossier/correction-context": { useV3CorrectionScope: () => scope },
    "@/lib/lmnp/store": { useOptionalLmnp: () => ({ workspace }) },
    "@/components/lmnp/app-shell/useV3CorrectionReturn": { useV3CorrectionReturn: () => ({}) },
  });
  return (uiModule.useScopedOwnerHref as (href: string) => string | null)("/declarations");
}
test("D4 return C -> owner navigation -> reload C, preserving year and no property/revision", () => {
  const workspace = multiWorkspace({ fiscalYear: { dossierId: DOSSIER } });
  const returned = new URL(buildStripeReturnUrls({ origin: "http://localhost:3100", dossierId: DOSSIER, fiscalYear: 2026 }).successUrl);
  assert.deepEqual(readStripeReturnContext(returned.searchParams).dossier, { kind: "explicit", id: DOSSIER });
  const href = ownerHref(workspace);
  assert.ok(href);
  const next = new URL(href, returned);
  const reloadSelection = readExplicitDossierId(next.searchParams) ?? DEFAULT;
  assert.equal(reloadSelection, DOSSIER);
  assert.equal(next.searchParams.get("fy"), "2026");
  for (const key of ["propertyId", "revision", "expectedRevision", "rfs"]) assert.equal(next.searchParams.has(key), false);
});
test("D4 explicit correction navigation retains its existing verified scope contract", () => {
  const workspace = multiWorkspace({ fiscalYear: { dossierId: DOSSIER } });
  const scope: V3CorrectionScope = { dossierId: DOSSIER, fiscalYearId: "fy-2026", year: 2026, property: { kind: "required", propertyId: B }, shell: "dossier" };
  assert.equal(ownerHref(workspace, scope), v3ScopedNavigationHref("/declarations", scope));
});

test("D4 existing production validation entry preserves loaded dossier C/year", () => {
  const html = documents(multiWorkspace(), "inpi", B);
  const href = /href="([^"]+)"[^>]*>Valider mon dossier/.exec(html)?.[1]?.replaceAll("&amp;", "&");
  assert.ok(href);
  const url = new URL(href, "http://localhost");
  assert.equal(url.searchParams.get("dossierId"), DOSSIER);
  assert.equal(url.searchParams.get("fy"), "2026");
  assert.equal(url.searchParams.has("propertyId"), false);
});
test("D4 Mes biens validation link preserves the same activity scope", () => {
  const workspace = multiWorkspace({ fiscalYear: { dossierId: DOSSIER } });
  const ui = loadUi("src/components/lmnp/biens/PropertiesManager.tsx", {
    "@/lib/lmnp/store": { useLmnp: () => ({ workspace }) },
    "@/lab/v2-dossier/correction-context": { useV3CorrectionScope: () => null },
  });
  const html = renderToStaticMarkup(React.createElement(ui.PropertiesManager as React.ComponentType));
  const href = /href="([^"]+)"[^>]*>Passer à la validation de mon dossier/.exec(html)?.[1]?.replaceAll("&amp;", "&");
  assert.ok(href);
  const url = new URL(href, "http://localhost");
  assert.equal(url.searchParams.get("dossierId"), DOSSIER);
  assert.equal(url.searchParams.get("fy"), "2026");
  assert.equal(url.searchParams.has("propertyId"), false);
});
