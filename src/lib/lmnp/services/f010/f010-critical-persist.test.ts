/**
 * Réserve 2 (audit F010 dateMiseEnService, Option B) — `blocked_missing_date`
 * doit être flushé immédiatement comme `review_plan`/`review_extraction`/
 * `complete` : c'est le point où toutes les réponses F010 viennent d'être
 * saisies, seule la précondition F-009 manque encore.
 * Run: npx tsx --test src/lib/lmnp/services/f010/f010-critical-persist.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { shouldFlushF010PersistedStep } from "./f010-critical-persist";
import type { F010State } from "@/runtime";

describe("shouldFlushF010PersistedStep", () => {
  const criticalSteps: F010State["step"][] = [
    "review_extraction",
    "review_plan",
    "blocked_missing_date",
    "complete",
  ];

  for (const step of criticalSteps) {
    it(`flush immédiat requis pour '${step}'`, () => {
      assert.equal(shouldFlushF010PersistedStep(step), true);
    });
  }

  const nonCriticalSteps: F010State["step"][] = [
    "orientation",
    "coming_soon",
    "acquisition_source",
    "collect_bien",
    "collect_frais",
    "collect_mobilier",
    "ventilation",
  ];

  for (const step of nonCriticalSteps) {
    it(`pas de flush critique pour '${step}' (debounce normal suffit)`, () => {
      assert.equal(shouldFlushF010PersistedStep(step), false);
    });
  }
});
