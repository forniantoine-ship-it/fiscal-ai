import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { shouldFlushF011PersistedStep } from "./f011-critical-persist";

describe("shouldFlushF011PersistedStep — Cycle 2 (O) / Cycle 5", () => {
  it("flush immédiat aux étapes coûteuses à reconstruire", () => {
    assert.equal(shouldFlushF011PersistedStep("loan_review"), true);
    assert.equal(shouldFlushF011PersistedStep("aggregate_review"), true);
    assert.equal(shouldFlushF011PersistedStep("complete"), true);
  });

  it("Cycle 5 — flush immédiat dès le lancement de l'analyse, avant l'appel OCR/GPT", () => {
    assert.equal(shouldFlushF011PersistedStep("loan_analyzing"), true);
    assert.equal(shouldFlushF011PersistedStep("loan_review_extraction"), true);
  });

  it("pas de flush immédiat aux étapes bon marché à reposer (l'autosave debounced suffit)", () => {
    assert.equal(shouldFlushF011PersistedStep("presence_emprunt"), false);
    assert.equal(shouldFlushF011PersistedStep("nombre_prets"), false);
    assert.equal(shouldFlushF011PersistedStep("loan_source_choice"), false);
    assert.equal(shouldFlushF011PersistedStep("loan_upload"), false);
    assert.equal(shouldFlushF011PersistedStep("loan_type"), false);
    assert.equal(shouldFlushF011PersistedStep("loan_collect"), false);
    assert.equal(shouldFlushF011PersistedStep("loan_insurance"), false);
    assert.equal(shouldFlushF011PersistedStep("loan_guarantee"), false);
    assert.equal(shouldFlushF011PersistedStep("loan_fees"), false);
    assert.equal(shouldFlushF011PersistedStep("loan_ira"), false);
    assert.equal(shouldFlushF011PersistedStep("blocked_missing_date"), false);
    assert.equal(shouldFlushF011PersistedStep("skipped"), false);
  });
});
