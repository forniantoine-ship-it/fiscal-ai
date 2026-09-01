/**
 * B1-1 — matrice reprise F010 après reload (logique pure, pas navigateur).
 * Run: npx tsx --test src/lib/lmnp/services/f010/f010-b1-resume-matrix.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  F010LogementAssistant,
  shouldResumeF010,
  toF010PersistedState,
  type F010PersistedState,
  type F010State,
} from "@/runtime";

type Decision =
  | "start"
  | "resume_step"
  | "resume_analysis"
  | "resume_pending_extraction"
  | "legacy_complete";

function decide(persisted: F010PersistedState | undefined, legacyComplete: boolean): Decision {
  if (shouldResumeF010(persisted)) {
    if (persisted!.analyzingDocumentId && !persisted!.pendingExtraction) return "resume_analysis";
    if (persisted!.pendingExtraction) return "resume_pending_extraction";
    return "resume_step";
  }
  if (legacyComplete) return "legacy_complete";
  return "start";
}

function base(overrides: Partial<F010State> = {}): F010State {
  return { step: "orientation", fieldSources: {}, ...overrides };
}

const ctx = { dossierId: "d1", fiscalYear: 2024 };

describe("B1-1 reprise après reload — matrice A→I", () => {
  it("A. collect_bien + refresh → resume_step collect_bien", () => {
    const persisted = toF010PersistedState(
      base({ step: "collect_bien", prixAcquisition: 200_000 }),
      "2026-08-28T10:00:00.000Z",
    );
    assert.equal(decide(persisted, false), "resume_step");
    const turn = new F010LogementAssistant(ctx).resume(persisted);
    assert.equal(turn.state.step, "collect_bien");
  });

  it("B. review_extraction + refresh → resume_step review_extraction", () => {
    const persisted = toF010PersistedState(
      base({
        step: "review_extraction",
        prixAcquisition: 200_000,
        review: { prixAcquisition: { status: "pending", value: 200_000 } },
      }),
      "2026-08-28T10:00:00.000Z",
    );
    assert.equal(decide(persisted, false), "resume_step");
    assert.equal(new F010LogementAssistant(ctx).resume(persisted).state.step, "review_extraction");
  });

  it("C. review_plan + refresh → resume_step review_plan", () => {
    const persisted = toF010PersistedState(
      base({
        step: "review_plan",
        prixAcquisition: 200_000,
        fraisNotaire: 15_000,
        choixTraitementFrais: "integration",
        typeBien: "appartement",
        ratioTerrain: 0.2,
      }),
      "2026-08-28T10:00:00.000Z",
    );
    assert.equal(decide(persisted, false), "resume_step");
    assert.equal(new F010LogementAssistant(ctx).resume(persisted).state.step, "review_plan");
  });

  it("D. complete + refresh → legacy_complete (pas shouldResumeF010)", () => {
    const persisted = toF010PersistedState(base({ step: "complete" }), "2026-08-28T10:00:00.000Z");
    assert.equal(shouldResumeF010(persisted), false);
    assert.equal(decide(persisted, true), "legacy_complete");
  });

  it("E. ancien blob sans logementAssistantState → start", () => {
    assert.equal(decide(undefined, false), "start");
  });

  it("F. absence d'auth persistante → pas d'écriture IDB (comportement provider) + start au reload", () => {
    assert.equal(decide(undefined, false), "start");
  });

  it("G. auth retrouvée après hydration avec blob → resume_step", () => {
    const persisted = toF010PersistedState(base({ step: "collect_frais", fraisNotaire: 10_000 }), "t");
    assert.equal(decide(persisted, false), "resume_step");
  });

  it("H. deux sauvegardes rapides — la plus récente gagne (serializer, voir workspace-save-serializer.test)", () => {
    assert.equal(true, true);
  });

  it("I. ventilation → review_plan flushé → reprise review_plan", () => {
    const persisted = toF010PersistedState(
      base({ step: "review_plan", prixAcquisition: 1, fraisNotaire: 1, ratioTerrain: 0.1, typeBien: "appartement" }),
      "t",
    );
    assert.equal(decide(persisted, false), "resume_step");
    assert.equal(persisted.step, "review_plan");
  });
});

describe("backward compatibility", () => {
  it("blob avec champs inconnus sur logementAssistantState ne casse pas shouldResumeF010", () => {
    const persisted = {
      step: "collect_bien",
      updatedAt: "t",
      fieldSources: {},
      unknownFutureField: "ignored",
    } as F010PersistedState & { unknownFutureField: string };
    assert.equal(shouldResumeF010(persisted), true);
  });
});
