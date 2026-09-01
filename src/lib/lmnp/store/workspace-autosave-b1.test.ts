/**
 * B1-1 — autosave display honesty + critical F010 flush steps.
 * Run: npx tsx --test src/lib/lmnp/store/workspace-autosave-b1.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveAutosaveDisplay } from "./workspace-autosave-display";
import {
  F010_CRITICAL_PERSIST_STEPS,
  shouldFlushF010PersistedStep,
} from "@/lib/lmnp/services/f010/f010-critical-persist";

describe("resolveAutosaveDisplay", () => {
  it("sans userId : jamais « Dossier enregistré » — avertit que le dossier n'est pas persisté", () => {
    const warning = {
      label: "Non enregistré — connectez-vous pour conserver votre dossier",
      tone: "error" as const,
    };
    assert.deepEqual(resolveAutosaveDisplay("saved", null), warning);
    assert.deepEqual(resolveAutosaveDisplay("idle", null), warning);
    assert.deepEqual(resolveAutosaveDisplay("error", null), warning);
    assert.notEqual(resolveAutosaveDisplay("saved", null)?.label, "Dossier enregistré");
  });

  it("sans userId : « Enregistrement en cours… » uniquement pendant saving", () => {
    assert.deepEqual(resolveAutosaveDisplay("saving", null), {
      label: "Enregistrement en cours…",
      tone: "saving",
    });
  });

  it("avec userId : affiche l'état réel", () => {
    assert.deepEqual(resolveAutosaveDisplay("saved", "user-1"), {
      label: "Dossier enregistré",
      tone: "saved",
    });
    assert.deepEqual(resolveAutosaveDisplay("saving", "user-1"), {
      label: "Enregistrement…",
      tone: "saving",
    });
  });
});

describe("F010 critical flush steps", () => {
  it("inclut review_extraction, review_plan et complete", () => {
    assert.equal(F010_CRITICAL_PERSIST_STEPS.has("review_extraction"), true);
    assert.equal(F010_CRITICAL_PERSIST_STEPS.has("review_plan"), true);
    assert.equal(F010_CRITICAL_PERSIST_STEPS.has("complete"), true);
    assert.equal(shouldFlushF010PersistedStep("ventilation"), false);
    assert.equal(shouldFlushF010PersistedStep("collect_bien"), false);
  });
});
