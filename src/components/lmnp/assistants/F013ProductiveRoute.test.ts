import "@/lab/v2-dossier/test-public-env";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import * as React from "react";
import ts from "typescript";

import { bienScopeFor, resolveActivePropertyId, withActivePropertyId } from "@/lib/lmnp/dossier/bien-scope";
import { productionOwnerHref } from "@/lib/lmnp/dossier/production-dossier-scope";
import { lmnpReducer, type LmnpState } from "@/lib/lmnp/store/reducer";
import { createDefaultWorkspace } from "@/lib/lmnp/store/persistence";
import { parseWorkspaceSnapshot, serializeWorkspaceSnapshot } from "@/lib/lmnp/store/workspace-snapshot";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import { readV3CorrectionQuery, v3ScopedNavigationHref, type V3CorrectionScope } from "@/lab/v2-dossier/correction-scope";
import { answerBalance, answerCollections, answerCoverage, answerExceptions } from "@/lib/lmnp/services/f013/v2/f013-v2-manual-flow";
import { confirmRentReconciliation, createRentReconciliationState } from "@/lib/lmnp/services/f013/v2/f013-v2-state";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const originalFlag = process.env.NEXT_PUBLIC_F013_V2_MANUAL;
afterEach(() => {
  if (originalFlag === undefined) delete process.env.NEXT_PUBLIC_F013_V2_MANUAL;
  else process.env.NEXT_PUBLIC_F013_V2_MANUAL = originalFlag;
});

type Props = { children?: React.ReactNode; label?: string; href?: string; onSubmit?: (cents: number) => void };
type Element = React.ReactElement<Props>;

// Execute the actual page, panel and gate. Only React hook hosting, store context
// and visual primitives are replaced; scope, manual actions and reducer stay real.
function sourceModule<T>(relative: string, replacements: Record<string, unknown>): T {
  const file = path.join(root, relative);
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  const localRequire = createRequire(file);
  const loaded = { exports: {} };
  const requireDependency = (id: string) => id in replacements ? replacements[id] : localRequire(id);
  new Function("require", "module", "exports", compiled.outputText)(requireDependency, loaded, loaded.exports);
  return loaded.exports as T;
}

function harness(multi = false, selected?: string) {
  const initial = createDefaultWorkspace(new Date("2026-10-05T12:00:00Z"));
  initial.fiscalYear.dossierId = "dossier";
  initial.properties[0].id = "A";
  initial.fiscalYear.propertyIds = ["A"];
  let workspace = { ...initial, fileRegistry: new Map() } as LmnpState;
  if (multi) {
    workspace = lmnpReducer(workspace, { type: "ADD_PROPERTY", property: { ...initial.properties[0], id: "B", label: "Second bien" } });
  }
  let correction: V3CorrectionScope | null = null;
  if (selected) {
    const href = productionOwnerHref("/assistants/revenus", workspace, selected);
    assert.ok(href);
    const url = new URL(href, "http://test");
    const query = readV3CorrectionQuery(url.pathname, url.searchParams);
    assert.equal(query.kind, "scope");
    if (query.kind === "scope") correction = query.scope;
  }
  const writes: unknown[] = [];
  const scope = () => bienScopeFor(workspace, resolveActivePropertyId(correction, workspace));
  const store = {
    useLmnp: () => ({ workspace }),
    useBienScope: () => {
      const resolved = scope();
      const propertyId = resolved.status === "ready" ? resolved.propertyId : undefined;
      return {
        scope: resolved, propertyId,
        draft: resolved.status === "ready" ? resolved.draft : { completedSteps: [] },
        dispatch: (action: Parameters<typeof lmnpReducer>[1]) => {
          const scoped = withActivePropertyId(action, propertyId);
          writes.push(scoped);
          workspace = lmnpReducer(workspace, scoped);
        },
      };
    },
  };
  const hooks = { ...React, useMemo: (fn: () => unknown) => fn(), useState: (initial: unknown) => [typeof initial === "function" ? initial() : initial, () => undefined] };
  const visual = (props: Props) => React.createElement("div", null, props.children);
  const shared = {
    react: hooks,
    "@/lib/lmnp/store": store,
    "@/lab/v2-dossier/correction-context": { useV3CorrectionScope: () => correction },
    "next/navigation": { usePathname: () => "/assistants/revenus" },
    "@/components/lmnp/biens/PropertySelector": { PropertySelector: visual },
    "@/design-system/components/Button": { Button: visual },
    "@/design-system/components/Card": { Card: visual },
    "@/components/lmnp/app-shell/scoped-owner-navigation": {
      ScopedOwnerLink: (props: Props) => React.createElement("a", { href: v3ScopedNavigationHref(props.href!, correction) ?? undefined }, props.children),
    },
  };
  const gate = sourceModule("src/components/lmnp/assistants/BienScopeGate.tsx", shared);
  const panel = sourceModule<{ F013V2ManualPanel: React.ComponentType }>("src/components/lmnp/assistants/F013V2ManualPanel.tsx", { ...shared, "./BienScopeGate": gate });
  const legacy = () => React.createElement("div", null, "historical panel");
  const page = sourceModule<{ default: () => Element }>("src/app/(dashboard)/assistants/revenus/page.tsx", {
    ...shared,
    "@/components/lmnp/assistants/F013V2ManualPanel": panel,
    "@/components/lmnp/assistants/F013RevenusAssistantPanel": { F013RevenusAssistantPanel: legacy },
  });
  function nodes(): Element[] {
    const found: Element[] = [];
    function visit(node: React.ReactNode) {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!React.isValidElement<Props>(node)) return;
      found.push(node);
      if (typeof node.type === "function") visit((node.type as (props: Props) => React.ReactNode)(node.props));
      else visit(node.props.children);
    }
    visit(page.default());
    return found;
  }
  return { page: page.default, panel: panel.F013V2ManualPanel, legacy, nodes, writes, scope, workspace: () => workspace };
}

