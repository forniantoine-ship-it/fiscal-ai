/**
 * R2C.3c1 — défense en profondeur Cerfa : une RFS portant le marqueur multi (`immobilisationsParBien` défini)
 * est refusée tant que la capacité de livraison multi est fermée (MULTI_PROPERTY_CAPABILITIES.delivery = false). Mono : chemin historique (voir route.test.ts).
 *
 * Run: npx tsx --test src/app/api/lmnp/declaration/cerfa-pdf/route.multi-barrier.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { handleCerfaPdfRequest } from "./handler";

const post = (body: unknown, onAccess?: () => void) =>
  handleCerfaPdfRequest(
    new Request("http://localhost/api/lmnp/declaration/cerfa-pdf", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    async () => { onAccess?.(); return { ok: true }; },
  );

describe("R2C.3c1 — Cerfa PDF : marqueur multi", () => {
  it("S16 — RFS avec immobilisationsParBien → 422 blocked multi_property_not_enabled, aucun PDF", async () => {
    const res = await post({
      rfs: { exercice: 2025, immobilisationsParBien: [{ propertyId: "A" }, { propertyId: "B" }] },
      declarationVersionId: "v1",
      forms: ["2033-A-SD"],
    });
    assert.equal(res.status, 422);
    const body = (await res.json()) as { status: string; reason: string };
    assert.equal(body.status, "blocked");
    assert.equal(body.reason, "multi_property_not_enabled");
    assert.notEqual(res.headers.get("content-type"), "application/pdf");
  });

  it("S17 — RFS sans marqueur : la barrière multi ne s'applique pas (chemin historique : ici refus de validation 400, pas 422 multi)", async () => {
    const res = await post({ rfs: { exercice: 2025 }, forms: ["2033-A-SD"] });
    assert.equal(res.status, 400);
    const res2 = await post({ rfs: { exercice: 2025, immobilisationsParBien: undefined }, declarationVersionId: "v1", forms: ["nope"] });
    assert.equal(res2.status, 400);
  });
});
