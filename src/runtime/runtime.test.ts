import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { validateSiret } from "./capabilities/f009/validate-siret";
import { explainMiseEnService } from "./capabilities/f009/explain-mise-en-service";

describe("F-009 — transforms", () => {
  it("validates a correct SIRET", () => {
    const result = validateSiret({ siret: "73282932000074" });
    assert.equal(result.valid, true);
    assert.equal(result.normalized, "73282932000074");
  });

  it("rejects an invalid SIRET", () => {
    const result = validateSiret({ siret: "12345678901234" });
    assert.equal(result.valid, false);
  });

  it("explains mise en service prorata", () => {
    const result = explainMiseEnService(
      {
        dateDebutActivite: "2024-03-01",
        dateMiseEnService: "2024-04-15",
      },
      2025,
    );
    assert.ok(result.daysInService > 0);
    assert.ok(result.prorataPercent > 0);
    assert.match(result.explanation, /prorata/i);
  });
});
