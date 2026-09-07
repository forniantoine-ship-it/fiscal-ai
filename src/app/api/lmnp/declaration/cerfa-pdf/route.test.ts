/**
 * P1-1 — pont serveur RFS → moteur CERFA existant.
 * Run: npx tsx --test src/app/api/lmnp/declaration/cerfa-pdf/route.test.ts
 *
 * Aucun RFS ni moteur fabriqué à la main : chaque fixture provient d'un vrai
 * appel à runDeclarationGeneration() (même chemin que ValidationDocumentStep.tsx
 * en production), et la route appelle réellement generateCerfa2033AFromRfs()/
 * generateCerfa2033BFromRfs() (aucun mock).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { POST } from "./route";
import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import { generateCerfa2033AFromRfs } from "@/lib/lmnp/services/liasse-pdf";
import type { DeclarationDraft } from "@/lib/lmnp/types/domain";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";

function generationReadyDraft(overrides: Partial<DeclarationDraft> = {}): DeclarationDraft {
  return {
    completedSteps: [],
    siret: "12345678901234",
    siren: "123456789",
    exploitantFirstName: "Marie",
    exploitantLastName: "Dupont",
    dateMiseEnService: "2020-01-01",
    revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
    chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
    amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1500, status: "validated" },
    ...overrides,
  } as DeclarationDraft;
}

function realRfs(overrides: Partial<DeclarationDraft> = {}): FiscalRepresentation {
  const generation = runDeclarationGeneration(generationReadyDraft(overrides), 2025);
  assert.equal(generation.status, "generated", "précondition — le fixture doit être générable");
  if (generation.status !== "generated") throw new Error("unreachable");
  return generation.rfs;
}

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/lmnp/declaration/cerfa-pdf", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function isPdf(bytes: Uint8Array): boolean {
  return String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
}

describe("POST /api/lmnp/declaration/cerfa-pdf", () => {
  it("RFS valide, 2033-A-SD seul → 200 application/pdf, bytes non vides, vrai PDF", async () => {
    const rfs = realRfs();
    const response = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: ["2033-A-SD"] }));

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.ok(bytes.length > 0, "le PDF ne doit jamais être vide");
    assert.ok(isPdf(bytes), "la réponse doit être un vrai PDF (signature %PDF-)");
  });

  it("RFS valide, 2033-B-SD seul → 200 application/pdf, bytes non vides, vrai PDF", async () => {
    const rfs = realRfs();
    const response = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: ["2033-B-SD"] }));

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.ok(bytes.length > 0);
    assert.ok(isPdf(bytes));
  });

  it("2033-A-SD + 2033-B-SD ensemble → un seul PDF fusionné (plus de pages que 2033-A seul)", async () => {
    const rfs = realRfs();
    const { PDFDocument } = await import("pdf-lib");

    const soloA = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: ["2033-A-SD"] }));
    const soloABytes = new Uint8Array(await soloA.arrayBuffer());
    const soloADoc = await PDFDocument.load(soloABytes);

    const both = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: ["2033-A-SD", "2033-B-SD"] }));
    assert.equal(both.status, 200);
    assert.equal(both.headers.get("content-type"), "application/pdf");
    const bothBytes = new Uint8Array(await both.arrayBuffer());
    assert.ok(isPdf(bothBytes));
    const bothDoc = await PDFDocument.load(bothBytes);

    assert.ok(
      bothDoc.getPageCount() > soloADoc.getPageCount(),
      "le PDF combiné doit contenir au moins les pages de 2033-A ET de 2033-B",
    );
  });

  it("moteur bloqué (débordement réel — montant extrême) → pas de PDF, réponse 422 avec violations", async () => {
    // Reproduit une dérive réelle du gate (checkOverflow), pas une simulation :
    // un montant assez grand pour dépasser la largeur calibrée d'une case
    // 2033-B (312/370) déclenche "debordement-largeur" dans le moteur RÉEL.
    const rfs = realRfs({ revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 999999999999 } as never });

    const response = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: ["2033-B-SD"] }));

    assert.equal(response.status, 422);
    const payload = (await response.json()) as { status: string; violations: unknown[] };
    assert.equal(payload.status, "blocked");
    assert.ok(Array.isArray(payload.violations) && payload.violations.length > 0, "les violations du moteur doivent être transmises pour diagnostic");
  });

  it("entrée invalide — forms inconnu → 400", async () => {
    const rfs = realRfs();
    const response = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: ["2033-Z-SD"] }));
    assert.equal(response.status, 400);
  });

  it("entrée invalide — forms vide → 400", async () => {
    const rfs = realRfs();
    const response = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: [] }));
    assert.equal(response.status, 400);
  });

  it("entrée invalide — rfs manquant → 400", async () => {
    const response = await POST(jsonRequest({ declarationVersionId: "v1", forms: ["2033-A-SD"] }));
    assert.equal(response.status, 400);
  });

  it("entrée invalide — declarationVersionId manquant → 400", async () => {
    const rfs = realRfs();
    const response = await POST(jsonRequest({ rfs, forms: ["2033-A-SD"] }));
    assert.equal(response.status, 400);
  });

  it("entrée invalide — corps JSON malformé → 400", async () => {
    const request = new Request("http://localhost/api/lmnp/declaration/cerfa-pdf", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ceci n'est pas du json",
    });
    const response = await POST(request);
    assert.equal(response.status, 400);
  });

  it("délègue au moteur existant sans recalcul parallèle : le PDF produit par la route est identique (SHA-256) à un appel direct à generateCerfa2033AFromRfs()", async () => {
    const rfs = realRfs();
    const direct = await generateCerfa2033AFromRfs({ rfs, declarationVersionId: "v1" });
    assert.equal(direct.status, "generated");
    if (direct.status !== "generated") throw new Error("unreachable");

    const response = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: ["2033-A-SD"] }));
    const bytes = new Uint8Array(await response.arrayBuffer());
    const { createHash } = await import("node:crypto");
    const sha256 = createHash("sha256").update(bytes).digest("hex");

    assert.equal(
      sha256,
      direct.sha256,
      "même RFS, même appel au moteur existant → même PDF octet pour octet — la route ne doit ajouter, recalculer, ni modifier aucune donnée",
    );
  });
});
