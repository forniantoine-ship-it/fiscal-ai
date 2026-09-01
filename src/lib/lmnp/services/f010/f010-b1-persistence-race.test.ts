/**
 * F010 B1 — reproduction logique persistance (hors navigateur, sans modifier la prod).
 *
 * Simule scheduleSaveWorkspace + saveWorkspace async pour tester :
 * - debounce 350ms
 * - race last-write-wins
 *
 * Run: npx tsx --test src/lib/lmnp/services/f010/f010-b1-persistence-race.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  shouldResumeF010,
  toF010PersistedState,
  type F010State,
} from "@/runtime";
import {
  __testResetSerializedWorkspaceWrites,
  runSerializedWorkspaceWrite,
} from "@/lib/lmnp/store/workspace-save-serializer";

type F010ResumeDecision =
  | { kind: "start" }
  | { kind: "resume_step" }
  | { kind: "legacy_complete" }
  | { kind: "resume_analysis"; analyzingDocumentId: string }
  | { kind: "resume_pending_extraction"; pendingExtraction: unknown };

/** Copie locale de resolveF010ResumeDecision — évite la chaîne d'import supabase. */
function resolveF010ResumeDecision(params: {
  persisted?: ReturnType<typeof toF010PersistedState>;
  isLegacyComplete: boolean;
}): F010ResumeDecision {
  const { persisted, isLegacyComplete } = params;
  if (shouldResumeF010(persisted)) {
    if (persisted!.analyzingDocumentId && !persisted!.pendingExtraction) {
      return { kind: "resume_analysis", analyzingDocumentId: persisted!.analyzingDocumentId };
    }
    if (persisted!.pendingExtraction) {
      return { kind: "resume_pending_extraction", pendingExtraction: persisted!.pendingExtraction };
    }
    return { kind: "resume_step" };
  }
  if (isLegacyComplete) return { kind: "legacy_complete" };
  return { kind: "start" };
}

const DEBOUNCE_MS = 350;

type PersistedWorkspaceMock = {
  declarationDraft?: {
    logementAssistantState?: ReturnType<typeof toF010PersistedState>;
    logementConfirmedAt?: string;
  };
};

/** Mini-reimplémentation fidèle de scheduleSaveWorkspace + flush (persistence.ts). */
function createPersistenceSimulator() {
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let pending: PersistedWorkspaceMock | null = null;
  let disk: PersistedWorkspaceMock | null = null;
  let writeSeq = 0;
  const writeLog: { seq: number; step: string | null; startedAt: number; finishedAt?: number }[] = [];

  function scheduleSave(workspace: PersistedWorkspaceMock) {
    pending = structuredClone(workspace);
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      const snapshot = pending;
      pending = null;
      if (!snapshot) return;
      const seq = ++writeSeq;
      const step = snapshot.declarationDraft?.logementAssistantState?.step ?? null;
      const startedAt = Date.now();
      writeLog.push({ seq, step, startedAt });
      // Simule IDB async : délai variable
      const delayMs = seq === 1 ? 500 : 50;
      setTimeout(() => {
        disk = snapshot;
        const entry = writeLog.find((w) => w.seq === seq);
        if (entry) entry.finishedAt = Date.now();
      }, delayMs);
    }, DEBOUNCE_MS);
  }

  async function flush(workspace?: PersistedWorkspaceMock) {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (pending) {
      const snapshot = pending;
      pending = null;
      const seq = ++writeSeq;
      const step = snapshot.declarationDraft?.logementAssistantState?.step ?? null;
      writeLog.push({ seq, step, startedAt: Date.now(), finishedAt: Date.now() });
      disk = snapshot;
      return;
    }
    if (workspace) {
      disk = structuredClone(workspace);
    }
  }

  function readDisk() {
    return disk ? structuredClone(disk) : null;
  }

  function resumeDecision(): F010ResumeDecision {
    return resolveF010ResumeDecision({
      persisted: disk?.declarationDraft?.logementAssistantState,
      isLegacyComplete: Boolean(disk?.declarationDraft?.logementConfirmedAt),
    });
  }

  return { scheduleSave, flush, readDisk, writeLog, resumeDecision };
}

function reviewPlanState(): F010State {
  return {
    step: "review_plan",
    fieldSources: {},
    prixAcquisition: 200_000,
    fraisNotaire: 15_000,
    choixTraitementFrais: "integration",
    typeBien: "appartement",
    ratioTerrain: 0.18,
    montantMobilier: 0,
    mobilierInclus: false,
  };
}

