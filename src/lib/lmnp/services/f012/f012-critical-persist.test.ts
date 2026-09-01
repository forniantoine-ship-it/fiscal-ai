import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { shouldFlushF012PersistedStep } from "./f012-critical-persist";

describe("shouldFlushF012PersistedStep — Cycle 2", () => {
  it("flush immédiat aux étapes coûteuses à reconstruire", () => {
    assert.equal(shouldFlushF012PersistedStep("aggregate_review"), true);
    assert.equal(shouldFlushF012PersistedStep("complete"), true);
  });

  it("pas de flush immédiat aux étapes bon marché à reposer (l'autosave debounced suffit)", () => {
    assert.equal(shouldFlushF012PersistedStep("profilage"), false);
    assert.equal(shouldFlushF012PersistedStep("category_collect"), false);
    assert.equal(shouldFlushF012PersistedStep("completeness"), false);
  });
});
