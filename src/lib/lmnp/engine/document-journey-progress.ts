import {
  DOCUMENT_JOURNEY_ORDER,
  DOCUMENT_JOURNEY_STEPS,
  type DocumentJourneyStepId,
  documentJourneyStepHref,
  getDocumentJourneyStep,
  nextDocumentStepId,
} from "../constants/document-journey";
import type { DeclarationDraft, LmnpDocument } from "../types";
import type { PersistedWorkspace } from "../store/persistence";

function getCompletedDocumentSteps(draft: DeclarationDraft | undefined): string[] {
  return draft?.documentStepsCompleted ?? [];
}

function documentMatchesStep(doc: LmnpDocument, stepId: DocumentJourneyStepId): boolean {
  const def = getDocumentJourneyStep(stepId);
  return def.fileNamePattern.test(doc.fileName) && doc.status === "analyzed";
}

export function isDocumentStepComplete(
  stepId: DocumentJourneyStepId,
  ws: PersistedWorkspace,
): boolean {
  const completed = getCompletedDocumentSteps(ws.declarationDraft);
  if (completed.includes(stepId)) return true;

  if (stepId === "inpi") {
    return Boolean(ws.declarationDraft?.inpiConfirmedAt);
  }

  return ws.documents.some((d) => documentMatchesStep(d, stepId));
}

export function isDocumentJourneyComplete(ws: PersistedWorkspace): boolean {
  return DOCUMENT_JOURNEY_ORDER.every((id) => {
    const def = getDocumentJourneyStep(id);
    if (def.optional) return true;
    return isDocumentStepComplete(id, ws);
  });
}

export function resolveCurrentDocumentStepId(ws: PersistedWorkspace): DocumentJourneyStepId {
  for (const id of DOCUMENT_JOURNEY_ORDER) {
    if (!isDocumentStepComplete(id, ws)) return id;
  }
  return DOCUMENT_JOURNEY_ORDER[DOCUMENT_JOURNEY_ORDER.length - 1];
}

export function resolveCurrentDocumentStep(ws: PersistedWorkspace) {
  const id = resolveCurrentDocumentStepId(ws);
  return getDocumentJourneyStep(id);
}

export function getDocumentJourneyProgress(ws: PersistedWorkspace) {
  const completed = DOCUMENT_JOURNEY_ORDER.filter((id) =>
    isDocumentStepComplete(id, ws),
  ).length;
  const required = DOCUMENT_JOURNEY_STEPS.filter((s) => !s.optional).length;
  return {
    completed,
    required,
    percent: Math.round((completed / DOCUMENT_JOURNEY_ORDER.length) * 100),
  };
}

export { documentJourneyStepHref, nextDocumentStepId };
