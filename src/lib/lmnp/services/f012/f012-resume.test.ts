import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveF012ResumeDecision } from "./f012-resume";
import type { F012PersistedState } from "@/runtime";

const TS = "2024-03-01T10:00:00.000Z";

function persisted(step: F012PersistedState["step"]): F012PersistedState {
  return {
    step,
    categoryInventory: [],
    currentCategoryIndex: 0,
    collected: { coproLignes: [], travaux: [], divers: [], skippedCategories: [] },
    fieldSources: {},
    updatedAt: TS,
  };
}

describe("resolveF012ResumeDecision — Cycle 2", () => {
  it("I — aucun blob (ancien dossier) → départ simple, jamais un crash", () => {
    assert.deepEqual(resolveF012ResumeDecision({ persisted: undefined, isLegacyComplete: false }), { kind: "start" });
  });

  it("ordre imposé : une session en cours prime toujours sur le raccourci « déjà complet »", () => {
    const decision = resolveF012ResumeDecision({
      persisted: persisted("category_collect"),
      isLegacyComplete: true,
    });
    assert.deepEqual(decision, { kind: "resume_step" });
  });

  it("aucune session en cours + déjà complet (ancien blob `chargesAssistant`) → raccourci legacy", () => {
    const decision = resolveF012ResumeDecision({ persisted: undefined, isLegacyComplete: true });
    assert.deepEqual(decision, { kind: "legacy_complete" });
  });

  it("un blob figé sur `complete` ne déclenche pas la reprise — le raccourci legacy prend le relais", () => {
    const decision = resolveF012ResumeDecision({ persisted: persisted("complete"), isLegacyComplete: true });
    assert.deepEqual(decision, { kind: "legacy_complete" });
  });

  it("A — aucun progrès (`profilage` non soumis) et pas encore complet → départ simple", () => {
    const decision = resolveF012ResumeDecision({ persisted: persisted("profilage"), isLegacyComplete: false });
    assert.deepEqual(decision, { kind: "start" });
  });
});
