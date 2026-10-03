/**
 * MB-MULTI-V3-READMODEL-1 — RENDU du vrai shell V3 sur un dossier multi-bien scopé (A + B) : plus de message global
 * « Dossier multi-biens non pris en charge dans ce lot » ; rubriques de bien = bien actif ; sans bien actif : « Choisir un bien ».
 * Un stub `require.extensions` rend le CSS module importable sous tsx.
 *
 * Run: npx tsx --test src/lab/v3-dossier/multi-shell-render.test.tsx
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { V3CorrectionScope } from "@/lab/v2-dossier/correction-scope";
import { money } from "@/lab/v2-dossier/read-model";
import { A, B, multiWorkspace } from "@/lib/lmnp/services/declaration/multi-property-test-support";

function installCssStub() {
  const extensions = (require as unknown as { extensions: Record<string, (module: { exports: unknown }) => void> }).extensions;
  extensions[".css"] = module => { module.exports = new Proxy({}, { get: (_target, key) => (typeof key === "string" && key !== "__esModule" ? key : undefined) }); };
}
async function loadShell() {
  installCssStub();
  return (await import("./V3RealPrototype")).V3RealPrototype;
}

const scopeOf = (propertyId: string | null): V3CorrectionScope => ({
  dossierId: "dossier-1", fiscalYearId: "fy-2026", year: 2026,
  property: propertyId ? { kind: "required", propertyId } : { kind: "not_applicable" }, shell: "v3",
});
const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("shell multi A+B, bien actif A : plus de message global, rubriques lues sur A", async () => {
  const V3RealPrototype = await loadShell();
  const html = plain(renderToStaticMarkup(<V3RealPrototype workspace={multiWorkspace()} scope={scopeOf(A)} documents={{ state: "known", documents: [] }} />));
  assert.ok(!html.includes("non pris en charge dans ce lot"));
  assert.ok(!html.includes("Non pris en charge"));
  assert.ok(!html.includes("Choisir un bien"));
  assert.ok(html.includes("Votre dossier en six rubriques"));
});

test("shell multi A+B, bien actif B : même absence de blocage global", async () => {
  const V3RealPrototype = await loadShell();
  const html = plain(renderToStaticMarkup(<V3RealPrototype workspace={multiWorkspace()} scope={scopeOf(B)} documents={{ state: "known", documents: [] }} />));
  assert.ok(!html.includes("non pris en charge dans ce lot"));
  assert.ok(!html.includes("Non pris en charge"));
  assert.ok(!html.includes(money(14321)!), "aucune donnée de A sous B");
});

test("shell multi sans bien actif : « Choisir un bien » sur les cinq rubriques de bien, aucun repli sur le premier bien", async () => {
  const V3RealPrototype = await loadShell();
  const html = plain(renderToStaticMarkup(<V3RealPrototype workspace={multiWorkspace()} scope={scopeOf(null)} documents={{ state: "known", documents: [] }} />));
  assert.equal(html.split("Choisir un bien").length - 1, 5);
  assert.ok(!html.includes("non pris en charge dans ce lot"));
  assert.ok(!html.includes(money(14321)!) && !html.includes(money(9000)!));
});
