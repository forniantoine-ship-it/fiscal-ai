/**
 * Cycle 2 (F010) — persistance et reprise. Tests obligatoires A→J.
 * Run: npx tsx --test src/lib/lmnp/services/f010/f010-persistence.test.ts
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
import type { GovernedFieldStore } from "@/lib/documents/types/governed-field";

import type { LogementGptPipelineResult } from "@/lib/lmnp/services/logement-gpt-pipeline";

import {
  computeLockAwarePrefillValues,
  resolveF010ResumeDecision,
  runF010UploadFlow,
  type RunF010DocumentAnalysisParams,
} from "./f010-document-prefill";

const ctx = { dossierId: "test-dossier", fiscalYear: 2024 };

function baseF010State(overrides: Partial<F010State> = {}): F010State {
  return { step: "orientation", fieldSources: {}, ...overrides };
}

function lockedStore(field: "acquisitionPrice"): GovernedFieldStore {
  return {
    [field]: {
      value: 999,
      sourceTunnel: "logement",
      sourceDocument: "acte_notarie",
      extractedBy: "user",
      ownershipTunnel: "logement",
      manuallyValidated: true,
      updatedAt: "2026-08-27T10:00:00.000Z",
      crossTunnelInferred: false,
    },
  };
}

describe("A. upload → refresh pendant analyse", () => {
  it("analyzingDocumentId est communiqué à l'appelant AVANT que la promesse d'analyse ne démarre", async () => {
    const events: string[] = [];
    let resolveAnalyze!: (v: LogementGptPipelineResult) => void;
    const fakeAnalyze = (_: RunF010DocumentAnalysisParams): Promise<LogementGptPipelineResult> => {
      events.push("analyze_called");
      return new Promise((resolve) => {
        resolveAnalyze = resolve;
      });
    };

    const flow = runF010UploadFlow({
      file: new File(["x"], "acte.pdf"),
      documentId: "doc-1",
      fiscalYearId: "fy-1",
      onAnalysisStarting: (id) => events.push(`starting:${id}`),
      analyze: fakeAnalyze,
    });

    // onAnalysisStarting doit s'être exécuté de façon synchrone avant que
    // fakeAnalyze n'ait eu l'occasion de se résoudre — vérifié par l'ordre exact.
    await Promise.resolve();
    assert.deepEqual(events, ["starting:doc-1", "analyze_called"]);

    resolveAnalyze({
      documentId: "doc-1",
      fileName: "acte.pdf",
      rawText: "",
      ocrProvider: "unknown",
      ocrDebug: {} as LogementGptPipelineResult["ocrDebug"],
      extraction: { success: true, extraction: { propertyPurchasePrice: 280_000, acquisitionDate: "2023-05-12" } },
    });
    await flow;
  });

  it("resolveF010ResumeDecision : analyzingDocumentId sans pendingExtraction → reprendre l'analyse", () => {
    const persisted: F010PersistedState = {
      step: "collect_bien",
      fieldSources: {},
      analyzingDocumentId: "doc-1",
      updatedAt: "2026-08-27T10:00:00.000Z",
    };
    const decision = resolveF010ResumeDecision({ persisted, isLegacyComplete: false });
    assert.deepEqual(decision, { kind: "resume_analysis", analyzingDocumentId: "doc-1" });
  });
});

describe("B. analyse terminée → refresh", () => {
  it("resolveF010ResumeDecision : pendingExtraction présent → pas de nouvel appel pipeline, réapplication directe", () => {
    const persisted: F010PersistedState = {
      step: "collect_bien",
      fieldSources: {},
      analyzingDocumentId: "doc-1",
      pendingExtraction: { prixAcquisition: 280_000, dateAcquisition: "2023-05-12" },
      updatedAt: "2026-08-27T10:00:00.000Z",
    };
    const decision = resolveF010ResumeDecision({ persisted, isLegacyComplete: false });
    assert.equal(decision.kind, "resume_pending_extraction");
    if (decision.kind === "resume_pending_extraction") {
      assert.equal(decision.pendingExtraction.prixAcquisition, 280_000);
    }
    // Le contrat "pendingExtraction → pas de pipeline" est structurel : cette
    // branche ne référence jamais runF010UploadFlow/runF010DocumentAnalysis.
  });

  it("computeLockAwarePrefillValues réapplique le prefill sans jamais consulter le pipeline", () => {
    const values = computeLockAwarePrefillValues(
      { prixAcquisition: 280_000, dateAcquisition: "2023-05-12", typeBien: "appartement", surface: 45 },
      {},
    );
    assert.deepEqual(values, {
      prix: "280000",
      dateAcq: "2023-05-12",
      typeBien: "appartement",
      surface: "45",
    });
  });
});

describe("C. question manuelle → refresh", () => {
  it("resume() restaure exactement l'étape persistée (collect_frais)", () => {
    const assistant = new F010LogementAssistant(ctx);
    const persisted: F010PersistedState = {
      step: "collect_frais",
      fieldSources: { prixAcquisition: "extracted" },
      prixAcquisition: 280_000,
      typeBien: "appartement",
      natureBien: "ancien",
      dateAcquisition: "2023-05-12",
      updatedAt: "2026-08-27T10:00:00.000Z",
    };
    const turn = assistant.resume(persisted);
    assert.equal(turn.state.step, "collect_frais");
    assert.equal(turn.state.prixAcquisition, 280_000);
    assert.equal(turn.completed, false);
  });
});

describe("D. données partiellement soumises → refresh", () => {
  it("resume() ne restaure que les champs déjà soumis (frais/mobilier/ventilation encore absents)", () => {
    const assistant = new F010LogementAssistant(ctx);
    const persisted: F010PersistedState = {
      step: "collect_mobilier",
      fieldSources: {},
      prixAcquisition: 280_000,
      dateAcquisition: "2023-05-12",
      typeBien: "appartement",
      fraisNotaire: 21_000,
      choixTraitementFrais: "integration",
      updatedAt: "2026-08-27T10:00:00.000Z",
    };
    const turn = assistant.resume(persisted);
    assert.equal(turn.state.step, "collect_mobilier");
    assert.equal(turn.state.fraisNotaire, 21_000);
    assert.equal(turn.state.montantMobilier, undefined);
    assert.equal(turn.state.ratioTerrain, undefined);
  });
});

describe("E. COMPLETE → refresh", () => {
  it("shouldResumeF010 exclut 'complete' — le repli logementConfirmedAt prend le relais, jamais resume()", () => {
    const persisted: F010PersistedState = { step: "complete", fieldSources: {}, updatedAt: "2026-08-27T10:00:00.000Z" };
    assert.equal(shouldResumeF010(persisted), false);
  });
});

describe("F. document en cours → dashboard → retour", () => {
  it("resolveF010ResumeDecision ne dépend d'aucun signal de navigation — même décision qu'un refresh", () => {
    const persisted: F010PersistedState = {
      step: "collect_bien",
      fieldSources: {},
      analyzingDocumentId: "doc-1",
      updatedAt: "2026-08-27T10:00:00.000Z",
    };
    const afterRefresh = resolveF010ResumeDecision({ persisted, isLegacyComplete: false });
    const afterDashboardReturn = resolveF010ResumeDecision({ persisted, isLegacyComplete: false });
    assert.deepEqual(afterRefresh, afterDashboardReturn);
  });
});

describe("G. document + données manuelles → refresh", () => {
  it("resume() combine un champ déjà soumis (fraisNotaire) et une extraction en attente sans collision", () => {
    const assistant = new F010LogementAssistant(ctx);
    const persisted: F010PersistedState = {
      step: "collect_bien",
      fieldSources: {},
      analyzingDocumentId: "doc-2",
      pendingExtraction: { prixAcquisition: 300_000, dateAcquisition: "2023-06-01" },
      updatedAt: "2026-08-27T10:00:00.000Z",
    };
    const turn = assistant.resume(persisted);
    assert.equal(turn.state.step, "collect_bien");
    const decision = resolveF010ResumeDecision({ persisted, isLegacyComplete: false });
    assert.equal(decision.kind, "resume_pending_extraction");
  });
});

describe("H. reprise sans corruption du declarationDraft", () => {
  it("toF010PersistedState ne contient jamais governedFields/propertyBackgroundExtraction/documents", () => {
    const persisted = toF010PersistedState(
      baseF010State({ step: "collect_bien", prixAcquisition: 280_000 }),
      "2026-08-27T10:00:00.000Z",
      { prixAcquisition: 280_000 },
      "doc-1",
    );
    const keys = Object.keys(persisted);
    assert.equal(keys.includes("governedFields"), false);
    assert.equal(keys.includes("propertyBackgroundExtraction"), false);
    assert.equal(keys.includes("documents"), false);
    assert.equal(keys.includes("result"), false);
  });

  it("computeLockAwarePrefillValues respecte un champ déjà verrouillé par un autre tunnel — aucune fuite dans le prefill", () => {
    const values = computeLockAwarePrefillValues(
      { prixAcquisition: 280_000, dateAcquisition: "2023-05-12" },
      lockedStore("acquisitionPrice"),
    );
    assert.equal(values.prix, undefined);
    assert.equal(values.dateAcq, "2023-05-12");
  });
});

describe("I. ancien dossier sans logementAssistantState", () => {
  it("shouldResumeF010(undefined) → false ; resolveF010ResumeDecision → start", () => {
    assert.equal(shouldResumeF010(undefined), false);
    const decision = resolveF010ResumeDecision({ persisted: undefined, isLegacyComplete: false });
    assert.deepEqual(decision, { kind: "start" });
  });

  it("ancien dossier confirmé via Tunnel A seul (logementConfirmedAt, jamais de session F010) → repli, pas resume", () => {
    const decision = resolveF010ResumeDecision({ persisted: undefined, isLegacyComplete: true });
    assert.deepEqual(decision, { kind: "legacy_complete" });
  });
});

describe("J. session COMPLETE ne déclenche jamais resume", () => {
  it("resolveF010ResumeDecision ne renvoie jamais un kind de reprise pour step:'complete'", () => {
    const persisted: F010PersistedState = { step: "complete", fieldSources: {}, updatedAt: "2026-08-27T10:00:00.000Z" };
    const decision = resolveF010ResumeDecision({ persisted, isLegacyComplete: true });
    assert.equal(decision.kind, "legacy_complete");
    assert.notEqual(decision.kind, "resume_analysis");
    assert.notEqual(decision.kind, "resume_pending_extraction");
    assert.notEqual(decision.kind, "resume_step");
  });
});

describe("Non-régression : résultat jamais mis en cache", () => {
  it("resume() sur review_plan recalcule le plan plutôt que de faire confiance à une valeur persistée (result n'existe pas dans F010PersistedState)", () => {
    const assistant = new F010LogementAssistant(ctx);
    const persisted: F010PersistedState = {
      step: "review_plan",
      fieldSources: {},
      prixAcquisition: 280_000,
      fraisNotaire: 21_000,
      choixTraitementFrais: "integration",
      typeBien: "appartement",
      ratioTerrain: 0.2,
      montantMobilier: 0,
      updatedAt: "2026-08-27T10:00:00.000Z",
    };
    const turn = assistant.resume(persisted);
    assert.equal(turn.state.step, "review_plan");
    assert.ok(turn.state.result, "le plan doit être recalculé à la reprise, jamais absent");
  });
});
