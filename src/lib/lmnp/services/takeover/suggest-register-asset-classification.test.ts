/**
 * Run: npx tsx --test src/lib/lmnp/services/takeover/suggest-register-asset-classification.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { suggestRegisterAssetClassification } from "./suggest-register-asset-classification";

describe("suggestRegisterAssetClassification", () => {
  it("exact tokens", () => {
    assert.equal(suggestRegisterAssetClassification("terrain")?.classification, "terrain");
    assert.equal(suggestRegisterAssetClassification("Bâtiment")?.classification, "batiment");
    assert.equal(suggestRegisterAssetClassification("MOBILIER")?.classification, "mobilier");
    assert.equal(suggestRegisterAssetClassification("travaux")?.classification, "travaux");
  });

  it("immeuble keyword → batiment", () => {
    assert.equal(
      suggestRegisterAssetClassification("Immeuble rue de la Paix")?.classification,
      "batiment",
    );
  });

  it("fail closed on vague / unknown labels", () => {
    assert.equal(suggestRegisterAssetClassification(""), null);
    assert.equal(suggestRegisterAssetClassification("Matériel"), null);
    assert.equal(suggestRegisterAssetClassification("APPLE MACBOOK"), null);
  });
});
