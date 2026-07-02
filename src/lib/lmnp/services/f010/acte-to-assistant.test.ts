import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { acteExtractionToF010Prefill } from "./acte-to-assistant";

describe("F-010 — adaptateur acte → Assistant", () => {
  it("mappe les champs de l'acte vers les entrées de l'Assistant", () => {
    const prefill = acteExtractionToF010Prefill({
      propertyPurchasePrice: 280000,
      notaryFees: 19500,
      acquisitionDate: "2024-03-01",
      surfaceM2: 58,
      propertyType: "appartement",
      propertyAddress: "12 rue de la Paix",
      propertyPostalCode: "75002",
      propertyCity: "Paris",
    });
    assert.equal(prefill.prixAcquisition, 280000);
    assert.equal(prefill.fraisNotaire, 19500);
    assert.equal(prefill.dateAcquisition, "2024-03-01");
    assert.equal(prefill.surface, 58);
    assert.equal(prefill.typeBien, "appartement");
    assert.equal(prefill.adresse, "12 rue de la Paix, 75002 Paris");
  });

  it("classe une maison et laisse 'autre' pour un type inconnu", () => {
    assert.equal(acteExtractionToF010Prefill({ propertyType: "maison" }).typeBien, "maison");
    assert.equal(acteExtractionToF010Prefill({ propertyType: "terrain" }).typeBien, "autre");
    assert.equal(acteExtractionToF010Prefill({}).typeBien, undefined);
  });
});
