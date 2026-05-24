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
import { LMNP_ROUTES, documentJourneyRoute } from "../routes";

function getDraft(ws: PersistedWorkspace): DeclarationDraft {
  return ws.declarationDraft ?? { completedSteps: [] };
}

function getCompletedDocumentSteps(draft: DeclarationDraft): string[] {
  return draft.documentStepsCompleted ?? [];
}

function documentMatchesStep(doc: LmnpDocument, stepId: DocumentJourneyStepId): boolean {
  const def = getDocumentJourneyStep(stepId);
  return def.fileNamePattern.test(doc.fileName) && doc.status === "analyzed";
}

export function isDocumentJourneyStarted(ws: PersistedWorkspace): boolean {
  const draft = getDraft(ws);
  return Boolean(
    draft.journeyStartedAt ||
    draft.inpiDocumentId ||
    (draft.documentStepsCompleted?.length ?? 0) > 0 ||
    ws.documents.length > 0,
  );
}

export function isDocumentStepComplete(
  stepId: DocumentJourneyStepId,
  ws: PersistedWorkspace,
): boolean {
  const draft = getDraft(ws);
  const completed = getCompletedDocumentSteps(draft);
  if (completed.includes(stepId)) return true;

  if (stepId === "inpi") {
    return Boolean(draft.inpiConfirmedAt);
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

/** Où envoyer l’utilisateur pour la pièce INPI (upload vs validation). */
export function inpiJourneyHref(fiscalYearId: string, ws: PersistedWorkspace): string {
  const draft = getDraft(ws);
  if (draft.inpiConfirmedAt) {
    const next = nextDocumentStepId("inpi");
    return next ? documentJourneyStepHref(fiscalYearId, next) : LMNP_ROUTES.dashboard;
  }

  const inpiDoc = ws.documents.find((d) => d.id === draft.inpiDocumentId);
  if (inpiDoc?.status === "analyzed" || inpiDoc?.status === "failed") {
    return documentJourneyRoute("inpi");
  }

  return documentJourneyRoute("inpi");
}

export function resolveCurrentDocumentStepId(ws: PersistedWorkspace): DocumentJourneyStepId {
  if (!isDocumentStepComplete("inpi", ws)) return "inpi";
  for (const id of DOCUMENT_JOURNEY_ORDER) {
    if (id === "inpi") continue;
    if (!isDocumentStepComplete(id, ws)) return id;
  }
  return DOCUMENT_JOURNEY_ORDER[DOCUMENT_JOURNEY_ORDER.length - 1];
}

export function resolveCurrentDocumentStepHref(
  fiscalYearId: string,
  ws: PersistedWorkspace,
): string {
  const stepId = resolveCurrentDocumentStepId(ws);
  if (stepId === "inpi") return inpiJourneyHref(fiscalYearId, ws);
  return documentJourneyStepHref(fiscalYearId, stepId);
}

export function resolveCurrentDocumentStep(ws: PersistedWorkspace) {
  const id = resolveCurrentDocumentStepId(ws);
  return getDocumentJourneyStep(id);
}

export function getDocumentJourneyProgress(ws: PersistedWorkspace) {
  const completed = DOCUMENT_JOURNEY_ORDER.filter((id) =>
    isDocumentStepComplete(id, ws),
  ).length;
  return {
    completed,
    total: DOCUMENT_JOURNEY_STEPS.length,
    percent: Math.round((completed / DOCUMENT_JOURNEY_ORDER.length) * 100),
  };
}

export { documentJourneyStepHref, nextDocumentStepId };
