/**
 * Deterministic linear lifecycle trace for credit document analysis (upload #3 regression).
 * One grouped logger: [credit-analysis-timeline] with fixed ordered stage numbers.
 */

export const CREDIT_ANALYSIS_TIMELINE_STAGES = {
  upload_received: 1,
  upload_queued: 2,
  analysis_started: 3,
  OCR_started: 4,
  OCR_finished: 5,
  extraction_started: 6,
  extraction_finished: 7,
  coherence_started: 8,
  coherence_finished: 9,
  applyPipelineResult_entered: 10,
  business_decision_selected: 11,
  conflict_event_dispatched: 12,
  finalize_execution_started: 13,
  finalize_execution_finished: 14,
  processing_state_reset: 15,
  render_gate_opened: 16,
  financing_form_rendered: 17,
} as const;

export type CreditAnalysisTimelineStage = keyof typeof CREDIT_ANALYSIS_TIMELINE_STAGES;

export type CreditAnalysisTimelineSnapshot = {
  analyzingRef: boolean;
  isExecutionRunning: boolean;
  executionPendingRef: boolean;
  latestUploadedDocIdRef: string | null;
  showAnimation: boolean;
  visibleSections: number;
};

const EMPTY_SNAPSHOT: CreditAnalysisTimelineSnapshot = {
  analyzingRef: false,
  isExecutionRunning: false,
  executionPendingRef: false,
  latestUploadedDocIdRef: null,
  showAnimation: false,
  visibleSections: 0,
};

let sessionId = 0;
let activeDocumentId: string | null = null;
let lastStageNumber = 0;
let lastStageName: CreditAnalysisTimelineStage | null = null;

let readRuntimeSnapshot: (() => CreditAnalysisTimelineSnapshot) | null = null;

/** Register React/runtime snapshot reader from CreditDocumentStep. */
export function registerCreditAnalysisTimelineSnapshotReader(
  reader: (() => CreditAnalysisTimelineSnapshot) | null,
): void {
  readRuntimeSnapshot = reader;
}

/** Start a new timeline session (call on each upload_received). */
export function resetCreditAnalysisTimeline(documentId: string | null): void {
  sessionId += 1;
  lastStageNumber = 0;
  lastStageName = null;
  activeDocumentId = documentId;
  console.log("[credit-analysis-timeline]", {
    event: "session_reset",
    session: sessionId,
    at: new Date().toISOString(),
    documentId,
  });
}

function resolveSnapshot(
  partial?: Partial<CreditAnalysisTimelineSnapshot>,
): CreditAnalysisTimelineSnapshot {
  const runtime = readRuntimeSnapshot?.() ?? EMPTY_SNAPSHOT;
  return { ...runtime, ...partial };
}

/**
 * Emit the next ordered stage. Stages must follow CREDIT_ANALYSIS_TIMELINE_STAGES numbering.
 */
export function traceCreditAnalysisTimeline(
  stageName: CreditAnalysisTimelineStage,
  documentId?: string | null,
  partialSnapshot?: Partial<CreditAnalysisTimelineSnapshot>,
  extra?: Record<string, unknown>,
): void {
  const stageNumber = CREDIT_ANALYSIS_TIMELINE_STAGES[stageName];
  const at = new Date().toISOString();
  const docId = documentId ?? activeDocumentId;

  if (stageNumber <= lastStageNumber && lastStageName !== null) {
    console.warn("[credit-analysis-timeline]", {
      event: "out_of_order_stage",
      session: sessionId,
      at,
      expectedAfter: lastStageNumber,
      received: stageNumber,
      receivedName: stageName,
      previousName: lastStageName,
      documentId: docId,
    });
  }

  lastStageNumber = stageNumber;
  lastStageName = stageName;
  if (docId) activeDocumentId = docId;

  const snapshot = resolveSnapshot(partialSnapshot);

  console.log("[credit-analysis-timeline]", {
    stage: stageNumber,
    name: stageName,
    session: sessionId,
    at,
    documentId: docId,
    analyzingRef: snapshot.analyzingRef,
    isExecutionRunning: snapshot.isExecutionRunning,
    executionPendingRef: snapshot.executionPendingRef,
    latestUploadedDocIdRef: snapshot.latestUploadedDocIdRef,
    showAnimation: snapshot.showAnimation,
    visibleSections: snapshot.visibleSections,
    ...extra,
  });
}

/** Last stage reached in the current session (for debugging in console). */
export function getCreditAnalysisTimelineLastStage(): {
  session: number;
  stage: number;
  name: CreditAnalysisTimelineStage | null;
} {
  return { session: sessionId, stage: lastStageNumber, name: lastStageName };
}