function ventilationState(): F010State {
  return {
    step: "ventilation",
    fieldSources: {},
    prixAcquisition: 200_000,
    fraisNotaire: 15_000,
    choixTraitementFrais: "integration",
    typeBien: "appartement",
    montantMobilier: 0,
    mobilierInclus: false,
  };
}

function toWorkspace(state: F010State): PersistedWorkspaceMock {
  return {
    declarationDraft: {
      logementAssistantState: toF010PersistedState(state, new Date().toISOString()),
    },
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

describe("F010 B1 — debounce 350ms", () => {
  it("F5 avant 350ms sans flush → disque sans review_plan → start()", async () => {
    const sim = createPersistenceSimulator();
    sim.scheduleSave(toWorkspace(reviewPlanState()));
    await sleep(100);
    assert.equal(sim.readDisk(), null);
    assert.equal(sim.resumeDecision().kind, "start");
  });

  it("après debounce + write async (~900ms) → review_plan sur disque → resume_step", async () => {
    const sim = createPersistenceSimulator();
    sim.scheduleSave(toWorkspace(reviewPlanState()));
    await sleep(950);
    assert.equal(sim.readDisk()?.declarationDraft?.logementAssistantState?.step, "review_plan");
    assert.equal(sim.resumeDecision().kind, "resume_step");
    assert.equal(shouldResumeF010(sim.readDisk()?.declarationDraft?.logementAssistantState), true);
  });

  it("flush immédiat après schedule → review_plan sur disque avant 350ms", async () => {
    const sim = createPersistenceSimulator();
    const ws = toWorkspace(reviewPlanState());
    sim.scheduleSave(ws);
    await sim.flush(ws);
    assert.equal(sim.readDisk()?.declarationDraft?.logementAssistantState?.step, "review_plan");
    assert.equal(sim.resumeDecision().kind, "resume_step");
  });
});

describe("F010 B1 — race last-write-wins", () => {
  it("écriture ventilation lente peut écraser review_plan (reproduit orientation au reload)", async () => {
    const sim = createPersistenceSimulator();

    sim.scheduleSave(toWorkspace(ventilationState()));
    await sleep(400);
    sim.scheduleSave(toWorkspace(reviewPlanState()));

    await sleep(450);
    await sleep(600);

    const disk = sim.readDisk();
    const step = disk?.declarationDraft?.logementAssistantState?.step ?? null;
    const decision = sim.resumeDecision();

    assert.equal(step, "ventilation", "race reproduite : dernier write async perd contre write lent antérieur");
    assert.equal(decision.kind, "resume_step");
    assert.notEqual(step, "review_plan");
  });

  it("ventilation → review_plan : sans flush, write lent ventilation peut gagner la race", async () => {
    const sim = createPersistenceSimulator();

    sim.scheduleSave(toWorkspace(ventilationState()));
    await sleep(400);
    sim.scheduleSave(toWorkspace(reviewPlanState()));

    await sleep(1100);

    const step = sim.readDisk()?.declarationDraft?.logementAssistantState?.step ?? null;
    assert.equal(step, "ventilation", "write lent antérieur écrase review_plan");
    assert.equal(sim.resumeDecision().kind, "resume_step");
  });
});

describe("F010 B1 — hydration tardive (simulation initialResume)", () => {
  it("initialResume figé : draft vide au mount → start() même si IDB se remplit après", () => {
    const draftAtMount: PersistedWorkspaceMock = { declarationDraft: { completedSteps: [] } };
    const draftAfterHydration = toWorkspace(reviewPlanState());

    const decisionAtMount = resolveF010ResumeDecision({
      persisted: draftAtMount.declarationDraft?.logementAssistantState,
      isLegacyComplete: false,
    });
    const decisionAfter = resolveF010ResumeDecision({
      persisted: draftAfterHydration.declarationDraft?.logementAssistantState,
      isLegacyComplete: false,
    });

    assert.equal(decisionAtMount.kind, "start");
    assert.equal(decisionAfter.kind, "resume_step");
  });
});

describe("F010 B1-1 — queue sérialisée corrige la race", () => {
  it("ventilation lent puis review_plan : disque final = review_plan", async () => {
    __testResetSerializedWorkspaceWrites();
    const disk: { step: string | null } = { step: null };

    const slow = runSerializedWorkspaceWrite(async () => {
      await sleep(60);
      disk.step = "ventilation";
    });
    const fast = runSerializedWorkspaceWrite(async () => {
      disk.step = "review_plan";
    });

    await Promise.all([slow, fast]);
    assert.equal(disk.step, "review_plan");
  });
});
