/** Real validation panel/CTA rendering; only application contexts and effects are substituted.
 * The generation gate, domain/readiness, capability resolver and CTA components remain real.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { monoWorkspace, multiWorkspace, T } from "@/lib/lmnp/services/declaration/multi-property-test-support";
import { resolveDeclarationGenerationGate } from "@/lib/lmnp/services/declaration/declaration-generation-gate";
import { resolveMultiPropertyDomainReadiness } from "@/lib/lmnp/dossier/multi-property-readiness";
import * as activation from "@/lib/lmnp/dossier/multi-property-activation";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";

const ROOT = process.cwd();
function confirmed(workspace: PersistedWorkspace): PersistedWorkspace {
  const ws = structuredClone(workspace);
  ws.fiscalYear.priorHistoryDeclaration = { status: "FIRST_REAL_YEAR", declaredAt: T };
  ws.declarationDraft!.inpiConfirmedAt = T;
  for (const bien of Object.values(ws.declarationDraft!.biens ?? { mono: ws.declarationDraft! })) {
    bien.revenusConfirmedAt = T;
    bien.creditConfirmedAt = T;
  }
  return ws;
}

function render(workspace: PersistedWorkspace, capabilities: activation.MultiPropertyCapabilities = activation.MULTI_PROPERTY_CAPABILITIES) {
  const filename = resolve(ROOT, "src/components/lmnp/documents/ValidationDocumentStep.tsx");
  const nativeRequire = createRequire(filename);
  const stubs: Record<string, unknown> = {
    "next/navigation": { useRouter: () => ({ push() {} }) },
    "@/lib/lmnp/store": { useLmnp: () => ({ workspace, dispatch() {}, updateInpiStatus() {}, resolveDeliveryRevision() {}, inpiStatusUpdating: false }) },
    "@/components/lmnp/shared/FeedbackProvider": { useFeedback: () => ({ showSuccess() {} }) },
    "@/components/lmnp/app-shell/scoped-owner-navigation": { useScopedOwnerHref: () => "/declarations" },
    "@/components/lmnp/shared/WorkflowProgressionActions": { WorkflowPageBackLink: () => null },
    "@/components/lmnp/payment/useServerPaymentSync": { useServerPaymentSync: () => ({ state: "unpaid", refetch: async () => "unpaid" }) },
    "@/lib/lmnp/services/declaration/declaration-generation-gate": {
      resolveDeclarationGenerationGate: (input: Parameters<typeof resolveDeclarationGenerationGate>[0]) => resolveDeclarationGenerationGate({ ...input, multiPropertyCapabilities: capabilities }),
    },
    "@/lib/lmnp/dossier/multi-property-activation": {
      ...activation,
      isMultiPropertyCapabilityBlocked: (ws: activation.PropertyModeInput, capability: activation.MultiPropertyCapability) => activation.isMultiPropertyCapabilityBlocked(ws, capability, capabilities),
      isMultiPropertyDeliveryBlocked: (ws: activation.PropertyModeInput) => activation.isMultiPropertyDeliveryBlocked(ws, capabilities),
    },
  };
  const req = (id: string) => id in stubs ? stubs[id] : nativeRequire(id.startsWith("@/") ? resolve(ROOT, "src", id.slice(2)) : id);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { fileName: filename, compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const exports: Record<string, unknown> = {};
  new Function("require", "exports", code)(req, exports);
  const router = { back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch() {} };
  return renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: router },
    React.createElement(exports.ValidationDocumentStep as React.ComponentType)));
}
function enabledCta(html: string) {
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
    .some((match) => match[2].includes("Générer ma déclaration") && !/\bdisabled\b/.test(match[1]));
}

test("eligible mono retains its real enabled checkout CTA", () => {
  assert.ok(enabledCta(render(confirmed(monoWorkspace()))));
});
test("supported ready multi with generation/payment/delivery open renders the real enabled checkout CTA", () => {
  const ws = confirmed(multiWorkspace());
  assert.equal(resolveMultiPropertyDomainReadiness(ws).status, "supported");
  const gate = resolveDeclarationGenerationGate({ draft: ws.declarationDraft, properties: ws.properties, fiscalYear: ws.fiscalYear.year, paid: false, generated: false, workspace: ws });
  assert.equal(gate.canGenerate, true);
  assert.equal(gate.workspaceReadiness?.technicalReady, true);
  assert.equal(activation.MULTI_PROPERTY_CAPABILITIES.payment, true);
  assert.ok(enabledCta(render(ws)), "generation admitted multi must reach the existing checkout CTA");
});
test("unsupported multi retains its block and cannot render an enabled checkout CTA", () => {
  const ws = confirmed(multiWorkspace({ root: { multiPropertyAttestations: undefined } }));
  assert.equal(resolveMultiPropertyDomainReadiness(ws).status, "unsupported");
  const html = render(ws);
  assert.equal(enabledCta(html), false);
  assert.ok(html.includes("accompagnement personnalisé"));
});
for (const capability of ["payment", "delivery", "generation"] as const) {
  test(`multi with ${capability} closed cannot render an enabled checkout CTA`, () => {
    assert.equal(enabledCta(render(confirmed(multiWorkspace()), { ...activation.MULTI_PROPERTY_CAPABILITIES, [capability]: false })), false);
  });
}
test("multi with unassigned required property document stays blocked", () => {
  const ws = confirmed(multiWorkspace());
  ws.documents.push({ id: "unassigned", fileName: "acte.pdf", fiscalYearId: ws.fiscalYear.id, documentRole: "durable_reference", mimeType: "application/pdf", sizeBytes: 20, documentType: "notary_deed", category: "autre", status: "uploaded", uploadedAt: T });
  assert.equal(enabledCta(render(ws)), false);
});
