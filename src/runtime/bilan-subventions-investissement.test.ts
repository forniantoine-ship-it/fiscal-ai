/**
 * MICRO-JALON P1-A — resolveSubventionsInvestissement() (case 137).
 * Run: npx tsx --test src/runtime/bilan-subventions-investissement.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveSubventionsInvestissement } from "./capabilities/bilan/subventions-investissement";

describe("resolveSubventionsInvestissement — case 137", () => {
  it("A — absent → INCONNU", () => {
    const res = resolveSubventionsInvestissement(undefined);
    assert.equal(res.status, "INCONNU");
  });

  it("B — explicitement nul → NUL_CONFIRME, montant 0", () => {
    const res = resolveSubventionsInvestissement({ status: "NUL_CONFIRME" });
    assert.equal(res.status, "NUL_CONFIRME");
    assert.equal((res as { montant: number }).montant, 0);
  });

  it("C — déclaré → DECLARE + montant exact", () => {
    const res = resolveSubventionsInvestissement({ status: "DECLARE", montant: 2500 });
    assert.equal(res.status, "DECLARE");
    assert.equal((res as { montant: number }).montant, 2500);
  });

  it("la raison mentionne explicitement la case 137, pour toute confusion évitée avec un autre poste patrimonial", () => {
    const res = resolveSubventionsInvestissement(undefined);
    assert.ok(res.raison.includes("137"));
  });
});
