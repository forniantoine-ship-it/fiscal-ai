/**
 * MICRO-JALON P1-A — resolveLignePatrimoniale() : abstraction générique à
 * 4 états (DECLARE / NUL_CONFIRME / NON_APPLICABLE / INCONNU).
 * Run: npx tsx --test src/runtime/bilan-ligne-patrimoniale.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveLignePatrimoniale } from "./capabilities/bilan/ligne-patrimoniale";

describe("resolveLignePatrimoniale — 4 états, NO SILENT ZERO", () => {
  it("input undefined → INCONNU, jamais NUL_CONFIRME ni NON_APPLICABLE par défaut", () => {
    const res = resolveLignePatrimoniale(undefined, "Test");
    assert.equal(res.status, "INCONNU");
  });

  it("{ status: 'INCONNU' } explicite → INCONNU", () => {
    const res = resolveLignePatrimoniale({ status: "INCONNU" }, "Test");
    assert.equal(res.status, "INCONNU");
  });

  it("NUL_CONFIRME → montant 0, statut distinct d'INCONNU et de NON_APPLICABLE", () => {
    const res = resolveLignePatrimoniale({ status: "NUL_CONFIRME" }, "Test");
    assert.equal(res.status, "NUL_CONFIRME");
    assert.equal((res as { montant: number }).montant, 0);
  });

  it("NON_APPLICABLE → montant 0, statut distinct de NUL_CONFIRME", () => {
    const res = resolveLignePatrimoniale({ status: "NON_APPLICABLE" }, "Test");
    assert.equal(res.status, "NON_APPLICABLE");
    assert.equal((res as { montant: number }).montant, 0);
    assert.notEqual(res.status, "NUL_CONFIRME", "NON_APPLICABLE et NUL_CONFIRME ne doivent jamais être confondus, même si le montant contribué est identique (0)");
  });

  it("DECLARE → montant retenu tel quel", () => {
    const res = resolveLignePatrimoniale({ status: "DECLARE", montant: 2500 }, "Test");
    assert.equal(res.status, "DECLARE");
    assert.equal((res as { montant: number }).montant, 2500);
  });

  it("chaque résolution porte une raison traçable, y compris INCONNU", () => {
    for (const input of [undefined, { status: "INCONNU" as const }, { status: "NUL_CONFIRME" as const }, { status: "NON_APPLICABLE" as const }, { status: "DECLARE" as const, montant: 100 }]) {
      const res = resolveLignePatrimoniale(input, "Test");
      assert.ok(res.raison.length > 0, `raison manquante pour ${JSON.stringify(input)}`);
    }
  });
});
