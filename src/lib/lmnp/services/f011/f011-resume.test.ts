import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveF011ResumeDecision } from "./f011-resume";
import type { F011PersistedState } from "@/runtime";

const TS = "2024-03-01T10:00:00.000Z";

function persisted(step: F011PersistedState["step"]): F011PersistedState {
  return { step, currentLoanIndex: 0, loans: [], fieldSources: {}, updatedAt: TS };
}

describe("resolveF011ResumeDecision — Cycle 2", () => {
  it("J — aucun blob (ancien dossier) → départ simple, jamais un crash", () => {
    assert.deepEqual(resolveF011ResumeDecision({ persisted: undefined, isLegacyComplete: false }), { kind: "start" });
  });

  it("ordre imposé : une session en cours prime toujours sur le raccourci « déjà complet »", () => {
    const decision = resolveF011ResumeDecision({
      persisted: persisted("loan_guarantee"),
      isLegacyComplete: true,
    });
    assert.deepEqual(decision, { kind: "resume_step" });
  });

  it("aucune session en cours + déjà complet → raccourci legacy", () => {
    const decision = resolveF011ResumeDecision({ persisted: undefined, isLegacyComplete: true });
    assert.deepEqual(decision, { kind: "legacy_complete" });
  });

  it("F011-2 — un blob figé sur `complete` reprend le vrai état persisté (prêts + history), jamais le repli synthétique", () => {
    const decision = resolveF011ResumeDecision({ persisted: persisted("complete"), isLegacyComplete: true });
    assert.deepEqual(decision, { kind: "resume_complete" });
  });

  it("F011-2 — `complete` sans flag legacy (nouveau dossier) reprend quand même le vrai état persisté", () => {
    const decision = resolveF011ResumeDecision({ persisted: persisted("complete"), isLegacyComplete: false });
    assert.deepEqual(decision, { kind: "resume_complete" });
  });

  it("aucun progrès (`presence_emprunt`) et pas encore complet → départ simple", () => {
    const decision = resolveF011ResumeDecision({ persisted: persisted("presence_emprunt"), isLegacyComplete: false });
    assert.deepEqual(decision, { kind: "start" });
  });

  it("Cycle 23 — achat comptant persisté (`skipped` + creditDeclaredNoneAt) → raccourci skipped, jamais un redémarrage", () => {
    const decision = resolveF011ResumeDecision({
      persisted: persisted("skipped"),
      isLegacyComplete: false,
      isLegacySkipped: true,
    });
    assert.deepEqual(decision, { kind: "legacy_skipped" });
  });

  it("Cycle 23 — `skipped` sans drapeau legacy → départ simple (état incomplet / abandonné)", () => {
    const decision = resolveF011ResumeDecision({
      persisted: persisted("skipped"),
      isLegacyComplete: false,
      isLegacySkipped: false,
    });
    assert.deepEqual(decision, { kind: "start" });
  });

  it("Cycle 23 — session en cours prime encore sur un achat comptant déjà déclaré", () => {
    const decision = resolveF011ResumeDecision({
      persisted: persisted("loan_guarantee"),
      isLegacyComplete: false,
      isLegacySkipped: true,
    });
    assert.deepEqual(decision, { kind: "resume_step" });
  });
});