for (const value of [undefined, "0", "false", "true", ""]) {
  test(`productive route flag ${String(value)}: historical component, no v2 write or migration`, () => {
    if (value === undefined) delete process.env.NEXT_PUBLIC_F013_V2_MANUAL;
    else process.env.NEXT_PUBLIC_F013_V2_MANUAL = value;
    const h = harness();
    const before = JSON.stringify(h.workspace());
    assert.equal(h.page().type, h.legacy);
    h.nodes();
    assert.equal(JSON.stringify(h.workspace()), before);
    assert.equal(h.writes.length, 0);
    assert.equal(h.workspace().declarationDraft?.rentReconciliationV2, undefined);
  });
}

test('productive route flag "1": mounts the actual F013 v2 panel without a redirect', () => {
  process.env.NEXT_PUBLIC_F013_V2_MANUAL = "1";
  const h = harness();
  assert.equal(h.page().type, h.panel);
  assert.ok(h.nodes().some(node => node.props.label === "Loyers reçus"));
  assert.equal(h.writes.length, 0, "merely opening the route must not create persisted v2 facts");
});

for (const [multi, selected, expected] of [[false, undefined, "A"], [true, "B", "B"]] as const) {
  test(`${multi ? "multi B" : "mono A"}: real panel submission persists in the resolved property and snapshot`, () => {
    process.env.NEXT_PUBLIC_F013_V2_MANUAL = "1";
    const h = harness(multi, selected);
    const untouchedA = structuredClone(h.workspace().declarationDraft?.biens?.A);
    const input = h.nodes().find(node => node.props.label === "Loyers reçus" && node.props.onSubmit);
    assert.ok(input, "productive route must expose the v2 input");
    input.props.onSubmit!(1200000);
    const resolved = h.scope();
    assert.equal(resolved.status, "ready");
    if (resolved.status !== "ready") return;
    assert.equal(resolved.propertyId, expected);
    assert.equal(resolved.draft.rentReconciliationV2?.facts.propertyId, expected);
    assert.deepEqual(resolved.draft.rentReconciliationV2?.facts.collections, { status: "VALIDATED", amountCents: 1200000, provenance: { kind: "user_declaration" } });
    if (multi) assert.deepEqual(h.workspace().declarationDraft?.biens?.A, untouchedA);
    const serialized = serializeWorkspaceSnapshot(h.workspace());
    assert.equal(serialized.ok, true);
    if (!serialized.ok) return;
    assert.equal(serialized.envelope.schemaVersion, 3);
    const restored = parseWorkspaceSnapshot(JSON.parse(JSON.stringify(serialized.envelope)));
    assert.equal(restored.ok, true);
    if (restored.ok) {
      // JSON snapshots omit undefined invalidated outputs, while preserving all facts.
      assert.deepEqual(restored.envelope.workspace.declarationDraft, JSON.parse(JSON.stringify(h.workspace().declarationDraft)));
      const reloadedScope = bienScopeFor(restored.envelope.workspace, expected);
      assert.equal(reloadedScope.status, "ready");
      if (reloadedScope.status === "ready") assert.deepEqual(reloadedScope.draft.rentReconciliationV2, resolved.draft.rentReconciliationV2);
    }
  });
}

