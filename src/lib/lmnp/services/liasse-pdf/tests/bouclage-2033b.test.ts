/**
 * Run: npx tsx --test src/lib/lmnp/services/liasse-pdf/tests/bouclage-2033b.test.ts
 *
 * SAV-032 (MB-2033B-NONPRO-NEUTRALIZATION-IMPL-1) — FAIL-CLOSED du bouclage du bloc « RÉSULTAT FISCAL » de la 2033-B :
 *   (312 − 314) + réintégrations imprimées − déductions imprimées = (352 − 354) imprimés.
 * Un bloc non bouclé (ou non établi) ne produit AUCUN PDF — ni au niveau du wrapper 2033-B, ni au niveau de la route.
 * Le garde `case-sans-mapping-visuel` reste, lui, intégralement actif (oracle C de la mission) : ce fichier ne l'affaiblit pas.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";
import { handleCerfaPdfRequest } from "@/app/api/lmnp/declaration/cerfa-pdf/handler";

import { generateCerfa2033BFromRfs } from "../generate-cerfa-2033b";
import { generateCerfaLiassePdf } from "../generator/render-cerfa-liasse";
import { buildScenarioRfs } from "./scenario-beneficiaire.test";

function brokenRfs(): FiscalRepresentation {
  const base = buildScenarioRfs();
  // Dotation 2 000 dont seulement 1 000 déduits : 318 = 1 000 alors que E (= 6 200 − 1 000 = 5 200 ≠ résultat fiscal 4 200) ne
  // correspond plus aux lignes imprimées → le bloc ne boucle pas.
  return {
    ...base,
    fiscalResult: { ...base.fiscalResult, amortDeduct: 1000, amortNonDeduitExercice: 1000 },
  };
}

function legacyRfs(): FiscalRepresentation {
  const base = buildScenarioRfs();
  const fiscalResult = { ...base.fiscalResult };
  delete (fiscalResult as { resultatFiscalAvantDeficits?: number }).resultatFiscalAvantDeficits;
  return { ...base, fiscalResult };
}

const POST = (body: unknown) =>
  handleCerfaPdfRequest(
    new Request("http://localhost/api/lmnp/declaration/cerfa-pdf", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    async () => ({ ok: true }),
  );

describe("SAV-032 — bouclage 2033-B : wrapper PDF fail-closed", () => {
  it("bloc bouclé → PDF généré", async () => {
    const result = await generateCerfa2033BFromRfs({ rfs: buildScenarioRfs(), declarationVersionId: "v1" });
    assert.equal(result.status, "generated");
    assert.equal(result.form2033B.balancing.status, "BALANCED");
  });

  it("bloc non bouclé → bloqué, violation `bouclage-resultat-fiscal`, aucun octet de PDF", async () => {
    const result = await generateCerfa2033BFromRfs({ rfs: brokenRfs(), declarationVersionId: "v1" });
    assert.equal(result.status, "blocked");
    if (result.status !== "blocked") return;
    assert.equal(result.form2033B.balancing.status, "UNBALANCED");
    assert.deepEqual(result.violations.map((violation) => violation.code), ["bouclage-resultat-fiscal"]);
    assert.ok(!("pdfBytes" in result));
  });

  it("FiscalResult antérieur à P0-39C (neutralisation non établie) → bloqué, jamais un PDF sans 330/350/352/370", async () => {
    const result = await generateCerfa2033BFromRfs({ rfs: legacyRfs(), declarationVersionId: "v1" });
    assert.equal(result.status, "blocked");
    if (result.status !== "blocked") return;
    assert.equal(result.form2033B.balancing.status, "UNAVAILABLE");
    assert.equal(result.violations[0]?.code, "bouclage-resultat-fiscal");
  });
});

describe("SAV-032 — bouclage 2033-B : route Cerfa fail-closed", () => {
  it("RFS bouclée → 200 application/pdf", async () => {
    const response = await POST({ rfs: buildScenarioRfs(), declarationVersionId: "v1", forms: ["2033-B-SD"] });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
  });

  it("RFS non bouclée → 422 `blocked` (frontière de déclarabilité : internal_projection_issue), aucun PDF", async () => {
    // La route applique d'abord `resolveFinalDeclarabilityState` (NEXT-5) : le bloc non bouclé y est une issue de projection
    // interne, donc le refus survient AVANT toute génération. Le wrapper 2033-B reste, lui, gardé par `bouclage-resultat-fiscal`.
    const response = await POST({ rfs: brokenRfs(), declarationVersionId: "v1", forms: ["2033-B-SD"] });
    assert.equal(response.status, 422);
    assert.notEqual(response.headers.get("content-type"), "application/pdf");
    const body = (await response.json()) as { status: string; reason?: string };
    assert.equal(body.status, "blocked");
    assert.equal(body.reason, "internal_projection_issue");
  });

  it("RFS d'un FiscalResult antérieur à P0-39C → 422 (bouclage non établi), aucun PDF", async () => {
    const response = await POST({ rfs: legacyRfs(), declarationVersionId: "v1", forms: ["2033-B-SD"] });
    assert.equal(response.status, 422);
    assert.notEqual(response.headers.get("content-type"), "application/pdf");
  });
});

describe("SAV-032 — ORACLE C : le garde `case-sans-mapping-visuel` n'est PAS neutralisé", () => {
  const caseOf = (caseId: string, value: number) => ({
    caseId,
    label: caseId,
    value,
    trace: { source: "FiscalResult" as const, path: "test", ksArtifacts: [] },
  });

  it("une case réellement inconnue bloque toujours", async () => {
    const result = await generateCerfaLiassePdf({ millesime: 2026, forms: [{ form: "2033-B-SD", cases: [caseOf("218", 1), caseOf("CASE_QUI_N_EXISTE_PAS", 1)] }] });
    assert.equal(result.status, "blocked");
    if (result.status !== "blocked") return;
    assert.ok(result.violations.some((violation) => violation.code === "case-sans-mapping-visuel" && violation.caseId === "CASE_QUI_N_EXISTE_PAS"));
  });

  it("354 (vide par neutralisation, absente du registre) : sa production reste bloquée", async () => {
    const result = await generateCerfaLiassePdf({ millesime: 2026, forms: [{ form: "2033-B-SD", cases: [caseOf("354", 1)] }] });
    assert.equal(result.status, "blocked");
    if (result.status !== "blocked") return;
    assert.equal(result.violations[0]?.code, "case-sans-mapping-visuel");
  });
});
