import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * R13.1A — declaration.freshness === "fresh" proves only that a generation
 * happened and declarationGeneratedAt is still set; it never proves the
 * numbers are currently, numerically verified (that needs the gate's live
 * F006/F007/RFS preview, which V3 must never call at render — see V3-R13.0
 * audit). No V3-rendered string may claim otherwise.
 */
describe("V3 declaration freshness copy — R13.1A", () => {
  it("A — the old overclaiming label is gone from V2Prototype.tsx", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(new URL("./V2Prototype.tsx", import.meta.url), "utf8");
    assert.equal(source.includes("Calcul à jour"), false);
  });

  it("B — no user-facing V3 string overclaims certainty from declarationGeneratedAt alone", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(new URL("./V2Prototype.tsx", import.meta.url), "utf8");
    for (const forbidden of ["Calcul à jour", "Déclaration à jour", "Calcul vérifié", "Prêt à transmettre"]) {
      assert.equal(source.includes(forbidden), false, `V2Prototype.tsx ne doit jamais afficher « ${forbidden} »`);
    }
    // The "fresh" branch's replacement label — exactly what declarationGeneratedAt supports.
    assert.ok(source.includes('freshness === "fresh" ? <Pill tone="green">Déclaration générée</Pill>'));
  });

  it("C — no new call into the live gate/generation pipeline was introduced", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(new URL("./V2Prototype.tsx", import.meta.url), "utf8");
    const code = source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const forbidden of [
      "resolveDeclarationGenerationGate(", "runDeclarationGeneration(", "produceFiscalResult(",
      "produceLiasse(", "assembleLiasseFromRfs(",
    ]) {
      assert.equal(code.includes(forbidden), false, `V2Prototype.tsx ne doit jamais appeler ${forbidden}`);
    }
  });
});