test("flag OFF leaves previously persisted v2 facts untouched", () => {
  process.env.NEXT_PUBLIC_F013_V2_MANUAL = "0";
  const h = harness();
  h.workspace().declarationDraft!.rentReconciliationV2 = createRentReconciliationState({ propertyId: "A", fiscalYear: h.workspace().fiscalYear.year });
  const before = structuredClone(h.workspace().declarationDraft);
  assert.equal(h.page().type, h.legacy);
  h.nodes();
  assert.deepEqual(h.workspace().declarationDraft, before);
  assert.equal(h.writes.length, 0);
});

test("flag ON never promotes legacy cash into v2 facts when opening the route", () => {
  process.env.NEXT_PUBLIC_F013_V2_MANUAL = "1";
  const h = harness();
  h.workspace().declarationDraft!.revenusAssistant = { exerciceFiscal: h.workspace().fiscalYear.year, totalRecettes: 9000 };
  const before = structuredClone(h.workspace().declarationDraft);
  assert.ok(h.nodes().some(node => node.props.label === "Loyers reçus"));
  assert.deepEqual(h.workspace().declarationDraft, before);
  assert.equal(h.writes.length, 0);
  assert.equal(h.workspace().declarationDraft?.rentReconciliationV2, undefined);
});

test("multi without selected property: gate blocks the panel and never falls back to A", () => {
  process.env.NEXT_PUBLIC_F013_V2_MANUAL = "1";
  const h = harness(true);
  assert.equal(h.page().type, h.panel);
  assert.equal(h.scope().status, "blocked");
  assert.equal(h.nodes().some(node => node.props.label === "Loyers reçus"), false);
  assert.equal(h.writes.length, 0);
});

test("F011 continues to canonical Revenus with the same verified property scope", () => {
  const source = readFileSync(path.join(root, "src/components/lmnp/assistants/F011FinancementAssistantPanel.tsx"), "utf8");
  assert.match(source, /href=\{LMNP_ROUTES.revenusAssistant\}[\s\S]*?Continuer vers Revenus/);
  assert.equal(LMNP_ROUTES.revenusAssistant, "/assistants/revenus");
  const h = harness(true, "B");
  const href = productionOwnerHref(LMNP_ROUTES.revenusAssistant, h.workspace(), "B")!;
  const url = new URL(href, "http://test");
  assert.equal(url.pathname, "/assistants/revenus");
  assert.equal(url.searchParams.get("propertyId"), "B");
});

test("v2 productive navigation: scoped Charges only after fresh confirmation; return remains available", () => {
  process.env.NEXT_PUBLIC_F013_V2_MANUAL = "1";
  const h = harness(true, "B");
  const hrefs = () => h.nodes().filter(node => node.type === "a").map(node => node.props.href);
  assert.ok(hrefs().some(href => href?.startsWith("/dashboard?")));
  assert.equal(hrefs().some(href => href?.startsWith("/assistants/charges?")), false);
  const scope = { propertyId: "B", fiscalYear: h.workspace().fiscalYear.year };
  let state = createRentReconciliationState(scope);
  const collections = answerCollections(state, 1200000);
  assert.ok(collections.ok);
  state = answerCoverage(collections.state, "all");
  for (const key of ["openingReceivables", "openingAdvances", "closingReceivables", "closingAdvances"] as const) {
    const result = answerBalance(state, key, { answer: "none" });
    assert.ok(result.ok);
    state = result.state;
  }
  const exceptions = answerExceptions(state, { answer: "none" });
  assert.ok(exceptions.ok);
  const confirmed = confirmRentReconciliation(exceptions.state, scope, "2026-10-05T12:00:00Z");
  assert.ok(confirmed.ok);
  h.workspace().declarationDraft!.biens!.B.rentReconciliationV2 = confirmed.state;
  const next = hrefs().find(href => href?.startsWith("/assistants/charges?"));
  assert.ok(next);
  assert.equal(new URL(next, "http://test").searchParams.get("propertyId"), "B");
  h.workspace().declarationDraft!.biens!.B.rentReconciliationV2 = exceptions.state;
  assert.equal(hrefs().some(href => href?.startsWith("/assistants/charges?")), false);
});
